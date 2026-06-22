"use client";

import { useState } from "react";
import PaymentLedger, { type LedgerRow } from "./PaymentLedger";
import PaymentsTable, { type PaymentRow } from "./PaymentsTable";

// Single payments surface with a segmented toggle: switch between the per-
// transaction ledger (all payments incl. refunds) and the per-deal outstanding
// view — instead of stacking two separate tables.
type View = "ledger" | "deals";

function Tab({
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

export default function PaymentsWorkspace({
  ledger,
  deals,
}: {
  ledger: LedgerRow[];
  deals: PaymentRow[];
}) {
  const [view, setView] = useState<View>("ledger");

  return (
    <div className="space-y-4">
      <div
        className="inline-flex gap-1 rounded-lg border p-1"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        <Tab active={view === "ledger"} onClick={() => setView("ledger")}>
          Payment Transactions
        </Tab>
        <Tab active={view === "deals"} onClick={() => setView("deals")}>
          Deals — Outstanding by Booking
        </Tab>
      </div>

      {view === "ledger" ? <PaymentLedger rows={ledger} /> : <PaymentsTable rows={deals} />}
    </div>
  );
}
