/**
 * Reset script — removes all dummy/sample data so the Admin panel renders a
 * clean, real (empty) state. Keeps ONLY the admin login so you can sign in.
 *
 *   npm run db:reset
 *
 * Deletes: projects, plots, categories, customers, bookings, payments,
 * registrations, notifications, audit log, and every non-admin user.
 * Keeps: users with role = 'admin'.
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

const ALL = "00000000-0000-0000-0000-000000000000"; // sentinel for "delete all rows"

async function wipe(table: string) {
  const { error, count } = await sb.from(table).delete({ count: "exact" }).neq("id", ALL);
  if (error) console.log(`  ${table.padEnd(20)} ERR: ${error.message}`);
  else console.log(`  ${table.padEnd(20)} cleared (${count ?? 0} rows)`);
}

async function main() {
  // Order respects foreign keys (children first). Districts are a master/reference
  // list (needed for project dropdowns), so they're intentionally NOT wiped.
  await wipe("notifications");
  await wipe("payments");
  await wipe("plot_transfers");
  await wipe("registrations");
  await wipe("service_requests");
  await wipe("cab_requests");
  await wipe("coupons");
  await wipe("bookings");
  await wipe("plots");
  await wipe("plot_categories");
  await wipe("customers");
  await wipe("projects");
  await wipe("project_categories");
  await wipe("audit_log");

  // Remove non-admin demo users; keep admin accounts intact for login.
  const { error, count } = await sb
    .from("users")
    .delete({ count: "exact" })
    .neq("role", "admin");
  if (error) console.log(`  users (non-admin)   ERR: ${error.message}`);
  else console.log(`  users (non-admin)   removed (${count ?? 0})`);

  const { data: admins } = await sb.from("users").select("email").eq("role", "admin");
  console.log("\n✔ Reset complete. Remaining admin login(s):");
  (admins ?? []).forEach((a) => console.log(`   ${a.email}`));
  console.log("\nThe Admin panel will now show real, empty data — create your own projects, plots and users.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
