import { notFound, redirect } from "next/navigation";
import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { ownBookedCustomerIds, ownCustomerOrFilter } from "@/lib/customers";
import { PageHeader } from "@/components/ui";
import type { Customer, Plot, Project } from "@/lib/types";
import BookingForm from "./BookingForm";

export const dynamic = "force-dynamic";

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ plot?: string; mode?: string; err?: string }>;
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

  if (plot.status !== "available") {
    redirect(`/plots/${plotId}`);
  }

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
      {sp.err === "underpaid" && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
          The plot was <b>not {mode === "blocking" ? "blocked" : "booked"}</b>: the full{" "}
          {mode === "blocking" ? "blocking amount" : "advance"} must be paid to lock it. It is still
          available — enter the full amount below to {mode === "blocking" ? "block" : "book"}.
        </div>
      )}
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
    </>
  );
}
