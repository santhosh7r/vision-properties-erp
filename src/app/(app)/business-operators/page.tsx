import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { ROLE_LABELS, SALES_HIERARCHY, isSalesRole, type Role } from "@/lib/roles";
import { PageHeader, StatCard } from "@/components/ui";
import type { User } from "@/lib/types";
import BusinessOperatorsTree, { type TreeUser } from "./BusinessOperatorsTree";
import CouponsTable, { type CouponRow } from "./CouponsTable";

export const dynamic = "force-dynamic";

export default async function BusinessOperatorsPage() {
  // Admin + the three managing sales roles can open this. Business Partners have
  // no downline, so they lack `manage_team` and are redirected.
  const actor = await requireCapability("manage_team");
  const sb = getSupabase();

  // ── ADMIN: a flat table of every salesperson with their coupon balances + the
  // ability to issue extra coupons/tokens. (The hierarchy tree lives on the
  // View Partner page.) ──────────────────────────────────────────────────────
  if (actor.role === "admin") {
    const { data: salesData } = await sb
      .from("users")
      .select("id, full_name, role, partner_code")
      .in("role", SALES_HIERARCHY)
      .order("full_name", { ascending: true });
    const salesUsers = (salesData ?? []) as Pick<User, "id" | "full_name" | "role" | "partner_code">[];

    // Coupons may not be migrated yet — fall back to empty balances.
    const { data: couponData } = await sb.from("coupons").select("user_id, type, quantity");
    const coupons = (couponData ?? []) as { user_id: string; type: string; quantity: number }[];
    const balancesByUser = new Map<string, Record<string, number>>();
    for (const c of coupons) {
      const m = balancesByUser.get(c.user_id) ?? {};
      m[c.type] = (m[c.type] ?? 0) + Number(c.quantity || 0);
      balancesByUser.set(c.user_id, m);
    }

    const couponRows: CouponRow[] = salesUsers.map((u) => ({
      id: u.id,
      name: u.full_name,
      code: u.partner_code ?? null,
      role: u.role as Role,
      balances: balancesByUser.get(u.id) ?? {},
    }));

    const counts = SALES_HIERARCHY.reduce<Record<string, number>>((acc, r) => {
      acc[r] = couponRows.filter((n) => n.role === r).length;
      return acc;
    }, {});

    return (
      <>
        <PageHeader
          title="Issue Token"
          subtitle="Every salesperson and their coupon balances — issue extra coupons / tokens (e.g. a Cab Token to a Director)."
        />
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <StatCard label="Sales People" value={couponRows.length} />
          {SALES_HIERARCHY.map((r) => (
            <StatCard key={r} label={ROLE_LABELS[r]} value={counts[r] ?? 0} />
          ))}
        </div>
        <CouponsTable rows={couponRows} />
      </>
    );
  }

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

  // Non-admin (a sales manager) sees ONLY their own subtree — themselves plus
  // everyone beneath them — rooted at themselves.
  const selfId = actor.id;
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
  const nodes = allNodes.filter((n) => keep.has(n.id));

  const counts = SALES_HIERARCHY.reduce<Record<string, number>>((acc, r) => {
    acc[r] = nodes.filter((n) => n.role === r).length;
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title="My Team"
        subtitle="Everyone beneath you in the sales chain. Add members under yourself or anyone in your team."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="My Team" value={nodes.length - 1} />
        {SALES_HIERARCHY.map((r) => (
          <StatCard key={r} label={ROLE_LABELS[r]} value={counts[r] ?? 0} />
        ))}
      </div>

      <BusinessOperatorsTree nodes={nodes} selfId={selfId} />
    </>
  );
}
