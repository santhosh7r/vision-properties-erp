"use client";

import Link from "next/link";
import DataTable, { type Column } from "@/components/DataTable";
import { fmtDate } from "@/lib/format";

export interface CustomerRow {
  id: string;
  name: string;
  mobile: string;
  location: string;
  occupation: string;
  plots: number;
  created_at: string;
  owner?: string;
}

export default function CustomersTable({ rows, showOwner = false }: { rows: CustomerRow[]; showOwner?: boolean }) {
  const columns: Column<CustomerRow>[] = [
    { id: "name", header: "Customer", sort: (r) => r.name.toLowerCase(), cell: (r) => <span className="font-medium text-[var(--text)]">{r.name}</span> },
    { id: "mobile", header: "Mobile", cell: (r) => r.mobile },
    { id: "location", header: "Location", hideBelow: "md", cell: (r) => <span className="text-[var(--muted)]">{r.location || "—"}</span> },
    { id: "occupation", header: "Occupation", hideBelow: "lg", cell: (r) => r.occupation || "—" },
    ...(showOwner
      ? [{
          id: "owner",
          header: "Added By",
          hideBelow: "md" as const,
          sort: (r: CustomerRow) => (r.owner ?? "").toLowerCase(),
          cell: (r: CustomerRow) => <span className="text-[var(--muted)]">{r.owner ?? "—"}</span>,
        }]
      : []),
    { id: "plots", header: "Plots", align: "right", sort: (r) => r.plots, cell: (r) => <span className="tabular-nums font-medium">{r.plots}</span> },
    { id: "added", header: "Added", hideBelow: "sm", sort: (r) => r.created_at, cell: (r) => <span className="whitespace-nowrap text-[var(--muted)]">{fmtDate(r.created_at)}</span> },
    { id: "action", header: "", align: "right", cell: (r) => (
      <Link href={`/customers/${r.id}`} onClick={(e) => e.stopPropagation()} className="btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}>Open</Link>
    ) },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowHref={(r) => `/customers/${r.id}`}
      search={(r) => `${r.name} ${r.mobile} ${r.location} ${r.occupation} ${r.owner ?? ""}`}
      searchPlaceholder="Search name, mobile, location…"
      emptyMessage="No customers found."
      emptyHint="Add a customer to begin a booking."
    />
  );
}
