/**
 * Read-only: list all user emails so we can see what actually exists.
 *
 *   npx tsx scripts/check-emails.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data, error } = await sb
    .from("users")
    .select("email, role, is_active")
    .order("email");
  if (error) throw error;

  if (!data || data.length === 0) {
    console.log("No users found in the database.");
    return;
  }

  console.log(`Found ${data.length} user(s):\n`);
  for (const u of data) {
    console.log(`  ${u.email}  ·  ${u.role}  ·  ${u.is_active ? "active" : "INACTIVE"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
