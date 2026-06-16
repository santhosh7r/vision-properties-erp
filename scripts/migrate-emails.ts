/**
 * One-off migration: rename any @visionproperties.in user emails to .co
 * so the old .in addresses no longer exist (and can no longer log in).
 *
 *   npx tsx scripts/migrate-emails.ts
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
  const { data: users, error } = await sb
    .from("users")
    .select("id, email")
    .ilike("email", "%@visionproperties.in");
  if (error) throw error;

  if (!users || users.length === 0) {
    console.log("No @visionproperties.in emails found — nothing to migrate.");
    return;
  }

  for (const u of users) {
    const next = u.email.replace(/@visionproperties\.in$/i, "@visionproperties.co");
    const { error: upErr } = await sb.from("users").update({ email: next }).eq("id", u.id);
    if (upErr) throw upErr;
    console.log(`  ${u.email}  ->  ${next}`);
  }

  console.log(`\n✔ Migrated ${users.length} email(s). The .in addresses no longer exist.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
