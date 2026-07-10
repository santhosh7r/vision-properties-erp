"use client";

import Link from "next/link";
import DataTable, { type Column } from "@/components/DataTable";
import { Badge, BookingStatusBadge, PaymentBadge } from "@/components/ui";
import { fmtDate, inr, shortRef } from "@/lib/format";
import Countdown from "@/components/Countdown";
import { SubmitButton } from "@/components/SubmitButton";
import { confirmBooking, cancelBooking } from "./actions";
import ConvertToBookingButton from "./ConvertToBookingButton";
import RequestCancelButton from "./RequestCancelButton";

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
  advance_required: number;
  paid: number; // total received so far (advance_paid)
  balance: number; // outstanding = value − paid (due before registration)
  booked_date: string | null;
  book_mode: string;
  status: string;
  plotStatus: string | null; // the plot's CURRENT status (cancelled = held for admin release)
  payment_status: string;
  refund_status: string;
  expires_at: string | null;
  deadline: string | null; // hold deadline = created_at + project window (runs until registration)
  cancel_requested_at: string | null; // a pending cancellation request (non-admin sales)
  created_at: string;
  registered: boolean; // a registration record already exists for this booking
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
  canRequestCancel = false,
  canRegister = false,
  canConvert = false,
  showSalesperson = false,
}: {
  rows: BookingRow[];
  canConfirm: boolean;
  canCancel: boolean;
  canRequestCancel?: boolean;
  canRegister?: boolean;
  canConvert?: boolean;
  showSalesperson?: boolean;
}) {
  const columns: Column<BookingRow>[] = [
    { id: "sno", header: "#", sort: (r) => r.sno, cell: (r) => <span className="tabular-nums text-[var(--muted)]">{r.sno}</span> },
    { id: "ref", header: "Ref", sort: (r) => r.id, cell: (r) => <span className="font-mono text-xs text-[var(--muted)]">{shortRef(r.id)}</span> },
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
    { id: "paid", header: "Paid", align: "right", sort: (r) => r.paid, hideBelow: "lg", cell: (r) => <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{inr(r.paid)}</span> },
    { id: "balance", header: "Balance", align: "right", sort: (r) => r.balance, hideBelow: "lg", cell: (r) => <span className={`tabular-nums ${r.balance > 0 ? "text-amber-600 dark:text-amber-400" : "text-[var(--muted)]"}`}>{inr(r.balance)}</span> },
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
        <Badge tone={r.book_mode === "blocking" ? "amber" : "blue"}>{r.book_mode}</Badge>
      ) },
    { id: "booked_date", header: "Booked Date", hideBelow: "lg", sort: (r) => r.booked_date ?? "", cell: (r) => <span className="whitespace-nowrap text-[var(--muted)]">{fmtDate(r.booked_date)}</span> },
    // Live deadline for the hold — blocking counts in hours, booking in days
    // (that project's window). The clock keeps running through 'confirmed' until
    // the plot is registered; once registered or cancelled the deal is settled
    // and there's no deadline to show.
    { id: "deadline", header: "Deadline", sort: (r) => r.deadline ?? "", cell: (r) =>
      r.status !== "cancelled" && !r.registered
        ? <Countdown deadline={r.deadline} />
        : <span className="text-[var(--muted)]">—</span> },
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
        {/* Promote a pending blocking to a full booking (blocking → booking) —
            opens a payment/loan popup that records the advance. */}
        {r.status === "pending" && r.book_mode === "blocking" && canConvert && (
          <ConvertToBookingButton
            bookingId={r.id}
            advanceRequired={r.advance_required}
            className="btn-primary"
            style={{ padding: "5px 10px", fontSize: 12 }}
          />
        )}
        {/* Admin can take an active plot straight to registration from the list. */}
        {r.status !== "cancelled" && canRegister && !r.registered && (
          <Link
            href={`/registrations/new?booking=${r.id}`}
            className="btn-primary"
            style={{ padding: "5px 10px", fontSize: 12 }}
          >
            Register
          </Link>
        )}
        {r.registered && <Badge tone="green">Registered</Badge>}
        {/* Admin cancels directly; sales raise a request. A pending request shows a badge. */}
        {r.status !== "cancelled" && !r.registered && canCancel && (
          <form action={cancelBooking}>
            <input type="hidden" name="id" value={r.id} />
            <SubmitButton className="btn-danger" style={{ padding: "5px 10px", fontSize: 12 }} pendingLabel="…">Cancel</SubmitButton>
          </form>
        )}
        {r.status !== "cancelled" && !r.registered && !canCancel && canRequestCancel && (
          r.cancel_requested_at ? (
            <Badge tone="amber">Cancel requested</Badge>
          ) : (
            <RequestCancelButton bookingId={r.id} className="btn-danger" style={{ padding: "5px 10px", fontSize: 12 }} label="Request Cancel" />
          )
        )}
      </div>
    ) },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowHref={(r) => `/bookings/${r.id}`}
      search={(r) => `${shortRef(r.id)} ${r.project} ${r.plot} ${r.customer} ${r.mobile} ${r.salesperson}`}
      searchPlaceholder="Search ref, customer, project, plot…"
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
