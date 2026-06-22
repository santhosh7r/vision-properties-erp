"use client";

import Link from "next/link";
import DataTable, { type Column } from "@/components/DataTable";
import { PlotStatusBadge } from "@/components/ui";
import { inr } from "@/lib/format";

export interface PlotRow {
  id: string;
  project: string;
  plot_no: string;
  sqft: number;
  value: number;
  status: string;
}

export default function PlotsTable({ rows }: { rows: PlotRow[] }) {
  const columns: Column<PlotRow>[] = [
    { id: "project", header: "Project", sort: (r) => r.project.toLowerCase(), cell: (r) => <span className="font-medium text-[var(--text)]">{r.project}</span> },
    { id: "plot_no", header: "Plot No", sort: (r) => r.plot_no, cell: (r) => <span className="font-medium">{r.plot_no}</span> },
    { id: "sqft", header: "Sq.ft", align: "right", sort: (r) => r.sqft, hideBelow: "sm", cell: (r) => <span className="tabular-nums">{r.sqft}</span> },
    { id: "value", header: "Plot Value", align: "right", sort: (r) => r.value, cell: (r) => <span className="tabular-nums">{inr(r.value)}</span> },
    { id: "status", header: "Status", sort: (r) => r.status, cell: (r) => <PlotStatusBadge status={r.status} /> },
    { id: "action", header: "", align: "right", cell: (r) => (
      <Link href={`/plots/${r.id}`} onClick={(e) => e.stopPropagation()} className="btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}>Open</Link>
    ) },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowHref={(r) => `/plots/${r.id}`}
      search={(r) => `${r.project} ${r.plot_no}`}
      searchPlaceholder="Search project, plot no…"
      filters={[{
        id: "status",
        label: "Status",
        options: [
          { value: "available", label: "Available" },
          { value: "blocked", label: "Blocked" },
          { value: "booked", label: "Booked" },
          { value: "registered", label: "Registered" },
          { value: "sold", label: "Sold" },
          { value: "cancelled", label: "Cancelled" },
        ],
        match: (r, v) => r.status === v,
      }]}
      emptyMessage="No plots found."
    />
  );
}
