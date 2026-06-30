import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { can, isSalesRole } from "@/lib/roles";
import { getDownlineIds } from "@/lib/hierarchy";
import { sweepExpiredBookings } from "@/lib/lifecycle";
import { PageHeader } from "@/components/ui";
import type { Booking, Customer, Plot, Project } from "@/lib/types";
import { type BookingRow } from "./BookingsTable";
import BookingsWorkspace from "./BookingsWorkspace";

export const dynamic = "force-dynamic";

// The LIST of blocked/booked records. Creating is on its own page (/bookings/add
// for sales · Pre-Sales for admin). Sales reach this as "My Blockings"
// (?mode=blocking) and "My Bookings" (?mode=booking); finance sees the full list.
export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const user = await requireUser();
  await sweepExpiredBookings();
  const sb = getSupabase();
  const sp = await searchParams;
  const mode = sp.mode === "blocking" ? "blocking" : sp.mode === "booking" ? "booking" : null;
  const isAdmin = user.role === "admin";
  const showSalesperson = isAdmin || (isSalesRole(user.role) && user.role !== "business_partner");

  let query = sb
    .from("bookings")
    .select("*, plots(plot_no, sqft, status), customers(name, mobile), projects(name), creator:users!created_by(full_name)")
    .order("created_at", { ascending: false });
  // Admin sees everything; everyone else sees their own downline's records.
  if (!isAdmin) {
    const ids = await getDownlineIds(sb, user.id);
    const list = ids.join(",");
    query = query.or(`created_by.in.(${list}),partner_id.in.(${list})`);
  }
  const { data } = await query;
  const raw = (data ?? []) as (Booking & {
    plots: Pick<Plot, "plot_no" | "sqft" | "status">;
    customers: Pick<Customer, "name" | "mobile">;
    projects: Pick<Project, "name">;
    creator: { full_name: string } | null;
  })[];

  // Which of these bookings already have a registration — so the list hides the
  // "Register" action once a plot is registered.
  const { data: regRows } = await sb
    .from("registrations")
    .select("booking_id")
    .not("booking_id", "is", null);
  const registeredBookingIds = new Set(
    ((regRows ?? []) as { booking_id: string | null }[]).map((r) => r.booking_id).filter(Boolean) as string[],
  );

  const rows: BookingRow[] = raw
    .filter((b) => (mode ? b.book_mode === mode : true))
    .map((b, i) => ({
      id: b.id,
      sno: i + 1,
      project: b.projects?.name ?? "—",
      plot: b.plots?.plot_no ?? "—",
      sqft: b.plot_sqft ?? b.plots?.sqft ?? null,
      customer: b.customers?.name ?? "—",
      mobile: b.customers?.mobile ?? "—",
      salesperson: b.partner_name
        ? b.partner_code
          ? `${b.partner_name} (${b.partner_code})`
          : b.partner_name
        : b.creator?.full_name ?? "—",
      value: b.total_plot_value,
      booked_date: b.booked_date,
      book_mode: b.book_mode,
      status: b.status,
      plotStatus: b.plots?.status ?? null,
      payment_status: b.payment_status,
      refund_status: b.refund_status,
      expires_at: b.expires_at,
      created_at: b.created_at,
      registered: registeredBookingIds.has(b.id),
    }));

  const salesView = isSalesRole(user.role);
  const title =
    mode === "blocking"
      ? "My Blockings"
      : mode === "booking"
        ? "My Bookings"
        : salesView
          ? "My Blockings & Bookings"
          : "Blockings & Bookings";
  const subtitle =
    mode === "blocking"
      ? "Your team's blockings — confirm or cancel."
      : mode === "booking"
        ? "Your team's bookings — confirm or cancel."
        : salesView
          ? "Your team's blockings and bookings — filter by Mode, confirm or cancel."
          : "Every actual blocking and booking on record — search, confirm or cancel.";

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      {/* Pure list — creating happens on the dedicated New Blocking / Add pages. */}
      <BookingsWorkspace
        rows={rows}
        canConfirm={can(user.role, "confirm_booking")}
        canCancel={can(user.role, "cancel_booking")}
        canRegister={can(user.role, "manage_registration")}
        canCreate={false}
        showSalesperson={showSalesperson}
        flow={null}
        hideCreate
      />
    </>
  );
}
