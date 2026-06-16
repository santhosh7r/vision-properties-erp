import Link from "next/link";
import { Sparkline } from "@/components/charts";

// Status palette shared across the dashboard.
export const STATUS_COLOR: Record<string, string> = {
  available: "#10b981",
  blocked: "#f59e0b",
  booked: "#428fdf", // logo blue
  registered: "#8b5cf6",
  sold: "#8b5cf6",
  cancelled: "#e4433a", // logo red
};

export function DeltaChip({ pct }: { pct: number }) {
  const up = pct >= 0;
  const color = up ? "#10b981" : "#ef4444";
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
      style={{ background: `${color}1f`, color }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: up ? "none" : "rotate(180deg)" }}>
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
      {Math.abs(pct)}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// KPI hero card
// ---------------------------------------------------------------------------
export function KpiCard({
  label,
  value,
  sub,
  icon,
  accent,
  href,
  highlight,
  delta,
  spark,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: React.ReactNode;
  accent: string;
  href?: string;
  highlight?: boolean;
  delta?: number;
  spark?: number[];
}) {
  const inner = (
    <div
      className={`card card-hover h-full ${href ? "cursor-pointer" : ""}`}
      style={
        highlight
          ? {
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, var(--surface)) 0%, var(--surface) 62%)",
              borderColor: "color-mix(in srgb, var(--accent) 28%, var(--border))",
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: `${accent}1f`, color: accent }}
        >
          {icon}
        </div>
        {spark && spark.some((v) => v > 0) && (
          <Sparkline data={spark} color={accent} />
        )}
      </div>
      <p className="mt-4 text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <div className="mt-1.5 flex items-end gap-2">
        <p className="text-[26px] font-semibold leading-none tracking-tight">{value}</p>
        {delta !== undefined && <DeltaChip pct={delta} />}
      </div>
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

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------
export function Panel({
  title,
  action,
  children,
  className,
  accent = "var(--accent)",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  accent?: string;
}) {
  return (
    <div className={`card ${className ?? ""}`}>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold">
          <span
            className="h-4 w-1 shrink-0 rounded-full"
            style={{ background: accent }}
          />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Donut chart (pure CSS conic-gradient)
// ---------------------------------------------------------------------------
export function Donut({
  segments,
  total,
  centerLabel,
  centerValue,
}: {
  segments: { label: string; value: number; color: string }[];
  total: number;
  centerLabel: string;
  centerValue: React.ReactNode;
}) {
  const sum = segments.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  const stops = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const start = (acc / sum) * 100;
      acc += s.value;
      const end = (acc / sum) * 100;
      return `${s.color} ${start}% ${end}%`;
    });
  const gradient =
    stops.length > 0
      ? `conic-gradient(${stops.join(", ")})`
      : `conic-gradient(var(--surface-3) 0% 100%)`;

  return (
    <div className="flex items-center gap-6">
      <div className="relative h-36 w-36 shrink-0">
        <div className="h-full w-full rounded-full" style={{ background: gradient }} />
        <div
          className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full"
          style={{ background: "var(--surface)" }}
        >
          <span className="text-2xl font-semibold leading-none">{centerValue}</span>
          <span className="mt-1 text-[11px] text-[var(--muted)]">{centerLabel}</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="flex-1 truncate text-sm capitalize text-[var(--text-2)]">
              {s.label}
            </span>
            <span className="text-sm font-medium tabular-nums">{s.value}</span>
            <span className="w-10 text-right text-xs tabular-nums text-[var(--muted)]">
              {total ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stacked horizontal bar
// ---------------------------------------------------------------------------
export function StackedBar({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const sum = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full"
        style={{ background: "var(--surface-3)" }}
      >
        {sum > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <div
                key={s.label}
                title={`${s.label}: ${s.value}`}
                style={{ width: `${(s.value / sum) * 100}%`, background: s.color }}
              />
            ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-xs capitalize text-[var(--muted)]">{s.label}</span>
            <span className="ml-auto text-sm font-medium tabular-nums">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline funnel
// ---------------------------------------------------------------------------
export function Funnel({
  steps,
}: {
  steps: { label: string; value: number; color: string }[];
}) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <div className="space-y-3.5">
      {steps.map((s) => (
        <div key={s.label}>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm text-[var(--text-2)]">{s.label}</span>
            <span className="text-sm font-semibold tabular-nums">{s.value}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-3)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.max((s.value / max) * 100, s.value > 0 ? 6 : 0)}%`, background: s.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
