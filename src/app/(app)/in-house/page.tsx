import Link from "next/link";
import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { ROLE_LABELS, STAFF_ROLES, isDistrictScoped, type Role } from "@/lib/roles";
import { projectMatchesBranch } from "@/lib/scope";
import { DISTRICTS } from "@/lib/options";
import { HIDDEN_IN_LIST } from "@/lib/hidden-users";
import { PageHeader, EmptyState } from "@/components/ui";
import { Plus } from "@/components/icons";
import type { User } from "@/lib/types";
import InHouseTeam, { type StaffRow } from "./InHouseTeam";

export const dynamic = "force-dynamic";

// Administration · My Team — the IN-HOUSE staff, kept deliberately apart from
// the Business Partners screens. Partners are a tree of independent salespeople;
// this is the company's own payroll: the branch desks (Pre-Sales / Post-Sales,
// one district each) plus the company-wide desks (Finance, Legal, Digital).
//
// Grouped by branch rather than listed flat, because "who covers Trichy" is the
// question this page exists to answer.
export default async function InHouseTeamPage() {
  await requireCapability("manage_users");
  const sb = getSupabase();

  // Every staff role except Admin — admins manage this page, they aren't on it.
  const staffRoles: Role[] = STAFF_ROLES.filter((r) => r !== "admin");

  // Filtered in JS rather than with `.in("role", staffRoles)` ON PURPOSE. Sending
  // the role list to Postgres means sending enum LITERALS, and if the database is
  // missing any one of them — a role the app knows about but whose migration has
  // not been applied yet — PostgREST rejects the entire query with
  // `invalid input value for enum user_role`. The page then showed "No in-house
  // team members yet" with a full roster behind it: one unapplied migration
  // silently emptying an admin screen, with nothing on the page to say so.
  // Reading the table and matching here cannot fail that way.
  const { data } = await sb
    .from("users")
    .select("*")
    .not("email", "in", HIDDEN_IN_LIST) // hidden dev/support accounts never appear
    .order("created_at", { ascending: true });

  const staff = ((data ?? []) as User[]).filter((u) => staffRoles.includes(u.role as Role));

  // How many projects each branch actually has — a desk pointed at a branch with
  // no projects opens onto empty screens, and an Admin should see that here
  // rather than discover it from a confused colleague. Counted with the SAME
  // city-or-district rule the desks are scoped by (projectMatchesBranch), so this
  // number can never disagree with what they actually see.
  const { data: projData } = await sb.from("projects").select("city, district");
  const projects = (projData ?? []) as { city: string | null; district: string | null }[];
  const countFor = (branch: string) => projects.filter((p) => projectMatchesBranch(p, branch)).length;

  const rows: StaffRow[] = staff.map((u) => ({
    id: u.id,
    name: u.full_name,
    email: u.email,
    mobile: u.mobile,
    role: u.role as Role,
    roleLabel: ROLE_LABELS[u.role as Role],
    district: u.district ?? null,
    scoped: isDistrictScoped(u.role as Role),
    active: u.is_active,
    joined: u.created_at,
  }));

  // One section per district (in the master order), then everyone company-wide.
  const branches = DISTRICTS.map((d) => ({
    district: d,
    projects: countFor(d),
    members: rows.filter(
      (r) => r.scoped && (r.district ?? "").trim().toLowerCase() === d.toLowerCase(),
    ),
  }));
  // A scoped desk whose district is blank or isn't in the master list would
  // otherwise vanish from this page while still holding a working login.
  const placed = new Set(branches.flatMap((b) => b.members.map((m) => m.id)));
  const unassigned = rows.filter((r) => r.scoped && !placed.has(r.id));
  const companyWide = rows.filter((r) => !r.scoped);

  return (
    <>
      <PageHeader
        title="My Team"
        subtitle="The in-house team — branch desks and company-wide staff. Partners are managed separately under Business Partners."
        action={
          <Link href="/users?action=new" className="btn-primary">
            <Plus size={16} /> Add Team Member
          </Link>
        }
      />
      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            message="No in-house team members yet."
            hint="Add one from Business Partners › Add New Partner, choosing a role from the In-House Team group."
          />
        </div>
      ) : (
        <InHouseTeam branches={branches} unassigned={unassigned} companyWide={companyWide} />
      )}
    </>
  );
}
