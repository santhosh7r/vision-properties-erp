import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { getDownlineIds } from "@/lib/hierarchy";
import { creatableRolesUnder, isSalesRole, type Role } from "@/lib/roles";
import { HIDDEN_IN_LIST } from "@/lib/hidden-users";
import { PageHeader } from "@/components/ui";
import type { User } from "@/lib/types";
import AddUserForm, { type ManagerOption } from "./AddUserForm";
import UsersTable, { type UserRow } from "./UsersTable";
import BusinessOperatorsTree, { type TreeUser } from "../business-operators/BusinessOperatorsTree";

export const dynamic = "force-dynamic";

// Header copy per Partners nav intent (Add / View / Block / Change Team). The
// page content is unchanged — the add form + table cover every intent.
const HEADERS = {
  new: { title: "Add New Partner", subtitle: "Create a partner / team member and place them in the hierarchy." },
  manage: {
    title: "Block / Change Team & Level",
    subtitle: "Block or re-activate a partner, and change their team or level — all from one place.",
  },
  view: {
    title: "View Partner",
    subtitle: "Who reports to whom — the full sales hierarchy. Expand a branch or add a member directly beneath any manager.",
  },
} as const;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const intent = sp.action === "new" ? "new" : sp.view === "manage" ? "manage" : "view";
  // Three different gates, one page:
  //   new    → `manage_team`   Admin + Senior Director / Director / Business Manager
  //   manage → `manage_users`  Admin only — blocking and re-levelling
  //   view   → `view_partners` read-only tree; Admin and the branch desks, who
  //            type Partner IDs onto every booking and need to look them up.
  // Sales managers use "My Team" for their own downline instead.
  const actor = await requireCapability(
    intent === "new" ? "manage_team" : intent === "manage" ? "manage_users" : "view_partners",
  );
  const isAdmin = actor.role === "admin";
  const head = HEADERS[intent];
  const sb = getSupabase();
  const { data: users } = await sb
    .from("users")
    .select("*")
    .not("email", "in", HIDDEN_IN_LIST) // hidden dev/support accounts never appear
    .order("created_at", { ascending: true });

  const list = (users ?? []) as User[];
  const byId = new Map(list.map((u) => [u.id, u]));

  // Roles this actor may create: Admin gets the full picker (sales + operators +
  // admin); a sales manager only ever sees the roles strictly beneath their own.
  const creatableRoles: Role[] | null = isAdmin ? null : creatableRolesUnder(actor.role as Role);

  // Potential parents: anyone active who can manage (i.e. not a leaf partner).
  // The form filters these to the role valid for the chosen new-member role.
  // A non-admin is confined to their OWN team — they cannot place a new member
  // under someone outside their downline (also enforced in the server action).
  const teamIds = isAdmin ? null : new Set(await getDownlineIds(sb, actor.id));
  const managers: ManagerOption[] = list
    .filter((u) => u.role !== "business_partner" && u.is_active)
    .filter((u) => !teamIds || teamIds.has(u.id))
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
    manager_id: u.manager_id,
    is_active: u.is_active,
  }));

  // Add New Partner → just the form. Other intents → the table, with only the
  // actions relevant to that intent (view = read-only, block, placement).
  if (intent === "new") {
    return (
      <>
        <PageHeader
          title={head.title}
          subtitle={
            isAdmin
              ? head.subtitle
              : "Create a member beneath you and place them anywhere in your own team."
          }
        />
        <div className="card max-w-xl">
          <h2 className="mb-4 text-sm font-semibold">New Partner</h2>
          <AddUserForm managers={managers} creatableRoles={creatableRoles} />
        </div>
      </>
    );
  }

  // View Partner → the hierarchy tree (who reports to whom). Admin sees the whole
  // sales org and can add a member directly under any node.
  if (intent === "view") {
    const treeNodes: TreeUser[] = list
      .filter((u) => u.role === "admin" || isSalesRole(u.role as Role))
      .map((u) => ({
        id: u.id,
        name: u.full_name,
        email: u.email,
        mobile: u.mobile,
        role: u.role as Role,
        code: u.partner_code ?? null,
        managerId: u.manager_id,
        active: u.is_active,
      }));
    return (
      <>
        <PageHeader title={head.title} subtitle={head.subtitle} />
        <BusinessOperatorsTree nodes={treeNodes} />
      </>
    );
  }

  // Combined page: both Block/Unblock and Change Team / Level actions.
  return (
    <>
      <PageHeader title={head.title} subtitle={head.subtitle} />
      <UsersTable rows={rows} managers={managers} mode="manage" />
    </>
  );
}
