import type { ErrorKind } from "@/lib/errors/types";
import { friendlyMessage, type MessageOptions } from "@/lib/errors/messages";

// ---------------------------------------------------------------------------
// The standard way to show a failure inside a page.
//
// It takes a `kind` and a reference code — never an error object and never a
// message string from a catch. That is the point: the component physically
// cannot render a stack trace, a SQL error or an exception message, because
// nothing of the sort can be passed to it. Every surface in the app that shows a
// failure should use this or <ErrorScreen>, so "no raw errors in the UI" is a
// property of the component library rather than a rule people have to remember.
//
// A plain server component — usable from a page, a form result or a boundary.
// ---------------------------------------------------------------------------

export default function ErrorNotice({
  kind = "unknown",
  reference,
  subject,
  action,
  title,
  children,
  compact = false,
}: {
  kind?: ErrorKind;
  /** The code from the capture layer. Shown so support can find the log row. */
  reference?: string | null;
  /** Optional extra actions — a "Try again" button, a link back. */
  children?: React.ReactNode;
  /** Overrides the standard heading when a page has a better one. */
  title?: string;
  compact?: boolean;
} & MessageOptions) {
  const friendly = friendlyMessage(kind, { subject, action });

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`rounded-xl border ${compact ? "px-3.5 py-3" : "p-5"}`}
      style={{
        borderColor: "color-mix(in srgb, var(--brand-red) 35%, transparent)",
        background: "var(--brand-red-soft)",
      }}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
          style={{ background: "var(--brand-red)", color: "var(--brand-red-contrast)" }}
        >
          !
        </span>
        <div className="min-w-0 flex-1">
          <p className={`font-semibold ${compact ? "text-[13px]" : "text-sm"}`}>
            {title ?? friendly.title}
          </p>
          <p className={`mt-1 ${compact ? "text-xs" : "text-sm"} text-[var(--text-2)]`}>
            {friendly.message}
          </p>
          {reference && (
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              Reference:{" "}
              <span className="font-mono font-medium tracking-tight">{reference}</span>
              {" · "}Quote this if you contact support.
            </p>
          )}
          {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
        </div>
      </div>
    </div>
  );
}
