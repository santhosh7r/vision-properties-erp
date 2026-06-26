import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { COUPON_TYPES, isValueCoupon } from "@/lib/options";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { CreditCard, Cog, Grid, Sparkle } from "@/components/icons";
import TokenHistory, { type HistoryRow } from "./TokenHistory";

export const dynamic = "force-dynamic";

// Icon + accent per token type (mirrors the Profile token cards).
const TOKEN_META: Record<string, { icon: React.ReactNode; color: string }> = {
  cab: { icon: <CreditCard size={18} />, color: "#e4433a" },
  tools: { icon: <Cog size={18} />, color: "#428fdf" },
  digital: { icon: <Grid size={18} />, color: "#8b5cf6" },
  gold: { icon: <Sparkle size={18} />, color: "#f59e0b" },
};

// Sales · Tokens — everything in one place: how many of each token the user
// currently holds, plus the full issue / redeem history. Sales people can only
// VIEW this; an admin issues and redeems on the Issue Token page.
export default async function TokensPage() {
  const user = await requireUser();
  const sb = getSupabase();

  // Coupons may not be migrated yet — fall back to empty.
  const { data: couponData } = await sb
    .from("coupons")
    .select("id, type, quantity, value, source, note, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const coupons = (couponData ?? []) as {
    id: string;
    type: string;
    quantity: number;
    value: number;
    source: string;
    note: string | null;
    created_at: string;
  }[];

  // Balance per type = sum of the ledger (redemptions are negative rows). Value
  // coupons (tools) sum their ₹ value; the rest count whole tokens.
  const balances: Record<string, number> = {};
  for (const c of coupons) {
    balances[c.type] = (balances[c.type] ?? 0) + (isValueCoupon(c.type) ? Number(c.value || 0) : Number(c.quantity || 0));
  }

  const typeLabel = Object.fromEntries(COUPON_TYPES.map((t) => [t.value, t.label]));
  const history: HistoryRow[] = coupons.map((c) => {
    const valueBased = isValueCoupon(c.type);
    const amount = valueBased ? Number(c.value || 0) : Number(c.quantity || 0);
    const redeemed = c.source === "redeem" || amount < 0;
    return {
      id: c.id,
      date: c.created_at,
      type: typeLabel[c.type] ?? c.type,
      action: redeemed ? "Redeemed" : "Issued",
      amount,
      valueBased,
      note: c.note ?? "",
    };
  });

  return (
    <>
      <PageHeader
        title="Tokens"
        subtitle="Your token & coupon balances and history."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {COUPON_TYPES.map((t) => {
          const meta = TOKEN_META[t.value];
          return (
            <div
              key={t.value}
              className="rounded-2xl border p-4"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
            >
              {meta?.icon && (
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ background: `${meta.color}1f`, color: meta.color }}
                >
                  {meta.icon}
                </span>
              )}
              <div className="mt-3 text-xs text-[var(--muted)]">{t.label}</div>
              <div className="mt-0.5 text-2xl font-semibold tabular-nums">
                {isValueCoupon(t.value) ? inr(balances[t.value] ?? 0) : (balances[t.value] ?? 0)}
              </div>
              <div className="mt-1 text-[11px] text-[var(--muted)]">Available balance</div>
            </div>
          );
        })}
      </div>

      <h2 className="mb-3 text-sm font-semibold">Token History</h2>
      <TokenHistory rows={history} />
    </>
  );
}
