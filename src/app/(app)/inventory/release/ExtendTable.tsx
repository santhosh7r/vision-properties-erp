"use client";

import { useState } from "react";
import DataTable, { type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { inr, fmtDateTime } from "@/lib/format";
import { extendHold, releasePlot } from "../../plots/actions";

export interface ExtendRow {
  bookingId: string;
  plotId: string;
  project: string;
  plot: string;
  customer: string;
  value: number;
  mode: string; // blocking | booking
  stillHeld: boolean; // false = released under the old auto-release behaviour
  confirmed: boolean; // an Admin had confirmed this hold before it expired
  expiredAt: string | null;
}

// Expired holds that STILL hold their plot — expiry only flags them, it never
// releases anything. An Admin either EXTENDS the hold (new deadline, same plot,
// same customer) or RELEASES the plot back to the company. Until one of those
// happens the plot stays off the market for everyone else.
export default function ExtendTable({ rows }: { rows: ExtendRow[] }) {
  const columns: Column<ExtendRow>[] = [
    { id: "project", header: "Project", sort: (r) => r.project.toLowerCase(), cell: (r) => <span className="font-medium text-[var(--text)]">{r.project}</span> },
    { id: "plot", header: "Plot", sort: (r) => r.plot, cell: (r) => <span className="font-medium">{r.plot}</span> },
    { id: "customer", header: "Was Held By", sort: (r) => r.customer.toLowerCase(), hideBelow: "sm", cell: (r) => r.customer },
    { id: "mode", header: "Mode", sort: (r) => r.mode, hideBelow: "md", cell: (r) => <Badge tone={r.mode === "booking" ? "blue" : "amber"}>{r.mode}</Badge> },
    {
      id: "stage",
      header: "Plot Status",
      sort: (r) => (r.stillHeld ? (r.confirmed ? "2" : "1") : "0"),
      hideBelow: "md",
      cell: (r) =>
        !r.stillHeld ? (
          <Badge tone="red">Already released</Badge>
        ) : (
          <Badge tone={r.confirmed ? "green" : "gray"}>{r.confirmed ? "Held · confirmed" : "Held · awaiting confirmation"}</Badge>
        ),
    },
    { id: "value", header: "Value", align: "right", sort: (r) => r.value, hideBelow: "md", cell: (r) => <span className="tabular-nums">{inr(r.value)}</span> },
    { id: "expired", header: "Expired", hideBelow: "lg", sort: (r) => r.expiredAt ?? "", cell: (r) => <span className="whitespace-nowrap text-[var(--muted)]">{fmtDateTime(r.expiredAt)}</span> },
    {
      id: "action",
      header: "Extend or release",
      align: "right",
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <ExtendForm bookingId={r.bookingId} />
          {/* Nothing to release on a hold whose plot is already back in
              inventory — extending is the only move left on those. */}
          {r.stillHeld && (
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
          )}
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
          id: "mode",
          label: "Mode",
          options: [
            { value: "blocking", label: "Blocking" },
            { value: "booking", label: "Booking" },
          ],
          match: (r, v) => r.mode === v,
        },
      ]}
      emptyMessage="No expired holds waiting on a decision."
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
