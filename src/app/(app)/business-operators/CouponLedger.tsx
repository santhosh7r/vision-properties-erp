"use client";

import DataTable, { type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { fmtDateTime, inr } from "@/lib/format";

// One movement in the coupon ledger. Balances on the table above are the SUM of
// these rows, so this is the audit trail behind every number shown there: what
// was handed over, to whom, by whom, and when.
export interface LedgerRow {
  id: string;
  date: string;
  // Who now holds (or held) it.
  holder: string;
  holderCode: string | null;
  holderRole: Role | null;
  type: string;
  action: "Issued" | "Redeemed";
  // Signed: positive on issue, negative on redeem. Value-based types carry ₹.
  amount: number;
  valueBased: boolean;
  note: string;
  // Who recorded it — a person's name, or the registration that auto-issued it.
  by: string;
  auto: boolean;
}

function amountLabel(r: LedgerRow): string {
  const body = r.valueBased ? inr(Math.abs(r.amount)) : String(Math.abs(r.amount));
  return `${r.amount < 0 ? "−" : "+"}${body}`;
}

export default function CouponLedger({ rows, types }: { rows: LedgerRow[]; types: { value: string; label: string }[] }) {
  const columns: Column<LedgerRow>[] = [
    {
      id: "date",
      header: "Date",
      sort: (r) => r.date,
      cell: (r) => <span className="whitespace-nowrap text-[var(--muted)]">{fmtDateTime(r.date)}</span>,
    },
    {
      id: "holder",
      header: "Holder",
      sort: (r) => r.holder.toLowerCase(),
      cell: (r) => (
        <div>
          <div className="font-medium text-[var(--text)]">{r.holder}</div>
          {r.holderCode && <div className="font-mono text-xs text-[var(--muted)]">{r.holderCode}</div>}
        </div>
      ),
    },
    {
      id: "role",
      header: "Role",
      hideBelow: "lg",
      sort: (r) => r.holderRole ?? "",
      cell: (r) => (
        <span className="text-xs text-[var(--muted)]">{r.holderRole ? ROLE_LABELS[r.holderRole] : "—"}</span>
      ),
    },
    { id: "type", header: "Token", sort: (r) => r.type, cell: (r) => <span className="font-medium text-[var(--text)]">{r.type}</span> },
    {
      id: "action",
      header: "Action",
      sort: (r) => r.action,
      cell: (r) => <Badge tone={r.action === "Redeemed" ? "amber" : "green"}>{r.action}</Badge>,
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      sort: (r) => r.amount,
      // Redemptions are shown in red and signed, so a balance that dropped can be
      // traced to the exact row that took it out.
      cell: (r) => (
        <span className="font-medium tabular-nums" style={{ color: r.amount < 0 ? "#e4433a" : undefined }}>
          {amountLabel(r)}
        </span>
      ),
    },
    {
      id: "by",
      header: "Recorded By",
      hideBelow: "md",
      sort: (r) => r.by.toLowerCase(),
      cell: (r) => (
        <span className="text-xs text-[var(--muted)]">
          {r.by}
          {r.auto && <span className="ml-1 opacity-70">(auto)</span>}
        </span>
      ),
    },
    { id: "note", header: "Note", hideBelow: "lg", cell: (r) => <span className="text-[var(--muted)]">{r.note || "—"}</span> },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      search={(r) => `${r.holder} ${r.holderCode ?? ""} ${r.type} ${r.action} ${r.note} ${r.by}`}
      searchPlaceholder="Search holder, ID, token, note…"
      filters={[
        {
          id: "action",
          label: "Action",
          options: [
            { value: "Redeemed", label: "Redeemed" },
            { value: "Issued", label: "Issued" },
          ],
          match: (r, v) => r.action === v,
        },
        {
          id: "type",
          label: "Token",
          options: types.map((t) => ({ value: t.label, label: t.label })),
          match: (r, v) => r.type === v,
        },
      ]}
      emptyMessage="Nothing issued or redeemed yet."
    />
  );
}
