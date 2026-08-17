import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { can } from "@/lib/roles";
import { sweepExpiredBookings } from "@/lib/lifecycle";
import { isFlaggedExpired } from "@/lib/holds";
import { inr, fmtDate, fmtDateTime, timeLeft } from "@/lib/format";
import { PageHeader, PlotStatusBadge, BookingStatusBadge, PaymentBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { releasePlot } from "../actions";
import type { Booking, Customer, Plot, Project } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PlotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await sweepExpiredBookings();
  const sb = getSupabase();

  const { data: plotData } = await sb
    .from("plots")
    .select("*, projects(*)")
    .eq("id", id)
    .maybeSingle();
  if (!plotData) notFound();
  const plot = plotData as Plot & { projects: Project };
  const project = plot.projects;
  const value = plot.sqft * plot.price_per_sqft;

  // active booking (pending/confirmed)
  const { data: bk } = await sb
    .from("bookings")
    .select("*, customers(name, mobile)")
    .eq("plot_id", id)
    .in("status", ["pending", "confirmed"])
    .order("created_at", { ascending: false })
    .maybeSingle();
  const live = bk as (Booking & { customers: Pick<Customer, "name" | "mobile"> }) | null;
  // An expired hold reads as auto-released to everyone but an Admin (lib/holds),
  // so its record is hidden here too — otherwise this page would show the deal a
  // salesperson has just been told is over.
  const isAdmin = user.role === "admin";
  const maskedHold = Boolean(live) && !isAdmin && isFlaggedExpired(live!);
  const booking = maskedHold ? null : live;

  // Sales roles may BLOCK; only Admin may BOOK.
  const canBlock = can(user.role, "create_blocking");
  const canBook = can(user.role, "create_booking");
  const canCreate = canBlock || canBook;
  const canRelease = can(user.role, "manage_plots");
  // An unconfirmed hold leaves the plot reading 'available', so "free to take"
  // means available AND unclaimed — the live booking is the real claim, masked
  // or not. A masked hold still blocks the actions; it just isn't named.
  const isFree = plot.status === "available" && !live;
  const isAvailable = plot.status === "available";

  return (
    <>
      <PageHeader
        title={`Plot ${plot.plot_no}`}
        subtitle={`${project.name} · ${project.city}`}
        back={{ href: `/projects/${project.id}`, label: "← Project" }}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card space-y-3 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Plot Details</span>
            <PlotStatusBadge status={plot.status} />
          </div>
          <Row label="Plot No">{plot.plot_no}</Row>
          <Row label="Sq.ft">{plot.sqft}</Row>
          <Row label="Price / Sq.ft">{inr(plot.price_per_sqft)}</Row>
          <Row label="Total Plot Value">
            <span className="font-semibold">{inr(value)}</span>
          </Row>
          <Row label="Blocking Amount">{inr(project.blocking_amount)}</Row>
          <Row label={`Advance (${project.advance_percent}%)`}>
            {inr((value * project.advance_percent) / 100)}
          </Row>
          {plot.description && <Row label="Description">{plot.description}</Row>}
        </div>

        <div className="lg:col-span-2">
          {isFree ? (
            <div className="card">
              <h2 className="text-sm font-semibold">Actions</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                This plot is available. Block it with the initial amount{canBook ? ", or book it directly with the advance" : ""}.
              </p>
              {canCreate ? (
                <div className="mt-4 flex flex-wrap gap-3">
                  {canBlock && (
                    <Link
                      href={`/bookings/new?plot=${plot.id}&mode=blocking`}
                      className={canBook ? "btn-ghost" : "btn-primary"}
                    >
                      Block Plot ({inr(project.blocking_amount)})
                    </Link>
                  )}
                  {canBook && (
                    <Link href={`/bookings/new?plot=${plot.id}&mode=booking`} className="btn-primary">
                      Book Plot ({project.advance_percent}% advance)
                    </Link>
                  )}
                </div>
              ) : (
                <p className="mt-4 text-sm text-[var(--muted)]">
                  You do not have permission to block/book plots.
                </p>
              )}
            </div>
          ) : booking ? (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  Current {booking.book_mode === "blocking" ? "Hold (Blocking)" : "Booking"}
                </h2>
                <div className="flex gap-2">
                  <BookingStatusBadge status={booking.status} />
                  <PaymentBadge status={booking.payment_status} />
                </div>
              </div>
              {booking.status === "pending" && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                  Awaiting Admin confirmation. The plot still reads as available, but it is claimed — nobody else can
                  block or book it.
                </p>
              )}
              <Row label="Customer">
                {booking.customers?.name}
                <span className="ml-2 text-xs text-[var(--muted)]">{booking.customers?.mobile}</span>
              </Row>
              <Row label="Total Value">{inr(booking.total_plot_value)}</Row>
              <Row label="Advance Required">{inr(booking.advance_required)}</Row>
              <Row label="Advance Paid">{inr(booking.advance_paid)}</Row>
              {booking.expires_at && (
                <Row label="Window">
                  {timeLeft(booking.expires_at)}{" "}
                  <span className="text-xs text-[var(--muted)]">
                    (until {fmtDateTime(booking.expires_at)})
                  </span>
                </Row>
              )}
              <Row label="Booked Date">{fmtDate(booking.booked_date)}</Row>
              <div className="pt-2">
                <Link href={`/bookings/${booking.id}`} className="btn-primary">
                  Open Booking
                </Link>
                {canRelease && (
                  <form action={releasePlot} className="ml-2 inline">
                    <input type="hidden" name="plot_id" value={plot.id} />
                    <SubmitButton className="btn-ghost text-[var(--brand-red)]" pendingLabel="Releasing…">
                      Release Plot
                    </SubmitButton>
                  </form>
                )}
              </div>
            </div>
          ) : maskedHold ? (
            // The hold behind this plot is hidden from this viewer, so no state
            // is described — just that the plot is out of reach and who to ask.
            <div className="card space-y-3">
              <h2 className="text-sm font-semibold">Not available</h2>
              <p className="text-sm text-[var(--muted)]">
                Plot {plot.plot_no} can&apos;t be blocked or booked right now. Please contact the Admin about this plot —
                every other plot in {project.name} is unaffected.
              </p>
              <Link href={`/projects/${project.id}`} className="btn-primary inline-block">
                Pick another plot
              </Link>
            </div>
          ) : (
            <div className="card space-y-3">
              <p className="text-sm text-[var(--muted)]">
                This plot is {plot.status} with no active booking record.
              </p>
              {canRelease && !isAvailable && (
                <form action={releasePlot}>
                  <input type="hidden" name="plot_id" value={plot.id} />
                  <SubmitButton className="btn-ghost text-[var(--brand-red)]" pendingLabel="Releasing…">
                    Release Plot to Company
                  </SubmitButton>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <span className="text-right text-sm">{children}</span>
    </div>
  );
}
