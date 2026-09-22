import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { classifyError, isBenignAbort, isControlFlow } from "./classify";
import { fingerprintOf, newEventId, shortIdFor } from "./fingerprint";
import { moduleForPath } from "./messages";
import { clamp, redactContext, redactText } from "./redact";
import {
  defaultSource,
  environmentName,
  parseUserAgent,
  releaseName,
  requestIdFrom,
  runtimeName,
} from "./runtime";
import type { CaptureResult, ErrorContext, ErrorKind, Severity } from "./types";

// ---------------------------------------------------------------------------
// CAPTURE — the one door into error_logs.
//
// Three promises this file has to keep, in order of importance:
//
//   1. IT NEVER THROWS. Every path is wrapped. A monitoring system that can
//      break the request it is monitoring is worse than no monitoring at all,
//      so the failure mode here is always "return quietly, log nothing".
//   2. IT NEVER BLOCKS. The database write is deferred; the caller gets its
//      reference code back immediately, computed locally from the fingerprint.
//   3. IT NEVER RECURSES. It talks to Supabase through its own uninstrumented
//      client, and a re-entrant call while a write is in flight is dropped.
// ---------------------------------------------------------------------------

const RPC = "record_error";

// Its own client, created here rather than imported from lib/supabase, so that
// the instrumented client cannot possibly be used from inside the error path
// (and so this module has no import cycle with it).
let client: SupabaseClient | null = null;
let clientUnavailable = false;

function sb(): SupabaseClient | null {
  if (client) return client;
  if (clientUnavailable) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Not configured (local dev without a .env, a preview build). Remember it so
    // we stop re-checking on every error.
    clientUnavailable = true;
    return null;
  }
  try {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return client;
  } catch {
    clientUnavailable = true;
    return null;
  }
}

// ── Load shedding ──────────────────────────────────────────────────────────
// Recursion is prevented STRUCTURALLY, not by a flag: this module talks to
// Supabase through its own uninstrumented client, so a failure while writing a
// log cannot be observed by the instrumented one, and every path below swallows
// its own errors rather than re-capturing them.
//
// What is left to guard against is a storm — a dependency falling over and
// every in-flight request failing at once. Past this many concurrent writes we
// start dropping, because a monitoring system holding open hundreds of sockets
// is no longer monitoring, it is the outage.
//
// (An earlier version used a single `writing` boolean. On a concurrent server
// that silently dropped any error that happened to arrive while an unrelated
// write was in flight — exactly the errors worth keeping.)
const MAX_IN_FLIGHT = 20;
let inFlight = 0;

// ── Throttling ─────────────────────────────────────────────────────────────
// An error in a loop (a failing render, a retrying poll) can fire hundreds of
// times a second. Writing each one would be pointless — they all fold into the
// same row anyway. So repeats inside the window are COUNTED, not written, and
// the accumulated count rides along with the next write. The total stays exact;
// the number of round-trips does not.
const THROTTLE_MS = 1500;
const MAX_TRACKED = 500;
const pending = new Map<string, { last: number; count: number; timer?: ReturnType<typeof setTimeout> }>();

function sweep(): void {
  if (pending.size <= MAX_TRACKED) return;
  const cutoff = Date.now() - 60_000;
  for (const [k, v] of pending) {
    if (v.count === 0 && v.last < cutoff) pending.delete(k);
    if (pending.size <= MAX_TRACKED) break;
  }
  // Still oversized (a pathological spread of distinct errors): drop the oldest
  // bookkeeping wholesale. Losing throttle state only costs extra writes.
  if (pending.size > MAX_TRACKED * 2) pending.clear();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record an error. Safe to call from anywhere on the server, with anything.
 *
 * Returns the reference to show the user. It resolves immediately — the write
 * happens in the background — and it resolves even when nothing was written, so
 * no caller ever has to branch on whether logging worked.
 */
export async function captureError(
  err: unknown,
  ctx: ErrorContext = {},
): Promise<CaptureResult> {
  const eventId = ctx.eventId || newEventId();
  try {
    // Framework control flow is not an error — see isControlFlow. Capturing it
    // would fill the table with every redirect in the app.
    if (isControlFlow(err) || isBenignAbort(err)) return { eventId, logged: false };
    if (inFlight >= MAX_IN_FLIGHT) return { eventId, logged: false };

    const row = await buildErrorRow(err, ctx, eventId);
    if (!row) return { eventId, logged: false };

    const fingerprint = row.fingerprint as string;
    const shortId = shortIdFor(fingerprint);

    // Throttle: fold this occurrence into the next write for the same group.
    const now = Date.now();
    const entry = pending.get(fingerprint);
    if (entry && now - entry.last < THROTTLE_MS) {
      entry.count += 1;
      if (!entry.timer) {
        entry.timer = setTimeout(() => flush(fingerprint, row), THROTTLE_MS);
        // Never hold a Node process open just to flush a log line.
        (entry.timer as unknown as { unref?: () => void }).unref?.();
      }
      return { eventId, shortId, logged: true };
    }

    // Past the window, so this one is written. Anything that accumulated since
    // the last write rides along with it — dropping it here would silently lose
    // every occurrence that arrived during a burst, which is the opposite of
    // what the throttle is for.
    const carried = entry?.count ?? 0;
    if (entry?.timer) clearTimeout(entry.timer);
    pending.set(fingerprint, { last: now, count: 0 });
    sweep();

    const payload =
      carried > 0
        ? { ...row, occurrence_count: Number(row.occurrence_count ?? 1) + carried }
        : row;
    // A process-level handler (unhandledRejection / uncaughtException) fires on
    // a later tick but often still INSIDE the async context of the request that
    // spawned the stray promise. `headers()` therefore succeeds and we would
    // hand the write to after() — which is by then a no-op, because that
    // response has already been sent. So these never defer.
    const useAfter = ctx.source === "node" ? false : await inRequestScope();
    await defer(() => write(payload), useAfter);
    return { eventId, shortId, logged: true };
  } catch {
    // Absolutely nothing escapes this function.
    return { eventId, logged: false };
  }
}

/**
 * Fire-and-forget form, for call sites that have no use for the reference (the
 * Supabase instrumentation, process-level handlers). Identical guarantees.
 */
export function captureErrorSync(err: unknown, ctx: ErrorContext = {}): void {
  try {
    void captureError(err, ctx).catch(() => {});
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function flush(fingerprint: string, row: Record<string, unknown>): void {
  const entry = pending.get(fingerprint);
  if (!entry) return;
  entry.timer = undefined;
  if (entry.count === 0) return;
  const extra = entry.count;
  entry.count = 0;
  entry.last = Date.now();
  // Detached, never via after(): this fires from a timer long after the request
  // that scheduled it has gone, and there is no response left to run behind.
  void defer(() => write({ ...row, occurrence_count: extra }), false);
}

// `after` is resolved lazily and cached. It must NOT be a static import:
// this module is pulled into the instrumentation bundle (via the process-level
// handlers) and into lib/supabase, and in those contexts importing
// `next/server` at module scope fails — which took the whole module down with
// it and silently disabled process-level capture entirely.
let afterFn: ((cb: () => void) => void) | null | undefined;

/**
 * Run the write after the response has been sent.
 *
 * `after()` is what makes "non-blocking" true on a serverless host: without it a
 * detached promise can be killed the moment the response finishes, so errors
 * would go unlogged on exactly the requests that failed.
 *
 * `inRequest` has to be passed in rather than discovered here. Outside a request
 * scope `after()` does not reliably throw — on some hosts it simply does
 * nothing, and the callback is dropped without a sound. That is not a
 * theoretical concern: it silently swallowed every throttled occurrence until
 * this was split out, because the flush timer runs with no request in scope.
 */
async function defer(fn: () => Promise<void>, inRequest: boolean): Promise<void> {
  const run = () => {
    void fn().catch(() => {});
  };
  if (!inRequest) {
    run();
    return;
  }
  if (afterFn === undefined) {
    try {
      afterFn = (await import("next/server")).after;
    } catch {
      afterFn = null;
    }
  }
  if (afterFn) {
    try {
      afterFn(run);
      return;
    } catch {
      /* no request scope after all */
    }
  }
  run();
}

/**
 * Is there a request to run behind? `headers()` resolves inside a request and
 * throws anywhere else, which makes it the cheapest honest answer available.
 */
async function inRequestScope(): Promise<boolean> {
  if (typeof window !== "undefined") return false;
  try {
    const { headers } = await import("next/headers");
    await headers();
    return true;
  } catch {
    return false;
  }
}

async function write(row: Record<string, unknown>): Promise<void> {
  const db = sb();
  if (!db) return;
  inFlight += 1;
  try {
    const { error } = await db.rpc(RPC, { p: row });
    if (error) await fallbackWrite(db, row);
  } catch {
    // Network down, Supabase unreachable, anything: drop it. The application
    // must not notice that monitoring is unavailable.
  } finally {
    inFlight -= 1;
  }
}

/**
 * Used when record_error() is unavailable — typically migration 0040 has not
 * been applied yet to this environment. Degrades to an insert that still
 * de-duplicates on the unique fingerprint, so an un-migrated environment logs
 * something useful instead of nothing, and never errors at the user.
 */
async function fallbackWrite(db: SupabaseClient, row: Record<string, unknown>): Promise<void> {
  try {
    const { fingerprint, occurred_at, occurrence_count, event_id, ...rest } = row;
    const { error } = await db.from("error_logs").insert({
      ...rest,
      fingerprint,
      short_id: shortIdFor(String(fingerprint)),
      last_event_id: event_id,
      occurrence_count: occurrence_count ?? 1,
      first_seen_at: occurred_at,
      last_seen_at: occurred_at,
    });
    if (!error) return;
    // Already there — bump what we can without the RPC's atomic increment.
    await db
      .from("error_logs")
      .update({ last_seen_at: occurred_at, last_event_id: event_id, updated_at: new Date().toISOString() })
      .eq("fingerprint", fingerprint);
  } catch {
    /* silent */
  }
}

/**
 * Turn an error plus its context into the row `record_error` expects.
 *
 * Exported because its keys ARE the contract with migration 0040: every key
 * here is read by name inside record_error(), and a rename on either side that
 * is not matched on the other silently stores a NULL. Having it reachable makes
 * that contract testable instead of hopeful.
 */
export async function buildErrorRow(
  err: unknown,
  ctx: ErrorContext,
  eventId: string,
): Promise<Record<string, unknown> | null> {
  const c = classifyError(err);
  const req = await requestContext(ctx);

  const route = ctx.route ?? req.route ?? null;
  const moduleName = ctx.module ?? moduleForPath(route ?? ctx.apiEndpoint ?? null);
  const source = ctx.source ?? defaultSource();
  const severity: Severity = ctx.severity ?? c.severity;
  const kind: ErrorKind = ctx.kind ?? c.kind;

  const fingerprint = fingerprintOf({
    name: c.name,
    message: c.message,
    kind,
    code: c.code,
    module: moduleName,
    source,
    stack: c.stack,
  });

  const device = parseUserAgent(ctx.userAgent ?? req.userAgent);
  const extraContext = {
    ...(ctx.context ?? {}),
    ...(c.extra ?? {}),
    ...(ctx.digest ? { digest: ctx.digest } : {}),
  };

  return {
    fingerprint,
    event_id: eventId,
    occurred_at: ctx.occurredAt ?? new Date().toISOString(),
    occurrence_count: Math.max(1, ctx.count ?? 1),

    name: c.name,
    message: c.message,
    raw_message: c.rawMessage,
    code: c.code,
    kind,
    severity,
    source,

    module: moduleName,
    route,
    api_endpoint: ctx.apiEndpoint ?? null,
    http_method: ctx.httpMethod ?? req.method ?? null,
    http_status: ctx.httpStatus ?? c.httpStatus ?? null,

    stack: c.stack,
    component_stack: clamp(redactText(ctx.componentStack), 6000),
    db_details: c.dbDetails,
    context: redactContext(extraContext),

    request_id: ctx.requestId ?? req.requestId ?? null,
    user_id: ctx.user?.id ?? req.user?.id ?? null,
    user_email: ctx.user?.email ?? req.user?.email ?? null,
    user_role: ctx.user?.role ?? req.user?.role ?? null,
    url: clamp(redactText(ctx.url ?? req.url), 500),
    user_agent: clamp(ctx.userAgent ?? req.userAgent, 400),
    browser: device.browser,
    os: device.os,
    device: device.device,
    // Where the error HAPPENED. A browser report is assembled here on the
    // server, so runtimeName() would say "nodejs" and quietly mislabel every
    // client-side crash.
    runtime: source === "browser" ? "browser" : runtimeName(),
    environment: environmentName(),
    release: releaseName(),
  };
}

interface RequestContext {
  route: string | null;
  url: string | null;
  method: string | null;
  userAgent: string | null;
  requestId: string | null;
  user: { id: string; email: string; role: string } | null;
}

const EMPTY_REQUEST: RequestContext = {
  route: null,
  url: null,
  method: null,
  userAgent: null,
  requestId: null,
  user: null,
};

/**
 * Best-effort request details. Every one of these APIs throws outside a request
 * scope (a background job, a process-level handler, a build-time render), which
 * is normal — the row is simply written with less context.
 */
async function requestContext(ctx: ErrorContext): Promise<RequestContext> {
  if (typeof window !== "undefined") return EMPTY_REQUEST;
  try {
    const { headers, cookies } = await import("next/headers");
    let h: Headers | null = null;
    try {
      h = await headers();
    } catch {
      h = null;
    }

    let user: RequestContext["user"] = null;
    if (!ctx.user) {
      try {
        const store = await cookies();
        const { SESSION_COOKIE, decodeSessionToken } = await import("../session");
        const session = await decodeSessionToken(store.get(SESSION_COOKIE)?.value);
        if (session) {
          user = { id: session.id, email: session.email, role: session.role };
        }
      } catch {
        user = null;
      }
    }

    if (!h) return { ...EMPTY_REQUEST, user };
    return {
      route: h.get("x-pathname"),
      url: h.get("referer"),
      method: null,
      userAgent: h.get("user-agent"),
      requestId: requestIdFrom(h),
      user,
    };
  } catch {
    return EMPTY_REQUEST;
  }
}
