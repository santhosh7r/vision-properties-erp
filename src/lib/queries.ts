import "server-only";
import { getSupabase } from "./supabase";
import { getDownlineIds } from "./hierarchy";
import { isSalesRole, isNetworkHead, type Role } from "./roles";

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
  plot_sqft: number | null;
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
      .select("created_at, plot_sqft, status, created_by, partner_id")
      .or(orFilter),
    sb.from("plots").select("id", { count: "exact", head: true }).eq("status", "available"),
    sb
      .from("bookings")
      .select("id, status, book_mode, payment_status, total_plot_value, plot_sqft, created_at, customers(name), projects(name), plots(plot_no)")
      .or(orFilter)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const rows = (bookingsRes.data ?? []) as {
    created_at: string;
    plot_sqft: number | null;
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
    const v = Number(b.plot_sqft || 0);
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
    plot_sqft: b.plot_sqft ?? null,
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

// ---------------------------------------------------------------------------
// REPORTS — the five totals on the Senior Director panel (§6). Company-wide for
// admin / finance / legal; confined to the user's own network otherwise.
// ---------------------------------------------------------------------------
export interface ReportsData {
  scope: "company" | "network";
  siteVisits: number;
  bookings: number;
  blockings: number;
  registrations: number;
  cancellations: number;
  partners: number;
  customers: number;
  siteVisitsByStatus: { pending: number; approved: number; declined: number };
}

// Per-salesperson performance row — who sold how much.
export interface LeaderboardRow {
  id: string;
  name: string;
  code: string | null;
  role: Role;
  blockings: number;
  bookings: number;
  deals: number; // active blockings + bookings
  value: number; // active deal value
  registrations: number;
  cancellations: number;
}

// Sales-by-person breakdown. Company-wide for admin/finance/legal; the user's own
// network otherwise. A deal is attributed to the partner stamped on it (the
// salesperson), falling back to whoever created it. Admin/operator rows excluded.
export async function getSalesLeaderboard(userId: string, role: Role): Promise<LeaderboardRow[]> {
  const sb = getSupabase();
  const companyWide = role === "admin" || role === "finance" || role === "legal";
  const ids = companyWide ? null : await getDownlineIds(sb, userId);
  const list = ids ? ids.join(",") : "";

  let bq = sb
    .from("bookings")
    .select("created_by, partner_id, partner_name, partner_code, status, book_mode, total_plot_value");
  if (ids) bq = bq.or(`created_by.in.(${list}),partner_id.in.(${list})`);

  let rq = sb.from("registrations").select("created_by");
  if (ids) rq = rq.in("created_by", ids);

  const [{ data: bookingData }, { data: regData }, { data: userData }] = await Promise.all([
    bq,
    rq,
    sb.from("users").select("id, full_name, role, partner_code"),
  ]);

  const users = new Map(
    ((userData ?? []) as { id: string; full_name: string; role: Role; partner_code: string | null }[]).map((u) => [u.id, u]),
  );
  const agg = new Map<string, LeaderboardRow>();
  const ensure = (id: string): LeaderboardRow => {
    let row = agg.get(id);
    if (!row) {
      const u = users.get(id);
      row = {
        id,
        name: u?.full_name ?? "—",
        code: u?.partner_code ?? null,
        role: (u?.role ?? "business_partner") as Role,
        blockings: 0,
        bookings: 0,
        deals: 0,
        value: 0,
        registrations: 0,
        cancellations: 0,
      };
      agg.set(id, row);
    }
    return row;
  };

  const bookings = (bookingData ?? []) as {
    created_by: string | null;
    partner_id: string | null;
    partner_name: string | null;
    partner_code: string | null;
    status: string;
    book_mode: string;
    total_plot_value: number;
  }[];
  for (const b of bookings) {
    const personId = b.partner_id ?? b.created_by;
    if (!personId) continue;
    const row = ensure(personId);
    if (b.partner_name) row.name = b.partner_name;
    if (b.partner_code) row.code = b.partner_code;
    if (b.status === "cancelled") {
      row.cancellations++;
    } else {
      row.deals++;
      row.value += Number(b.total_plot_value || 0);
      if (b.book_mode === "blocking") row.blockings++;
      else row.bookings++;
    }
  }

  for (const rg of (regData ?? []) as { created_by: string | null }[]) {
    if (!rg.created_by) continue;
    ensure(rg.created_by).registrations++;
  }

  return [...agg.values()]
    .filter((r) => isSalesRole(r.role)) // sales people only — not admin / finance / legal
    .sort((a, b) => b.value - a.value || b.deals - a.deals);
}

export async function getReports(userId: string, role: Role): Promise<ReportsData> {
  const sb = getSupabase();
  const companyWide = role === "admin" || role === "finance" || role === "legal";
  const ids = companyWide ? null : await getDownlineIds(sb, userId);
  const list = ids ? ids.join(",") : "";

  const inCreated = (q: any) => (ids ? q.in("created_by", ids) : q);
  const inRequester = (q: any) => (ids ? q.in("requested_by", ids) : q);
  const inBookingOwner = (q: any) =>
    ids ? q.or(`created_by.in.(${list}),partner_id.in.(${list})`) : q;

  const [
    siteVisits,
    svPending,
    svApproved,
    svDeclined,
    bookings,
    blockings,
    registrations,
    cancellations,
    partnersRaw,
    customers,
  ] = await Promise.all([
    count("service_requests", (q) => inRequester(q.eq("type", "site_visit"))),
    count("service_requests", (q) => inRequester(q.eq("type", "site_visit").eq("status", "pending"))),
    count("service_requests", (q) => inRequester(q.eq("type", "site_visit").eq("status", "approved"))),
    count("service_requests", (q) => inRequester(q.eq("type", "site_visit").eq("status", "declined"))),
    count("bookings", (q) => inBookingOwner(q.eq("book_mode", "booking"))),
    count("bookings", (q) => inBookingOwner(q.eq("book_mode", "blocking"))),
    count("registrations", (q) => inCreated(q)),
    count("bookings", (q) => inBookingOwner(q.eq("status", "cancelled"))),
    count("users", (q) => {
      let qq = q.not("partner_code", "is", null);
      if (ids) qq = qq.in("id", ids);
      return qq;
    }),
    count("customers", (q) => inCreated(q)),
  ]);

  // Exclude the viewer themselves from their own partner count.
  const partners = companyWide ? partnersRaw : Math.max(0, partnersRaw - (isSalesRole(role) ? 1 : 0));

  return {
    scope: companyWide ? "company" : "network",
    siteVisits,
    bookings,
    blockings,
    registrations,
    cancellations,
    partners,
    customers,
    siteVisitsByStatus: { pending: svPending, approved: svApproved, declined: svDeclined },
  };
}

// ---------------------------------------------------------------------------
// SENIOR OVERVIEW — extra dashboard panels for the Senior Director panel:
// Overall + This-Month counters, partner-growth & registration trends, and the
// network's recent activity. Scoped to the user's downline network.
// ---------------------------------------------------------------------------
export interface SeniorOverview {
  overall: { siteVisits: number; registrations: number; cancellations: number; partners: number; customers: number };
  thisMonth: { siteVisits: number; blocking: number; booking: number; registration: number; cancellations: number };
  partnersGrowth: SeriesPoint[];
  registrationSeries: SeriesPoint[];
  recentActivity: ActivityRow[];
}

export async function getSeniorOverview(userId: string, role: Role): Promise<SeniorOverview> {
  const sb = getSupabase();
  const ids = await getDownlineIds(sb, userId);
  const list = ids.join(",");
  // Only the network head (Senior Director) sees the whole TEAM's activity feed.
  // Director and below see just their own actions — a personal feed, not the team's.
  const activityIds = isNetworkHead(role) ? ids : [userId];
  const nowKey = `${new Date().getFullYear()}-${new Date().getMonth()}`;

  const [bookingsRes, regRes, svRes, usersRes, customersCount, activityRes] = await Promise.all([
    sb
      .from("bookings")
      .select("created_at, book_mode, status")
      .or(`created_by.in.(${list}),partner_id.in.(${list})`),
    sb.from("registrations").select("created_at").in("created_by", ids),
    sb.from("service_requests").select("created_at").eq("type", "site_visit").in("requested_by", ids),
    sb.from("users").select("id, created_at, partner_code").in("id", ids),
    sb.from("customers").select("id", { count: "exact", head: true }).in("created_by", ids),
    sb
      .from("audit_log")
      .select("id, actor_name, action, entity, details, created_at")
      .in("actor_id", activityIds)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const bookings = (bookingsRes.data ?? []) as { created_at: string; book_mode: string; status: string }[];
  const regs = (regRes.data ?? []) as { created_at: string }[];
  const svs = (svRes.data ?? []) as { created_at: string }[];
  const users = (usersRes.data ?? []) as { id: string; created_at: string; partner_code: string | null }[];

  const thisMonth = { siteVisits: 0, blocking: 0, booking: 0, registration: 0, cancellations: 0 };
  let cancellationsTotal = 0;
  for (const b of bookings) {
    const thisM = keyOf(b.created_at) === nowKey;
    if (b.status === "cancelled") {
      cancellationsTotal++;
      if (thisM) thisMonth.cancellations++;
      continue;
    }
    if (thisM && b.book_mode === "blocking") thisMonth.blocking++;
    if (thisM && b.book_mode === "booking") thisMonth.booking++;
  }
  for (const s of svs) if (keyOf(s.created_at) === nowKey) thisMonth.siteVisits++;
  for (const r of regs) if (keyOf(r.created_at) === nowKey) thisMonth.registration++;

  // 8-month trend series for partners joined & registrations.
  const partnersGrowth = buildBuckets(8);
  const pgIndex = new Map(partnersGrowth.map((b, i) => [b.key, i]));
  const regSeries = buildBuckets(8);
  const rsIndex = new Map(regSeries.map((b, i) => [b.key, i]));
  let partnersTotal = 0;
  for (const u of users) {
    if (!u.partner_code || u.id === userId) continue;
    partnersTotal++;
    const idx = pgIndex.get(keyOf(u.created_at));
    if (idx !== undefined) {
      partnersGrowth[idx].value += 1;
      partnersGrowth[idx].count += 1;
    }
  }
  for (const r of regs) {
    const idx = rsIndex.get(keyOf(r.created_at));
    if (idx !== undefined) {
      regSeries[idx].value += 1;
      regSeries[idx].count += 1;
    }
  }

  return {
    overall: {
      siteVisits: svs.length,
      registrations: regs.length,
      cancellations: cancellationsTotal,
      partners: partnersTotal,
      customers: customersCount.count ?? 0,
    },
    thisMonth,
    partnersGrowth,
    registrationSeries: regSeries,
    recentActivity: (activityRes.data ?? []) as ActivityRow[],
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
    .select("id, status, book_mode, payment_status, total_plot_value, plot_sqft, created_at, customers(name), projects(name), plots(plot_no)")
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
    plot_sqft: b.plot_sqft ?? null,
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

// ---------------------------------------------------------------------------
// ADMIN INSIGHTS — company-wide business intelligence shown ONLY on the admin
// dashboard (never scoped, never on other panels). Real figures from the DB.
// ---------------------------------------------------------------------------
export interface PerformerRow {
  name: string;
  code: string | null;
  count: number;
  value: number;
}

export interface AdminInsights {
  // Realized vs in-flight money
  registeredValue: number;
  registeredCount: number;
  bookedValue: number;
  collected: number;
  outstanding: number;
  avgDealSize: number;
  collectionRate: number;
  // Risk / money tied up
  refundsPending: number;
  refundsPendingCount: number;
  valueLocked: number; // value of cancelled plots awaiting release
  plotsPendingRelease: number;
  // Health
  totalBookings: number;
  cancelledCount: number;
  cancellationRate: number;
  conversionRate: number;
  newCustomersThisMonth: number;
  requestsPending: number;
  // Breakdowns
  topPerformers: PerformerRow[];
  revenueByType: { type: string; value: number; count: number }[];
}

export async function getAdminInsights(): Promise<AdminInsights> {
  const sb = getSupabase();
  const nowKey = `${new Date().getFullYear()}-${new Date().getMonth()}`;

  const [plotsRes, bookingsRes, projectsRes, customersRes, requestsPending] = await Promise.all([
    sb.from("plots").select("status, sqft, price_per_sqft"),
    sb
      .from("bookings")
      .select("status, book_mode, total_plot_value, advance_paid, partner_name, partner_code, project_id, refund_status, refund_amount"),
    sb.from("projects").select("id, project_type"),
    sb.from("customers").select("created_at"),
    count("service_requests", (q) => q.eq("status", "pending")),
  ]);

  // Plots → realized value (registered/sold) + value locked in cancelled plots.
  const plots = (plotsRes.data ?? []) as { status: string; sqft: number; price_per_sqft: number }[];
  let registeredValue = 0, registeredCount = 0, valueLocked = 0, plotsPendingRelease = 0;
  for (const p of plots) {
    const v = Number(p.sqft || 0) * Number(p.price_per_sqft || 0);
    if (p.status === "registered" || p.status === "sold") {
      registeredValue += v;
      registeredCount++;
    } else if (p.status === "cancelled") {
      valueLocked += v;
      plotsPendingRelease++;
    }
  }

  const bookings = (bookingsRes.data ?? []) as {
    status: string;
    book_mode: string;
    total_plot_value: number;
    advance_paid: number;
    partner_name: string | null;
    partner_code: string | null;
    project_id: string;
    refund_status: string;
    refund_amount: number | null;
  }[];
  const projectType = new Map(
    ((projectsRes.data ?? []) as { id: string; project_type: string }[]).map((p) => [p.id, p.project_type]),
  );

  let bookedValue = 0, collected = 0, activeBookings = 0, confirmed = 0, cancelledCount = 0;
  let refundsPending = 0, refundsPendingCount = 0;
  const perf = new Map<string, PerformerRow>();
  const typeAgg = new Map<string, { value: number; count: number }>();

  for (const b of bookings) {
    if (b.status === "cancelled") {
      cancelledCount++;
      if (b.refund_status === "pending_approval" || b.refund_status === "approved") {
        refundsPending += Number(b.refund_amount || 0);
        refundsPendingCount++;
      }
      continue;
    }
    activeBookings++;
    bookedValue += Number(b.total_plot_value || 0);
    collected += Number(b.advance_paid || 0);
    if (b.status === "confirmed") confirmed++;

    const name = b.partner_name ?? "Direct / Admin";
    const key = b.partner_code ?? name;
    const a = perf.get(key) ?? { name, code: b.partner_code, count: 0, value: 0 };
    a.count++;
    a.value += Number(b.total_plot_value || 0);
    perf.set(key, a);

    const t = projectType.get(b.project_id) ?? "other";
    const ta = typeAgg.get(t) ?? { value: 0, count: 0 };
    ta.value += Number(b.total_plot_value || 0);
    ta.count++;
    typeAgg.set(t, ta);
  }

  const totalBookings = bookings.length;
  const customers = (customersRes.data ?? []) as { created_at: string }[];

  return {
    registeredValue,
    registeredCount,
    bookedValue,
    collected,
    outstanding: Math.max(0, bookedValue - collected),
    avgDealSize: activeBookings > 0 ? Math.round(bookedValue / activeBookings) : 0,
    collectionRate: bookedValue > 0 ? Math.round((collected / bookedValue) * 100) : 0,
    refundsPending,
    refundsPendingCount,
    valueLocked,
    plotsPendingRelease,
    totalBookings,
    cancelledCount,
    cancellationRate: totalBookings > 0 ? Math.round((cancelledCount / totalBookings) * 100) : 0,
    conversionRate: activeBookings > 0 ? Math.round((confirmed / activeBookings) * 100) : 0,
    newCustomersThisMonth: customers.filter((c) => keyOf(c.created_at) === nowKey).length,
    requestsPending,
    topPerformers: [...perf.values()].sort((a, b) => b.value - a.value).slice(0, 5),
    revenueByType: [...typeAgg.entries()]
      .map(([type, a]) => ({ type, value: a.value, count: a.count }))
      .sort((a, b) => b.value - a.value),
  };
}
