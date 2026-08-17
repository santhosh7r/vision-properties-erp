"use client";

import { useState } from "react";
import PendingReleaseTable, { type PendingRow } from "./PendingReleaseTable";
import ReleasedHistory, { type ReleasedRow } from "./ReleasedHistory";

type Tab = "pending" | "history";

function TabButton({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors"
      style={
        active
          ? { background: "var(--surface)", color: "var(--text)", boxShadow: "0 1px 2px rgba(0,0,0,0.25)" }
          : { background: "transparent", color: "var(--muted)" }
      }
    >
      {children}
      <span
        className="rounded-full px-1.5 text-[11px] tabular-nums"
        style={{ background: "var(--surface-2)", color: "var(--muted)" }}
      >
        {count}
      </span>
    </button>
  );
}

// Two tabs is the whole page: what still needs a decision, and what is done.
// Expired holds and cancelled plots share the first one — both are off the
// market, neither returns to inventory on its own, and both are settled by the
// same Release button.
export default function ReleaseTabs({
  pendingRows,
  historyRows,
}: {
  pendingRows: PendingRow[];
  historyRows: ReleasedRow[];
}) {
  const [tab, setTab] = useState<Tab>("pending");

  return (
    <div className="space-y-4">
      <div
        className="inline-flex gap-1 rounded-lg border p-1"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        <TabButton active={tab === "pending"} onClick={() => setTab("pending")} count={pendingRows.length}>
          Expired holds
        </TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")} count={historyRows.length}>
          History
        </TabButton>
      </div>

      <p className="text-xs text-[var(--muted)]">
        {tab === "pending"
          ? "Everything waiting on you. A hold that ran past its deadline still owns its plot — extend it for the customer, or release it. A cancelled booking has no hold left to extend, so it can only be released. Nothing here goes back on the market until you say so."
          : "Plots that have already gone back to the company — a record of what you released. Releasing is final: nothing here can be extended, released again or reinstated. The plot is plain inventory now, and the next customer takes it through the normal blocking or booking flow."}
      </p>

      {tab === "pending" ? <PendingReleaseTable rows={pendingRows} /> : <ReleasedHistory rows={historyRows} />}
    </div>
  );
}
