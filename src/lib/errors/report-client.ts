import { classifyError, isBenignAbort, isControlFlow } from "./classify";
import { fingerprintOf, newEventId } from "./fingerprint";
import { redactContext, redactText } from "./redact";
import type { ErrorSource, Severity } from "./types";

// ---------------------------------------------------------------------------
// The browser half of the reporter.
//
// It posts to /api/errors/report and nothing else — the browser has no database
// credentials and never will. Three properties matter here:
//
//   • It redacts before sending. The server redacts again, but a secret should
//     not travel over the wire in the first place.
//   • It throttles locally. A render loop can fire thousands of times a second;
//     without a client-side limit the reporter becomes the outage.
//   • It fails silently, always. A reporter that can throw would be caught by
//     the handlers that call it, which would call the reporter…
// ---------------------------------------------------------------------------

const ENDPOINT = "/api/errors/report";

// Client-side dedup, mirroring the server's: same group inside the window is
// counted, not sent, and the count rides along with the next report.
const THROTTLE_MS = 3000;
const seen = new Map<string, { last: number; count: number }>();

// A hard ceiling for the life of the page, so a pathological loop that defeats
// the throttle (every occurrence genuinely distinct) still cannot flood.
const MAX_PER_PAGE = 50;
let sent = 0;

export interface ClientReportOptions {
  source?: ErrorSource;
  severity?: Severity;
  componentStack?: string | null;
  digest?: string | null;
  /** Reuse the reference already shown to the user, so the two match. */
  eventId?: string | null;
  apiEndpoint?: string | null;
  httpStatus?: number | null;
  route?: string | null;
  context?: Record<string, unknown> | null;
}

/**
 * Report a browser-side error. Returns the reference to show the user; it
 * returns one even when nothing was sent, so the UI always has something to
 * display and never has to know whether reporting worked.
 */
export function reportClientError(err: unknown, options: ClientReportOptions = {}): string {
  const eventId = options.eventId || newEventId();
  try {
    if (typeof window === "undefined") return eventId;
    if (isControlFlow(err) || isBenignAbort(err)) return eventId;
    if (sent >= MAX_PER_PAGE) return eventId;

    const c = classifyError(err);
    const route = options.route ?? window.location?.pathname ?? null;
    const fingerprint = fingerprintOf({
      name: c.name,
      message: c.message,
      kind: c.kind,
      code: c.code,
      module: null,
      source: options.source ?? "browser",
      stack: c.stack,
    });

    const now = Date.now();
    const entry = seen.get(fingerprint);
    if (entry && now - entry.last < THROTTLE_MS) {
      entry.count += 1;
      return eventId;
    }
    const carried = entry?.count ?? 0;
    seen.set(fingerprint, { last: now, count: 0 });
    if (seen.size > 200) seen.clear();

    const payload = {
      name: c.name,
      message: c.message,
      stack: c.stack ?? undefined,
      componentStack: options.componentStack
        ? redactText(options.componentStack).slice(0, 20_000)
        : undefined,
      eventId,
      digest: options.digest ?? undefined,
      route: route ?? undefined,
      url: redactText(window.location?.href ?? "").slice(0, 1000) || undefined,
      source: options.source ?? "browser",
      severity: options.severity ?? c.severity,
      kind: c.kind,
      apiEndpoint: options.apiEndpoint ?? undefined,
      httpStatus: options.httpStatus ?? c.httpStatus ?? undefined,
      occurredAt: new Date().toISOString(),
      count: 1 + carried,
      context: redactContext(options.context) ?? undefined,
    };

    send(payload);
    sent += 1;
  } catch {
    /* never throws */
  }
  return eventId;
}

function send(payload: unknown): void {
  let body: string;
  try {
    body = JSON.stringify(payload);
  } catch {
    return;
  }
  // 64KB is the endpoint's ceiling; drop the stack rather than the whole report.
  if (body.length > 60_000) {
    try {
      const trimmed = { ...(payload as Record<string, unknown>), stack: undefined, componentStack: undefined };
      body = JSON.stringify(trimmed);
    } catch {
      return;
    }
  }

  try {
    // keepalive so a report survives the navigation that a crash often triggers.
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
      cache: "no-store",
    }).catch(() => {});
  } catch {
    // Last resort for a page being torn down mid-report.
    try {
      navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }));
    } catch {
      /* give up quietly */
    }
  }
}
