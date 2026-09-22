// ---------------------------------------------------------------------------
// The vocabulary of the error system. Deliberately isomorphic — no `server-only`
// import — because the browser reporter, the ingestion route, the capture layer
// and the developer Error Logs page all have to agree on these shapes.
// ---------------------------------------------------------------------------

/** How bad is it? Ordered; `record_error` promotes but never demotes. */
export type Severity = "info" | "warning" | "error" | "critical";

export const SEVERITIES: Severity[] = ["info", "warning", "error", "critical"];

export const SEVERITY_LABEL: Record<Severity, string> = {
  info: "Info",
  warning: "Warning",
  error: "Error",
  critical: "Critical",
};

/** Where a human has got to with it. Mirrors the CHECK on error_logs.status. */
export type ErrorStatus = "new" | "investigating" | "in_progress" | "resolved" | "ignored";

export const ERROR_STATUSES: ErrorStatus[] = [
  "new",
  "investigating",
  "in_progress",
  "resolved",
  "ignored",
];

export const STATUS_LABEL: Record<ErrorStatus, string> = {
  new: "New",
  investigating: "Investigating",
  in_progress: "In progress",
  resolved: "Resolved",
  ignored: "Ignored",
};

/**
 * Which layer produced it. This is the "where was the code running" axis, kept
 * separate from `kind` (what sort of failure it was) so a database error from a
 * server action and the same one from a route handler group together by kind but
 * stay tellable apart.
 */
export type ErrorSource =
  | "browser" // React render, event handler, unhandled rejection in the tab
  | "rsc" // React Server Component / page render
  | "action" // Next.js server action
  | "route" // route handler (app/api/**/route.ts)
  | "middleware"
  | "edge"
  | "node" // process-level: uncaughtException / unhandledRejection
  | "server"; // anything else running on the server

export const ERROR_SOURCES: ErrorSource[] = [
  "browser",
  "rsc",
  "action",
  "route",
  "middleware",
  "edge",
  "node",
  "server",
];

export const SOURCE_LABEL: Record<ErrorSource, string> = {
  browser: "Browser",
  rsc: "Server component",
  action: "Server action",
  route: "API route",
  middleware: "Middleware",
  edge: "Edge",
  node: "Node process",
  server: "Server",
};

/**
 * What KIND of failure it is. This is the axis the friendly user-facing message
 * is chosen from, and the axis a developer filters by. Keep it coarse: a longer
 * list is a worse list, because every branch here needs a sentence a customer
 * can read.
 */
export type ErrorKind =
  | "database" // Postgres / PostgREST / RLS / RPC
  | "storage" // Supabase Storage
  | "auth" // not signed in, session expired, bad credentials
  | "permission" // signed in, not allowed
  | "validation" // the input was wrong
  | "conflict" // uniqueness / concurrent edit / already-done
  | "not_found"
  | "network" // fetch failed, DNS, connection reset, upstream down
  | "timeout"
  | "rate_limit"
  | "integration" // third-party API / webhook returned a failure
  | "config" // the app is missing an env var / is misconfigured
  | "runtime" // TypeError and friends — a bug in our code
  | "unknown";

export const ERROR_KINDS: ErrorKind[] = [
  "database",
  "storage",
  "auth",
  "permission",
  "validation",
  "conflict",
  "not_found",
  "network",
  "timeout",
  "rate_limit",
  "integration",
  "config",
  "runtime",
  "unknown",
];

export const KIND_LABEL: Record<ErrorKind, string> = {
  database: "Database",
  storage: "File storage",
  auth: "Authentication",
  permission: "Authorization",
  validation: "Validation",
  conflict: "Conflict",
  not_found: "Not found",
  network: "Network",
  timeout: "Timeout",
  rate_limit: "Rate limit",
  integration: "Integration",
  config: "Configuration",
  runtime: "Runtime",
  unknown: "Unknown",
};

/** Structured Supabase/Postgres detail, already redacted. */
export interface DbDetails {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  table?: string | null;
  constraint?: string | null;
  operation?: string | null;
}

/**
 * Everything the call site knows that the error object itself does not. Every
 * field is optional: the capture layer fills what it can from the request and
 * never refuses to log because something was missing.
 */
export interface ErrorContext {
  source?: ErrorSource;
  /** Feature area — "bookings", "payments". Derived from the route when absent. */
  module?: string | null;
  route?: string | null;
  apiEndpoint?: string | null;
  httpMethod?: string | null;
  httpStatus?: number | null;
  requestId?: string | null;
  url?: string | null;
  userAgent?: string | null;
  componentStack?: string | null;
  /** Forces a severity; otherwise classification decides. */
  severity?: Severity;
  /** Forces a kind; otherwise classification decides. */
  kind?: ErrorKind;
  /** Arbitrary extra key/values. Redacted, then capped, before storage. */
  context?: Record<string, unknown> | null;
  /** Next.js `digest`, so a boundary on the client can be tied to its server log. */
  digest?: string | null;
  /** Client-supplied event id, so the reference the user saw matches the row. */
  eventId?: string | null;
  /** When it happened, if not "now". ISO 8601. */
  occurredAt?: string | null;
  /** Number of occurrences this report stands for (throttled batching). */
  count?: number;
  user?: {
    id?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
}

/** What `captureError` hands back. Never throws, so every field is optional. */
export interface CaptureResult {
  /** The per-occurrence reference shown to the user. Always present. */
  eventId: string;
  /** The group's short code (ERR-XXXXXXX) — absent if the write failed. */
  shortId?: string;
  /** The error_logs row id — absent if the write failed. */
  id?: string;
  /** False when the row could not be written (logging fails silently). */
  logged: boolean;
}

/** One row of the developer Error Logs page. */
export interface ErrorLogRow {
  id: string;
  fingerprint: string;
  short_id: string;
  name: string | null;
  message: string | null;
  raw_message: string | null;
  code: string | null;
  kind: string;
  severity: Severity;
  source: string;
  module: string | null;
  route: string | null;
  api_endpoint: string | null;
  http_method: string | null;
  http_status: number | null;
  stack: string | null;
  component_stack: string | null;
  db_details: DbDetails | null;
  context: Record<string, unknown> | null;
  request_id: string | null;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  url: string | null;
  user_agent: string | null;
  browser: string | null;
  os: string | null;
  device: string | null;
  runtime: string | null;
  environment: string;
  release: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  last_event_id: string | null;
  recent: ErrorOccurrence[];
  affected_users: AffectedUser[];
  status: ErrorStatus;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ErrorOccurrence {
  event_id?: string;
  at?: string;
  source?: string;
  route?: string;
  api_endpoint?: string;
  http_status?: number;
  request_id?: string;
  user_id?: string;
  user_email?: string;
  user_role?: string;
  environment?: string;
  release?: string;
  message?: string;
}

export interface AffectedUser {
  id?: string;
  email?: string;
  role?: string;
  at?: string;
}
