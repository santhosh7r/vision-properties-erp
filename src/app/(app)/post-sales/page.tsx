import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { can } from "@/lib/roles";
import { getDistrictScope, withProjectScope } from "@/lib/scope";
import { sweepExpiredBookings } from "@/lib/lifecycle";
import { PageHeader } from "@/components/ui";
import type { Booking, Customer, Plot, Project } from "@/lib/types";
import { type PaymentRow } from "../payments/PaymentsTable";
import { type LedgerRow } from "../payments/PaymentLedger";
import { type ReceiptRow } from "../payments/ReceiptsTable";
import { type CancellationRow } from "./CancellationsTable";
import PostSalesTabs from "./PostSalesTabs";

export const dynamic = "force-dynamic";

interface RawPayment {
  id: string;
  booking_id: string;
  amount: number;
  kind: string;
  mode: string | null;
  reference: string | null;
  bank_name: string | null;
  instrument_date: string | null;
  status: string;
  paid_at: string;
  recorder: { full_name: string } | null;
  bookings: {
    plots: Pick<Plot, "plot_no"> | null;
    customers: Pick<Customer, "name"> | null;
    projects: Pick<Project, "name"> | null;
  } | null;
}

interface RawRefund {
  id: string;
  refund_amount: number | null;
  refund_status: string;
  refund_paid_at: string | null;
  refund_approved_at: string | null;
  released_at: string | null;
  created_at: string;
  plots: Pick<Plot, "plot_no"> | null;
  customers: Pick<Customer, "name"> | null;
  projects: Pick<Project, "name"> | null;
}

// Post-Sales desk — Part Payment, Fully Paid Receipt and Cancellation on one
// tabbed page. Admin sees the company; a Post-Sales desk sees its own district.
export default async function PostSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireCapability("view_post_sales");
  await sweepExpiredBookings();
  const sb = getSupabase();
  // Null for Admin (company-wide); a project-id filter for a branch desk.
  const scope = await getDistrictScope(sb, user);

  const tabParam = (await searchParams).tab;
  const initialTab = tabParam === "receipts" || tabParam === "cancel" ? tabParam : "part";

  // ── Cancellation: cancelled bookings + their refund lifecycle ───────────────
  const { data: cancelData } = await withProjectScope(
    sb
      .from("bookings")
      .select(
        "id, total_plot_value, cancellation_reason, cancellation_charge, refund_amount, refund_status, refund_due_date, released_at, created_at, plots(plot_no), customers(name), projects(name)",
      )
      .eq("status", "cancelled"),
    scope,
  ).order("released_at", { ascending: false });
  const cancelRaw = (cancelData ?? []) as unknown as (Pick<
    Booking,
    | "id"
    | "total_plot_value"
    | "cancellation_reason"
    | "cancellation_charge"
    | "refund_amount"
    | "refund_status"
    | "refund_due_date"
    | "released_at"
    | "created_at"
  > & {
    plots: Pick<Plot, "plot_no"> | null;
    customers: Pick<Customer, "name"> | null;
    projects: Pick<Project, "name"> | null;
  })[];
  const cancelRows: CancellationRow[] = cancelRaw.map((b) => ({
    id: b.id,
    project: b.projects?.name ?? "—",
    plot: b.plots?.plot_no ?? "—",
    customer: b.customers?.name ?? "—",
    value: Number(b.total_plot_value ?? 0),
    reason: b.cancellation_reason ?? null,
    charge: b.cancellation_charge != null ? Number(b.cancellation_charge) : null,
    refundAmount: b.refund_amount != null ? Number(b.refund_amount) : null,
    refundStatus: b.refund_status ?? "none",
    refundDue: b.refund_due_date ?? null,
    cancelledAt: b.released_at ?? b.created_at ?? null,
  }));

  // ── Deals (Part Payment) + fully-paid subset (Receipts) ─────────────────────
  const { data: dealData } = await withProjectScope(
    sb
      .from("bookings")
      .select("*, plots(plot_no), customers(name), projects(name)")
      .neq("status", "cancelled"),
    scope,
  ).order("created_at", { ascending: false });
  const dealRaw = (dealData ?? []) as (Booking & {
    plots: Pick<Plot, "plot_no">;
    customers: Pick<Customer, "name">;
    projects: Pick<Project, "name">;
  })[];
  const deals: PaymentRow[] = dealRaw.map((b) => ({
    id: b.id,
    project: b.projects?.name ?? "—",
    plot: b.plots ? `${b.plots.plot_no}` : "—",
    customer: b.customers?.name ?? "—",
    value: b.total_plot_value,
    paid: b.advance_paid,
    balance: Math.max(0, b.total_plot_value - b.advance_paid),
    status: b.status,
    payment_status: b.payment_status,
  }));
  const receipts: ReceiptRow[] = deals
    .filter((r) => r.payment_status === "completed")
    .map((r) => ({ id: r.id, project: r.project, plot: r.plot, customer: r.customer, value: r.value, paid: r.paid }));

  // ── Ledger (Part Payment): every payment + refund outflow ───────────────────
  // A payment reaches a district only through its booking, and the nested join
  // can't be filtered server-side — but the two queries above already hold every
  // booking in scope (cancelled + active), so reuse those ids instead of a third
  // round-trip. Null for Admin = no filter.
  const scopedBookingIds = scope
    ? [...cancelRaw.map((b) => b.id), ...dealRaw.map((b) => b.id)]
    : null;

  let payQuery = sb
    .from("payments")
    .select(
      "id, booking_id, amount, kind, mode, reference, bank_name, instrument_date, status, paid_at, recorder:users!recorded_by(full_name), bookings(plots(plot_no), customers(name), projects(name))",
    );
  if (scopedBookingIds) payQuery = payQuery.in("booking_id", scopedBookingIds);
  const { data: payData } = await payQuery.order("paid_at", { ascending: false });
  const payRaw = (payData ?? []) as unknown as RawPayment[];
  const payments: LedgerRow[] = payRaw.map((p) => ({
    id: p.id,
    bookingId: p.booking_id,
    paidAt: p.paid_at,
    customer: p.bookings?.customers?.name ?? "—",
    project: p.bookings?.projects?.name ?? "—",
    plot: p.bookings?.plots ? `${p.bookings.plots.plot_no}` : "—",
    kind: p.kind,
    amount: Number(p.amount),
    mode: p.mode ?? "—",
    reference: [p.reference, p.bank_name, p.instrument_date].filter(Boolean).join(" · "),
    recordedBy: p.recorder?.full_name ?? "—",
    status: p.status,
    receiptHref: `/receipts/payment/${p.id}`,
  }));

  const { data: refundData } = await withProjectScope(
    sb
      .from("bookings")
      .select(
        "id, refund_amount, refund_status, refund_paid_at, refund_approved_at, released_at, created_at, plots(plot_no), customers(name), projects(name)",
      )
      .gt("refund_amount", 0),
    scope,
  );
  const refundRaw = (refundData ?? []) as unknown as RawRefund[];
  const refunds: LedgerRow[] = refundRaw.map((b) => ({
    id: `refund-${b.id}`,
    bookingId: b.id,
    paidAt: b.refund_paid_at ?? b.refund_approved_at ?? b.released_at ?? b.created_at,
    customer: b.customers?.name ?? "—",
    project: b.projects?.name ?? "—",
    plot: b.plots ? `${b.plots.plot_no}` : "—",
    kind: "refund",
    amount: -Number(b.refund_amount ?? 0),
    mode: "—",
    reference: "",
    recordedBy: "—",
    status: b.refund_status === "paid" ? "completed" : "pending",
    receiptHref: null,
  }));

  const ledger: LedgerRow[] = [...payments, ...refunds].sort(
    (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime(),
  );

  // The four tiles must describe ONE population — the live deals. `received` used
  // to sum the whole ledger, which also carries money collected on CANCELLED
  // bookings (₹2.1L of it here), while Deal Value and Outstanding counted only
  // the live ones. The tiles then refused to reconcile: Deal Value − Received
  // came out well short of Outstanding, so a fully-paid deal still looked owed.
  // Money on a cancelled deal is not lost from view — it is what the Refunds tile
  // and the Cancellation tab are for, and the Payment Transactions ledger below
  // still lists every entry.
  const dealValue = deals.reduce((s, b) => s + b.value, 0);
  const liveDealIds = new Set(deals.map((d) => d.id));
  const received = payments
    .filter((p) => p.status === "completed" && liveDealIds.has(p.bookingId))
    .reduce((s, p) => s + p.amount, 0);
  const totals = {
    dealValue,
    received,
    outstanding: Math.max(0, dealValue - received),
    refunds: refunds.reduce((s, p) => s + Math.abs(p.amount), 0),
    collected: receipts.reduce((s, r) => s + r.value, 0),
  };

  return (
    <>
      <PageHeader
        title="Payments & Cancellation"
        subtitle={
          scope
            ? `Part payments, fully-paid receipts and cancellations for ${scope.district ?? "your branch"}.`
            : "Part payments, fully-paid receipts and cancellations — all in one place."
        }
      />
      <PostSalesTabs
        deals={deals}
        ledger={ledger}
        receipts={receipts}
        cancelRows={cancelRows}
        canApproveRefund={can(user.role, "approve_refund")}
        canPayRefund={can(user.role, "record_payment")}
        totals={totals}
        initialTab={initialTab}
      />
    </>
  );
}
