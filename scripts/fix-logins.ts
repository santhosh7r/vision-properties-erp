/**
 * Normalize logins to @visionproperties.co:
 *   1. Rename the existing admin from .in -> .co (account preserved, NOT deleted).
 *   2. Delete any other leftover @visionproperties.in logins.
 *   3. Create/refresh the team logins with .co emails (password: REDACTED).
 *
 *   npm run db:fix-logins
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

// Team logins to create with .co (admin is handled by rename, not recreated).
const TEAM = [
  { full_name: "Senthil Kumar", email: "srdirector@visionproperties.co", role: "senior_director", mobile: "9000000002" },
  { full_name: "Ravi Director", email: "director@visionproperties.co", role: "director", mobile: "9000000003" },
  { full_name: "Meena Manager", email: "manager@visionproperties.co", role: "business_manager", mobile: "9000000004" },
  { full_name: "Arun Partner", email: "partner@visionproperties.co", role: "business_partner", mobile: "9000000005" },
  { full_name: "Finance Desk", email: "finance@visionproperties.co", role: "finance", mobile: "9000000006" },
  { full_name: "Legal Desk", email: "legal@visionproperties.co", role: "legal", mobile: "9000000007" },
];

async function main() {
  // 1. Rename existing admin(s) .in -> .co — preserves the account (id, password).
  const { data: admins, error: aErr } = await sb
    .from("users")
    .select("id, email")
    .ilike("email", "admin@visionproperties.in");
  if (aErr) throw aErr;

  for (const a of admins ?? []) {
    const { error } = await sb
      .from("users")
      .update({ email: "admin@visionproperties.co" })
      .eq("id", a.id);
    if (error) throw error;
    console.log(`  renamed admin: ${a.email} -> admin@visionproperties.co`);
  }

  // 2. Remove any OTHER leftover .in logins (admin is now .co, so it's safe).
  const { data: removed, error: dErr } = await sb
    .from("users")
    .delete()
    .ilike("email", "%@visionproperties.in")
    .select("email");
  if (dErr) throw dErr;
  for (const u of removed ?? []) console.log(`  removed: ${u.email}`);

  // 3. Create/refresh the team logins with .co.
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const u of TEAM) {
    const { error } = await sb
      .from("users")
      .upsert({ ...u, password_hash: hash, is_active: true }, { onConflict: "email" });
    if (error) throw error;
    console.log(`  created: ${u.email} (${u.role})`);
  }

  // Final state
  const { data: all } = await sb.from("users").select("email, role").order("email");
  console.log(`\n✔ Done. ${all?.length ?? 0} login(s) now exist:`);
  for (const u of all ?? []) console.log(`    ${u.email}  ·  ${u.role}`);
  console.log(`\nAll passwords: ${PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
