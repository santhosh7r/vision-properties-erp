import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { type Role } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import type { User } from "@/lib/types";
import AddUserForm, { type ManagerOption } from "./AddUserForm";
import UsersTable, { type UserRow } from "./UsersTable";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requireCapability("manage_users");
  const sb = getSupabase();
  const { data: users } = await sb
    .from("users")
    .select("*")
    .order("created_at", { ascending: true });

  const list = (users ?? []) as User[];
  const byId = new Map(list.map((u) => [u.id, u]));
  // Potential parents: anyone active who can manage (i.e. not a leaf partner).
  // The form filters these to the role valid for the chosen new-member role.
  const managers: ManagerOption[] = list
    .filter((u) => u.role !== "business_partner" && u.is_active)
    .map((u) => ({ id: u.id, full_name: u.full_name, role: u.role as Role, code: u.partner_code ?? null }));

  // Admin panel manages the team — hide admin accounts from the list itself.
  const rows: UserRow[] = list
    .filter((u) => u.role !== "admin")
    .map((u) => ({
    id: u.id,
    full_name: u.full_name,
    email: u.email,
    role: u.role as Role,
    code: u.partner_code,
    manager: u.manager_id ? byId.get(u.manager_id)?.full_name ?? "" : "",
    is_active: u.is_active,
  }));

  return (
    <>
      <PageHeader
        title="Users & Hierarchy"
        subtitle="Admin, the sales chain (Senior Director → Director → Business Manager → Business Partner) and operators (Finance, Legal)."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold">Add User</h2>
          <AddUserForm managers={managers} />
        </div>

        <div className="lg:col-span-2">
          <UsersTable rows={rows} />
        </div>
      </div>
    </>
  );
}
