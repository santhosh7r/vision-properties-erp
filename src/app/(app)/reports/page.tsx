import { requireCapability } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import { supabaseConfigured } from "@/lib/supabase";
import { getReports } from "@/lib/queries";
import { PageHeader, EmptyState } from "@/components/ui";
import { KpiCard, Panel, StackedBar } from "@/components/dashboard";
import { Clock, FileText, Scroll, Grid, UserCircle, Building } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await requireCapability("view_reports");

  if (!supabaseConfigured()) {
    return (
      <>
        <PageHeader title="Reports" subtitle={ROLE_LABELS[user.role]} />
        <EmptyState message="Connect your database to see reports." />
      </>
    );
  }

  const r = await getReports(user.id, user.role);
  const scopeLabel =
    r.scope === "company" ? "Company-wide totals." : "Totals across your network.";

  return (
    <>
      <PageHeader title="Reports" subtitle={scopeLabel} />

      {/* The five headline totals from the panel spec */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Total Site Visits" value={String(r.siteVisits)}
          sub={`${r.siteVisitsByStatus.approved} approved · ${r.siteVisitsByStatus.pending} pending`}
          icon={<Clock size={20} />} accent="#428fdf" href="/requests"
        />
        <KpiCard
          label="Total Bookings" value={String(r.bookings)}
          sub={`${r.blockings} blockings`}
          icon={<FileText size={20} />} accent="#e4433a" href="/bookings"
        />
        <KpiCard
          label="Total Registrations" value={String(r.registrations)}
          sub="Plots registered" icon={<Scroll size={20} />} accent="#8b5cf6"
        />
        <KpiCard
          label="Total Cancellations" value={String(r.cancellations)}
          sub="Cancelled bookings" icon={<Grid size={20} />} accent="#f59e0b"
        />
        <KpiCard
          label="Total Partners" value={String(r.partners)}
          sub={r.scope === "company" ? "Across the company" : "In your network"}
          icon={<UserCircle size={20} />} accent="#10b981" href="/business-operators"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Site Visit Requests" accent="#428fdf">
          <StackedBar
            segments={[
              { label: "approved", value: r.siteVisitsByStatus.approved, color: "#10b981" },
              { label: "pending", value: r.siteVisitsByStatus.pending, color: "#f59e0b" },
              { label: "declined", value: r.siteVisitsByStatus.declined, color: "#e4433a" },
            ]}
          />
        </Panel>

        <Panel title="Sales Funnel" accent="#e4433a">
          <StackedBar
            segments={[
              { label: "blockings", value: r.blockings, color: "#f59e0b" },
              { label: "bookings", value: r.bookings, color: "#428fdf" },
              { label: "registrations", value: r.registrations, color: "#8b5cf6" },
              { label: "cancellations", value: r.cancellations, color: "#e4433a" },
            ]}
          />
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel title="Customers" accent="#428fdf">
          <div className="flex items-center gap-3">
            <Building size={20} />
            <span className="text-2xl font-semibold">{r.customers}</span>
          </div>
        </Panel>
      </div>
    </>
  );
}
