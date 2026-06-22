import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { sweepExpiredBookings } from "@/lib/lifecycle";
import { inr } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/ui";
import type { Booking, Customer, Plot, Project } from "@/lib/types";
import { type PaymentRow } from "./PaymentsTable";
import { type LedgerRow } from "./PaymentLedger";
import PaymentsWorkspace from "./PaymentsWorkspace";

export const dynamic = "force-dynamic";

// Shape returned by the payments query (nested embeds via Supabase FKs).
interface RawPayment {
  id: string;
  booking_id: string;
  amount: number;
  kind: string;
  mode: string | null;
  status: string;
  paid_at: string;
  recorder: { full_name: string } | null;
  bookings: {
    plots: Pick<Plot, "plot_no"> | null;
    customers: Pick<Customer, "name"> | null;
    projects: Pick<Project, "name"> | null;
  } | null;
}

// Refunds live on the booking (not in the payments ledger). We surface them as
// ledger rows too so the transactions view shows the FULL money trail — money
// in and money back out.
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

export default async function PaymentsPage() {
  await requireCapability("view_finance");
  await sweepExpiredBookings();

  const sb = getSupabase();

  // Per-deal summary (outstanding/balance per booking).
  const { data } = await sb
    .from("bookings")
    .select("*, plots(plot_no), customers(name), projects(name)")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  const raw = (data ?? []) as (Booking & {
    plots: Pick<Plot, "plot_no">;
    customers: Pick<Customer, "name">;
    projects: Pick<Project, "name">;
  })[];

  const rows: PaymentRow[] = raw.map((b) => ({
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

  // Per-transaction ledger — every individual payment, who recorded it.
  const { data: payData } = await sb
    .from("payments")
    .select(
      "id, booking_id, amount, kind, mode, status, paid_at, recorder:users!recorded_by(full_name), bookings(plots(plot_no), customers(name), projects(name))",
    )
    .order("paid_at", { ascending: false });
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
    recordedBy: p.recorder?.full_name ?? "—",
    status: p.status,
  }));

  // Refunds — every booking that has money owed/returned, shown as outflows.
  const { data: refundData } = await sb
    .from("bookings")
    .select(
      "id, refund_amount, refund_status, refund_paid_at, refund_approved_at, released_at, created_at, plots(plot_no), customers(name), projects(name)",
    )
    .gt("refund_amount", 0);
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
    recordedBy: "—",
    status: b.refund_status === "paid" ? "completed" : "pending",
  }));

  const ledger: LedgerRow[] = [...payments, ...refunds].sort(
    (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime(),
  );

  const totalValue = rows.reduce((s, b) => s + b.value, 0);
  const totalPaid = rows.reduce((s, b) => s + b.paid, 0);
  // Net received = completed inflows minus completed refund outflows.
  const totalReceived = ledger
    .filter((p) => p.status === "completed")
    .reduce((s, p) => s + p.amount, 0);
  const totalRefunds = refunds.reduce((s, p) => s + Math.abs(p.amount), 0);

  return (
    <>
      <PageHeader title="Payments" subtitle="Collections and outstanding across every active deal." />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Deal Value" value={inr(totalValue)} />
        <StatCard label="Received" value={inr(totalReceived)} />
        <StatCard label="Outstanding" value={inr(Math.max(0, totalValue - totalPaid))} />
        <StatCard label="Refunds" value={inr(totalRefunds)} />
      </div>

      <PaymentsWorkspace ledger={ledger} deals={rows} />
    </>
  );
}
