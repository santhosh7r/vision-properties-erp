import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/roles";
import { supabaseConfigured } from "@/lib/supabase";
import { getDashboard } from "@/lib/queries";
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
  // Admin sees company-wide figures; sales users see only their own.
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
