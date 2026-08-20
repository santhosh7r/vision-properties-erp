"use client";

import { useState } from "react";
import { StatCard } from "@/components/ui";
import CouponsTable, { type CouponRow } from "./CouponsTable";
import CouponLedger, { type LedgerRow } from "./CouponLedger";

type Tab = "holdings" | "history";

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors"
      style={
        active
          ? { background: "var(--surface)", color: "var(--text)", boxShadow: "0 1px 2px rgba(0,0,0,0.25)" }
          : { background: "transparent", color: "var(--muted)" }
      }
    >
      {children}
    </button>
  );
}

// The whole token surface on ONE page, as two tabs:
//   • Holdings — every salesperson and what they currently hold, with the
//     Issue / Redeem actions.
//   • History  — every movement behind those balances, issue and redeem alike.
// Mirrors the Post-Sales tab pattern so the two workspaces feel the same.
export default function TokenWorkspace({
  rows,
  ledger,
  types,
  stats,
  initialTab = "holdings",
}: {
  rows: CouponRow[];
  ledger: LedgerRow[];
  types: { value: string; label: string }[];
  stats: { label: string; value: number }[];
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const redeemed = ledger.filter((r) => r.action === "Redeemed").length;

  return (
    <div className="space-y-5">
      <div
        className="inline-flex flex-wrap gap-1 rounded-lg border p-1"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        <TabButton active={tab === "holdings"} onClick={() => setTab("holdings")}>
          Holdings
        </TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")}>
          History{ledger.length > 0 ? ` (${ledger.length})` : ""}
        </TabButton>
      </div>

      {tab === "holdings" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {stats.map((s) => (
              <StatCard key={s.label} label={s.label} value={s.value} />
            ))}
          </div>
          <CouponsTable rows={rows} />
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-5">
          <p className="text-xs text-[var(--muted)]">
            Every issue and redemption, newest first — the movements the balances on Holdings are summed
            from.{" "}
            {ledger.length > 0 && (
              <>
                {ledger.length} movement{ledger.length === 1 ? "" : "s"}
                {redeemed > 0 && `, ${redeemed} of them redemptions`}.
              </>
            )}
          </p>
          <CouponLedger rows={ledger} types={types} />
        </div>
      )}
    </div>
  );
}
