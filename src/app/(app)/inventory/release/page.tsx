import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { getDistrictScope, withProjectScope } from "@/lib/scope";
import { sweepExpiredBookings } from "@/lib/lifecycle";
import { PageHeader } from "@/components/ui";
import type { Booking, Customer, Plot, Project } from "@/lib/types";
import ReleaseTable, { type ReleaseRow } from "./ReleaseTable";
import ExtendTable, { type ExtendRow } from "./ExtendTable";

export const dynamic = "force-dynamic";

const NOTICE: Record<string, { tone: "ok" | "err"; text: string }> = {
  extended: { tone: "ok", text: "Hold extended — the customer has more time on the same plot." },
  extend_taken: { tone: "err", text: "Can't extend: that hold has already been released." },
  extend_gone: { tone: "err", text: "Can't extend: that hold is no longer available to extend." },
  extend_input: { tone: "err", text: "Enter a valid extension duration." },
};

// Post-Sales · Plot Release — ADMIN ONLY, and the single place a plot ever goes
// back to inventory. Nothing releases itself, so both queues here sit until an
// Admin acts on them:
//  1. Expired holds — the deadline passed, but the plot is STILL held for that
//     customer. Extend it (new deadline, same plot) or Release it to the company.
//  2. Cancelled plots — a cancelled booking parks its plot as 'cancelled'; it
//     lands here to be released back to the company.
// Gated on `release_plot`, not `manage_plots`: working this queue must not carry
// the power to add, re-price or delete inventory.
export default async function PlotReleasePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const user = await requireCapability("release_plot");
  await sweepExpiredBookings();
  const sb = getSupabase();
  // Null for Admin (company-wide); a project-id filter for a branch desk.
  const scope = await getDistrictScope(sb, user);

  const { ok, err } = await searchParams;
  const notice = NOTICE[ok ?? ""] ?? NOTICE[err ?? ""];

  // ── 1. Expired holds ──────────────────────────────────────────────────────
  // Two shapes land here, and the row's actions differ between them:
  //  · STILL HELD (status pending/confirmed) — the sweep only flagged it, so the
  //    hold kept its plot. Extend it, or Release the plot to the company.
  //  · ALREADY RELEASED (status cancelled) — a hold that expired under the OLD
  //    auto-release behaviour: it was cancelled and its plot pushed back to
  //    'available' before anyone could decide. There is nothing left to release,
  //    but it can still be reclaimed for the original customer while the plot is
  //    free — which is why these are NOT filtered out by status here.
  const { data: expData } = await withProjectScope(
    sb
      .from("bookings")
      .select(
        "id, plot_id, status, total_plot_value, book_mode, expired_at, plots!inner(plot_no, status, price_per_sqft, sqft, projects(name)), customers(name)",
      )
      .not("expired_at", "is", null),
    scope,
  ).order("expired_at", { ascending: false });

  type ExpRow = Pick<Booking, "id" | "plot_id" | "status" | "total_plot_value" | "book_mode" | "expired_at"> & {
    plots: (Pick<Plot, "plot_no" | "status" | "price_per_sqft" | "sqft"> & { projects: Pick<Project, "name"> | null }) | null;
    customers: Pick<Customer, "name"> | null;
  };

  const seenPlots = new Set<string>();
  const candidates: ExpRow[] = [];
  for (const b of (expData ?? []) as unknown as ExpRow[]) {
    // Most recent expired hold per plot only.
    if (seenPlots.has(b.plot_id)) continue;
    seenPlots.add(b.plot_id);
    // An already-released hold is only reclaimable while its plot is still free.
    if (b.status === "cancelled" && b.plots?.status !== "available") continue;
    candidates.push(b);
  }

  // A released hold's plot can read 'available' and STILL be spoken for — an
  // unconfirmed hold no longer moves the plot. Drop those: someone else has it.
  const releasedPlotIds = candidates.filter((b) => b.status === "cancelled").map((b) => b.plot_id);
  const claimedPlots = new Set<string>();
  if (releasedPlotIds.length > 0) {
    const { data: claims } = await sb
      .from("bookings")
      .select("plot_id")
      .in("plot_id", releasedPlotIds)
      .in("status", ["pending", "confirmed"]);
    for (const c of (claims ?? []) as { plot_id: string }[]) claimedPlots.add(c.plot_id);
  }

  const extendRows: ExtendRow[] = candidates
    .filter((b) => !(b.status === "cancelled" && claimedPlots.has(b.plot_id)))
    .map((b) => ({
      bookingId: b.id,
      plotId: b.plot_id,
      project: b.plots?.projects?.name ?? "—",
      plot: b.plots?.plot_no ?? "—",
      customer: b.customers?.name ?? "—",
      value: Number(b.total_plot_value ?? 0) || (b.plots ? b.plots.sqft * b.plots.price_per_sqft : 0),
      mode: b.book_mode,
      stillHeld: b.status !== "cancelled",
      confirmed: b.status === "confirmed",
      expiredAt: b.expired_at,
    }));

  // ── 2. Cancelled plots waiting to be released back to the company ─────────
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

  // The cancelled booking behind each held plot → who held it, value, refund.
  const ids = plots.map((p) => p.id);
  const byPlot = new Map<string, { customer: string; value: number; cancelledAt: string | null; refundStatus: string }>();
  if (ids.length > 0) {
    const { data: bkData } = await sb
      .from("bookings")
      .select("plot_id, total_plot_value, released_at, refund_status, customers(name)")
      .in("plot_id", ids)
      .eq("status", "cancelled")
      .order("released_at", { ascending: false });
    for (const b of (bkData ?? []) as unknown as (Pick<Booking, "plot_id" | "total_plot_value" | "released_at" | "refund_status"> & {
      customers: Pick<Customer, "name"> | null;
    })[]) {
      // Keep the most recent cancelled booking per plot (rows are sorted desc).
      if (!byPlot.has(b.plot_id)) {
        byPlot.set(b.plot_id, {
          customer: b.customers?.name ?? "—",
          value: Number(b.total_plot_value ?? 0),
          cancelledAt: b.released_at,
          refundStatus: b.refund_status ?? "none",
        });
      }
    }
  }

  const rows: ReleaseRow[] = plots.map((p) => {
    const bk = byPlot.get(p.id);
    return {
      id: p.id,
      project: p.projects?.name ?? "—",
      plot: p.plot_no,
      customer: bk?.customer ?? "—",
      value: bk?.value ?? p.sqft * p.price_per_sqft,
      cancelledAt: bk?.cancelledAt ?? null,
      refundStatus: bk?.refundStatus ?? "none",
    };
  });

  return (
    <>
      <PageHeader
        title="Plot Release"
        subtitle="Nothing returns to inventory on its own. Expired holds and cancelled plots wait here until you extend or release them."
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

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">Expired holds — extend or release</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Holds past their deadline. <b>Held</b> ones still own their plot — nobody else can take it — so extend to give
          the customer more time, or release the plot back to the company. <b>Already released</b> ones expired under the
          old automatic behaviour and their plot is back in inventory; you can still extend to reclaim it for the
          original customer, but only until someone else takes it.
        </p>
        <ExtendTable rows={extendRows} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">Cancelled plots — release to company</h2>
        <ReleaseTable rows={rows} />
      </section>
    </>
  );
}
