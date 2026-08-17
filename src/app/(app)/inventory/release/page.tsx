import { requireAnyCapability } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getSupabase } from "@/lib/supabase";
import { getDistrictScope, withProjectScope } from "@/lib/scope";
import { sweepExpiredBookings } from "@/lib/lifecycle";
import { PageHeader } from "@/components/ui";
import type { Booking, Customer, Plot, Project } from "@/lib/types";
import { RELEASED_BY_ADMIN } from "@/lib/holds";
import ReleaseTabs from "./ReleaseTabs";
import { type PendingRow } from "./PendingReleaseTable";
import { type ReleasedRow } from "./ReleasedHistory";

export const dynamic = "force-dynamic";

const NOTICE: Record<string, { tone: "ok" | "err"; text: string }> = {
  extended: { tone: "ok", text: "Hold extended — the customer has more time on the same plot." },
  extend_released: {
    tone: "err",
    text: "Can't extend: that plot has already been released back to the company, and a release is final.",
  },
  extend_gone: { tone: "err", text: "Can't extend: that hold is no longer available to extend." },
  extend_input: { tone: "err", text: "Enter a valid extension duration." },
};

// Post-Sales · Plot Release — ADMIN ONLY, and the single place a plot ever goes
// back to inventory. Two tabs:
//  1. Expired holds — everything waiting on a decision, of both kinds. A hold
//     past its deadline still owns its plot (Extend or Release); a cancelled
//     booking has no hold left (Release only). Neither returns on its own.
//  2. History — what has already gone back. A record, nothing more: releasing is
//     FINAL, so nothing here can be extended, released again or reinstated. The
//     plot is plain inventory once more and the next customer takes it through
//     the normal blocking/booking flow.
// Gated on `release_plot`, not `manage_plots`: working this queue must not carry
// the power to add, re-price or delete inventory.
export default async function PlotReleasePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  // The Post-Sales desk may OPEN this page; only Admin may act on it. `canAct`
  // drives whether the Extend / Release controls render at all — the server
  // actions behind them re-check `release_plot` regardless.
  const user = await requireAnyCapability(["release_plot", "view_plot_release"]);
  const canAct = can(user.role, "release_plot");
  await sweepExpiredBookings();
  const sb = getSupabase();
  // Null for Admin (company-wide); a project-id filter for a branch desk.
  const scope = await getDistrictScope(sb, user);

  const { ok, err } = await searchParams;
  const notice = NOTICE[ok ?? ""] ?? NOTICE[err ?? ""];

  // ── 1. Expired holds AWAITING A DECISION ──────────────────────────────────
  // Only holds that are still LIVE (pending/confirmed) and therefore still own
  // their plot. These are the ones an Admin has to act on: Extend the hold, or
  // Release the plot back to the company. A hold that has already been released
  // is finished — it is not actionable and never re-extendable — so it drops out
  // of this queue and into the read-only history below.
  const { data: expData } = await withProjectScope(
    sb
      .from("bookings")
      .select(
        "id, plot_id, status, total_plot_value, book_mode, expired_at, plots!inner(plot_no, status, price_per_sqft, sqft, projects(name)), customers(name)",
      )
      .not("expired_at", "is", null)
      .in("status", ["pending", "confirmed"]),
    scope,
  ).order("expired_at", { ascending: false });

  type ExpRow = Pick<Booking, "id" | "plot_id" | "status" | "total_plot_value" | "book_mode" | "expired_at"> & {
    plots: (Pick<Plot, "plot_no" | "status" | "price_per_sqft" | "sqft"> & { projects: Pick<Project, "name"> | null }) | null;
    customers: Pick<Customer, "name"> | null;
  };

  const seenPlots = new Set<string>();
  const expiredPending: PendingRow[] = [];
  for (const b of (expData ?? []) as unknown as ExpRow[]) {
    // The unique active-booking index allows only one of these per plot, but
    // guard anyway so a legacy double never renders two rows for one plot.
    if (seenPlots.has(b.plot_id)) continue;
    seenPlots.add(b.plot_id);
    expiredPending.push({
      key: `expired-${b.id}`,
      bookingId: b.id,
      plotId: b.plot_id,
      project: b.plots?.projects?.name ?? "—",
      plot: b.plots?.plot_no ?? "—",
      customer: b.customers?.name ?? "—",
      value: Number(b.total_plot_value ?? 0) || (b.plots ? b.plots.sqft * b.plots.price_per_sqft : 0),
      mode: b.book_mode,
      kind: "expired",
      confirmed: b.status === "confirmed",
      refundStatus: "none",
      since: b.expired_at,
    });
  }

  // ── 2. Cancelled plots — the booking is over, the plot is parked ──────────
  // A cancellation does NOT put the plot back on the market: cancelBooking parks
  // it as 'cancelled' so it waits here alongside the expired holds. There is no
  // live hold left to extend, so these rows only ever offer Release.
  const { data: plotData } = await withProjectScope(
    sb
      .from("plots")
      .select("id, plot_no, sqft, price_per_sqft, status, projects(name)")
      .eq("status", "cancelled"),
    scope,
  ).order("plot_no");
  const plots = (plotData ?? []) as unknown as (Pick<Plot, "id" | "plot_no" | "sqft" | "price_per_sqft" | "status"> & {
    projects: Pick<Project, "name"> | null;
  })[];

  // The cancelled booking behind each parked plot → who held it, value, refund.
  const ids = plots.map((p) => p.id);
  const byPlot = new Map<
    string,
    { customer: string; value: number; mode: string; cancelledAt: string | null; refundStatus: string }
  >();
  if (ids.length > 0) {
    const { data: bkData } = await sb
      .from("bookings")
      .select("plot_id, total_plot_value, book_mode, released_at, refund_status, customers(name)")
      .in("plot_id", ids)
      .eq("status", "cancelled")
      .order("released_at", { ascending: false });
    for (const b of (bkData ?? []) as unknown as (Pick<
      Booking,
      "plot_id" | "total_plot_value" | "book_mode" | "released_at" | "refund_status"
    > & {
      customers: Pick<Customer, "name"> | null;
    })[]) {
      // Keep the most recent cancelled booking per plot (rows are sorted desc).
      if (!byPlot.has(b.plot_id)) {
        byPlot.set(b.plot_id, {
          customer: b.customers?.name ?? "—",
          value: Number(b.total_plot_value ?? 0),
          mode: b.book_mode,
          cancelledAt: b.released_at,
          refundStatus: b.refund_status ?? "none",
        });
      }
    }
  }

  const cancelledPending: PendingRow[] = plots.map((p) => {
    const bk = byPlot.get(p.id);
    return {
      key: `cancelled-${p.id}`,
      bookingId: null, // the deal is over — nothing here to extend
      plotId: p.id,
      project: p.projects?.name ?? "—",
      plot: p.plot_no,
      customer: bk?.customer ?? "—",
      value: bk?.value ?? p.sqft * p.price_per_sqft,
      mode: bk?.mode ?? "booking",
      kind: "cancelled" as const,
      confirmed: false,
      refundStatus: bk?.refundStatus ?? "none",
      since: bk?.cancelledAt ?? null,
    };
  });

  // ONE queue: both kinds are off the market and both are settled by Release.
  const pendingRows: PendingRow[] = [...expiredPending, ...cancelledPending].sort(
    (a, b) => new Date(b.since ?? 0).getTime() - new Date(a.since ?? 0).getTime(),
  );

  // ── 3. HISTORY — holds whose plot has already gone back ───────────────────
  // Two ways in:
  //   · an Admin pressed Release   → cancellation_reason "Released by admin"
  //   · the old automatic expiry   → no reason, released_at == expired_at
  // A customer cancellation is a different story with its own refund and belongs
  // on Payments & Cancellation, so it is filtered out.
  const { data: relData } = await withProjectScope(
    sb
      .from("bookings")
      .select(
        "id, plot_id, total_plot_value, book_mode, released_at, expired_at, cancellation_reason, plots(plot_no, status, projects(name)), customers(name)",
      )
      .eq("status", "cancelled")
      .not("released_at", "is", null),
    scope,
  ).order("released_at", { ascending: false });

  const relRaw = ((relData ?? []) as unknown as (Pick<
    Booking,
    "id" | "plot_id" | "total_plot_value" | "book_mode" | "released_at" | "expired_at" | "cancellation_reason"
  > & {
    plots: (Pick<Plot, "plot_no" | "status"> & { projects: Pick<Project, "name"> | null }) | null;
    customers: Pick<Customer, "name"> | null;
  })[]).filter((b) => b.cancellation_reason === RELEASED_BY_ADMIN || b.cancellation_reason === null);

  const releasedRows: ReleasedRow[] = relRaw.map((b) => ({
    bookingId: b.id,
    project: b.plots?.projects?.name ?? "—",
    plot: b.plots?.plot_no ?? "—",
    customer: b.customers?.name ?? "—",
    value: Number(b.total_plot_value ?? 0),
    mode: b.book_mode,
    releasedAt: b.released_at,
  }));

  return (
    <>
      <PageHeader
        title="Plot Release"
        subtitle="Nothing returns to inventory on its own. Expired holds and cancelled plots wait here until you act; History records what has already gone back."
      />

      {notice && (
        <div
          className="mb-4 rounded-lg px-4 py-2.5 text-sm"
          style={{
            background: notice.tone === "ok" ? "var(--green-soft, #ecfdf5)" : "var(--red-soft, #fef2f2)",
            color: notice.tone === "ok" ? "var(--green, #047857)" : "var(--brand-red, #b91c1c)",
          }}
        >
          {notice.text}
        </div>
      )}

      <ReleaseTabs pendingRows={pendingRows} historyRows={releasedRows} canAct={canAct} />
    </>
  );
}
