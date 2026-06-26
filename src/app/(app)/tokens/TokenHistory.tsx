"use client";

import DataTable, { type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui";
import { fmtDate, inr } from "@/lib/format";

export interface HistoryRow {
  id: string;
  date: string;
  type: string;
  action: "Issued" | "Redeemed";
  amount: number;
  valueBased: boolean;
  note: string;
}

function amountLabel(r: HistoryRow): string {
  const body = r.valueBased ? inr(Math.abs(r.amount)) : String(Math.abs(r.amount));
  return r.amount < 0 ? `−${body}` : `+${body}`;
}

export default function TokenHistory({ rows }: { rows: HistoryRow[] }) {
  const columns: Column<HistoryRow>[] = [
    { id: "date", header: "Date", sort: (r) => r.date, cell: (r) => <span className="whitespace-nowrap text-[var(--muted)]">{fmtDate(r.date)}</span> },
    { id: "type", header: "Token", sort: (r) => r.type, cell: (r) => <span className="font-medium text-[var(--text)]">{r.type}</span> },
    { id: "action", header: "Action", sort: (r) => r.action, cell: (r) => <Badge tone={r.action === "Redeemed" ? "amber" : "green"}>{r.action}</Badge> },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      sort: (r) => r.amount,
      cell: (r) => (
        <span className="tabular-nums font-medium" style={{ color: r.amount < 0 ? "#e4433a" : undefined }}>
          {amountLabel(r)}
        </span>
      ),
    },
    { id: "note", header: "Note", hideBelow: "md", cell: (r) => <span className="text-[var(--muted)]">{r.note || "—"}</span> },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      search={(r) => `${r.type} ${r.action} ${r.note}`}
      searchPlaceholder="Search token, note…"
      filters={[
        {
          id: "action",
          label: "Action",
          options: [
            { value: "Issued", label: "Issued" },
            { value: "Redeemed", label: "Redeemed" },
          ],
          match: (r, v) => r.action === v,
        },
      ]}
      emptyMessage="No token activity yet."
    />
  );
}
