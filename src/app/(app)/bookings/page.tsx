import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { can, isSalesRole } from "@/lib/roles";
import { getDownlineIds } from "@/lib/hierarchy";
import { sweepExpiredBookings } from "@/lib/lifecycle";
import { PageHeader } from "@/components/ui";
import type { Booking, Customer, Plot, Project } from "@/lib/types";
import { type BookingRow } from "./BookingsTable";
import BookingsWorkspace from "./BookingsWorkspace";
import { loadBookingFlow } from "./flow";

export const dynamic = "force-dynamic";

// Blockings & Bookings — the LIST of every actual blocked/booked record. Adding a
// new blocking/booking lives on its own page (/bookings/add).
export default async function BookingsPage() {
  const user = await requireUser();
  await sweepExpiredBookings();
  const sb = getSupabase();
  const canBlock = can(user.role, "create_blocking");
  const canBook = can(user.role, "create_booking");
  const canCreate = canBlock || canBook;
  const isAdmin = user.role === "admin";
  const showSalesperson = isAdmin || (isSalesRole(user.role) && user.role !== "business_partner");

  let query = sb
    .from("bookings")
    .select("*, plots(plot_no, sqft), customers(name, mobile), projects(name), creator:users!created_by(full_name)")
    .order("created_at", { ascending: false });
  // Admin sees everything; everyone else sees their own downline's records.
  if (!isAdmin) {
    const ids = await getDownlineIds(sb, user.id);
    const list = ids.join(",");
    query = query.or(`created_by.in.(${list}),partner_id.in.(${list})`);
  }
  const { data } = await query;
  const raw = (data ?? []) as (Booking & {
    plots: Pick<Plot, "plot_no" | "sqft">;
    customers: Pick<Customer, "name" | "mobile">;
    projects: Pick<Project, "name">;
    creator: { full_name: string } | null;
  })[];

  const rows: BookingRow[] = raw.map((b, i) => ({
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
    payment_status: b.payment_status,
    refund_status: b.refund_status,
    expires_at: b.expires_at,
    created_at: b.created_at,
  }));

  // Admin creates from the dedicated "Add Blocking & Booking" page, so this list
  // has no inline create button. Sales keep the inline flow here.
  const flow = canCreate && !isAdmin ? await loadBookingFlow(sb, user) : null;
  const { data: me } = await sb.from("users").select("city").eq("id", user.id).maybeSingle();
  const myCity = (me as { city?: string | null } | null)?.city ?? null;

  return (
    <>
      <PageHeader
        title="Blockings & Bookings"
        subtitle="Every actual blocking and booking on record — search, confirm or cancel."
      />
      <BookingsWorkspace
        rows={rows}
        canConfirm={can(user.role, "confirm_booking")}
        canCancel={can(user.role, "cancel_booking")}
        canCreate={canCreate}
        canBlock={canBlock}
        canBook={canBook}
        showSalesperson={showSalesperson}
        flow={flow}
        hideCreate={isAdmin}
        myCity={myCity}
      />
    </>
  );
}
