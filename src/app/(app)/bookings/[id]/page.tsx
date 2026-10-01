import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { can, hasFullAccess } from "@/lib/roles";
import { sweepExpiredBookings } from "@/lib/lifecycle";
import { getDistrictScope, projectInScope } from "@/lib/scope";
import { shownStatus } from "@/lib/holds";
import { inr, fmtDate, fmtDateTime, shortRef } from "@/lib/format";
import { CASH_LIMIT_LABEL, loanTokenByLabel } from "@/lib/options";
import Countdown from "@/components/Countdown";
import {
  PageHeader,
  BookingStatusBadge,
  PaymentBadge,
  Badge,
  EmptyState,
} from "@/components/ui";
import { computeRefund } from "@/lib/sop";
import PrintReceiptButton from "@/components/PrintReceiptButton";
import RecordPaymentForm from "../RecordPaymentForm";
import PaymentRowActions from "../PaymentRowActions";
import { paymentReceiptNo } from "@/app/receipts/data";
import { BILL_PENDING_NOTE, billReady } from "@/lib/bill";
import ConvertToBookingButton from "../ConvertToBookingButton";
import RequestCancelButton from "../RequestCancelButton";
import { SubmitButton } from "@/components/SubmitButton";
import type { Booking, Customer, Payment, Plot, Project, PlotTransfer } from "@/lib/types";
import {
  confirmBooking,
  verifyBookingDetails,
  cancelBooking,
  dismissCancellationRequest,
  approveRefund,
  markRefundPaid,
  transferBooking,
} from "../actions";

const REFUND_TONE: Record<string, "amber" | "blue" | "green" | "gray"> = {
  pending_approval: "amber",
  approved: "blue",
  paid: "green",
  none: "gray",
};
const REFUND_LABEL: Record<string, string> = {
  pending_approval: "Refund pending COO approval",
  approved: "Refund approved — awaiting payout",
  paid: "Refund paid",
  none: "No refund",
};

export const dynamic = "force-dynamic";

const BOOKING_ERRORS: Record<string, string> = {
  already_registered:
    "This plot is already registered, so the booking can’t be cancelled. A registered plot is sold and final.",
  cash_limit:
    `Nothing was saved — ${CASH_LIMIT_LABEL} is the most that may be taken in cash on a plot. ` +
    "Record a larger collection as cheque, bank transfer, net banking, UPI (GPay / PhonePe / Paytm) or loan.",
  pay_locked:
    "Payments on a cancelled booking can't be changed — its refund was worked out from what had been paid.",
  pay_invalid: "Nothing was saved — pick a valid kind and mode for the payment.",
  pay_details: "Nothing was saved — fill in the payment details the chosen mode needs (e.g. cheque number, UPI transaction ID).",
  pay_reason: "Nothing was deleted — give a reason for deleting the payment.",
  pay_failed: "The payment couldn't be saved. Please try again.",
  verify_failed:
    "The verification couldn't be saved, so the bill is still on hold. Please try again — if it keeps failing, the database update for bill verification has not been applied yet.",
};

const BOOKING_NOTICES: Record<string, string> = {
  payment_updated: "Payment details corrected. The amount is unchanged, and its receipt reprints with the new details.",
  payment_deleted: "Payment deleted. The paid total and balance are updated.",
  bill_verified: "Customer and plot details verified. The bill can now be printed.",
};

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; receipt?: string; notice?: string; edit?: string; delete?: string }>;
}) {
  const { id } = await params;
  const { error: errorKey, receipt: justPaidId, notice: noticeKey, edit: reopenEdit, delete: reopenDelete } = await searchParams;
  const bookingError = errorKey ? BOOKING_ERRORS[errorKey] : undefined;
  const bookingNotice = noticeKey ? BOOKING_NOTICES[noticeKey] : undefined;
  const sb = getSupabase();

  // Opening a booking used to cost five sequential Supabase round-trips, which
  // is what made a row click feel slow. Everything keyed off the URL's booking
  // id needs nothing from the booking row, so it is fetched in ONE wave with the
  // session check and the expiry sweep. Only two waits remain: the booking row
  // (read AFTER the sweep so `expired_at` is fresh for the mask below) and the
  // transfer target list (needs the booking's project).
  const [user, , payRes, regRes, transferRes] = await Promise.all([
    requireUser(),
    sweepExpiredBookings(),
    sb.from("payments").select("*").eq("booking_id", id).order("paid_at", { ascending: false }),
    // Is there already a registration?
    sb.from("registrations").select("id").eq("booking_id", id).maybeSingle(),
    sb.from("plot_transfers").select("*").eq("booking_id", id).order("created_at", { ascending: false }),
  ]);
  const payments = (payRes.data ?? []) as Payment[];
  const reg = regRes.data;
  const transfers = (transferRes.data ?? []) as PlotTransfer[];

  const { data } = await sb
    .from("bookings")
    .select("*, plots(*, plot_categories(name)), customers(*), projects(*)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const raw = data as Booking & {
    // plot_categories is the plot's TYPE — the value the receipt prints in its
    // "Sector" box (see app/receipts/data.ts).
    plots: Plot & { plot_categories: { name: string } | null };
    customers: Customer;
    projects: Project;
  };

  // An expired hold is still live and still holding its plot, pending an Admin's
  // release-or-extend decision — but only the Admin may know that. For everyone
  // else the whole page is rendered from a copy whose status reads 'cancelled',
  // so every badge, deadline and action gate below behaves exactly as it did
  // when expiry auto-released the plot. See lib/holds.
  const isAdmin = hasFullAccess(user.role);
  const b = { ...raw, status: shownStatus(raw, isAdmin) };

  // Hold deadline = expires_at (kept through 'confirmed' until registration).
  // Fallback for older confirmed rows: created_at + that project's window
  // (blocking → hours, booking → days).
  const winMs =
    b.book_mode === "blocking"
      ? (b.projects.blocking_window_hours ?? 0) * 3_600_000
      : (b.projects.booking_window_days ?? 0) * 86_400_000;
  const deadline =
    b.expires_at ??
    (b.created_at && winMs > 0 ? new Date(new Date(b.created_at).getTime() + winMs).toISOString() : null);

  const balance = Math.max(0, b.total_plot_value - b.advance_paid);
  const canConfirm = can(user.role, "confirm_booking");
  // lib/bill: no bill until Admin (or a desk for Admin) has verified the
  // customer and plot details of a deal a sales role raised.
  const billOk = billReady(b);
  const canCancel = can(user.role, "cancel_booking");
  const canRequestCancel = can(user.role, "request_cancellation");
  const canPay = can(user.role, "record_payment");
  // Correcting a payment: same people as recording one, only on their own
  // branch's bookings (the server refuses the rest — no point offering it), and
  // never on a cancelled booking (its refund was computed from these payments).
  const canCorrectPayments =
    canPay && b.status !== "cancelled" && projectInScope(await getDistrictScope(sb, user), b.project_id);
  const canConvert = can(user.role, "create_booking");
  const canRegister = can(user.role, "manage_registration");
  const canApproveRefund = can(user.role, "approve_refund");
  const canTransfer = can(user.role, "manage_transfer");
  // Editing the captured details is open to anyone who can raise a hold — the
  // same gate the edit page and updateBooking use.
  const canEditDetails = can(user.role, "create_blocking");

  // §3 Preview: what the customer would get back if cancelled right now.
  const refundPreview =
    b.status !== "cancelled" && b.advance_paid > 0
      ? computeRefund(b.projects, b.booked_date ?? b.created_at, new Date(), b.advance_paid)
      : null;

  // §7 Available plots in the same project to transfer to (history came with the
  // first wave above).
  const { data: availData } =
    b.status !== "cancelled"
      ? await sb
          .from("plots")
          .select("id, plot_no, sqft, price_per_sqft")
          .eq("project_id", b.project_id)
          .eq("status", "available")
          .order("plot_no")
      : { data: [] };
  const availablePlots = (availData ?? []) as Pick<Plot, "id" | "plot_no" | "sqft" | "price_per_sqft">[];

  return (
    <>
      <PageHeader
        title={`${b.book_mode === "blocking" ? "Blocking" : "Booking"} — ${b.plots.plot_no}`}
        subtitle={`${b.projects.name} · ${b.customers.name} (${b.customers.mobile})`}
        // Back to the list with the project / filters the viewer had selected.
        back={{ href: "/bookings", label: "← Bookings", remember: true }}
        action={
          <>
            {/* Fill in whatever the record is still missing — nominee, partner,
                dates. Cancelled records are read-only (the edit page redirects). */}
            {b.status !== "cancelled" && canEditDetails && (
              <Link href={`/bookings/${b.id}/edit`} className="btn-ghost">
                Edit
              </Link>
            )}
            {billOk && <PrintReceiptButton id={b.id} />}
          </>
        }
      />

      {/* A payment was just recorded — hand over its bill immediately. The same
          receipt stays printable from the Payments table below, forever. */}
      {/* Bill on hold until Admin verifies what a sales role entered. */}
      {!billOk && b.status !== "cancelled" && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <span>
            <strong>Bill on hold.</strong> {BILL_PENDING_NOTE}
            {canConfirm && b.status === "pending" && " Confirming the booking also verifies it."}
            {!canConfirm && canPay && " Payments can still be recorded; their receipts print once verified."}
          </span>
          {canConfirm && (
            <form action={verifyBookingDetails}>
              <input type="hidden" name="id" value={b.id} />
              <SubmitButton className="btn-primary" pendingLabel="Verifying…">
                Verify details &amp; release bill
              </SubmitButton>
            </form>
          )}
        </div>
      )}

      {justPaidId && !billOk && (
        <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          Payment recorded. Its receipt can be printed once Admin verifies the customer and plot details.
        </div>
      )}
      {justPaidId && billOk && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          <span>Payment recorded. Print the customer&apos;s receipt for it now, or any time from Payments below.</span>
          <PrintReceiptButton
            href={`/receipts/payment/${justPaidId}`}
            label="Print Receipt"
            className="btn-primary"
            style={{ padding: "6px 14px", fontSize: 13 }}
          />
        </div>
      )}

      {bookingNotice && (
        <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          {bookingNotice}
        </div>
      )}

      {bookingError && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {bookingError}
        </div>
      )}

      {/* Status strip */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="rounded-md border px-2 py-0.5 font-mono text-xs text-[var(--muted)]" title="Order reference">
          Ref {shortRef(b.id)}
        </span>
        <BookingStatusBadge status={b.status} />
        <PaymentBadge status={b.payment_status} />
        <Badge tone={b.book_mode === "blocking" ? "amber" : "blue"}>{b.book_mode}</Badge>
        {b.status !== "cancelled" && !reg && deadline && (
          <span className="text-xs text-[var(--muted)]">
            <Countdown deadline={deadline} /> (until {fmtDateTime(deadline)})
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: details */}
        <div className="space-y-6 lg:col-span-2">
          <Section title="Project Details">
            <Grid>
              <F label="Project">{b.projects.name}</F>
              <F label="Plot No — Sq.ft">{b.plots.plot_no} — {b.plot_sqft}</F>
              {/* The plot's type — what the receipt prints in its "Sector" box. */}
              <F label="Plot Type">{b.plots.plot_categories?.name ?? b.plots.block ?? "—"}</F>
              <F label="Total Plot Value">{inr(b.total_plot_value)}</F>
            </Grid>
          </Section>

          <Section title="Customer Details">
            <Grid>
              <F label="Name">{b.customers.name}</F>
              <F label="Mobile">{b.customers.mobile}</F>
              <F label="D.O.B">{fmtDate(b.customers.dob)}</F>
              <F label="Father&apos;s Name">{b.customers.father_name ?? "—"}</F>
              <F label="Father&apos;s Mobile">{b.customers.father_mobile ?? "—"}</F>
              <F label="Spouse&apos;s Name">{b.customers.spouse_name ?? "—"}</F>
              <F label="Spouse&apos;s Mobile">{b.customers.spouse_mobile ?? "—"}</F>
              <F label="Occupation">{b.customers.occupation ?? "—"}</F>
              <F label="Address">
                {[b.customers.street, b.customers.area, b.customers.district, b.customers.state, b.customers.pincode]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </F>
            </Grid>
          </Section>

          <Section title="Nominee Details">
            <Grid>
              <F label="Name">{b.nominee_name ?? "—"}</F>
              <F label="Mobile">{b.nominee_mobile ?? "—"}</F>
              <F label="Relationship">{b.nominee_relationship ?? "—"}</F>
            </Grid>
          </Section>

          <Section title="Partner Details">
            <Grid>
              <F label="Partner ID">{b.partner_code ?? "—"}</F>
              <F label="Partner Name">{b.partner_name ?? "—"}</F>
              <F label="Senior Director ID">{b.senior_director_code ?? "—"}</F>
              <F label="Senior Director Name">{b.senior_director_name ?? "—"}</F>
              <F label="Director ID">{b.director_code ?? "—"}</F>
              <F label="Director Name">{b.director_name ?? "—"}</F>
            </Grid>
          </Section>

          <Section title="Payment Details">
            <Grid>
              <F label="Tentative Registration">{fmtDate(b.tentative_registration_date)}</F>
              <F label="Mode of Payment">{b.mode_of_payment ?? "—"}</F>
              <F label="Loan Taken By">{loanTokenByLabel(b.loan_token_by)}</F>
              <F label="Booked Date">{fmtDate(b.booked_date)}</F>
              {b.book_mode === "blocking" && <F label="Blocking Amount">{inr(b.blocking_amount)}</F>}
              <F label="Advance Required">{inr(b.advance_required)}</F>
              <F label="Amount Paid">{inr(b.advance_paid)}</F>
              <F label="Balance">{inr(balance)}</F>
            </Grid>
            {b.remarks && <p className="mt-3 text-sm text-[var(--muted)]">Remarks: {b.remarks}</p>}
          </Section>

          {/* Payment ledger */}
          <Section title={`Payments (${payments.length})`}>
            {payments.length === 0 ? (
              <EmptyState message="No payments recorded yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b">
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Kind</th>
                      <th className="th">Mode</th>
                      <th className="th">Reference</th>
                      <th className="th">Amount</th>
                      {/* Every money entry keeps its own bill, printable at any
                          time — not just when it was recorded. */}
                      <th className="th">Receipt</th>
                      {canCorrectPayments && <th className="th">Correct</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="td">{fmtDateTime(p.paid_at)}</td>
                        <td className="td capitalize">{p.kind}</td>
                        <td className="td">{p.mode ?? "—"}</td>
                        <td className="td">
                          {p.reference || p.bank_name || p.instrument_date ? (
                            <span className="text-xs">
                              {[p.reference, p.bank_name, p.instrument_date ? fmtDate(p.instrument_date) : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="td">{inr(p.amount)}</td>
                        <td className="td">
                          {billOk ? (
                            <PrintReceiptButton
                              href={`/receipts/payment/${p.id}`}
                              label="Print"
                              className="btn-ghost"
                              style={{ padding: "4px 10px", fontSize: 12 }}
                            />
                          ) : (
                            <span className="text-xs text-amber-600" title={BILL_PENDING_NOTE}>
                              On hold
                            </span>
                          )}
                        </td>
                        {canCorrectPayments && (
                          <td className="td">
                            <PaymentRowActions
                              payment={{
                                id: p.id,
                                receiptNo: paymentReceiptNo(b, p),
                                paidAt: p.paid_at,
                                amount: Number(p.amount),
                                kind: p.kind,
                                mode: p.mode,
                                reference: p.reference,
                                bank_name: p.bank_name,
                                instrument_date: p.instrument_date,
                              }}
                              openInitially={reopenEdit === p.id ? "edit" : reopenDelete === p.id ? "delete" : undefined}
                              error={reopenEdit === p.id || reopenDelete === p.id ? bookingError : undefined}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {transfers.length > 0 && (
            <Section title={`Plot Transfers (${transfers.length})`}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b">
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Change</th>
                      <th className="th">From → To value</th>
                      <th className="th">Charge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map((t) => (
                      <tr key={t.id} className="border-b last:border-0">
                        <td className="td">{fmtDate(t.created_at)}</td>
                        <td className="td">
                          <Badge tone={t.kind === "upgrade" ? "green" : t.kind === "downgrade" ? "red" : "gray"}>
                            {t.kind}
                          </Badge>
                        </td>
                        <td className="td">{inr(t.from_value)} → {inr(t.to_value)}</td>
                        <td className="td">{t.charge ? inr(t.charge) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>

        {/* Right: actions */}
        <div className="space-y-4 lg:col-span-1">
          {b.status !== "cancelled" && (
            <div className="card space-y-3">
              <h2 className="text-sm font-semibold">Actions</h2>

              {b.status === "pending" && canConfirm && (
                <form action={confirmBooking}>
                  <input type="hidden" name="id" value={b.id} />
                  <SubmitButton className="btn-success w-full" pendingLabel="Confirming…">Confirm Booking</SubmitButton>
                </form>
              )}

              {b.book_mode === "blocking" && b.status === "pending" && canConvert && (
                <ConvertToBookingButton
                  bookingId={b.id}
                  advanceRequired={b.advance_required}
                  className="btn-primary w-full"
                />
              )}

              {/* Pending cancellation request — shown to everyone; Admin acts on it. */}
              {b.cancel_requested_at && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                  <p className="font-semibold">Cancellation requested</p>
                  {b.cancel_request_reason && <p className="mt-0.5 opacity-90">“{b.cancel_request_reason}”</p>}
                  {!canCancel && <p className="mt-0.5 opacity-80">Pending Admin review.</p>}
                </div>
              )}

              {/* Admin: cancel directly (reason optional — falls back to the request's reason). */}
              {canCancel && !reg && (
                <>
                  <form action={cancelBooking} className="space-y-2">
                    <input type="hidden" name="id" value={b.id} />
                    <input name="reason" className="input" placeholder="Cancellation reason (optional)" />
                    {refundPreview && (
                      <p className="text-xs text-[var(--muted)]">
                        {refundPreview.withinFullRefundWindow
                          ? `Within ${b.projects.cancel_full_refund_days}-day window → full refund of ${inr(refundPreview.refund)}.`
                          : `After ${b.projects.cancel_full_refund_days}-day window → refund ${inr(refundPreview.refund)} (₹ charge ${inr(refundPreview.charge)}).`}
                      </p>
                    )}
                    <SubmitButton className="btn-danger w-full" pendingLabel="Cancelling…">Cancel Booking</SubmitButton>
                  </form>
                  {b.cancel_requested_at && (
                    <form action={dismissCancellationRequest}>
                      <input type="hidden" name="id" value={b.id} />
                      <SubmitButton className="btn-ghost w-full" pendingLabel="Dismissing…">Dismiss Request</SubmitButton>
                    </form>
                  )}
                </>
              )}

              {/* Non-admin sales: raise a cancellation request (unless one's pending). */}
              {!canCancel && canRequestCancel && !reg && !b.cancel_requested_at && (
                <RequestCancelButton bookingId={b.id} className="btn-danger w-full" />
              )}

              {/* Admin may convert any active booking/blocking straight into a
                  registration — confirming first is not required. */}
              {canRegister && !reg && (
                <Link href={`/registrations/new?booking=${b.id}`} className="btn-primary w-full">
                  Register Plot
                </Link>
              )}
              {reg && (
                <Link href={`/registrations/${reg.id}`} className="btn-ghost w-full">View Registration</Link>
              )}
            </div>
          )}

          {b.refund_status !== "none" && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Refund (§3)</h2>
                <Badge tone={REFUND_TONE[b.refund_status]}>{REFUND_LABEL[b.refund_status]}</Badge>
              </div>
              <Grid>
                <F label="Amount Paid">{inr(b.advance_paid)}</F>
                <F label="Admin Charge">{inr(b.cancellation_charge ?? 0)}</F>
                <F label="Refund Amount">{inr(b.refund_amount ?? 0)}</F>
                {b.refund_due_date && <F label="Payout Due">{fmtDate(b.refund_due_date)}</F>}
              </Grid>
              {b.cancellation_reason && (
                <p className="text-xs text-[var(--muted)]">Reason: {b.cancellation_reason}</p>
              )}
              {b.refund_status === "pending_approval" && canApproveRefund && (
                <form action={approveRefund}>
                  <input type="hidden" name="id" value={b.id} />
                  <SubmitButton className="btn-success w-full" pendingLabel="Approving…">Approve Refund (COO)</SubmitButton>
                </form>
              )}
              {b.refund_status === "approved" && canPay && (
                <form action={markRefundPaid}>
                  <input type="hidden" name="id" value={b.id} />
                  <SubmitButton className="btn-primary w-full" pendingLabel="Saving…">Mark Refund Paid</SubmitButton>
                </form>
              )}
            </div>
          )}

          {canPay && b.status !== "cancelled" && (
            <div className="card">
              <h2 className="mb-3 text-sm font-semibold">Record Payment</h2>
              <RecordPaymentForm bookingId={b.id} balance={balance} />
            </div>
          )}

          {canTransfer && b.status !== "cancelled" && (
            <div className="card">
              <h2 className="mb-3 text-sm font-semibold">Transfer / Change Plot (§7)</h2>
              {availablePlots.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">No other available plots in this project.</p>
              ) : (
                <form action={transferBooking} className="space-y-3">
                  <input type="hidden" name="id" value={b.id} />
                  <div>
                    <label className="label">Move to plot</label>
                    <select name="to_plot_id" className="select" required defaultValue="">
                      <option value="" disabled>Select available plot</option>
                      {availablePlots.map((pl) => (
                        <option key={pl.id} value={pl.id}>
                          {pl.plot_no} · {inr(pl.sqft * pl.price_per_sqft)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input name="remarks" className="input" placeholder="Remarks (optional)" />
                  <SubmitButton className="btn-primary w-full" pendingLabel="Transferring…">Transfer Plot</SubmitButton>
                  <p className="text-xs text-[var(--muted)]">
                    Upgrade to higher value = no charge. Downgrade = ₹{b.projects.transfer_charge} charge.
                  </p>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="text-sm font-medium">{children}</p>
    </div>
  );
}
