"use client";

import { useState } from "react";
import DataTable, { type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { inr, fmtDateTime } from "@/lib/format";
import { extendHold } from "../../plots/actions";

export interface ExtendRow {
  bookingId: string;
  project: string;
  plot: string;
  customer: string;
  value: number;
  mode: string; // blocking | booking
  expiredAt: string | null;
}

// Auto-expired holds whose plot is still free. The plot has already been
// released back to inventory (anyone may block/book it), but an Admin can still
// EXTEND it back to the original customer for a custom duration — until someone
// else takes it, at which point the row disappears from this list.
export default function ExtendTable({ rows }: { rows: ExtendRow[] }) {
  const columns: Column<ExtendRow>[] = [
    { id: "project", header: "Project", sort: (r) => r.project.toLowerCase(), cell: (r) => <span className="font-medium text-[var(--text)]">{r.project}</span> },
    { id: "plot", header: "Plot", sort: (r) => r.plot, cell: (r) => <span className="font-medium">{r.plot}</span> },
    { id: "customer", header: "Was Held By", sort: (r) => r.customer.toLowerCase(), hideBelow: "sm", cell: (r) => r.customer },
    { id: "mode", header: "Mode", sort: (r) => r.mode, hideBelow: "md", cell: (r) => <Badge tone={r.mode === "booking" ? "blue" : "amber"}>{r.mode}</Badge> },
    { id: "value", header: "Value", align: "right", sort: (r) => r.value, hideBelow: "md", cell: (r) => <span className="tabular-nums">{inr(r.value)}</span> },
    { id: "expired", header: "Expired", hideBelow: "lg", sort: (r) => r.expiredAt ?? "", cell: (r) => <span className="whitespace-nowrap text-[var(--muted)]">{fmtDateTime(r.expiredAt)}</span> },
    {
      id: "action",
      header: "Extend for original customer",
      align: "right",
      cell: (r) => <ExtendForm bookingId={r.bookingId} />,
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
          id: "mode",
          label: "Mode",
          options: [
            { value: "blocking", label: "Blocking" },
            { value: "booking", label: "Booking" },
          ],
          match: (r, v) => r.mode === v,
        },
      ]}
      emptyMessage="No released holds available to extend."
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
