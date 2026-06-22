"use client";

import Link from "next/link";
import DataTable, { type Column } from "@/components/DataTable";
import { PaymentBadge } from "@/components/ui";
import { inr, fmtDateTime } from "@/lib/format";

// One row per individual payment transaction (the `payments` ledger).
export interface LedgerRow {
  id: string;
  bookingId: string;
  paidAt: string;
  customer: string;
  project: string;
  plot: string;
  kind: string;
  amount: number;
  mode: string;
  recordedBy: string;
  status: string;
}

const KIND_LABEL: Record<string, string> = {
  blocking: "Blocking",
  advance: "Advance",
  installment: "Installment",
  final: "Final",
  refund: "Refund",
};

export default function PaymentLedger({ rows }: { rows: LedgerRow[] }) {
  const columns: Column<LedgerRow>[] = [
    {
      id: "paidAt",
      header: "Date",
      sort: (r) => r.paidAt,
      cell: (r) => <span className="whitespace-nowrap text-[var(--muted)]">{fmtDateTime(r.paidAt)}</span>,
    },
    {
      id: "customer",
      header: "Customer",
      sort: (r) => r.customer.toLowerCase(),
      cell: (r) => <span className="font-medium text-[var(--text)]">{r.customer}</span>,
    },
    { id: "project", header: "Project", hideBelow: "md", sort: (r) => r.project.toLowerCase(), cell: (r) => r.project },
    { id: "plot", header: "Plot", hideBelow: "sm", cell: (r) => r.plot },
    {
      id: "kind",
      header: "Type",
      sort: (r) => r.kind,
      cell: (r) => (
        <span
          className={`rounded-full border px-2 py-0.5 text-xs capitalize ${
            r.kind === "refund" ? "border-red-500/30 text-red-400" : ""
          }`}
        >
          {KIND_LABEL[r.kind] ?? r.kind}
        </span>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      sort: (r) => r.amount,
      cell: (r) => (
        <span className={`tabular-nums ${r.amount < 0 ? "text-red-400" : "text-emerald-500"}`}>
          {inr(r.amount)}
        </span>
      ),
    },
    { id: "mode", header: "Mode", hideBelow: "lg", cell: (r) => r.mode },
    { id: "recordedBy", header: "Recorded By", hideBelow: "lg", sort: (r) => r.recordedBy.toLowerCase(), cell: (r) => r.recordedBy },
    { id: "status", header: "Status", cell: (r) => <PaymentBadge status={r.status} /> },
    {
      id: "action",
      header: "",
      align: "right",
      cell: (r) => (
        <Link
          href={`/bookings/${r.bookingId}`}
          onClick={(e) => e.stopPropagation()}
          className="btn-ghost"
          style={{ padding: "5px 12px", fontSize: 12 }}
        >
          Open
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowHref={(r) => `/bookings/${r.bookingId}`}
      search={(r) => `${r.customer} ${r.project} ${r.plot} ${r.kind} ${r.mode} ${r.recordedBy}`}
      searchPlaceholder="Search customer, project, plot, who paid…"
      filters={[
        {
          id: "kind",
          label: "Type",
          options: [
            { value: "blocking", label: "Blocking" },
            { value: "advance", label: "Advance" },
            { value: "installment", label: "Installment" },
            { value: "final", label: "Final" },
            { value: "refund", label: "Refund" },
          ],
          match: (r, v) => r.kind === v,
        },
      ]}
      emptyMessage="No payments recorded yet."
    />
  );
}
