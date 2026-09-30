import { requirePage } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase";
import { PageHeader, EmptyState } from "@/components/ui";
import { Panel } from "@/components/dashboard";
import { DEPARTMENTS, type ReportDef } from "@/lib/reports/catalog";
import { getReportAccess } from "@/lib/reports/context";
import { runReport, type ReportResult } from "@/lib/reports/data";
import { currentMonthKey, parseMonth } from "@/lib/reports/period";
import MonthPicker from "./MonthPicker";

export const dynamic = "force-dynamic";

const DEPT_ACCENT: Record<string, string> = {
  pre_sales: "#428fdf",
  post_sales: "#8b5cf6",
  finance: "#10b981",
  legal: "#f59e0b",
};

// Monthly Reports — pick a month, download a department's reports (or one
// report) as Excel. Each card's record count comes from the SAME fetch that
// builds the file, so what the page says is what the download contains.
export default async function MonthlyReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { user } = await requirePage("monthly_reports");

  if (!supabaseConfigured()) {
    return (
      <>
        <PageHeader title="Monthly Reports" />
        <EmptyState message="Connect your database to export reports." />
      </>
    );
  }

  const access = await getReportAccess(user);
  if (access.reports.length === 0) {
    return (
      <>
        <PageHeader title="Monthly Reports" />
        <EmptyState
          message="No reports are available for your role."
          hint="Monthly exports are for Admin, the General Manager, Finance, Legal and the Pre-/Post-Sales desks."
        />
      </>
    );
  }

  const max = currentMonthKey();
  const asked = (await searchParams).month;
  const period = parseMonth(asked) ?? parseMonth(max)!;
  const invalidMonth = !!asked && asked !== period.key;

  const ctx = access.context(period);
  const settled = await Promise.allSettled(access.reports.map((r) => runReport(r.key, ctx)));
  const resultByKey = new Map<string, ReportResult | null>(
    access.reports.map((r, i) => [r.key, settled[i].status === "fulfilled" ? settled[i].value : null]),
  );
  const total = [...resultByKey.values()].reduce((s, r) => s + (r?.rows.length ?? 0), 0);

  const href = (sel: string) => `/monthly-reports/export?month=${period.key}&sel=${encodeURIComponent(sel)}`;
  const sections = DEPARTMENTS.map((d) => ({ ...d, reports: access.reports.filter((r) => r.department === d.key) })).filter(
    (d) => d.reports.length > 0,
  );

  return (
    <>
      <PageHeader
        title="Monthly Reports"
        subtitle={`${period.label} · ${access.scopeLabel} · Excel downloads, dates in IST.`}
        action={
          <>
            <MonthPicker value={period.key} max={max} />
            {access.reports.length > 1 && (
              <a href={href("all")} className="btn-primary whitespace-nowrap">
                ↓ Download all ({total})
              </a>
            )}
          </>
        }
      />

      {invalidMonth && (
        <p className="mb-4 text-sm text-[var(--muted)]">
          That month isn&apos;t available — showing {period.label} instead. Reports can be pulled for this month or any earlier one.
        </p>
      )}
      {access.scope && !access.scope.district && (
        <p className="mb-4 text-sm" style={{ color: "#e4433a" }}>
          Your account has no branch set, so every report is empty. Ask an Admin to set your branch.
        </p>
      )}

      <div className="space-y-4">
        {sections.map((d) => (
          <Panel
            key={d.key}
            title={d.label}
            accent={DEPT_ACCENT[d.key]}
            action={
              d.reports.length > 1 ? (
                <a href={href(`dept:${d.key}`)} className="btn-ghost whitespace-nowrap" style={{ padding: "5px 12px", fontSize: 12 }}>
                  ↓ Download {d.label}
                </a>
              ) : undefined
            }
          >
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {d.reports.map((r) => (
                <ReportLine key={r.key} def={r} result={resultByKey.get(r.key) ?? null} href={href(r.key)} />
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}

function ReportLine({ def, result, href }: { def: ReportDef; result: ReportResult | null; href: string }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between" style={{ borderColor: "var(--border)" }}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-medium text-[var(--text)]">{def.title}</span>
          {result ? (
            <span className="text-xs tabular-nums text-[var(--muted)]">
              {result.rows.length} {result.rows.length === 1 ? "record" : "records"}
            </span>
          ) : (
            <span className="text-xs" style={{ color: "#e4433a" }}>Couldn&apos;t load — refresh to try again</span>
          )}
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">{def.description}</p>
        {result && result.rows.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-[var(--text)]">
            {result.highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-[var(--muted)]">Counted by: {def.countedBy}</p>
      </div>
      {result ? (
        <a href={href} className="btn-ghost shrink-0 whitespace-nowrap" style={{ padding: "6px 14px", fontSize: 13 }}>
          ↓ Excel
        </a>
      ) : (
        <span className="btn-ghost shrink-0 whitespace-nowrap opacity-50" style={{ padding: "6px 14px", fontSize: 13 }} aria-disabled>
          ↓ Excel
        </span>
      )}
    </div>
  );
}
