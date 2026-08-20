import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { ROLE_LABELS, SALES_HIERARCHY, isSalesRole, can, type Role } from "@/lib/roles";
import { COUPON_TYPES, isValueCoupon } from "@/lib/options";
import { HIDDEN_IN_LIST } from "@/lib/hidden-users";
import { PageHeader, StatCard } from "@/components/ui";
import type { User } from "@/lib/types";
import BusinessOperatorsTree, { type TreeUser } from "./BusinessOperatorsTree";
import { type CouponRow } from "./CouponsTable";
import { type LedgerRow } from "./CouponLedger";
import TokenWorkspace from "./TokenWorkspace";

export const dynamic = "force-dynamic";

export default async function BusinessOperatorsPage({
  searchParams,
}: {
  // ?tab=history deep-links straight to the ledger (same idea as Post-Sales).
  searchParams: Promise<{ tab?: string }>;
}) {
  // One route, two audiences:
  //   • `issue_token` (Admin, Pre-Sales desk) → the Issue Token workspace: every
  //     salesperson, what they hold, and the issue/redeem actions.
  //   • `manage_team`  (Senior Director / Director / Business Manager) → their
  //     own team tree, unchanged.
  // Business Partners have no downline and issue nothing, so they hold neither
  // and are redirected.
  const actor = await requireUser();
  const mayIssue = can(actor.role, "issue_token");
  if (!mayIssue && !can(actor.role, "manage_team")) redirect("/dashboard");
  const sb = getSupabase();

  // ── ISSUE TOKEN: a flat table of every salesperson with their coupon balances
  // + the ability to issue extra coupons/tokens, or redeem against what they
  // hold. Deliberately the WHOLE sales tree, not one district — a desk issues to
  // any partner, director or senior director who walks in. (The hierarchy tree
  // lives on the View Partner page.) ────────────────────────────────────────
  if (mayIssue) {
    // EVERY user, not just the sales tree: the ledger names whoever recorded a
    // movement, and that is an Admin or a branch desk — neither of which is in
    // SALES_HIERARCHY. One fetch serves both the table and the ledger below.
    const [{ data: userData }, { data: couponData }] = await Promise.all([
      sb.from("users").select("id, full_name, role, partner_code").order("full_name", { ascending: true }),
      // Coupons may not be migrated yet — fall back to empty.
      sb
        .from("coupons")
        .select("id, user_id, type, quantity, value, source, note, issued_by, created_at")
        .order("created_at", { ascending: false }),
    ]);
    const allUsers = (userData ?? []) as Pick<User, "id" | "full_name" | "role" | "partner_code">[];
    const salesUsers = allUsers.filter((u) => SALES_HIERARCHY.includes(u.role as Role));
    const userById = new Map(allUsers.map((u) => [u.id, u]));

    const coupons = (couponData ?? []) as {
      id: string;
      user_id: string;
      type: string;
      quantity: number;
      value: number;
      source: string;
      note: string | null;
      issued_by: string | null;
      created_at: string;
    }[];

    // Value-based types (tools/digital/gold) sum their ₹ value; the rest count
    // whole tokens. Redemptions are negative rows, so the same sum handles both.
    const balancesByUser = new Map<string, Record<string, number>>();
    for (const c of coupons) {
      const m = balancesByUser.get(c.user_id) ?? {};
      m[c.type] = (m[c.type] ?? 0) + (isValueCoupon(c.type) ? Number(c.value || 0) : Number(c.quantity || 0));
      balancesByUser.set(c.user_id, m);
    }

    // The movements behind those balances. Same rows, unsummed.
    const typeLabel = Object.fromEntries(COUPON_TYPES.map((t) => [t.value, t.label]));
    const ledger: LedgerRow[] = coupons.map((c) => {
      const valueBased = isValueCoupon(c.type);
      const amount = valueBased ? Number(c.value || 0) : Number(c.quantity || 0);
      const holder = userById.get(c.user_id);
      const issuer = c.issued_by ? userById.get(c.issued_by) : null;
      // 'auto' rows are the coupons issued by a registration, not by a person.
      const auto = c.source === "auto";
      return {
        id: c.id,
        date: c.created_at,
        holder: holder?.full_name ?? "(removed user)",
        holderCode: holder?.partner_code ?? null,
        holderRole: (holder?.role as Role | undefined) ?? null,
        type: typeLabel[c.type] ?? c.type,
        action: c.source === "redeem" || amount < 0 ? "Redeemed" : "Issued",
        amount,
        valueBased,
        note: c.note ?? "",
        by: auto ? "Registration" : (issuer?.full_name ?? "—"),
        auto,
      };
    });

    const couponRows: CouponRow[] = salesUsers.map((u) => ({
      id: u.id,
      name: u.full_name,
      code: u.partner_code ?? null,
      role: u.role as Role,
      balances: balancesByUser.get(u.id) ?? {},
    }));

    const stats = [
      { label: "Sales People", value: couponRows.length },
      ...SALES_HIERARCHY.map((r) => ({
        label: ROLE_LABELS[r],
        value: couponRows.filter((n) => n.role === r).length,
      })),
    ];
    const initialTab = (await searchParams).tab === "history" ? "history" : "holdings";

    return (
      <>
        <PageHeader
          title="Issue Token"
          subtitle="Every salesperson and what they currently hold. Issue tokens / coupons, or redeem against a balance — the handover happens offline, this is the record of it."
        />
        <TokenWorkspace
          rows={couponRows}
          ledger={ledger}
          types={COUPON_TYPES}
          stats={stats}
          initialTab={initialTab}
        />
      </>
    );
  }

  // One flat fetch — the client builds & renders the tree (only expanded
  // branches hit the DOM, so this scales to thousands of rows).
  const { data } = await sb
    .from("users")
    .select("id, full_name, email, mobile, role, manager_id, is_active")
    .not("email", "in", HIDDEN_IN_LIST) // hidden dev/support accounts never appear
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
  // The hidden dev account is excluded from the tree itself, so rooting at it
  // would yield nothing — while switched into a sales role it sees the whole
  // org instead, which is the point of the switcher.
  const nodes = actor.isDev ? allNodes : allNodes.filter((n) => keep.has(n.id));

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
