import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { ownBookedCustomerIds, ownCustomerOrFilter } from "@/lib/customers";
import { type FlowData } from "./BookingsWorkspace";
import { type FlowProject } from "./StartBookingFlow";

// Loads the data the "Block / Book" create flow needs: active projects with
// their AVAILABLE plots (+ categories) and the customers this user may pick.
// Returns null when the user can neither block nor book. Shared by the bookings
// list page and the dedicated Add Blocking & Booking page.
export async function loadBookingFlow(
  sb: SupabaseClient,
  user: SessionUser,
): Promise<FlowData | null> {
  const canBlock = can(user.role, "create_blocking");
  const canBook = can(user.role, "create_booking");
  if (!canBlock && !canBook) return null;
  const isAdmin = user.role === "admin";

  // Non-admins pick from their OWN clients (created by them or booked with their id).
  const custScopeFilter = isAdmin
    ? ""
    : ownCustomerOrFilter(user.id, await ownBookedCustomerIds(sb, user.id));

  const [{ data: projData }, { data: custData }] = await Promise.all([
    sb
      .from("projects")
      .select(
        "id, name, city, district, advance_percent, advance_min_amount, blocking_amount, blocking_window_hours, booking_window_days, plots(id, plot_no, sqft, price_per_sqft, status)",
      )
      .eq("status", "active")
      .order("name"),
    (isAdmin
      ? sb.from("customers").select("id, name, mobile")
      : sb.from("customers").select("id, name, mobile").or(custScopeFilter)
    ).order("name"),
  ]);

  // Plot groups are OPTIONAL (migration 0003): fall back to "no groups" if absent.
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
    district: string;
    advance_percent: number;
    advance_min_amount: number;
    blocking_amount: number;
    blocking_window_hours: number;
    booking_window_days: number;
    plots: { id: string; plot_no: string; sqft: number; price_per_sqft: number; status: string }[] | null;
  }[];

  const projects: FlowProject[] = projRaw
    .map((p) => ({
      id: p.id,
      name: p.name,
      city: p.city,
      district: p.district,
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

  return { projects, customers: (custData ?? []) as FlowData["customers"] };
}
