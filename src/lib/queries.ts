import "server-only";
import { getSupabase } from "./supabase";
import { getDownlineIds } from "./hierarchy";

async function count(table: string, filter?: (q: any) => any): Promise<number> {
  let q = getSupabase().from(table).select("id", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: c } = await q;
  return c ?? 0;
}

export interface PlotStatusBreakdown {
  available: number;
  blocked: number;
  booked: number;
  registered: number;
  sold: number;
  cancelled: number;
}

export interface SeriesPoint {
  label: string;
  value: number;
  count: number;
}

export interface TopProject {
  name: string;
  bookings: number;
  value: number;
}

export interface RecentBooking {
  id: string;
  status: string;
  book_mode: string;
  payment_status: string;
  total_plot_value: number;
  created_at: string;
  customer: string | null;
  project: string | null;
  plot: string | null;
}

export interface ActivityRow {
  id: string;
  actor_name: string | null;
  action: string;
  entity: string;
  details: string | null;
  created_at: string;
}

export interface DashboardData {
  projects: number;
  plots: number;
  customers: number;
  users: number;
  bookingsTotal: number;
  bookingsPending: number;
  bookingsConfirmed: number;
  breakdown: PlotStatusBreakdown;
  inventoryValue: number;
  bookedValue: number;
  collected: number;
  outstanding: number;
  conversionRate: number;
  // sales tracking
  salesSeries: SeriesPoint[]; // monthly booked value + count
  collectionsSeries: SeriesPoint[]; // monthly collected amount
  salesSparkline: number[];
  collectionsSparkline: number[];
  // month-over-month
  thisMonthValue: number;
  lastMonthValue: number;
  thisMonthCollected: number;
  lastMonthCollected: number;
  topProjects: TopProject[];
  recentBookings: RecentBooking[];
  recentActivity: ActivityRow[];
}

// ---------------------------------------------------------------------------
// SALES dashboard — a salesperson's OWN view. No company-wide figures: just what
// they sold, what their downline network sold, and how many plots are available
// to sell. A record is attributed to the partner stamped on it (the salesperson),
// falling back to whoever created it.
// ---------------------------------------------------------------------------
export interface SalesDashboardData {
  mine: { count: number; value: number };
  network: { count: number; value: number };
  teamSize: number;
  availablePlots: number;
  thisMonthValue: number;
  lastMonthValue: number;
  salesSeries: SeriesPoint[];
  salesSparkline: number[];
  recentBookings: RecentBooking[];
}

export async function getSalesDashboard(userId: string): Promise<SalesDashboardData> {
  const sb = getSupabase();
  const ids = await getDownlineIds(sb, userId); // includes self
  const list = ids.join(",");
  const orFilter = `created_by.in.(${list}),partner_id.in.(${list})`;

  const [bookingsRes, availRes, recentRes] = await Promise.all([
    sb
      .from("bookings")
      .select("created_at, total_plot_value, status, created_by, partner_id")
      .or(orFilter),
    sb.from("plots").select("id", { count: "exact", head: true }).eq("status", "available"),
    sb
      .from("bookings")
      .select("id, status, book_mode, payment_status, total_plot_value, created_at, customers(name), projects(name), plots(plot_no)")
      .or(orFilter)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const rows = (bookingsRes.data ?? []) as {
    created_at: string;
    total_plot_value: number;
    status: string;
    created_by: string | null;
    partner_id: string | null;
  }[];

  const mine = { count: 0, value: 0 };
  const network = { count: 0, value: 0 };
  const salesBuckets = buildBuckets(8);
  const salesIndex = new Map(salesBuckets.map((b, i) => [b.key, i]));
  const nowKey = `${new Date().getFullYear()}-${new Date().getMonth()}`;
  const lastD = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  const lastKey = `${lastD.getFullYear()}-${lastD.getMonth()}`;
  let thisMonthValue = 0;
  let lastMonthValue = 0;

  for (const b of rows) {
    if (b.status === "cancelled") continue;
    const v = Number(b.total_plot_value || 0);
    // Attribute to the salesperson on the record (partner), else the creator.
    const owner = b.partner_id ?? b.created_by;
    if (owner === userId) {
      mine.count++;
      mine.value += v;
      const k = keyOf(b.created_at);
      const idx = salesIndex.get(k);
      if (idx !== undefined) {
        salesBuckets[idx].value += v;
        salesBuckets[idx].count += 1;
      }
      if (k === nowKey) thisMonthValue += v;
      if (k === lastKey) lastMonthValue += v;
    } else {
      network.count++;
      network.value += v;
    }
  }

  const recentBookings: RecentBooking[] = ((recentRes.data ?? []) as any[]).map((b) => ({
    id: b.id,
    status: b.status,
    book_mode: b.book_mode,
    payment_status: b.payment_status,
    total_plot_value: b.total_plot_value,
    created_at: b.created_at,
    customer: b.customers?.name ?? null,
    project: b.projects?.name ?? null,
    plot: b.plots ? b.plots.plot_no : null,
  }));

  return {
    mine,
    network,
    teamSize: ids.length - 1, // exclude self
    availablePlots: availRes.count ?? 0,
    thisMonthValue,
    lastMonthValue,
    salesSeries: salesBuckets,
    salesSparkline: salesBuckets.map((b) => b.value),
    recentBookings,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildBuckets(n: number) {
  const now = new Date();
  const buckets: { key: string; label: string; value: number; count: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()], value: 0, count: 0 });
  }
  return buckets;
}
function keyOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

// `scopeUserId` confines every figure to a single salesperson's own data
// (their bookings, their customers, their available inventory). Admin calls
// this with no argument to see the whole company.
export async function getDashboard(scopeUserId?: string): Promise<DashboardData> {
  const sb = getSupabase();
  const scoped = Boolean(scopeUserId);

  let plotsQ = sb.from("plots").select("status, sqft, price_per_sqft");
  if (scoped) plotsQ = plotsQ.eq("status", "available");

  let bookingsQ = sb.from("bookings").select("created_at, total_plot_value, advance_paid, status, project_id");
  if (scoped) bookingsQ = bookingsQ.eq("created_by", scopeUserId!);

  let recentQ = sb
    .from("bookings")
    .select("id, status, book_mode, payment_status, total_plot_value, created_at, customers(name), projects(name), plots(plot_no)")
    .order("created_at", { ascending: false })
    .limit(6);
  if (scoped) recentQ = recentQ.eq("created_by", scopeUserId!);

  let activityQ = sb
    .from("audit_log")
    .select("id, actor_name, action, entity, details, created_at")
    .order("created_at", { ascending: false })
    .limit(8);
  if (scoped) activityQ = activityQ.eq("actor_id", scopeUserId!);

  const [
    projects,
    customers,
    users,
    plotsRes,
    bookingsRes,
    paymentsRes,
    recentRes,
    activityRes,
    projectNamesRes,
  ] = await Promise.all([
    count("projects"),
    count("customers", scoped ? (q) => q.eq("created_by", scopeUserId!) : undefined),
    count("users"),
    plotsQ,
    bookingsQ,
    sb.from("payments").select("paid_at, amount, status, bookings(created_by)"),
    recentQ,
    activityQ,
    sb.from("projects").select("id, name"),
  ]);

  // Inventory breakdown + value
  const plotRows = (plotsRes.data ?? []) as { status: keyof PlotStatusBreakdown; sqft: number; price_per_sqft: number }[];
  const breakdown: PlotStatusBreakdown = { available: 0, blocked: 0, booked: 0, registered: 0, sold: 0, cancelled: 0 };
  let inventoryValue = 0;
  for (const p of plotRows) {
    if (p.status in breakdown) breakdown[p.status]++;
    inventoryValue += Number(p.sqft || 0) * Number(p.price_per_sqft || 0);
  }

  // Bookings: value, collections, series, deltas, top projects, conversion
  const bookings = (bookingsRes.data ?? []) as { created_at: string; total_plot_value: number; advance_paid: number; status: string; project_id: string }[];
  const projectNames = new Map(((projectNamesRes.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));

  const salesBuckets = buildBuckets(8);
  const salesIndex = new Map(salesBuckets.map((b, i) => [b.key, i]));
  const projAgg = new Map<string, { bookings: number; value: number }>();

  let bookedValue = 0;
  let collected = 0;
  let confirmed = 0;
  const nowKey = `${new Date().getFullYear()}-${new Date().getMonth()}`;
  const lastD = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  const lastKey = `${lastD.getFullYear()}-${lastD.getMonth()}`;
  let thisMonthValue = 0, lastMonthValue = 0;

  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    bookedValue += Number(b.total_plot_value || 0);
    collected += Number(b.advance_paid || 0);
    if (b.status === "confirmed") confirmed++;

    const k = keyOf(b.created_at);
    const idx = salesIndex.get(k);
    if (idx !== undefined) {
      salesBuckets[idx].value += Number(b.total_plot_value || 0);
      salesBuckets[idx].count += 1;
    }
    if (k === nowKey) thisMonthValue += Number(b.total_plot_value || 0);
    if (k === lastKey) lastMonthValue += Number(b.total_plot_value || 0);

    const agg = projAgg.get(b.project_id) ?? { bookings: 0, value: 0 };
    agg.bookings += 1;
    agg.value += Number(b.total_plot_value || 0);
    projAgg.set(b.project_id, agg);
  }

  const activeBookings = bookings.filter((b) => b.status !== "cancelled").length;
  const conversionRate = activeBookings > 0 ? Math.round((confirmed / activeBookings) * 100) : 0;

  // Collections series from payments (scoped to the user's own bookings).
  const payments = ((paymentsRes.data ?? []) as unknown as {
    paid_at: string;
    amount: number;
    status: string;
    bookings: { created_by: string | null } | null;
  }[]).filter((p) => !scoped || p.bookings?.created_by === scopeUserId);
  const collBuckets = buildBuckets(8);
  const collIndex = new Map(collBuckets.map((b, i) => [b.key, i]));
  let thisMonthCollected = 0, lastMonthCollected = 0;
  for (const p of payments) {
    if (p.status !== "completed") continue;
    const k = keyOf(p.paid_at);
    const idx = collIndex.get(k);
    if (idx !== undefined) {
      collBuckets[idx].value += Number(p.amount || 0);
      collBuckets[idx].count += 1;
    }
    if (k === nowKey) thisMonthCollected += Number(p.amount || 0);
    if (k === lastKey) lastMonthCollected += Number(p.amount || 0);
  }

  const topProjects: TopProject[] = [...projAgg.entries()]
    .map(([id, a]) => ({ name: projectNames.get(id) ?? "—", bookings: a.bookings, value: a.value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const recentBookings: RecentBooking[] = ((recentRes.data ?? []) as any[]).map((b) => ({
    id: b.id,
    status: b.status,
    book_mode: b.book_mode,
    payment_status: b.payment_status,
    total_plot_value: b.total_plot_value,
    created_at: b.created_at,
    customer: b.customers?.name ?? null,
    project: b.projects?.name ?? null,
    plot: b.plots ? b.plots.plot_no : null,
  }));

  return {
    projects,
    plots: plotRows.length,
    customers,
    users,
    bookingsTotal: bookings.length,
    bookingsPending: bookings.filter((b) => b.status === "pending").length,
    bookingsConfirmed: confirmed,
    breakdown,
    inventoryValue,
    bookedValue,
    collected,
    outstanding: Math.max(0, bookedValue - collected),
    conversionRate,
    salesSeries: salesBuckets,
    collectionsSeries: collBuckets,
    salesSparkline: salesBuckets.map((b) => b.value),
    collectionsSparkline: collBuckets.map((b) => b.value),
    thisMonthValue,
    lastMonthValue,
    thisMonthCollected,
    lastMonthCollected,
    topProjects,
    recentBookings,
    recentActivity: (activityRes.data ?? []) as ActivityRow[],
  };
}
