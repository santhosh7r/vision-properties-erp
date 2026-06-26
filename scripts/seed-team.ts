/**
 * Seed TEAM LOGINS only — recreates one fresh login per role (no sample
 * projects / plots / customers). Use after `npm run db:reset` to get a clean
 * database with working logins for every role.
 *
 *   npm run db:seed:team
 *
 * Sales people sign in with their auto-assigned Sales ID (partner_code, e.g.
 * VPSD22); admin / finance / legal sign in with their email. All share the
 * default password below — change it from each user's Profile after first login.
 * Safe to re-run: upserts by email.
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

const PASSWORD = "REDACTED";

async function upsertUser(
  u: { full_name: string; email: string; role: string; mobile: string },
  hash: string,
): Promise<string> {
  const { data, error } = await sb
    .from("users")
    .upsert({ ...u, password_hash: hash, is_active: true }, { onConflict: "email" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);

  // Admin already exists after a reset, but upsert keeps this idempotent.
  const adminId = await upsertUser(
    { full_name: "System Admin", email: "admin@visionproperties.co", role: "admin", mobile: "9000000001" },
    hash,
  );

  const team = [
    { full_name: "Senthil Kumar", email: "srdirector@visionproperties.co", role: "senior_director", mobile: "9000000002" },
    { full_name: "Ravi Director", email: "director@visionproperties.co", role: "director", mobile: "9000000003" },
    { full_name: "Meena Manager", email: "manager@visionproperties.co", role: "business_manager", mobile: "9000000004" },
    { full_name: "Arun Partner", email: "partner@visionproperties.co", role: "business_partner", mobile: "9000000005" },
    { full_name: "Finance Desk", email: "finance@visionproperties.co", role: "finance", mobile: "9000000006" },
    { full_name: "Legal Desk", email: "legal@visionproperties.co", role: "legal", mobile: "9000000007" },
  ];

  const ids: Record<string, string> = { admin: adminId };
  for (const u of team) ids[u.role] = await upsertUser(u, hash);

  // Sales chain: SD → Director → Manager → Partner. Finance & Legal report to Admin.
  await sb.from("users").update({ manager_id: ids["admin"] }).eq("id", ids["senior_director"]);
  await sb.from("users").update({ manager_id: ids["senior_director"] }).eq("id", ids["director"]);
  await sb.from("users").update({ manager_id: ids["director"] }).eq("id", ids["business_manager"]);
  await sb.from("users").update({ manager_id: ids["business_manager"] }).eq("id", ids["business_partner"]);
  await sb.from("users").update({ manager_id: ids["admin"] }).eq("id", ids["finance"]);
  await sb.from("users").update({ manager_id: ids["admin"] }).eq("id", ids["legal"]);

  // Show how each person signs in (Sales ID for sales roles, email otherwise).
  const { data: users } = await sb
    .from("users")
    .select("full_name, email, role, partner_code")
    .order("created_at", { ascending: true });

  console.log("\n✔ Team logins ready. Password for all:  " + PASSWORD + "\n");
  console.log("  ROLE              EMAIL                              SALES ID   NAME");
  console.log("  ----------------  ---------------------------------  ---------  --------------------");
  for (const u of (users ?? []) as { full_name: string; email: string; role: string; partner_code: string | null }[]) {
    console.log(`  ${u.role.padEnd(16)}  ${u.email.padEnd(33)}  ${(u.partner_code ?? "—").padEnd(9)}  ${u.full_name}`);
  }
  console.log("\nEveryone can sign in with EITHER their email OR their Sales ID (sales roles only) + the password above.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
