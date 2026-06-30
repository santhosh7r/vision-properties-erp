import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { can } from "@/lib/roles";
import { sweepExpiredBookings } from "@/lib/lifecycle";
import { inr, fmtDate, fmtDateTime, timeLeft } from "@/lib/format";
import {
  PageHeader,
  BookingStatusBadge,
  PaymentBadge,
  Badge,
  EmptyState,
} from "@/components/ui";
import { computeRefund } from "@/lib/sop";
import { PAYMENT_MODES } from "@/lib/options";
import PrintReceiptButton from "./PrintReceiptButton";
import { SubmitButton } from "@/components/SubmitButton";
import type { Booking, Customer, Payment, Plot, Project, PlotTransfer } from "@/lib/types";
import {
  confirmBooking,
  cancelBooking,
  convertToBooking,
  recordPayment,
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

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await sweepExpiredBookings();
  const sb = getSupabase();

  const { data } = await sb
    .from("bookings")
    .select("*, plots(*), customers(*), projects(*)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const b = data as Booking & {
    plots: Plot;
    customers: Customer;
    projects: Project;
  };

  const { data: payData } = await sb
    .from("payments")
    .select("*")
    .eq("booking_id", id)
    .order("paid_at", { ascending: false });
  const payments = (payData ?? []) as Payment[];

  // Is there already a registration?
  const { data: reg } = await sb
    .from("registrations")
    .select("id")
    .eq("booking_id", id)
    .maybeSingle();

  const balance = Math.max(0, b.total_plot_value - b.advance_paid);
  const canConfirm = can(user.role, "confirm_booking");
  const canCancel = can(user.role, "cancel_booking");
  const canPay = can(user.role, "record_payment");
  const canConvert = can(user.role, "create_booking");
  const canRegister = can(user.role, "manage_registration");
  const canApproveRefund = can(user.role, "approve_refund");
  const canTransfer = can(user.role, "manage_transfer");

  // §3 Preview: what the customer would get back if cancelled right now.
  const refundPreview =
    b.status !== "cancelled" && b.advance_paid > 0
      ? computeRefund(b.projects, b.booked_date ?? b.created_at, new Date(), b.advance_paid)
      : null;

  // §7 Available plots in the same project to transfer to, + transfer history.
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

  const { data: transferData } = await sb
    .from("plot_transfers")
    .select("*")
    .eq("booking_id", id)
    .order("created_at", { ascending: false });
  const transfers = (transferData ?? []) as PlotTransfer[];

  return (
    <>
      <PageHeader
        title={`${b.book_mode === "blocking" ? "Blocking" : "Booking"} — ${b.plots.plot_no}`}
        subtitle={`${b.projects.name} · ${b.customers.name} (${b.customers.mobile})`}
        back={{ href: "/bookings", label: "← Bookings" }}
        action={<PrintReceiptButton id={b.id} />}
      />

      {/* Status strip */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <BookingStatusBadge status={b.status} />
        <PaymentBadge status={b.payment_status} />
        <Badge tone={b.book_mode === "blocking" ? "amber" : "blue"}>{b.book_mode}</Badge>
        {b.status === "pending" && b.expires_at && (
          <span className="text-xs text-[var(--muted)]">
            {timeLeft(b.expires_at)} (until {fmtDateTime(b.expires_at)})
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
              <F label="Total Plot Value">{inr(b.total_plot_value)}</F>
            </Grid>
          </Section>

          <Section title="Customer Details">
            <Grid>
              <F label="Name">{b.customers.name}</F>
              <F label="Mobile">{b.customers.mobile}</F>
              <F label="D.O.B">{fmtDate(b.customers.dob)}</F>
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
              <F label="Loan Token By">{b.loan_token_by ?? "—"}</F>
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
                      <th className="th">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="td">{fmtDateTime(p.paid_at)}</td>
                        <td className="td capitalize">{p.kind}</td>
                        <td className="td">{p.mode ?? "—"}</td>
                        <td className="td">{inr(p.amount)}</td>
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
                <form action={convertToBooking}>
                  <input type="hidden" name="id" value={b.id} />
                  <SubmitButton className="btn-primary w-full" pendingLabel="Converting…">Convert to Booking</SubmitButton>
                </form>
              )}

              {canCancel && !reg && (
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
              )}

              {/* Admin may convert any active booking/blocking straight into a
                  registration — confirming first is not required. */}
              {canRegister && !reg && (
                <Link href={`/registrations/new?booking=${b.id}`} className="btn-primary w-full">
                  Register Plot
                </Link>
              )}
              {reg && (
                <Link href="/registrations" className="btn-ghost w-full">View Registration</Link>
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
              <form action={recordPayment} className="space-y-3">
                <input type="hidden" name="booking_id" value={b.id} />
                <div>
                  <label className="label">Amount (₹)</label>
                  <input name="amount" type="number" min={1} className="input" required />
                </div>
                <div>
                  <label className="label">Kind</label>
                  <select name="kind" className="select" defaultValue="installment">
                    <option value="advance">Advance</option>
                    <option value="installment">Installment</option>
                    <option value="final">Final</option>
                  </select>
                </div>
                <div>
                  <label className="label">Mode</label>
                  <select name="mode" className="select" defaultValue="">
                    <option value="" disabled>Select mode</option>
                    {PAYMENT_MODES.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <SubmitButton className="btn-primary w-full" pendingLabel="Adding…">Add Payment</SubmitButton>
                <p className="text-xs text-[var(--muted)]">
                  Payment stays Pending until the full plot value is received.
                </p>
              </form>
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
