import Link from "next/link";
import { requireDevUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { PageHeader, EmptyState, Badge } from "@/components/ui";
import {
  ERROR_KINDS,
  ERROR_SOURCES,
  ERROR_STATUSES,
  KIND_LABEL,
  SEVERITIES,
  SEVERITY_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  type ErrorLogRow,
  type ErrorStatus,
  type Severity,
} from "@/lib/errors/types";
import { bulkUpdateStatus, purgeOldErrors } from "./actions";

// ---------------------------------------------------------------------------
// DEVELOPER ERROR LOGS — the one place in the application where raw technical
// detail is shown, and it is shown in full: message, stack, SQLSTATE, hint,
// context, request id, device.
//
// Access is the hidden dev/support account only (requireDevUser). Not Admin, not
// General Manager — full business authority is not the same thing as being the
// person who reads stack traces, and a stack trace is a map of the system's
// internals. The route is deliberately absent from lib/pages.ts too, so it
// cannot be granted to a role from Administration › Page Config by mistake.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

const SORTS = {
  last_seen: { column: "last_seen_at", label: "Last seen" },
  first_seen: { column: "first_seen_at", label: "First seen" },
  count: { column: "occurrence_count", label: "Occurrences" },
  severity: { column: "severity", label: "Severity" },
} as const;
type SortKey = keyof typeof SORTS;

const SEVERITY_TONE: Record<Severity, "red" | "amber" | "blue" | "gray"> = {
  critical: "red",
  error: "red",
  warning: "amber",
  info: "blue",
};

const STATUS_TONE: Record<ErrorStatus, "red" | "amber" | "blue" | "green" | "gray"> = {
  new: "red",
  investigating: "amber",
  in_progress: "blue",
  resolved: "green",
  ignored: "gray",
};

export default async function ErrorLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireDevUser();
  const sb = getSupabase();
  const sp = await searchParams;

  const q = (sp.q ?? "").trim();
  const severity = pick(sp.severity, SEVERITIES as readonly string[]);
  const status = pick(sp.status, ERROR_STATUSES as readonly string[]);
  const source = pick(sp.source, ERROR_SOURCES as readonly string[]);
  const kind = pick(sp.kind, ERROR_KINDS as readonly string[]);
  const moduleName = (sp.module ?? "").trim();
  const environment = (sp.env ?? "").trim();
  const sort = (sp.sort && sp.sort in SORTS ? sp.sort : "last_seen") as SortKey;
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(sp.page) || 1);
  const from = (page - 1) * PAGE_SIZE;

  // `open` is the default view: everything a human has not closed. Without it
  // the page opens on a wall of resolved history and the new failure is lost.
  const view = sp.view === "all" ? "all" : sp.view === "closed" ? "closed" : "open";

  let query = sb
    .from("error_logs")
    .select("*", { count: "exact" })
    .order(SORTS[sort].column, { ascending: dir === "asc" })
    .order("last_seen_at", { ascending: false });

  if (view === "open") query = query.not("status", "in", "(resolved,ignored)");
  if (view === "closed") query = query.in("status", ["resolved", "ignored"]);
  if (severity) query = query.eq("severity", severity);
  if (status) query = query.eq("status", status);
  if (source) query = query.eq("source", source);
  if (kind) query = query.eq("kind", kind);
  if (moduleName) query = query.eq("module", moduleName);
  if (environment) query = query.eq("environment", environment);
  if (q) {
    const like = `%${q}%`;
    // short_id and last_event_id are in here on purpose: a support call quotes a
    // reference code, and that code has to find the row in one search.
    query = query.or(
      [
        `short_id.ilike.${like}`,
        `last_event_id.ilike.${like}`,
        `message.ilike.${like}`,
        `name.ilike.${like}`,
        `code.ilike.${like}`,
        `route.ilike.${like}`,
        `module.ilike.${like}`,
        `user_email.ilike.${like}`,
        `request_id.ilike.${like}`,
        `fingerprint.ilike.${like}`,
      ].join(","),
    );
  }

  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
  const rows = (data ?? []) as ErrorLogRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Distinct modules for the filter. Cheap enough at this table's size, and it
  // keeps the dropdown honest — it lists what is actually in the data rather
  // than a hard-coded list that drifts.
  const { data: moduleRows } = await sb
    .from("error_logs")
    .select("module")
    .not("module", "is", null)
    .limit(1000);
  const modules = [
    ...new Set((moduleRows ?? []).map((r) => (r as { module: string }).module)),
  ].sort();

  const qs = (overrides: Record<string, string | number>) => {
    const p = new URLSearchParams();
    const current: Record<string, string> = {
      q, severity, status, source, kind, module: moduleName, env: environment, sort, dir, view,
    };
    for (const [k, v] of Object.entries(current)) if (v) p.set(k, v);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === "") p.delete(k);
      else p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  const hasFilters = Boolean(q || severity || status || source || kind || moduleName || environment);

  // The table may simply not exist yet (migration 0040 not applied). Say so
  // plainly — this is the developer page, so here the real reason IS the useful
  // message.
  if (error) {
    return (
      <>
        <PageHeader title="Error Logs" subtitle="Developer diagnostics." />
        <div className="card">
          <EmptyState
            message="The error_logs table is not available."
            hint="Apply supabase/migrations/0040_error_logs.sql, then reload. Until it is applied, errors are still caught and shown to users safely — they are simply not recorded."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Error Logs"
        subtitle="Every captured error, grouped by fingerprint. Developer access only."
        action={
          <form action={purgeOldErrors}>
            <input type="hidden" name="days" value="90" />
            <button type="submit" className="btn-ghost" style={{ fontSize: 13 }}>
              Purge closed &gt; 90 days
            </button>
          </form>
        }
      />

      {/* View tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {([
          ["open", "Open"],
          ["closed", "Resolved & ignored"],
          ["all", "All"],
        ] as const).map(([value, label]) => (
          <Link
            key={value}
            href={`/dev/error-logs${qs({ view: value, page: 1 })}`}
            className={view === value ? "btn-primary" : "btn-ghost"}
            style={{ fontSize: 13 }}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Filters */}
      <form method="GET" className="card mb-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <div className="flex-1" style={{ minWidth: 220 }}>
          <label className="label">Search</label>
          <input
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Reference, message, route, code, user…"
          />
        </div>
        <Select name="severity" label="Severity" value={severity} options={SEVERITIES.map((s) => [s, SEVERITY_LABEL[s]])} all="Any" />
        <Select name="status" label="Status" value={status} options={ERROR_STATUSES.map((s) => [s, STATUS_LABEL[s]])} all="Any" />
        <Select name="source" label="Layer" value={source} options={ERROR_SOURCES.map((s) => [s, SOURCE_LABEL[s]])} all="Any" />
        <Select name="kind" label="Type" value={kind} options={ERROR_KINDS.map((k) => [k, KIND_LABEL[k]])} all="Any" />
        <Select name="module" label="Module" value={moduleName} options={modules.map((m) => [m, m])} all="Any" />
        <Select name="env" label="Environment" value={environment} options={[["production", "Production"], ["development", "Development"]]} all="Any" />
        <button type="submit" className="btn-primary">Filter</button>
        {hasFilters && (
          <Link href={`/dev/error-logs${qs({ q: "", severity: "", status: "", source: "", kind: "", module: "", env: "", page: 1 })}`} className="btn-ghost">
            Clear
          </Link>
        )}
      </form>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-[var(--muted)]">
          {total.toLocaleString("en-IN")} {total === 1 ? "group" : "groups"}
          {hasFilters ? " (filtered)" : ""}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          Sort:
          {(Object.keys(SORTS) as SortKey[]).map((k) => (
            <Link
              key={k}
              href={`/dev/error-logs${qs({ sort: k, dir: sort === k && dir === "desc" ? "asc" : "desc", page: 1 })}`}
              className="btn-ghost"
              style={{ padding: "3px 8px", fontSize: 12 }}
            >
              {SORTS[k].label}
              {sort === k ? (dir === "desc" ? " ↓" : " ↑") : ""}
            </Link>
          ))}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            message={view === "open" ? "No open errors." : "No errors found."}
            hint={hasFilters ? "Try clearing the filters." : "Nothing has gone wrong that the system noticed."}
          />
        </div>
      ) : (
        <form action={bulkUpdateStatus}>
          <div className="card" style={{ padding: 0 }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="th" style={{ width: 34 }} aria-label="Select" />
                    <th className="th">Error</th>
                    <th className="th">Where</th>
                    <th className="th">Layer</th>
                    <th className="th text-right">Count</th>
                    <th className="th whitespace-nowrap">Last seen</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="td">
                        <input type="checkbox" name="ids" value={r.id} aria-label={`Select ${r.short_id}`} />
                      </td>
                      <td className="td">
                        <Link href={`/dev/error-logs/${r.id}`} className="block max-w-xl">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={SEVERITY_TONE[r.severity] ?? "gray"}>
                              {SEVERITY_LABEL[r.severity] ?? r.severity}
                            </Badge>
                            <span className="font-mono text-[11px] text-[var(--muted)]">{r.short_id}</span>
                            <span className="font-medium">{r.name ?? "Error"}</span>
                          </span>
                          <span className="mt-1 block truncate text-xs text-[var(--muted)]">
                            {r.message ?? "—"}
                          </span>
                        </Link>
                      </td>
                      <td className="td">
                        <span className="block text-xs">{r.module ?? "—"}</span>
                        <span className="block truncate text-[11px] text-[var(--muted)]" style={{ maxWidth: 220 }}>
                          {r.route ?? r.api_endpoint ?? "—"}
                        </span>
                      </td>
                      <td className="td">
                        <span className="text-xs text-[var(--muted)]">
                          {SOURCE_LABEL[r.source as keyof typeof SOURCE_LABEL] ?? r.source}
                        </span>
                        <span className="block text-[11px] text-[var(--muted)]">
                          {KIND_LABEL[r.kind as keyof typeof KIND_LABEL] ?? r.kind}
                          {r.code ? ` · ${r.code}` : ""}
                        </span>
                      </td>
                      <td className="td text-right font-medium">
                        {r.occurrence_count.toLocaleString("en-IN")}
                      </td>
                      <td className="td whitespace-nowrap text-[var(--muted)]" title={fmtDateTime(r.last_seen_at)}>
                        {timeAgo(r.last_seen_at)}
                      </td>
                      <td className="td">
                        <Badge tone={STATUS_TONE[r.status] ?? "gray"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--muted)]">With selected:</span>
            <select name="status" className="select" style={{ width: 180 }} defaultValue="resolved">
              {ERROR_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
            <button type="submit" className="btn-ghost">Apply</button>
          </div>
        </form>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-[var(--muted)]">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={`/dev/error-logs${qs({ page: page - 1 })}`} className="btn-ghost">← Prev</Link>
            ) : (
              <span className="btn-ghost pointer-events-none opacity-40">← Prev</span>
            )}
            {page < totalPages ? (
              <Link href={`/dev/error-logs${qs({ page: page + 1 })}`} className="btn-ghost">Next →</Link>
            ) : (
              <span className="btn-ghost pointer-events-none opacity-40">Next →</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function pick(value: string | undefined, allowed: readonly string[]): string {
  const v = (value ?? "").trim();
  return allowed.includes(v) ? v : "";
}

function Select({
  name,
  label,
  value,
  options,
  all,
}: {
  name: string;
  label: string;
  value: string;
  options: [string, string][];
  all: string;
}) {
  return (
    <div style={{ minWidth: 140 }}>
      <label className="label">{label}</label>
      <select name={name} defaultValue={value} className="select">
        <option value="">{all}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </div>
  );
}
