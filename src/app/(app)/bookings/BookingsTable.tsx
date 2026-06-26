"use client";

import DataTable, { type Column } from "@/components/DataTable";
import { Badge, BookingStatusBadge, PaymentBadge } from "@/components/ui";
import { fmtDate, timeLeft, inr } from "@/lib/format";
import { SubmitButton } from "@/components/SubmitButton";
import { confirmBooking, cancelBooking } from "./actions";

export interface BookingRow {
  id: string;
  sno: number;
  project: string;
  plot: string;
  sqft: number | null;
  customer: string;
  mobile: string;
  salesperson: string;
  value: number;
  booked_date: string | null;
  book_mode: string;
  status: string;
  plotStatus: string | null; // the plot's CURRENT status (cancelled = held for admin release)
  payment_status: string;
  refund_status: string;
  expires_at: string | null;
  created_at: string;
}

// When a booking is cancelled the plot goes back to the company, so the deal is
// dead — Mode/Payment no longer describe an active hold. We surface the refund
// state instead of a stale "Pending".
const REFUND_BADGE: Record<string, { label: string; tone: "gray" | "amber" | "blue" | "green" }> = {
  none: { label: "No refund", tone: "gray" },
  pending_approval: { label: "Refund pending", tone: "amber" },
  approved: { label: "Refund approved", tone: "blue" },
  paid: { label: "Refunded", tone: "green" },
};

export default function BookingsTable({
  rows,
  canConfirm,
  canCancel,
  showSalesperson = false,
}: {
  rows: BookingRow[];
  canConfirm: boolean;
  canCancel: boolean;
  showSalesperson?: boolean;
}) {
  const columns: Column<BookingRow>[] = [
    { id: "sno", header: "#", sort: (r) => r.sno, cell: (r) => <span className="tabular-nums text-[var(--muted)]">{r.sno}</span> },
    { id: "project", header: "Project", sort: (r) => r.project.toLowerCase(), cell: (r) => <span className="font-medium text-[var(--text)]">{r.project}</span> },
    { id: "plot", header: "Plot No", sort: (r) => r.plot, cell: (r) => r.plot },
    { id: "sqft", header: "Sq.ft", align: "right", hideBelow: "md", sort: (r) => r.sqft ?? 0, cell: (r) => <span className="tabular-nums">{r.sqft ?? "—"}</span> },
    { id: "customer", header: "Customer", sort: (r) => r.customer.toLowerCase(), cell: (r) => (
      <div><div>{r.customer}</div><div className="text-xs text-[var(--muted)] sm:hidden">{r.mobile}</div></div>
    ) },
    { id: "mobile", header: "Mobile", hideBelow: "md", cell: (r) => r.mobile },
    ...(showSalesperson
      ? [{
          id: "salesperson",
          header: "Sales Person",
          hideBelow: "lg" as const,
          sort: (r: BookingRow) => r.salesperson.toLowerCase(),
          cell: (r: BookingRow) => <span className="text-[var(--muted)]">{r.salesperson}</span>,
        }]
      : []),
    { id: "value", header: "Value", align: "right", sort: (r) => r.value, hideBelow: "lg", cell: (r) => <span className="tabular-nums">{inr(r.value)}</span> },
    { id: "mode", header: "Mode", sort: (r) => r.book_mode, cell: (r) =>
      r.status === "cancelled" ? (
        // Cancelled but the plot is still held ('cancelled') = reserved until an
        // admin releases it. Once released the plot is 'available' → "released".
        r.plotStatus === "cancelled" ? (
          <Badge tone="amber">reserved</Badge>
        ) : (
          <Badge tone="gray">released</Badge>
        )
      ) : (
        <div>
          <Badge tone={r.book_mode === "blocking" ? "amber" : "blue"}>{r.book_mode}</Badge>
          {r.status === "pending" && r.expires_at && (
            <div className="mt-0.5 text-[10px] text-[var(--muted)]">{timeLeft(r.expires_at)}</div>
          )}
        </div>
      ) },
    { id: "booked_date", header: "Booked Date", hideBelow: "lg", sort: (r) => r.booked_date ?? "", cell: (r) => <span className="whitespace-nowrap text-[var(--muted)]">{fmtDate(r.booked_date)}</span> },
    { id: "status", header: "Status", sort: (r) => r.status, cell: (r) => <BookingStatusBadge status={r.status} /> },
    { id: "payment", header: "Payment", sort: (r) => r.payment_status, cell: (r) => {
      if (r.status !== "cancelled") return <PaymentBadge status={r.payment_status} />;
      const rb = REFUND_BADGE[r.refund_status] ?? REFUND_BADGE.none;
      return <Badge tone={rb.tone}>{rb.label}</Badge>;
    } },
    { id: "action", header: "", align: "right", cell: (r) => (
      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        {r.status === "pending" && canConfirm && (
          <form action={confirmBooking}>
            <input type="hidden" name="id" value={r.id} />
            <SubmitButton className="btn-success" style={{ padding: "5px 10px", fontSize: 12 }} pendingLabel="…">Confirm</SubmitButton>
          </form>
        )}
        {r.status !== "cancelled" && canCancel && (
          <form action={cancelBooking}>
            <input type="hidden" name="id" value={r.id} />
            <SubmitButton className="btn-danger" style={{ padding: "5px 10px", fontSize: 12 }} pendingLabel="…">Cancel</SubmitButton>
          </form>
        )}
      </div>
    ) },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowHref={(r) => `/bookings/${r.id}`}
      search={(r) => `${r.project} ${r.plot} ${r.customer} ${r.mobile} ${r.salesperson}`}
      searchPlaceholder="Search customer, project, plot…"
      filters={[
        { id: "status", label: "Status", options: [
          { value: "pending", label: "Pending" },
          { value: "confirmed", label: "Confirmed" },
          { value: "cancelled", label: "Cancelled" },
        ], match: (r, v) => r.status === v },
        { id: "mode", label: "Mode", options: [
          { value: "blocking", label: "Blocking" },
          { value: "booking", label: "Booking" },
        ], match: (r, v) => r.book_mode === v },
        { id: "payment", label: "Payment", options: [
          { value: "pending", label: "Pending" },
          { value: "completed", label: "Paid" },
        ], match: (r, v) => r.payment_status === v },
      ]}
      emptyMessage="No bookings found."
    />
  );
}
