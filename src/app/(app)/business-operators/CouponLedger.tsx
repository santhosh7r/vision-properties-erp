"use client";

import Link from "next/link";
import DataTable, { type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { fmtDateTime, inr } from "@/lib/format";
import { TOKEN_ORIGIN_LABELS, type TokenOrigin } from "@/lib/token-source";

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
  // Who recorded it — a person's name, or "System" for an unattended grant.
  by: string;
  auto: boolean;
  // Where it came from and what it was for (lib/token-source).
  origin: TokenOrigin;
  originLabel: string;
  reference: string;
  plot: string;
  customer: string;
  bookingId: string | null;
  registrationId: string | null;
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
      id: "source",
      header: "Source",
      sort: (r) => r.originLabel,
      cell: (r) => (
        <div>
          <div className="whitespace-nowrap text-[var(--text)]">{r.originLabel}</div>
          {r.reference &&
            (r.registrationId ? (
              <Link href={`/registrations/${r.registrationId}`} className="font-mono text-xs text-[var(--muted)] hover:underline">
                {r.reference}
              </Link>
            ) : (
              <div className="font-mono text-xs text-[var(--muted)]">{r.reference}</div>
            ))}
        </div>
      ),
    },
    {
      id: "plot",
      header: "For Plot",
      sort: (r) => r.plot.toLowerCase(),
      cell: (r) =>
        r.plot ? (
          <div>
            {r.bookingId ? (
              <Link href={`/bookings/${r.bookingId}`} className="font-medium text-[var(--text)] hover:underline">
                {r.plot}
              </Link>
            ) : (
              <div className="font-medium text-[var(--text)]">{r.plot}</div>
            )}
            {r.customer && <div className="text-xs text-[var(--muted)]">{r.customer}</div>}
          </div>
        ) : (
          <div>
            <span className="text-[var(--muted)]">—</span>
            {r.customer && <div className="text-xs text-[var(--muted)]">{r.customer}</div>}
          </div>
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
      search={(r) =>
        `${r.holder} ${r.holderCode ?? ""} ${r.type} ${r.action} ${r.originLabel} ${r.reference} ${r.plot} ${r.customer} ${r.note} ${r.by}`
      }
      searchPlaceholder="Search holder, plot, customer, reg. no, receipt…"
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
        {
          id: "source",
          label: "Source",
          options: (Object.keys(TOKEN_ORIGIN_LABELS) as TokenOrigin[]).map((o) => ({ value: o, label: TOKEN_ORIGIN_LABELS[o] })),
          match: (r, v) => r.origin === v,
        },
      ]}
      emptyMessage="Nothing issued or redeemed yet."
    />
  );
}
