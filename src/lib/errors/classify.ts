import type { DbDetails, ErrorKind, Severity } from "./types";
import { clamp, redactText, redactValue } from "./redact";

// ---------------------------------------------------------------------------
// CLASSIFICATION — turn any thrown value into a structured, storable shape.
//
// The input is genuinely `unknown`: a `catch` may receive an Error, a
// PostgrestError (a plain object, not an Error), a Supabase AuthError, a
// ZodError, a DOMException, a string, a number, a rejected fetch, or `undefined`
// from a `throw` in a library. Everything below has to survive all of it without
// throwing itself — a classifier that can fail is a monitoring system that goes
// dark exactly when it is needed.
//
// It answers three questions:
//   • What is it?      → kind + code + name
//   • How bad is it?   → severity
//   • What does the user see? → the friendly sentence, chosen from kind alone,
//                        so a new failure mode can never produce raw text.
// ---------------------------------------------------------------------------

export interface Classified {
  name: string;
  /** Redacted, for storage and for the fingerprint. */
  message: string;
  /** The original message with secrets stripped but nothing else lost. */
  rawMessage: string;
  code: string | null;
  kind: ErrorKind;
  severity: Severity;
  stack: string | null;
  dbDetails: DbDetails | null;
  httpStatus: number | null;
  /** Extra structured fields worth keeping (Zod issues, cause chain…). */
  extra: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Next.js control flow. `redirect()` and `notFound()` signal by THROWING. They
// are not errors, they are how the framework returns — capturing them would fill
// the table with noise and, worse, swallowing them would break every redirect in
// the app. Anything that catches broadly must ask this first and re-throw.
// ---------------------------------------------------------------------------
const CONTROL_FLOW_DIGESTS = [
  "NEXT_REDIRECT",
  "NEXT_NOT_FOUND",
  "NEXT_HTTP_ERROR_FALLBACK",
  "DYNAMIC_SERVER_USAGE",
  "BAILOUT_TO_CLIENT_SIDE_RENDERING",
  "NEXT_STATIC_GEN_BAILOUT",
  "NEXT_RSC_UNION_QUERY",
];

export function isControlFlow(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { digest?: unknown; message?: unknown; $$typeof?: unknown };
  const digest = typeof e.digest === "string" ? e.digest : "";
  const message = typeof e.message === "string" ? e.message : "";
  return CONTROL_FLOW_DIGESTS.some((d) => digest.startsWith(d) || message.startsWith(d));
}

/**
 * An abort the user caused — navigating away mid-request, closing the tab, a
 * React transition superseded. Not a fault, and high-volume if logged.
 */
export function isBenignAbort(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown; message?: unknown };
  const name = String(e.name ?? "");
  const msg = String(e.message ?? "");
  if (name === "AbortError" && /user|navigat|unmount/i.test(msg)) return true;
  return /The user aborted a request|The operation was aborted|signal is aborted without reason|Request aborted/i.test(
    msg,
  );
}

// ---------------------------------------------------------------------------
// Postgres SQLSTATE → kind/severity. Only the classes we can say something
// meaningful about; everything else falls through to `database`.
// ---------------------------------------------------------------------------
const PG_CODES: Record<string, { kind: ErrorKind; severity: Severity }> = {
  "23505": { kind: "conflict", severity: "warning" },   // unique_violation
  "23503": { kind: "conflict", severity: "warning" },   // foreign_key_violation
  "23502": { kind: "validation", severity: "warning" }, // not_null_violation
  "23514": { kind: "validation", severity: "warning" }, // check_violation
  "22P02": { kind: "validation", severity: "warning" }, // invalid_text_representation
  "22003": { kind: "validation", severity: "warning" }, // numeric_value_out_of_range
  "22001": { kind: "validation", severity: "warning" }, // string_data_right_truncation
  "22007": { kind: "validation", severity: "warning" }, // invalid_datetime_format
  "42501": { kind: "permission", severity: "error" },   // insufficient_privilege (RLS)
  "42601": { kind: "database", severity: "critical" },  // syntax_error
  "42P01": { kind: "config", severity: "critical" },    // undefined_table — migration missing
  "42703": { kind: "config", severity: "critical" },    // undefined_column — schema drift
  "42883": { kind: "config", severity: "critical" },    // undefined_function — RPC missing
  "40001": { kind: "conflict", severity: "warning" },   // serialization_failure
  "40P01": { kind: "conflict", severity: "error" },     // deadlock_detected
  "53300": { kind: "database", severity: "critical" },  // too_many_connections
  "53200": { kind: "database", severity: "critical" },  // out_of_memory
  "57014": { kind: "timeout", severity: "error" },      // query_canceled / statement timeout
  "55P03": { kind: "timeout", severity: "warning" },    // lock_not_available
  P0001: { kind: "database", severity: "error" },       // raise_exception from a trigger/RPC
  P0002: { kind: "not_found", severity: "info" },       // no_data_found
};

// PostgREST's own error codes (returned instead of a SQLSTATE).
const PGRST_CODES: Record<string, { kind: ErrorKind; severity: Severity }> = {
  PGRST100: { kind: "runtime", severity: "error" },   // malformed query string — our bug
  PGRST102: { kind: "runtime", severity: "error" },   // malformed request body
  PGRST103: { kind: "runtime", severity: "error" },   // invalid range
  PGRST116: { kind: "not_found", severity: "info" },  // 0 or >1 rows for .single()
  PGRST202: { kind: "config", severity: "critical" }, // RPC not found in schema cache
  PGRST204: { kind: "config", severity: "critical" }, // column not found in schema cache
  PGRST301: { kind: "auth", severity: "warning" },    // JWT expired
  PGRST302: { kind: "auth", severity: "warning" },    // anonymous access disabled
};

const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "EPROTO",
  "ERR_NETWORK",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
]);

const TIMEOUT_CODES = new Set([
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "ERR_TIMEOUT",
]);

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  try {
    return String(v);
  } catch {
    return "";
  }
}

/** Is this a Supabase/PostgREST error object? They are plain objects, not Errors. */
function looksLikePostgrest(e: Record<string, unknown>): boolean {
  return "message" in e && ("details" in e || "hint" in e) && !("stack" in e && e.stack);
}

function kindFromHttpStatus(status: number): { kind: ErrorKind; severity: Severity } | null {
  if (status === 401) return { kind: "auth", severity: "warning" };
  if (status === 403) return { kind: "permission", severity: "warning" };
  if (status === 404) return { kind: "not_found", severity: "info" };
  if (status === 409) return { kind: "conflict", severity: "warning" };
  if (status === 408) return { kind: "timeout", severity: "warning" };
  if (status === 413 || status === 422 || status === 400) return { kind: "validation", severity: "warning" };
  if (status === 429) return { kind: "rate_limit", severity: "warning" };
  if (status === 504 || status === 524) return { kind: "timeout", severity: "error" };
  if (status === 502 || status === 503) return { kind: "network", severity: "error" };
  if (status >= 500) return { kind: "runtime", severity: "error" };
  return null;
}

function kindFromMessage(message: string): { kind: ErrorKind; severity: Severity } | null {
  const m = message.toLowerCase();
  if (/timed? ?out|timeout|deadline exceeded|statement timeout/.test(m))
    return { kind: "timeout", severity: "error" };
  if (/rate ?limit|too many requests|throttl|quota exceeded/.test(m))
    return { kind: "rate_limit", severity: "warning" };
  if (/fetch failed|network ?error|failed to fetch|load failed|socket hang up|connection (refused|reset|closed)|dns/.test(m))
    return { kind: "network", severity: "error" };
  if (/row-level security|violates row-level|permission denied|not authori[sz]ed|forbidden|insufficient privilege/.test(m))
    return { kind: "permission", severity: "error" };
  if (/invalid (login|credential)|jwt|session (expired|missing)|not signed in|unauthenti/.test(m))
    return { kind: "auth", severity: "warning" };
  if (/is not configured|missing environment|env(ironment)? variable|not set in|misconfigur/.test(m))
    return { kind: "config", severity: "critical" };
  if (/duplicate key|already exists|conflict/.test(m))
    return { kind: "conflict", severity: "warning" };
  if (/not found|does not exist|no rows/.test(m))
    return { kind: "not_found", severity: "info" };
  if (/invalid|required|must be|expected .* received|validation/.test(m))
    return { kind: "validation", severity: "warning" };
  return null;
}

/**
 * The single entry point. Never throws, never returns null — an unreadable input
 * still produces a storable `unknown` record, because a swallowed error is worse
 * than a vague one.
 */
export function classifyError(err: unknown): Classified {
  try {
    return classifyInner(err);
  } catch {
    return {
      name: "UnclassifiableError",
      message: "An error could not be read.",
      rawMessage: "An error could not be read.",
      code: null,
      kind: "unknown",
      severity: "error",
      stack: null,
      dbDetails: null,
      httpStatus: null,
      extra: null,
    };
  }
}

function classifyInner(err: unknown): Classified {
  // --- primitives and non-objects ------------------------------------------
  if (err === null || err === undefined) {
    return base({ name: "EmptyThrow", message: `Nothing was thrown (${String(err)})`, kind: "runtime" });
  }
  if (typeof err === "string") {
    const hint = kindFromMessage(err);
    return base({ name: "StringThrow", message: err, kind: hint?.kind ?? "unknown", severity: hint?.severity });
  }
  if (typeof err !== "object") {
    return base({ name: "NonErrorThrow", message: str(err), kind: "runtime" });
  }

  const e = err as Record<string, unknown>;

  // --- Zod ------------------------------------------------------------------
  // Recognised structurally rather than by `instanceof`, so this file never has
  // to import zod (and keeps working if the version changes).
  if (e.name === "ZodError" && Array.isArray(e.issues)) {
    const issues = (e.issues as Record<string, unknown>[]).slice(0, 10);
    const first = issues[0];
    const path = Array.isArray(first?.path) ? first.path.join(".") : "";
    return base({
      name: "ZodError",
      message: `Validation failed${path ? ` at "${path}"` : ""}: ${str(first?.message) || "invalid input"}`,
      kind: "validation",
      severity: "warning",
      code: "ZOD",
      extra: { issues: redactValue(issues) as unknown[] },
    });
  }

  // --- Supabase Storage -----------------------------------------------------
  if (typeof e.name === "string" && /StorageApiError|StorageUnknownError/.test(e.name)) {
    const status = Number(e.statusCode ?? e.status) || null;
    const fromStatus = status ? kindFromHttpStatus(status) : null;
    return base({
      name: str(e.name),
      message: str(e.message),
      kind: fromStatus?.kind === "not_found" ? "not_found" : "storage",
      severity: fromStatus?.severity ?? "error",
      code: str(e.statusCode) || null,
      httpStatus: status,
      stack: str(e.stack) || null,
    });
  }

  // --- Supabase Auth --------------------------------------------------------
  if (typeof e.name === "string" && /AuthApiError|AuthError|AuthRetryableFetchError|AuthSessionMissingError/.test(e.name)) {
    const status = Number(e.status) || null;
    return base({
      name: str(e.name),
      message: str(e.message),
      kind: e.name === "AuthRetryableFetchError" ? "network" : "auth",
      severity: status && status >= 500 ? "error" : "warning",
      code: str(e.code) || (status ? String(status) : null),
      httpStatus: status,
      stack: str(e.stack) || null,
    });
  }

  // --- Postgres / PostgREST -------------------------------------------------
  const code = str(e.code).trim();
  const isPg = Boolean(code) && (PG_CODES[code] || PGRST_CODES[code] || looksLikePostgrest(e));
  if (isPg) {
    const mapped = PGRST_CODES[code] ?? PG_CODES[code] ?? { kind: "database" as ErrorKind, severity: "error" as Severity };
    const details = str(e.details);
    const hint = str(e.hint);
    // Postgres puts the table and constraint into the detail text; pulling them
    // out makes the group scannable without reading the whole message.
    const table =
      /relation "([^"]+)"/.exec(str(e.message))?.[1] ??
      /table "([^"]+)"/.exec(details)?.[1] ??
      null;
    const constraint =
      /constraint "([^"]+)"/.exec(str(e.message))?.[1] ??
      /Key \(([^)]+)\)/.exec(details)?.[1] ??
      null;
    return base({
      name: str(e.name) || "PostgrestError",
      message: str(e.message),
      kind: mapped.kind,
      severity: mapped.severity,
      code: code || null,
      stack: str(e.stack) || null,
      dbDetails: {
        code: code || null,
        details: clamp(redactText(details), 1000),
        hint: clamp(redactText(hint), 500),
        table,
        constraint,
      },
    });
  }

  // --- DOM / fetch / abort --------------------------------------------------
  const name = str(e.name) || "Error";
  const message = str(e.message);
  const sysCode = str(e.code) || str((e.cause as Record<string, unknown> | undefined)?.code);

  if (NETWORK_CODES.has(sysCode)) {
    return base({ name, message: message || sysCode, kind: "network", severity: "error", code: sysCode, stack: str(e.stack) || null });
  }
  if (TIMEOUT_CODES.has(sysCode) || name === "TimeoutError") {
    return base({ name, message: message || sysCode, kind: "timeout", severity: "error", code: sysCode || "TIMEOUT", stack: str(e.stack) || null });
  }
  if (name === "AbortError") {
    return base({ name, message: message || "Aborted", kind: "timeout", severity: "warning", code: "ABORT", stack: str(e.stack) || null });
  }

  // --- HTTP-shaped ----------------------------------------------------------
  const status = Number(e.status ?? e.statusCode ?? e.httpStatus);
  const fromStatus = Number.isFinite(status) && status > 0 ? kindFromHttpStatus(status) : null;

  // --- plain Error / anything else -----------------------------------------
  const fromMessage = kindFromMessage(message);
  const isTypeError = /^(TypeError|ReferenceError|RangeError|SyntaxError)$/.test(name);
  // `fetch failed` arrives as a bare TypeError with the real reason on `.cause`.
  const causeMessage = str((e.cause as Record<string, unknown> | undefined)?.message);
  const fromCause = causeMessage ? kindFromMessage(causeMessage) : null;

  const resolved =
    fromCause ??
    fromMessage ??
    fromStatus ??
    (isTypeError ? { kind: "runtime" as ErrorKind, severity: "error" as Severity } : null) ??
    { kind: "unknown" as ErrorKind, severity: "error" as Severity };

  return base({
    name,
    message: message || str(err) || "Unknown error",
    kind: resolved.kind,
    severity: resolved.severity,
    code: sysCode || (Number.isFinite(status) ? String(status) : null),
    httpStatus: Number.isFinite(status) ? status : null,
    stack: str(e.stack) || null,
    extra: causeMessage ? { cause: clamp(redactText(causeMessage), 500) } : null,
  });
}

function base(input: {
  name: string;
  message: string;
  kind: ErrorKind;
  severity?: Severity;
  code?: string | null;
  stack?: string | null;
  dbDetails?: DbDetails | null;
  httpStatus?: number | null;
  extra?: Record<string, unknown> | null;
}): Classified {
  const raw = input.message || "Unknown error";
  return {
    name: input.name || "Error",
    message: clamp(redactText(raw), 1000) ?? "Unknown error",
    rawMessage: clamp(redactText(raw), 4000) ?? "Unknown error",
    code: input.code ?? null,
    kind: input.kind,
    severity: input.severity ?? "error",
    stack: clamp(redactText(input.stack), 12000),
    dbDetails: input.dbDetails ?? null,
    httpStatus: input.httpStatus ?? null,
    extra: input.extra ?? null,
  };
}
