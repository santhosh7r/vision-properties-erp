import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { can } from "@/lib/roles";
import { sweepExpiredBookings } from "@/lib/lifecycle";
import { inr, fmtDate, fmtDateTime, timeLeft } from "@/lib/format";
import { PageHeader, PlotStatusBadge, BookingStatusBadge, PaymentBadge } from "@/components/ui";
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
  const booking = bk as (Booking & { customers: Pick<Customer, "name" | "mobile"> }) | null;

  // Sales roles may BLOCK; only Admin may BOOK.
  const canBlock = can(user.role, "create_blocking");
  const canBook = can(user.role, "create_booking");
  const canCreate = canBlock || canBook;
  const isAvailable = plot.status === "available";

  return (
    <>
      <PageHeader
        title={`Plot ${plot.plot_no}`}
        subtitle={`${project.name} · ${project.city}`}
        action={
          <Link href={`/projects/${project.id}`} className="btn-ghost">
            ← Project
          </Link>
        }
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
          {isAvailable ? (
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
              </div>
            </div>
          ) : (
            <div className="card">
              <p className="text-sm text-[var(--muted)]">
                This plot is {plot.status} with no active booking record.
              </p>
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
