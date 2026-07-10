import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { sweepExpiredBookings } from "@/lib/lifecycle";
import { PageHeader } from "@/components/ui";
import type { Booking, Customer, Plot, Project } from "@/lib/types";
import ReleaseTable, { type ReleaseRow } from "./ReleaseTable";
import ExtendTable, { type ExtendRow } from "./ExtendTable";

export const dynamic = "force-dynamic";

const NOTICE: Record<string, { tone: "ok" | "err"; text: string }> = {
  extended: { tone: "ok", text: "Hold extended — the plot is back with the original customer." },
  extend_taken: { tone: "err", text: "Can't extend: another customer has already blocked or booked that plot." },
  extend_gone: { tone: "err", text: "Can't extend: that hold is no longer available to extend." },
  extend_input: { tone: "err", text: "Enter a valid extension duration." },
};

// Post-Sales · Plot Release. Two queues for an Admin:
//  1. Expired holds — the deadline passed, the plot auto-released back to
//     'available' (anyone may re-block/book it), but the Admin can still EXTEND
//     it back to the original customer while it stays free.
//  2. Cancelled plots — a cancelled booking parks its plot as 'cancelled'; it
//     lands here for the Admin to release back to the company. Admin-only.
export default async function PlotReleasePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  await requireCapability("manage_plots");
  await sweepExpiredBookings();
  const sb = getSupabase();

  const { ok, err } = await searchParams;
  const notice = NOTICE[ok ?? ""] ?? NOTICE[err ?? ""];

  // ── 1. Expired holds whose plot is still free → extendable ────────────────
  const { data: expData } = await sb
    .from("bookings")
    .select(
      "id, plot_id, total_plot_value, book_mode, expired_at, plots!inner(plot_no, status, price_per_sqft, sqft, projects(name)), customers(name)",
    )
    .not("expired_at", "is", null)
    .order("expired_at", { ascending: false });

  const seenPlots = new Set<string>();
  const extendRows: ExtendRow[] = [];
  for (const b of (expData ?? []) as unknown as (Pick<Booking, "id" | "plot_id" | "total_plot_value" | "book_mode" | "expired_at"> & {
    plots: (Pick<Plot, "plot_no" | "status" | "price_per_sqft" | "sqft"> & { projects: Pick<Project, "name"> | null }) | null;
    customers: Pick<Customer, "name"> | null;
  })[]) {
    // Only the most recent expired hold per plot, and only while it stays free.
    if (seenPlots.has(b.plot_id)) continue;
    seenPlots.add(b.plot_id);
    if (b.plots?.status !== "available") continue;
    extendRows.push({
      bookingId: b.id,
      project: b.plots?.projects?.name ?? "—",
      plot: b.plots?.plot_no ?? "—",
      customer: b.customers?.name ?? "—",
      value: Number(b.total_plot_value ?? 0) || (b.plots ? b.plots.sqft * b.plots.price_per_sqft : 0),
      mode: b.book_mode,
      expiredAt: b.expired_at,
    });
  }

  // ── 2. Cancelled plots waiting to be released back to the company ─────────
  const { data: plotData } = await sb
    .from("plots")
    .select("id, plot_no, sqft, price_per_sqft, status, projects(name)")
    .eq("status", "cancelled")
    .order("plot_no");
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
        subtitle="Expired holds you can extend for the original customer, and cancelled plots to release back to the company."
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
        <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">Expired holds — extend or leave released</h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          These plots are already released and open to anyone. Extend to give the original customer more time — only
          while the plot is still free. Once someone else blocks or books it, the row drops off here.
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
