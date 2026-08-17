"use client";

import DataTable, { type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui";
import { inr, fmtDateTime } from "@/lib/format";

export interface ReleasedRow {
  bookingId: string;
  project: string;
  plot: string;
  customer: string;
  value: number;
  mode: string; // blocking | booking
  releasedAt: string | null;
}

// HISTORY — plots that have already gone back to the company. Strictly a record:
// releasing is FINAL and there is no way back from here. A released hold cannot
// be extended, cannot be released again, and cannot be reinstated; the plot is
// simply inventory once more and the next customer takes it through the normal
// blocking/booking flow.
export default function ReleasedHistory({ rows }: { rows: ReleasedRow[] }) {
  const columns: Column<ReleasedRow>[] = [
    { id: "project", header: "Project", sort: (r) => r.project.toLowerCase(), cell: (r) => <span className="font-medium text-[var(--text)]">{r.project}</span> },
    { id: "plot", header: "Plot", sort: (r) => r.plot, cell: (r) => <span className="font-medium">{r.plot}</span> },
    { id: "customer", header: "Was Held By", sort: (r) => r.customer.toLowerCase(), hideBelow: "sm", cell: (r) => r.customer },
    { id: "mode", header: "Mode", sort: (r) => r.mode, hideBelow: "md", cell: (r) => <Badge tone={r.mode === "booking" ? "blue" : "amber"}>{r.mode}</Badge> },
    { id: "value", header: "Value", align: "right", sort: (r) => r.value, hideBelow: "md", cell: (r) => <span className="tabular-nums">{inr(r.value)}</span> },
    {
      id: "status",
      header: "Status",
      cell: () => <Badge tone="gray">Released</Badge>,
    },
    {
      id: "releasedAt",
      header: "Released",
      sort: (r) => r.releasedAt ?? "",
      cell: (r) => <span className="whitespace-nowrap text-[var(--muted)]">{fmtDateTime(r.releasedAt)}</span>,
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
      emptyMessage="No plots have been released yet."
    />
  );
}
