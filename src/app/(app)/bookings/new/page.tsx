import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { isFlaggedExpired } from "@/lib/holds";
import { ownBookedCustomerIds, ownCustomerOrFilter } from "@/lib/customers";
import { PageHeader } from "@/components/ui";
import type { Customer, Plot, Project } from "@/lib/types";
import BookingForm from "./BookingForm";

export const dynamic = "force-dynamic";

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ plot?: string; mode?: string; err?: string; held?: string }>;
}) {
  const sp = await searchParams;
  const plotId = sp.plot;
  const mode = sp.mode === "blocking" ? "blocking" : "booking";
  // Sales roles may BLOCK; only Admin may BOOK.
  const user = await requireCapability(mode === "booking" ? "create_booking" : "create_blocking");
  if (!plotId) redirect("/plots");

  const sb = getSupabase();
  const { data: plotData } = await sb
    .from("plots")
    .select("*, projects(*)")
    .eq("id", plotId)
    .maybeSingle();
  if (!plotData) notFound();
  const plot = plotData as Plot & { projects: Project };

  // An unconfirmed hold leaves the plot reading 'available', so availability is
  // not enough — check for the claim itself. Whatever is wrong, it is wrong with
  // THIS plot only: the page renders the reason in place and drops the form
  // rather than bouncing the user somewhere with nothing to read.
  const isAdmin = user.role === "admin";
  const { data: claim } = await sb
    .from("bookings")
    .select("book_mode, status, expired_at")
    .eq("plot_id", plotId)
    .in("status", ["pending", "confirmed"])
    .maybeSingle();

  // An EXPIRED hold has been shown to this user as auto-released (lib/holds), so
  // naming it would give away the Admin's pending decision. They get a neutral
  // "something is wrong with this plot" instead. Admin sees the real reason.
  const maskedIssue =
    (claim ? isFlaggedExpired(claim) && !isAdmin : false) || (!claim && sp.err === "plot_issue");
  const heldAs = maskedIssue
    ? null
    : claim?.book_mode ?? (sp.err === "held" ? sp.held ?? "blocking" : null);
  // Plot gone for some other reason (blocked/booked/registered by an older
  // record) — still this plot's problem, not an error page.
  const goneAs = !maskedIssue && !heldAs && plot.status !== "available" ? plot.status : null;
  const blocked = maskedIssue || Boolean(heldAs) || Boolean(goneAs);

  // Scope the customer picker to the user's own book — a salesperson must not
  // see (or attach a plot to) another salesperson's customer. Admin sees all.
  let custQ = sb.from("customers").select("id, name, mobile").order("name");
  if (user.role !== "admin") {
    const bookedIds = await ownBookedCustomerIds(sb, user.id);
    custQ = custQ.or(ownCustomerOrFilter(user.id, bookedIds));
  }
  const { data: custData } = await custQ;

  return (
    <>
      <PageHeader
        title={mode === "blocking" ? "Block Plot" : "Book Plot"}
        subtitle={`${plot.projects.name} · Plot ${plot.plot_no}`}
        back={{ href: `/plots/${plotId}`, label: "← Back" }}
      />
      {maskedIssue && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
          <p className="font-medium">
            This plot can&apos;t be {mode === "blocking" ? "blocked" : "booked"} right now.
          </p>
          <p className="mt-1">
            Something needs sorting out on Plot {plot.plot_no} — please contact the Admin. Every other plot is
            unaffected, so you can carry on with a different one.
          </p>
        </div>
      )}
      {heldAs && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-[var(--brand-red)]">
          This plot has already been <b>{heldAs === "booking" ? "booked" : "blocked"}</b>. It stays listed as available
          until an Admin confirms that hold, but it is no longer free to take — pick another plot.
        </div>
      )}
      {goneAs && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-[var(--brand-red)]">
          Plot {plot.plot_no} is <b>{goneAs}</b> and can no longer be {mode === "blocking" ? "blocked" : "booked"} — pick
          another plot.
        </div>
      )}
      {blocked && (
        <div className="mb-6 flex flex-wrap gap-3">
          <Link href={`/projects/${plot.projects.id}`} className="btn-primary">
            Pick another plot
          </Link>
          <Link href="/bookings" className="btn-ghost">
            ← Blockings &amp; Bookings
          </Link>
        </div>
      )}
      {!blocked && sp.err === "underpaid" && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
          The plot was <b>not {mode === "blocking" ? "blocked" : "booked"}</b>: the full{" "}
          {mode === "blocking" ? "blocking amount" : "advance"} must be paid to lock it. It is still
          available — enter the full amount below to {mode === "blocking" ? "block" : "book"}.
        </div>
      )}
      {!blocked && (
        <BookingForm
          mode={mode}
          plot={{
            id: plot.id,
            plot_no: plot.plot_no,
            sqft: plot.sqft,
            price_per_sqft: plot.price_per_sqft,
          }}
          project={{
            name: plot.projects.name,
            advance_percent: plot.projects.advance_percent,
            advance_min_amount: plot.projects.advance_min_amount,
            blocking_amount: plot.projects.blocking_amount,
            blocking_window_hours: plot.projects.blocking_window_hours,
            booking_window_days: plot.projects.booking_window_days,
          }}
          customers={(custData ?? []) as Pick<Customer, "id" | "name" | "mobile">[]}
        />
      )}
    </>
  );
}
