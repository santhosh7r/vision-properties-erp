import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { can, isSalesRole } from "@/lib/roles";
import { getDownlineIds } from "@/lib/hierarchy";
import { ownBookedCustomerIds, ownCustomerOrFilter } from "@/lib/customers";
import { sweepExpiredBookings } from "@/lib/lifecycle";
import { PageHeader } from "@/components/ui";
import type { Booking, Customer, Plot, Project } from "@/lib/types";
import { type BookingRow } from "./BookingsTable";
import BookingsWorkspace, { type FlowData } from "./BookingsWorkspace";
import { type FlowProject } from "./StartBookingFlow";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const user = await requireUser();
  await sweepExpiredBookings();
  const sb = getSupabase();
  // Sales roles may BLOCK; only Admin may BOOK. Either capability opens the flow.
  const canBlock = can(user.role, "create_blocking");
  const canBook = can(user.role, "create_booking");
  const canCreate = canBlock || canBook;
  const isAdmin = user.role === "admin";
  // Show the "Sales Person" column to anyone who can see other people's records
  // (Admin + managers with a downline) — not to a lone Business Partner.
  const showSalesperson = isAdmin || (isSalesRole(user.role) && user.role !== "business_partner");

  let query = sb
    .from("bookings")
    .select("*, plots(plot_no, sqft), customers(name, mobile), projects(name), creator:users!created_by(full_name)")
    .order("created_at", { ascending: false });
  // Admin sees the whole company. Everyone else sees records (blockings AND
  // bookings) that belong to their own downline (themselves + everyone beneath
  // them) — matched either by who CREATED the record or by the Partner ID stamped
  // on it. So a Partner's block/booking rolls up to their Manager, Director,
  // Senior Director and Admin.
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
    // The "sales person" is whoever's Partner ID is stamped on the record — even
    // when an Admin created it on their behalf. Fall back to the creator only
    // when no partner was entered.
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

  // Data for the inline "Block / Book" flow — only when the user can create.
  let flow: FlowData | null = null;
  if (canCreate) {
    // Non-admins pick from their OWN clients (created by them or booked with
    // their id) — same rule as the Customers panel.
    const custScopeFilter = isAdmin
      ? ""
      : ownCustomerOrFilter(user.id, await ownBookedCustomerIds(sb, user.id));
    // Base query does NOT depend on the plot-groups migration (0003), so blocking
    // and booking keep working even before that migration is run.
    const [{ data: projData }, { data: custData }] = await Promise.all([
      sb
        .from("projects")
        .select(
          "id, name, city, advance_percent, advance_min_amount, blocking_amount, blocking_window_hours, booking_window_days, plots(id, plot_no, sqft, price_per_sqft, status)",
        )
        .eq("status", "active")
        .order("name"),
      (isAdmin
        ? sb.from("customers").select("id, name, mobile")
        : sb.from("customers").select("id, name, mobile").or(custScopeFilter)
      ).order("name"),
    ]);

    // Plot groups are OPTIONAL: if migration 0003 isn't applied these queries
    // just error and we fall back to "no groups" (every plot is ungrouped).
    const [{ data: catData }, { data: plotCatData }] = await Promise.all([
      sb.from("plot_categories").select("id, name, project_id"),
      sb.from("plots").select("id, plot_category_id"),
    ]);
    const groupsByProject = new Map<string, { id: string; name: string }[]>();
    for (const g of (catData ?? []) as { id: string; name: string; project_id: string }[]) {
      const list = groupsByProject.get(g.project_id) ?? [];
      list.push({ id: g.id, name: g.name });
      groupsByProject.set(g.project_id, list);
    }
    const plotGroup = new Map<string, string | null>();
    for (const r of (plotCatData ?? []) as { id: string; plot_category_id: string | null }[]) {
      plotGroup.set(r.id, r.plot_category_id);
    }

    const projRaw = (projData ?? []) as unknown as {
      id: string;
      name: string;
      city: string;
      advance_percent: number;
      advance_min_amount: number;
      blocking_amount: number;
      blocking_window_hours: number;
      booking_window_days: number;
      plots: {
        id: string;
        plot_no: string;
        sqft: number;
        price_per_sqft: number;
        status: string;
      }[] | null;
    }[];

    const projects: FlowProject[] = projRaw
      .map((p) => ({
        id: p.id,
        name: p.name,
        city: p.city,
        advance_percent: p.advance_percent,
        advance_min_amount: p.advance_min_amount,
        blocking_amount: p.blocking_amount,
        blocking_window_hours: p.blocking_window_hours,
        booking_window_days: p.booking_window_days,
        groups: (groupsByProject.get(p.id) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
        plots: (p.plots ?? [])
          .filter((pl) => pl.status === "available")
          .map((pl) => ({
            id: pl.id,
            plot_no: pl.plot_no,
            sqft: pl.sqft,
            price_per_sqft: pl.price_per_sqft,
            plot_category_id: plotGroup.get(pl.id) ?? null,
          })),
      }))
      .filter((p) => p.plots.length > 0);

    flow = {
      projects,
      customers: (custData ?? []) as FlowData["customers"],
    };
  }

  return (
    <>
      <PageHeader
        title="Bookings & Blocking"
        subtitle="Block or book a plot, and manage every blocking and booking — all in one place."
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
      />
    </>
  );
}
