import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDevUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { PageHeader, Badge } from "@/components/ui";
import CopyText from "@/components/CopyText";
import {
  KIND_LABEL,
  SEVERITY_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  type AffectedUser,
  type ErrorLogRow,
  type ErrorOccurrence,
  type ErrorStatus,
  type Severity,
} from "@/lib/errors/types";
import { friendlyMessage } from "@/lib/errors/messages";
import TriageForm from "../TriageForm";

// ---------------------------------------------------------------------------
// One error group, in full.
//
// This is the ONLY screen in the application that renders raw technical detail:
// the original message, the stack, the SQLSTATE and its hint, the context bag,
// the request id, the device. Everywhere else — for every role, including this
// account — the same failure is a sentence and a reference code.
//
// The two are shown side by side at the top on purpose. "What the user saw" is
// the first thing you need when a support call quotes a reference, and having it
// here means nobody has to guess what the customer was actually told.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

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

export default async function ErrorLogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireDevUser();
  const { id } = await params;

  const { data } = await getSupabase().from("error_logs").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const e = data as ErrorLogRow;

  const occurrences = (Array.isArray(e.recent) ? e.recent : []) as ErrorOccurrence[];
  const affected = (Array.isArray(e.affected_users) ? e.affected_users : []) as AffectedUser[];
  const friendly = friendlyMessage(e.kind as never);

  return (
    <>
      <PageHeader
        title={e.name ?? "Error"}
        subtitle={`${e.short_id} · ${KIND_LABEL[e.kind as keyof typeof KIND_LABEL] ?? e.kind}${e.code ? ` · ${e.code}` : ""}`}
        back={{ href: "/dev/error-logs", label: "← Back to Error Logs" }}
        action={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={SEVERITY_TONE[e.severity] ?? "gray"}>
              {SEVERITY_LABEL[e.severity] ?? e.severity}
            </Badge>
            <Badge tone={STATUS_TONE[e.status] ?? "gray"}>
              {STATUS_LABEL[e.status] ?? e.status}
            </Badge>
            <CopyText value={e.short_id} label="Copy ID" />
          </span>
        }
      />

      {/* ── Headline numbers ─────────────────────────────────────────────── */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Occurrences" value={e.occurrence_count.toLocaleString("en-IN")} />
        <Stat label="First seen" value={timeAgo(e.first_seen_at)} sub={fmtDateTime(e.first_seen_at)} />
        <Stat label="Last seen" value={timeAgo(e.last_seen_at)} sub={fmtDateTime(e.last_seen_at)} />
        <Stat label="People affected" value={affected.length ? `${affected.length}${affected.length >= 20 ? "+" : ""}` : "—"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* ── The error itself ─────────────────────────────────────────── */}
          <section className="card">
            <h2 className="text-sm font-semibold">Error</h2>
            <Pre className="mt-3">{e.raw_message || e.message || "—"}</Pre>
            {e.message && e.raw_message && e.message !== e.raw_message && (
              <>
                <p className="mt-4 text-xs font-medium text-[var(--muted)]">Stored (truncated) message</p>
                <Pre className="mt-1.5">{e.message}</Pre>
              </>
            )}
          </section>

          {/* ── What the user was told ───────────────────────────────────── */}
          <section className="card">
            <h2 className="text-sm font-semibold">What the user saw</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              The application shows this — and only this — to everyone, including
              developer accounts. Raw detail never leaves this page.
            </p>
            <div
              className="mt-3 rounded-xl border p-4"
              style={{
                borderColor: "color-mix(in srgb, var(--brand-red) 35%, transparent)",
                background: "var(--brand-red-soft)",
              }}
            >
              <p className="text-sm font-semibold">{friendly.title}</p>
              <p className="mt-1 text-sm text-[var(--text-2)]">{friendly.message}</p>
              {e.last_event_id && (
                <p className="mt-2 text-[11px] text-[var(--muted)]">
                  Reference: <span className="font-mono font-medium">{e.last_event_id}</span>
                </p>
              )}
            </div>
          </section>

          {/* ── Stack ─────────────────────────────────────────────────────── */}
          {e.stack && (
            <section className="card">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Stack trace</h2>
                <CopyText value={e.stack} label="Copy" />
              </div>
              <Pre className="mt-3" scroll>{e.stack}</Pre>
            </section>
          )}

          {e.component_stack && (
            <section className="card">
              <h2 className="text-sm font-semibold">React component stack</h2>
              <Pre className="mt-3" scroll>{e.component_stack}</Pre>
            </section>
          )}

          {/* ── Database detail ───────────────────────────────────────────── */}
          {e.db_details && Object.values(e.db_details).some(Boolean) && (
            <section className="card">
              <h2 className="text-sm font-semibold">Database detail</h2>
              <dl className="mt-3 space-y-2">
                <Field label="SQLSTATE / code" value={e.db_details.code} mono />
                <Field label="Table" value={e.db_details.table} mono />
                <Field label="Constraint / key" value={e.db_details.constraint} mono />
                <Field label="Details" value={e.db_details.details} />
                <Field label="Hint" value={e.db_details.hint} />
              </dl>
            </section>
          )}

          {/* ── Context bag ───────────────────────────────────────────────── */}
          {e.context && Object.keys(e.context).length > 0 && (
            <section className="card">
              <h2 className="text-sm font-semibold">Context</h2>
              <Pre className="mt-3" scroll>{JSON.stringify(e.context, null, 2)}</Pre>
            </section>
          )}

          {/* ── History ───────────────────────────────────────────────────── */}
          <section className="card" style={{ padding: 0 }}>
            <div className="flex items-center justify-between gap-2 px-5 pt-5">
              <h2 className="text-sm font-semibold">Recent occurrences</h2>
              <span className="text-xs text-[var(--muted)]">
                Last {occurrences.length} of {e.occurrence_count.toLocaleString("en-IN")}
              </span>
            </div>
            {occurrences.length === 0 ? (
              <p className="px-5 pb-5 pt-3 text-sm text-[var(--muted)]">No occurrence history recorded.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="th">When</th>
                      <th className="th">Reference</th>
                      <th className="th">Route</th>
                      <th className="th">Who</th>
                      <th className="th">Request</th>
                    </tr>
                  </thead>
                  <tbody>
                    {occurrences.map((o, i) => (
                      <tr key={o.event_id ?? `${o.at}-${i}`}>
                        <td className="td whitespace-nowrap" title={fmtDateTime(o.at)}>{timeAgo(o.at)}</td>
                        <td className="td font-mono text-[11px]">{o.event_id ?? "—"}</td>
                        <td className="td text-[var(--muted)]">{o.route ?? o.api_endpoint ?? "—"}</td>
                        <td className="td text-[var(--muted)]">{o.user_email ?? "Signed out"}</td>
                        <td className="td font-mono text-[11px] text-[var(--muted)]">{o.request_id ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* ── Side column ──────────────────────────────────────────────────── */}
        <div className="space-y-5">
          <section className="card">
            <h2 className="text-sm font-semibold">Triage</h2>
            <TriageForm id={e.id} status={e.status} notes={e.resolution_notes} />
            {e.resolved_at && (
              <p className="mt-3 text-[11px] text-[var(--muted)]">
                Resolved {timeAgo(e.resolved_at)}
                {e.resolved_by_name ? ` by ${e.resolved_by_name}` : ""} · {fmtDateTime(e.resolved_at)}
              </p>
            )}
            <p className="mt-3 text-[11px] text-[var(--muted)]">
              A resolved error that happens again re-opens itself automatically.
              Ignored is permanent until changed here.
            </p>
          </section>

          <section className="card">
            <h2 className="text-sm font-semibold">Where</h2>
            <dl className="mt-3 space-y-2">
              <Field label="Module" value={e.module} />
              <Field label="Route" value={e.route} mono />
              <Field label="API endpoint" value={e.api_endpoint} mono />
              <Field label="Method" value={e.http_method} />
              <Field label="HTTP status" value={e.http_status?.toString()} />
              <Field label="Layer" value={SOURCE_LABEL[e.source as keyof typeof SOURCE_LABEL] ?? e.source} />
              <Field label="Runtime" value={e.runtime} />
              <Field label="Environment" value={e.environment} />
              <Field label="Release" value={e.release} mono />
              <Field label="Full URL" value={e.url} mono />
            </dl>
          </section>

          <section className="card">
            <h2 className="text-sm font-semibold">Who &amp; what</h2>
            <dl className="mt-3 space-y-2">
              <Field label="User" value={e.user_email} />
              <Field label="Role" value={e.user_role} />
              <Field label="Browser" value={e.browser} />
              <Field label="OS" value={e.os} />
              <Field label="Device" value={e.device} />
              <Field label="Request ID" value={e.request_id} mono />
              <Field label="Fingerprint" value={e.fingerprint} mono />
            </dl>
            {e.user_agent && (
              <>
                <p className="mt-3 text-xs font-medium text-[var(--muted)]">User agent</p>
                <Pre className="mt-1.5">{e.user_agent}</Pre>
              </>
            )}
          </section>

          {affected.length > 0 && (
            <section className="card">
              <h2 className="text-sm font-semibold">People affected</h2>
              <ul className="mt-3 space-y-1.5">
                {affected.map((u, i) => (
                  <li key={u.id ?? i} className="text-xs">
                    <span className="font-medium">{u.email ?? u.id ?? "Unknown"}</span>
                    {u.role && <span className="text-[var(--muted)]"> · {u.role}</span>}
                    {u.at && <span className="block text-[11px] text-[var(--muted)]">{timeAgo(u.at)}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Link href="/dev/error-logs" className="btn-ghost w-full justify-center">
            Back to all errors
          </Link>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-[22px] font-semibold leading-none tracking-tight">{value}</p>
      {sub && <p className="mt-2 text-[11px] text-[var(--muted)]">{sub}</p>}
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="text-[11px] uppercase tracking-wider text-[var(--muted)]">{label}</dt>
      <dd className={`min-w-0 flex-1 break-all text-xs ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function Pre({
  children,
  className = "",
  scroll = false,
}: {
  children: React.ReactNode;
  className?: string;
  scroll?: boolean;
}) {
  return (
    <pre
      className={`overflow-x-auto whitespace-pre-wrap break-words rounded-lg border p-3 font-mono text-[11px] leading-relaxed ${className}`}
      style={{
        borderColor: "var(--border)",
        background: "var(--surface-2)",
        maxHeight: scroll ? 420 : undefined,
        overflowY: scroll ? "auto" : undefined,
      }}
    >
      {children}
    </pre>
  );
}
