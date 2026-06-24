import Link from "next/link";
import { requireUser } from "@/lib/auth";
import type { SessionUser } from "@/lib/session";
import { can, isSalesRole, ROLE_LABELS } from "@/lib/roles";
import { supabaseConfigured } from "@/lib/supabase";
import { getDashboard, getSalesDashboard, getSeniorOverview } from "@/lib/queries";
import { sweepExpiredBookings } from "@/lib/lifecycle";
import { inr, inrCompact, timeAgo } from "@/lib/format";
import { EmptyState, BookingStatusBadge, PaymentBadge, Badge } from "@/components/ui";
import { KpiCard, Panel, Donut, Funnel, STATUS_COLOR } from "@/components/dashboard";
import { AreaChart, BarChart } from "@/components/charts";
import {
  Rupee,
  Trending,
  CreditCard,
  Check,
  FileText,
  Building,
  Grid,
  Scroll,
  UserCircle,
  Plus,
  ArrowRight,
  Clock,
} from "@/components/icons";

export const dynamic = "force-dynamic";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
function pctChange(cur: number, prev: number): number {
  if (prev > 0) return Math.round(((cur - prev) / prev) * 100);
  return cur > 0 ? 100 : 0;
}

const ENTITY_ICON: Record<string, React.ReactNode> = {
  project: <Building size={13} />,
  plot: <Grid size={13} />,
  booking: <FileText size={13} />,
  payment: <CreditCard size={13} />,
  registration: <Scroll size={13} />,
  customer: <UserCircle size={13} />,
  user: <UserCircle size={13} />,
};

export default async function DashboardPage() {
  const user = await requireUser();

  if (!supabaseConfigured()) {
    return (
      <>
        <h1 className="text-[22px] font-semibold tracking-tight">Welcome, {user.full_name}</h1>
        <p className="mb-6 mt-1.5 text-sm text-[var(--muted)]">{ROLE_LABELS[user.role]}</p>
        <EmptyState message="Connect your database to see live data." />
      </>
    );
  }

  await sweepExpiredBookings();

  // Sales roles get a focused, personal view — their own sales, their network's
  // sales and available inventory. No company-wide financials.
  if (isSalesRole(user.role)) {
    return <SalesDashboard user={user} />;
  }

  // Admin (and Finance/Legal) see company-wide figures.
  const d = await getDashboard(user.role === "admin" ? undefined : user.id);

  const sold = d.breakdown.booked + d.breakdown.registered + d.breakdown.sold;
  const sellThrough = d.plots > 0 ? Math.round((sold / d.plots) * 100) : 0;
  const salesDelta = pctChange(d.thisMonthValue, d.lastMonthValue);
  const collDelta = pctChange(d.thisMonthCollected, d.lastMonthCollected);

  const breakdownSegments = [
    { label: "available", value: d.breakdown.available, color: STATUS_COLOR.available },
    { label: "blocked", value: d.breakdown.blocked, color: STATUS_COLOR.blocked },
    { label: "booked", value: d.breakdown.booked, color: STATUS_COLOR.booked },
    { label: "registered", value: d.breakdown.registered + d.breakdown.sold, color: STATUS_COLOR.registered },
    { label: "cancelled", value: d.breakdown.cancelled, color: STATUS_COLOR.cancelled },
  ];

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const topMax = Math.max(...d.topProjects.map((p) => p.value), 1);

  return (
    <>
      {/* Header */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--muted)]">{today}</p>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight">
            {greeting()}, {user.full_name.split(" ")[0]}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {can(user.role, "manage_customers") && (
            <Link href="/customers/new" className="btn-ghost"><Plus size={16} /> Customer</Link>
          )}
          {can(user.role, "manage_projects") && (
            <Link href="/projects/new" className="btn-primary"><Plus size={16} /> New Project</Link>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Inventory Value" value={inrCompact(d.inventoryValue)} highlight
          sub={`${d.plots} plots · ${d.projects} projects`}
          icon={<Rupee size={20} />} accent="#428fdf" href="/plots"
        />
        <KpiCard
          label="Sales This Month" value={inrCompact(d.thisMonthValue)} delta={salesDelta}
          spark={d.salesSparkline} sub="Booked value vs last month"
          icon={<Trending size={20} />} accent="#e4433a" href="/bookings"
        />
        <KpiCard
          label="Collections" value={inrCompact(d.thisMonthCollected)} delta={collDelta}
          spark={d.collectionsSparkline} sub={`Outstanding ${inrCompact(d.outstanding)}`}
          icon={<CreditCard size={20} />} accent="#428fdf"
          href={can(user.role, "view_finance") ? "/payments" : undefined}
        />
        <KpiCard
          label="Conversion" value={`${d.conversionRate}%`}
          sub={`${d.bookingsConfirmed} confirmed · sell-through ${sellThrough}%`}
          icon={<Check size={20} />} accent="#e4433a" href="/bookings"
        />
      </div>

      {/* Sales performance + inventory donut */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel
          title="Sales Performance"
          accent="#e4433a"
          className="lg:col-span-2"
          action={<span className="text-xs text-[var(--muted)]">Booked value · last 8 months</span>}
        >
          <div className="mb-5 flex flex-wrap gap-8">
            <Metric label="This Month" value={inrCompact(d.thisMonthValue)} />
            <Metric label="Last Month" value={inrCompact(d.lastMonthValue)} />
            <Metric label="Total Booked" value={inrCompact(d.bookedValue)} />
            <Metric label="Active Bookings" value={d.bookingsPending + d.bookingsConfirmed} />
          </div>
          <AreaChart
            data={d.salesSeries.map((s) => ({ label: s.label, value: s.value }))}
            color="#e4433a"
            valueFormat={inrCompact}
          />
        </Panel>

        <Panel title="Inventory by Status" accent="#428fdf">
          {d.plots === 0 ? (
            <div className="flex h-44 items-center justify-center text-sm text-[var(--muted)]">No plots yet</div>
          ) : (
            <Donut segments={breakdownSegments} total={d.plots} centerValue={d.plots} centerLabel="plots" />
          )}
        </Panel>
      </div>

      {/* Collections trend + pipeline */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Collections Trend" accent="#428fdf" action={<span className="text-xs text-[var(--muted)]">Received · last 8 months</span>}>
          <BarChart
            data={d.collectionsSeries.map((s) => ({ label: s.label, value: s.value }))}
            color="#428fdf"
            valueFormat={inrCompact}
          />
        </Panel>
        <Panel title="Sales Pipeline" accent="#e4433a">
          <Funnel
            steps={[
              { label: "Available", value: d.breakdown.available, color: STATUS_COLOR.available },
              { label: "Blocked", value: d.breakdown.blocked, color: STATUS_COLOR.blocked },
              { label: "Booked", value: d.breakdown.booked, color: STATUS_COLOR.booked },
              { label: "Registered", value: d.breakdown.registered + d.breakdown.sold, color: STATUS_COLOR.registered },
            ]}
          />
        </Panel>
      </div>

      {/* Top projects + activity */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="Top Projects"
          accent="#428fdf"
          action={<Link href="/projects" className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline">All <ArrowRight size={13} /></Link>}
        >
          {d.topProjects.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-[var(--muted)]">No bookings yet</div>
          ) : (
            <div className="space-y-4">
              {d.topProjects.map((p) => (
                <div key={p.name}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium">{p.name}</span>
                    <span className="tabular-nums text-[var(--muted)]">{inrCompact(p.value)} · {p.bookings}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-3)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(p.value / topMax) * 100}%`, background: STATUS_COLOR.booked }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Recent Activity" accent="#e4433a">
          {d.recentActivity.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-[var(--muted)]">No activity yet</div>
          ) : (
            <ul className="space-y-3.5">
              {d.recentActivity.map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--surface-3)", color: "var(--muted)" }}>
                    {ENTITY_ICON[a.entity] ?? <FileText size={13} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">
                      <span className="font-medium">{a.actor_name ?? "System"}</span>{" "}
                      <span className="text-[var(--muted)]">{a.action.replace(/_/g, " ")} {a.entity}</span>
                      {a.details && <span className="text-[var(--text-2)]"> · {a.details}</span>}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-[var(--muted)]">{timeAgo(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Recent bookings */}
      <div className="card mt-4" style={{ padding: 0 }}>
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="flex items-center gap-2.5 text-sm font-semibold">
            <span className="h-4 w-1 shrink-0 rounded-full" style={{ background: "#428fdf" }} />
            Recent Bookings
          </h2>
          <Link href="/bookings" className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline">View all <ArrowRight size={13} /></Link>
        </div>
        <div style={{ borderTop: "1px solid var(--border)" }} />
        {d.recentBookings.length === 0 ? (
          <div className="px-5 py-8"><EmptyState message="No bookings yet." hint="Block or book a plot to see it here." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Project</th>
                  <th className="th">Plot</th>
                  <th className="th">Customer</th>
                  <th className="th">Value</th>
                  <th className="th">Mode</th>
                  <th className="th">Status</th>
                  <th className="th">Payment</th>
                  <th className="th">When</th>
                </tr>
              </thead>
              <tbody>
                {d.recentBookings.map((b) => (
                  <tr key={b.id}>
                    <td className="td"><Link href={`/bookings/${b.id}`} className="font-medium hover:text-[var(--accent)]">{b.project ?? "—"}</Link></td>
                    <td className="td">{b.plot ?? "—"}</td>
                    <td className="td">{b.customer ?? "—"}</td>
                    <td className="td tabular-nums">{inr(b.total_plot_value)}</td>
                    <td className="td"><Badge tone={b.book_mode === "blocking" ? "amber" : "blue"}>{b.book_mode}</Badge></td>
                    <td className="td"><BookingStatusBadge status={b.status} /></td>
                    <td className="td"><PaymentBadge status={b.payment_status} /></td>
                    <td className="td whitespace-nowrap text-[var(--muted)]">{timeAgo(b.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sales dashboard — a salesperson's OWN view. Deliberately omits all
// company-wide figures (inventory value, company collections, pipeline). Shows
// only: what they sold, what their network sold, and available inventory.
// ---------------------------------------------------------------------------
async function SalesDashboard({ user }: { user: SessionUser }) {
  const [sd, ov] = await Promise.all([
    getSalesDashboard(user.id),
    getSeniorOverview(user.id),
  ]);
  const salesDelta = pctChange(sd.thisMonthValue, sd.lastMonthValue);
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <>
      {/* Header */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--muted)]">{today}</p>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight">
            {greeting()}, {user.full_name.split(" ")[0]}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {can(user.role, "manage_customers") && (
            <Link href="/customers/new" className="btn-ghost"><Plus size={16} /> Customer</Link>
          )}
          <Link href="/bookings" className="btn-primary"><Plus size={16} /> Block Plot</Link>
        </div>
      </div>

      {/* KPI row — personal + network only */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="My Sales" value={inrCompact(sd.mine.value)} delta={salesDelta}
          spark={sd.salesSparkline} sub={`${sd.mine.count} blocking / booking`}
          icon={<Trending size={20} />} accent="#e4433a" href="/bookings" highlight
        />
        <KpiCard
          label="My Network Sales" value={inrCompact(sd.network.value)}
          sub={`${sd.network.count} deals · ${sd.teamSize} member${sd.teamSize === 1 ? "" : "s"}`}
          icon={<UserCircle size={20} />} accent="#428fdf" href="/business-operators"
        />
        <KpiCard
          label="Available Plots" value={String(sd.availablePlots)}
          sub="Ready to block / book"
          icon={<Grid size={20} />} accent="#428fdf" href="/plots"
        />
        <KpiCard
          label="My Team" value={String(sd.teamSize)}
          sub="People in your network"
          icon={<Building size={20} />} accent="#e4433a" href="/business-operators"
        />
      </div>

      {/* My sales performance */}
      <div className="mt-4">
        <Panel
          title="My Sales Performance" accent="#e4433a"
          action={<span className="text-xs text-[var(--muted)]">Booked value · last 8 months</span>}
        >
          <div className="mb-5 flex flex-wrap gap-8">
            <Metric label="This Month" value={inrCompact(sd.thisMonthValue)} />
            <Metric label="Last Month" value={inrCompact(sd.lastMonthValue)} />
            <Metric label="My Total" value={inrCompact(sd.mine.value)} />
            <Metric label="Network Total" value={inrCompact(sd.network.value)} />
          </div>
          <AreaChart
            data={sd.salesSeries.map((s) => ({ label: s.label, value: s.value }))}
            color="#e4433a"
            valueFormat={inrCompact}
          />
        </Panel>
      </div>

      {/* This Month — activity counters */}
      <div className="mt-4">
        <Panel title="This Month" accent="#428fdf">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
            <Metric label="Site Visits" value={ov.thisMonth.siteVisits} />
            <Metric label="Blocking" value={ov.thisMonth.blocking} />
            <Metric label="Booking" value={ov.thisMonth.booking} />
            <Metric label="Registration" value={ov.thisMonth.registration} />
            <Metric label="Cancellations" value={ov.thisMonth.cancellations} />
          </div>
        </Panel>
      </div>

      {/* Overall — lifetime network counters */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Site Visits" value={String(ov.overall.siteVisits)} sub="All time" icon={<Clock size={20} />} accent="#428fdf" href="/requests" />
        <KpiCard label="Registrations" value={String(ov.overall.registrations)} sub="Plots registered" icon={<Scroll size={20} />} accent="#8b5cf6" />
        <KpiCard label="Cancellations" value={String(ov.overall.cancellations)} sub="Cancelled bookings" icon={<FileText size={20} />} accent="#e4433a" />
        <KpiCard label="Partners" value={String(ov.overall.partners)} sub="In your network" icon={<UserCircle size={20} />} accent="#10b981" href="/business-operators" />
        <KpiCard label="Customers" value={String(ov.overall.customers)} sub="Onboarded" icon={<Building size={20} />} accent="#428fdf" href="/customers" />
      </div>

      {/* Performance charts */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Partner Growth Performance" accent="#10b981" action={<span className="text-xs text-[var(--muted)]">New partners · last 8 months</span>}>
          <BarChart
            data={ov.partnersGrowth.map((s) => ({ label: s.label, value: s.value }))}
            color="#10b981"
            valueFormat={(v) => String(Math.round(v))}
          />
        </Panel>
        <Panel title="Registration Performance" accent="#8b5cf6" action={<span className="text-xs text-[var(--muted)]">Registrations · last 8 months</span>}>
          <AreaChart
            data={ov.registrationSeries.map((s) => ({ label: s.label, value: s.value }))}
            color="#8b5cf6"
            valueFormat={(v) => String(Math.round(v))}
          />
        </Panel>
      </div>

      {/* Updates — what's flowing through the network */}
      <div className="mt-4">
        <Panel title="Updates" accent="#e4433a" action={<span className="text-xs text-[var(--muted)]">Bookings · registrations · partners · availability</span>}>
          {ov.recentActivity.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-[var(--muted)]">No recent updates</div>
          ) : (
            <ul className="space-y-3.5">
              {ov.recentActivity.map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--surface-3)", color: "var(--muted)" }}>
                    {ENTITY_ICON[a.entity] ?? <FileText size={13} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">
                      <span className="font-medium">{a.actor_name ?? "System"}</span>{" "}
                      <span className="text-[var(--muted)]">{a.action.replace(/_/g, " ")} {a.entity}</span>
                      {a.details && <span className="text-[var(--text-2)]"> · {a.details}</span>}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-[var(--muted)]">{timeAgo(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Recent bookings (their own + network) */}
      <div className="card mt-4" style={{ padding: 0 }}>
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="flex items-center gap-2.5 text-sm font-semibold">
            <span className="h-4 w-1 shrink-0 rounded-full" style={{ background: "#428fdf" }} />
            Recent Bookings & Blockings
          </h2>
          <Link href="/bookings" className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline">View all <ArrowRight size={13} /></Link>
        </div>
        <div style={{ borderTop: "1px solid var(--border)" }} />
        {sd.recentBookings.length === 0 ? (
          <div className="px-5 py-8"><EmptyState message="No bookings yet." hint="Block a plot to see it here." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Project</th>
                  <th className="th">Plot</th>
                  <th className="th">Customer</th>
                  <th className="th">Value</th>
                  <th className="th">Mode</th>
                  <th className="th">Status</th>
                  <th className="th">Payment</th>
                  <th className="th">When</th>
                </tr>
              </thead>
              <tbody>
                {sd.recentBookings.map((b) => (
                  <tr key={b.id}>
                    <td className="td"><Link href={`/bookings/${b.id}`} className="font-medium hover:text-[var(--accent)]">{b.project ?? "—"}</Link></td>
                    <td className="td">{b.plot ?? "—"}</td>
                    <td className="td">{b.customer ?? "—"}</td>
                    <td className="td tabular-nums">{inr(b.total_plot_value)}</td>
                    <td className="td"><Badge tone={b.book_mode === "blocking" ? "amber" : "blue"}>{b.book_mode}</Badge></td>
                    <td className="td"><BookingStatusBadge status={b.status} /></td>
                    <td className="td"><PaymentBadge status={b.payment_status} /></td>
                    <td className="td whitespace-nowrap text-[var(--muted)]">{timeAgo(b.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
