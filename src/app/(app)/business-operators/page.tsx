import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { ROLE_LABELS, SALES_HIERARCHY, isSalesRole, type Role } from "@/lib/roles";
import { PageHeader, StatCard } from "@/components/ui";
import type { User } from "@/lib/types";
import BusinessOperatorsTree, { type TreeUser } from "./BusinessOperatorsTree";

export const dynamic = "force-dynamic";

export default async function BusinessOperatorsPage() {
  // Admin + the three managing sales roles can open this. Business Partners have
  // no downline, so they lack `manage_team` and are redirected.
  const actor = await requireCapability("manage_team");
  const sb = getSupabase();

  // One flat fetch — the client builds & renders the tree (only expanded
  // branches hit the DOM, so this scales to thousands of rows).
  const { data } = await sb
    .from("users")
    .select("id, full_name, email, mobile, role, manager_id, is_active")
    .order("full_name", { ascending: true });

  const users = (data ?? []) as Pick<
    User,
    "id" | "full_name" | "email" | "mobile" | "role" | "manager_id" | "is_active"
  >[];

  // Partner IDs come from the 0005 migration. Fetch them separately so the tree
  // still renders (just without codes) if the migration hasn't been applied yet.
  const { data: codeData } = await sb.from("users").select("id, partner_code");
  const codeById = new Map<string, string | null>(
    (codeData ?? []).map((u) => [u.id as string, (u.partner_code as string | null) ?? null]),
  );

  // The Sales Tree is the sales chain only — Admin (root) + the 4 sales roles.
  // Finance/Legal operators are managed on the Users page.
  const allNodes: TreeUser[] = users
    .filter((u) => u.role === "admin" || isSalesRole(u.role as Role))
    .map((u) => ({
      id: u.id,
      name: u.full_name,
      email: u.email,
      mobile: u.mobile,
      role: u.role as Role,
      code: codeById.get(u.id) ?? null,
      managerId: u.manager_id,
      active: u.is_active,
    }));

  // Admin sees the whole org. A sales manager sees ONLY their own subtree
  // (themselves + everyone beneath them), rooted at themselves.
  const isAdmin = actor.role === "admin";
  let nodes = allNodes;
  let selfId: string | undefined;
  if (!isAdmin) {
    selfId = actor.id;
    const childIds = new Map<string, string[]>();
    for (const n of allNodes) {
      if (n.managerId) {
        const arr = childIds.get(n.managerId) ?? [];
        arr.push(n.id);
        childIds.set(n.managerId, arr);
      }
    }
    const keep = new Set<string>();
    const stack = [actor.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (keep.has(id)) continue;
      keep.add(id);
      for (const c of childIds.get(id) ?? []) stack.push(c);
    }
    nodes = allNodes.filter((n) => keep.has(n.id));
  }

  const counts = SALES_HIERARCHY.reduce<Record<string, number>>((acc, r) => {
    acc[r] = nodes.filter((n) => n.role === r).length;
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title={isAdmin ? "Business Operators" : "My Team"}
        subtitle={
          isAdmin
            ? "The full sales hierarchy. Expand a branch, search anyone, or add a member directly beneath their manager."
            : "Everyone beneath you in the sales chain. Add members under yourself or anyone in your team."
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label={isAdmin ? "Total Members" : "My Team"} value={isAdmin ? nodes.length : nodes.length - 1} />
        {SALES_HIERARCHY.map((r) => (
          <StatCard key={r} label={ROLE_LABELS[r]} value={counts[r] ?? 0} />
        ))}
      </div>

      <BusinessOperatorsTree nodes={nodes} selfId={selfId} />
    </>
  );
}
