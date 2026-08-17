"use client";

import { useState } from "react";
import DataTable, { type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { inr, fmtDateTime } from "@/lib/format";
import { extendHold, releasePlot } from "../../plots/actions";

export interface PendingRow {
  key: string;
  bookingId: string | null; // null when no booking sits behind a cancelled plot
  plotId: string;
  project: string;
  plot: string;
  customer: string;
  value: number;
  mode: string; // blocking | booking
  // How the plot ended up waiting on a decision:
  //   expired   — the hold ran past its deadline; still holding the plot
  //   cancelled — the booking was cancelled; the plot is parked, not on sale
  kind: "expired" | "cancelled";
  confirmed: boolean; // expired rows: was the hold confirmed before it lapsed
  refundStatus: string; // cancelled rows: where the refund got to
  since: string | null; // expired_at / cancelled_at
}

const REFUND: Record<string, { label: string; tone: "gray" | "amber" | "blue" | "green" }> = {
  none: { label: "No refund", tone: "gray" },
  pending_approval: { label: "Refund pending", tone: "amber" },
  approved: { label: "Refund approved", tone: "blue" },
  paid: { label: "Refunded", tone: "green" },
};

// ONE queue for everything waiting on an Admin: holds that ran out of time and
// plots whose booking was cancelled. Both are off the market and neither returns
// to inventory by itself, so they belong in the same list — the difference is
// only what you may do with them:
//   · expired   → Extend (more time, same plot, same customer) or Release
//   · cancelled → Release only; the deal is already over, so there is no hold to
//                 extend. Its refund is handled on Payments & Cancellation.
export default function PendingReleaseTable({ rows }: { rows: PendingRow[] }) {
  const columns: Column<PendingRow>[] = [
    { id: "project", header: "Project", sort: (r) => r.project.toLowerCase(), cell: (r) => <span className="font-medium text-[var(--text)]">{r.project}</span> },
    { id: "plot", header: "Plot", sort: (r) => r.plot, cell: (r) => <span className="font-medium">{r.plot}</span> },
    { id: "customer", header: "Was Held By", sort: (r) => r.customer.toLowerCase(), hideBelow: "sm", cell: (r) => r.customer },
    {
      id: "kind",
      header: "Waiting Because",
      sort: (r) => r.kind,
      cell: (r) =>
        r.kind === "expired" ? (
          <div className="leading-tight">
            <Badge tone="amber">Hold expired</Badge>
            <div className="mt-0.5 text-xs text-[var(--muted)]">
              {r.confirmed ? "was confirmed" : "never confirmed"}
            </div>
          </div>
        ) : (
          <div className="leading-tight">
            <Badge tone="red">Booking cancelled</Badge>
            <div className="mt-0.5 text-xs text-[var(--muted)]">
              {(REFUND[r.refundStatus] ?? REFUND.none).label}
            </div>
          </div>
        ),
    },
    { id: "mode", header: "Mode", sort: (r) => r.mode, hideBelow: "lg", cell: (r) => <Badge tone={r.mode === "booking" ? "blue" : "amber"}>{r.mode}</Badge> },
    { id: "value", header: "Value", align: "right", sort: (r) => r.value, hideBelow: "md", cell: (r) => <span className="tabular-nums">{inr(r.value)}</span> },
    { id: "since", header: "Since", hideBelow: "lg", sort: (r) => r.since ?? "", cell: (r) => <span className="whitespace-nowrap text-[var(--muted)]">{fmtDateTime(r.since)}</span> },
    {
      id: "action",
      header: "Extend or release",
      align: "right",
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          {/* A cancelled deal has no live hold to give more time to. */}
          {r.kind === "expired" && r.bookingId && <ExtendForm bookingId={r.bookingId} />}
          <form action={releasePlot} onClick={(e) => e.stopPropagation()}>
            <input type="hidden" name="plot_id" value={r.plotId} />
            <SubmitButton
              className="btn-ghost text-[var(--brand-red)]"
              style={{ padding: "5px 12px", fontSize: 12 }}
              pendingLabel="Releasing…"
            >
              Release
            </SubmitButton>
          </form>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      search={(r) => `${r.project} ${r.plot} ${r.customer}`}
      searchPlaceholder="Search project, plot, customer…"
      filters={[
        {
          id: "kind",
          label: "Waiting because",
          options: [
            { value: "expired", label: "Hold expired" },
            { value: "cancelled", label: "Booking cancelled" },
          ],
          match: (r, v) => r.kind === v,
        },
        {
          id: "mode",
          label: "Mode",
          options: [
            { value: "blocking", label: "Blocking" },
            { value: "booking", label: "Booking" },
          ],
          match: (r, v) => r.mode === v,
        },
      ]}
      emptyMessage="Nothing waiting on a decision."
    />
  );
}

function ExtendForm({ bookingId }: { bookingId: string }) {
  const [value, setValue] = useState(24);
  const [unit, setUnit] = useState<"hours" | "days">("hours");
  return (
    <form action={extendHold} onClick={(e) => e.stopPropagation()} className="flex items-center justify-end gap-2">
      <input type="hidden" name="booking_id" value={bookingId} />
      <input
        type="number"
        name="value"
        min={1}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="input w-16 tabular-nums"
        style={{ padding: "5px 8px", fontSize: 12 }}
        aria-label="Extend duration"
      />
      <select
        name="unit"
        value={unit}
        onChange={(e) => setUnit(e.target.value as "hours" | "days")}
        className="input"
        style={{ padding: "5px 8px", fontSize: 12 }}
        aria-label="Extend unit"
      >
        <option value="hours">hours</option>
        <option value="days">days</option>
      </select>
      <SubmitButton className="btn-primary" style={{ padding: "5px 12px", fontSize: 12 }} pendingLabel="Extending…">
        Extend
      </SubmitButton>
    </form>
  );
}
