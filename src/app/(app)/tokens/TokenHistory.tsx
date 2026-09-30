"use client";

import DataTable, { type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui";
import { fmtDate, inr } from "@/lib/format";
import { TOKEN_ORIGIN_LABELS, type TokenOrigin } from "@/lib/token-source";

export interface HistoryRow {
  id: string;
  date: string;
  type: string;
  action: "Issued" | "Redeemed";
  amount: number;
  valueBased: boolean;
  note: string;
  // Where it came from and which plot it was for (lib/token-source).
  origin: TokenOrigin;
  originLabel: string;
  reference: string;
  plot: string;
  customer: string;
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
    {
      id: "source",
      header: "Source",
      sort: (r) => r.originLabel,
      cell: (r) => (
        <div>
          <div className="whitespace-nowrap text-[var(--text)]">{r.originLabel}</div>
          {r.reference && <div className="font-mono text-xs text-[var(--muted)]">{r.reference}</div>}
        </div>
      ),
    },
    {
      id: "plot",
      header: "For Plot",
      sort: (r) => r.plot.toLowerCase(),
      cell: (r) => (
        <div>
          <div className={r.plot ? "font-medium text-[var(--text)]" : "text-[var(--muted)]"}>{r.plot || "—"}</div>
          {r.customer && <div className="text-xs text-[var(--muted)]">{r.customer}</div>}
        </div>
      ),
    },
    { id: "note", header: "Note", hideBelow: "lg", cell: (r) => <span className="text-[var(--muted)]">{r.note || "—"}</span> },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      search={(r) => `${r.type} ${r.action} ${r.originLabel} ${r.reference} ${r.plot} ${r.customer} ${r.note}`}
      searchPlaceholder="Search token, plot, customer, reg. no…"
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
        {
          id: "source",
          label: "Source",
          options: (Object.keys(TOKEN_ORIGIN_LABELS) as TokenOrigin[]).map((o) => ({ value: o, label: TOKEN_ORIGIN_LABELS[o] })),
          match: (r, v) => r.origin === v,
        },
      ]}
      emptyMessage="No token activity yet."
    />
  );
}
