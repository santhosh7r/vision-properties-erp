"use client";

import DataTable, { type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { inr } from "@/lib/format";
import type { LeaderboardRow } from "@/lib/queries";

const ROLE_TONE: Record<string, "blue" | "green" | "gray"> = {
  senior_director: "blue",
  director: "blue",
  business_manager: "green",
  business_partner: "gray",
};

// Who sold how much — sortable per-salesperson performance.
export default function LeaderboardTable({ rows }: { rows: LeaderboardRow[] }) {
  const columns: Column<LeaderboardRow>[] = [
    {
      id: "name",
      header: "Sales Person",
      sort: (r) => r.name.toLowerCase(),
      cell: (r) => (
        <div>
          <div className="font-medium text-[var(--text)]">{r.name}</div>
          {r.code && <div className="font-mono text-xs text-[var(--muted)]">{r.code}</div>}
        </div>
      ),
    },
    { id: "role", header: "Role", sort: (r) => r.role, hideBelow: "md", cell: (r) => <Badge tone={ROLE_TONE[r.role] ?? "gray"}>{ROLE_LABELS[r.role as Role]}</Badge> },
    { id: "blockings", header: "Blockings", align: "right", sort: (r) => r.blockings, cell: (r) => <span className="tabular-nums">{r.blockings}</span> },
    { id: "bookings", header: "Bookings", align: "right", sort: (r) => r.bookings, cell: (r) => <span className="tabular-nums">{r.bookings}</span> },
    { id: "registrations", header: "Registered", align: "right", hideBelow: "lg", sort: (r) => r.registrations, cell: (r) => <span className="tabular-nums">{r.registrations}</span> },
    { id: "cancellations", header: "Cancelled", align: "right", hideBelow: "lg", sort: (r) => r.cancellations, cell: (r) => <span className="tabular-nums text-[var(--muted)]">{r.cancellations}</span> },
    { id: "value", header: "Sales Value", align: "right", sort: (r) => r.value, cell: (r) => <span className="tabular-nums font-medium">{inr(r.value)}</span> },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      search={(r) => `${r.name} ${r.code ?? ""} ${ROLE_LABELS[r.role as Role]}`}
      searchPlaceholder="Search sales person, ID…"
      filters={[
        {
          id: "role",
          label: "Role",
          options: (["senior_director", "director", "business_manager", "business_partner"] as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] })),
          match: (r, v) => r.role === v,
        },
      ]}
      emptyMessage="No sales recorded yet."
    />
  );
}
