/**
 * Seed script.
 *
 *   npm run db:seed        -> seeds ONLY the admin login (real, clean state)
 *   npm run db:seed:demo   -> also seeds demo users + sample projects/plots/customer
 *
 * Prerequisites: run supabase/schema.sql, then configure .env.local.
 * Safe to re-run: upserts users by email; skips sample data if it already exists.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const WITH_DEMO = process.env.SEED_DEMO === "1";
const PASSWORD = process.env.SEED_PASSWORD ?? "";
if (!PASSWORD) {
  console.error("Missing SEED_PASSWORD in .env.local — set a seed/demo password there.");
  process.exit(1);
}

async function upsertUser(u: {
  full_name: string;
  email: string;
  role: string;
  mobile: string;
}, hash: string) {
  const { data, error } = await sb
    .from("users")
    .upsert({ ...u, password_hash: hash, is_active: true }, { onConflict: "email" })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`  user: ${u.email} (${u.role})`);
  return data.id as string;
}

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);

  // --- Admin (always) -----------------------------------------------------
  await upsertUser(
    { full_name: "System Admin", email: "admin@visionproperties.co", role: "admin", mobile: "9000000001" },
    hash,
  );

  if (!WITH_DEMO) {
    console.log("\n✔ Seed complete (admin only).");
    console.log(`\nAdmin login:  admin@visionproperties.co  /  ${PASSWORD}`);
    console.log("The Admin panel will render real, empty data — create your own projects and plots.");
    return;
  }

  // ------------------------------------------------------------------------
  // DEMO DATA (only with npm run db:seed:demo)
  // ------------------------------------------------------------------------
  const adminId = await upsertUser(
    { full_name: "System Admin", email: "admin@visionproperties.co", role: "admin", mobile: "9000000001" },
    hash,
  );
  const ids: Record<string, string> = { admin: adminId };
  const demoUsers = [
    { full_name: "Senthil Kumar", email: "srdirector@visionproperties.co", role: "senior_director", mobile: "9000000002" },
    { full_name: "Ravi Director", email: "director@visionproperties.co", role: "director", mobile: "9000000003" },
    { full_name: "Meena Manager", email: "manager@visionproperties.co", role: "business_manager", mobile: "9000000004" },
    { full_name: "Arun Partner", email: "partner@visionproperties.co", role: "business_partner", mobile: "9000000005" },
    { full_name: "Finance Desk", email: "finance@visionproperties.co", role: "finance", mobile: "9000000006" },
    { full_name: "Legal Desk", email: "legal@visionproperties.co", role: "legal", mobile: "9000000007" },
  ];
  for (const u of demoUsers) ids[u.role] = await upsertUser(u, hash);

  await sb.from("users").update({ manager_id: ids["admin"] }).eq("id", ids["senior_director"]);
  await sb.from("users").update({ manager_id: ids["senior_director"] }).eq("id", ids["director"]);
  await sb.from("users").update({ manager_id: ids["director"] }).eq("id", ids["business_manager"]);
  await sb.from("users").update({ manager_id: ids["business_manager"] }).eq("id", ids["business_partner"]);
  // Finance & Legal are operators that connect directly to the company (Admin).
  await sb.from("users").update({ manager_id: ids["admin"] }).eq("id", ids["finance"]);
  await sb.from("users").update({ manager_id: ids["admin"] }).eq("id", ids["legal"]);

  const { data: existing } = await sb.from("projects").select("id").eq("name", "Vision Signature").maybeSingle();
  if (existing) {
    console.log("Sample project already present — skipping inventory seed.");
    return;
  }

  const { data: cat } = await sb
    .from("project_categories")
    .upsert({ name: "Chennai Premium Layouts", description: "Premium gated layouts across Chennai" }, { onConflict: "name" })
    .select("id")
    .single();

  const projects = [
    { name: "Vision Signature", district: "Chengalpattu", city: "Chennai", area: "12 acres", land_type: "Residential", approval_type: "dtcp_rera", project_type: "luxury", advance_percent: 5, blocking_amount: 10000, blocking_window_hours: 48, booking_window_days: 15, status: "active" },
    { name: "ECR Greens", district: "Chengalpattu", city: "Chennai", area: "8 acres", land_type: "Residential", approval_type: "dtcp_only", project_type: "affordable", advance_percent: 5, blocking_amount: 25000, blocking_window_hours: 72, booking_window_days: 15, status: "active" },
    { name: "OMR Elite City", district: "Kancheepuram", city: "Chennai", area: "20 acres", land_type: "Mixed Use", approval_type: "dtcp_rera", project_type: "luxury", advance_percent: 7, blocking_amount: 50000, blocking_window_hours: 48, booking_window_days: 20, status: "active" },
  ];

  for (const p of projects) {
    const { data: proj, error } = await sb
      .from("projects")
      .insert({ ...p, category_id: cat?.id ?? null, created_by: ids["admin"] })
      .select("id, name")
      .single();
    if (error) throw error;
    const plotRows = [];
    let n = 1;
    for (const block of ["A", "B"]) {
      for (let i = 1; i <= 6; i++) {
        const sqft = 600 + ((n * 50) % 600);
        const ppsf = p.project_type === "luxury" ? 4500 : 3000;
        plotRows.push({ project_id: proj.id, block, plot_no: `${block}${i}`, sqft, price_per_sqft: ppsf, description: `${proj.name} plot ${block}${i}`, status: "available" });
        n++;
      }
    }
    await sb.from("plots").insert(plotRows);
    console.log(`  project: ${proj.name} (+${plotRows.length} plots)`);
  }

  await sb.from("customers").insert({
    name: "Karthik Raja", mobile: "9812345678", dob: "1988-04-12",
    street: "12 Anna Nagar", area: "Anna Nagar", state: "Tamil Nadu", district: "Chennai",
    pincode: "600040", occupation: "Salaried", occupation_remarks: "IT professional",
    created_by: ids["business_partner"],
  });

  console.log("\n✔ Demo seed complete.");
  console.log(`\nAll demo logins use password: ${PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
