import Link from "next/link";
import RememberedBackLink from "./RememberedBackLink";

export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  // Left-aligned back / cancel link rendered above the title. `label` is shown
  // verbatim (include "←" yourself for nav links). `remember` returns to the
  // list at `href` as the viewer left it (filters, search, page) — for lists
  // that keep their state with useUrlTableState.
  back?: { href: string; label: string; remember?: boolean };
}) {
  return (
    <div className="mb-7">
      {back?.remember && <RememberedBackLink listPath={back.href} label={back.label} />}
      {back && !back.remember && (
        <Link
          href={back.href}
          className="btn-ghost mb-3 inline-flex"
          style={{ padding: "5px 12px", fontSize: 13 }}
        >
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-[var(--muted)]">{subtitle}</p>}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div
      className="rounded-2xl border border-dashed p-12 text-center"
      style={{ borderColor: "var(--border-strong)" }}
    >
      <p className="text-sm font-medium text-[var(--text-2)]">{message}</p>
      {hint && <p className="mx-auto mt-1.5 max-w-md text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

const TONE: Record<string, string> = {
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  blue: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  amber: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  red: "bg-red-500/15 text-red-400 border-red-500/30",
  gray: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  purple: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

export function Badge({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONE;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

const PLOT_TONE: Record<string, keyof typeof TONE> = {
  available: "green",
  blocked: "amber",
  booked: "blue",
  registered: "purple",
  sold: "purple",
  cancelled: "red",
};

export function PlotStatusBadge({ status }: { status: string }) {
  return <Badge tone={PLOT_TONE[status] ?? "gray"}>{status.replace(/_/g, " ")}</Badge>;
}

const BOOKING_TONE: Record<string, keyof typeof TONE> = {
  pending: "amber",
  confirmed: "green",
  cancelled: "red",
};

export function BookingStatusBadge({ status }: { status: string }) {
  return <Badge tone={BOOKING_TONE[status] ?? "gray"}>{status}</Badge>;
}

export function PaymentBadge({ status }: { status: string }) {
  return (
    <Badge tone={status === "completed" ? "green" : "amber"}>
      {status === "completed" ? "Paid" : "Pending"}
    </Badge>
  );
}

export function StatCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <div className={`card h-full ${href ? "card-hover cursor-pointer" : ""}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2.5 text-[28px] font-semibold leading-none tracking-tight">{value}</p>
      {sub && <p className="mt-2 text-xs text-[var(--muted)]">{sub}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
