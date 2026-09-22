import type { ErrorKind } from "./types";

// ---------------------------------------------------------------------------
// USER-FACING COPY — the only text the application UI is ever allowed to show
// for a failure.
//
// Everything a user sees is chosen from `kind`, which is a closed set. That is
// the structural guarantee behind "never expose raw technical errors": there is
// no branch anywhere that falls through to the original message, because the
// original message is not an input to this file. A failure mode nobody has seen
// before classifies as `unknown` and gets the `unknown` sentence — it cannot
// leak, because there is nothing here to leak it through.
//
// The same is true for a developer login. Seniority does not change what the
// app renders; the raw detail lives on the Error Logs page and nowhere else.
// ---------------------------------------------------------------------------

export interface FriendlyMessage {
  /** Short heading, e.g. "Could not save". */
  title: string;
  /** One or two sentences: what happened and what to do next. */
  message: string;
  /** True when trying the exact same thing again is likely to work. */
  retryable: boolean;
}

/**
 * What the user was trying to do, in the app's own words. Passed in by the call
 * site so the sentence is contextual ("This booking could not be saved") rather
 * than generic ("Something went wrong"). Optional everywhere — the generic form
 * is always correct, just less helpful.
 */
export interface MessageOptions {
  /** The thing being acted on: "booking", "payment", "partner". Singular. */
  subject?: string | null;
  /** The verb, past participle: "saved", "cancelled", "loaded". */
  action?: string | null;
}

function subjectPhrase(o: MessageOptions | undefined, fallback: string): string {
  const s = o?.subject?.trim();
  return s ? `This ${s}` : fallback;
}

const BY_KIND: Record<ErrorKind, (o?: MessageOptions) => FriendlyMessage> = {
  database: (o) => ({
    title: "Could not complete that",
    message: `${subjectPhrase(o, "That")} could not be ${o?.action ?? "saved"} right now. Nothing has been changed — please try again in a moment.`,
    retryable: true,
  }),

  storage: () => ({
    title: "File could not be processed",
    message:
      "The file could not be uploaded or opened. Please check the file and try again.",
    retryable: true,
  }),

  auth: () => ({
    title: "Please sign in again",
    message: "Your session has ended. Sign in again to carry on where you left off.",
    retryable: false,
  }),

  permission: (o) => ({
    title: "Not allowed",
    message: `You do not have permission to ${o?.action ? `${o.action} this` : "do that"}. If you think you should, ask an administrator to check your access.`,
    retryable: false,
  }),

  validation: () => ({
    title: "Please check the details",
    message:
      "Some of the information entered is missing or not in the expected format. Please review the highlighted fields and try again.",
    retryable: false,
  }),

  conflict: (o) => ({
    title: "That conflicts with an existing record",
    message: `${subjectPhrase(o, "That")} clashes with something already on file — it may have been created or changed by someone else. Refresh the page and check before trying again.`,
    retryable: false,
  }),

  not_found: (o) => ({
    title: "Not found",
    message: `${subjectPhrase(o, "That record")} could not be found. It may have been removed, or the link may be out of date.`,
    retryable: false,
  }),

  network: () => ({
    title: "Connection problem",
    message:
      "We could not reach the server. Check your internet connection and try again.",
    retryable: true,
  }),

  timeout: () => ({
    title: "That took too long",
    message:
      "The request timed out before it finished. Please try again — if it keeps happening, try again in a few minutes.",
    retryable: true,
  }),

  rate_limit: () => ({
    title: "Too many attempts",
    message: "You have tried that too many times in a row. Please wait a minute and try again.",
    retryable: true,
  }),

  integration: () => ({
    title: "A connected service is unavailable",
    message:
      "An external service we depend on did not respond. Your work has not been lost — please try again shortly.",
    retryable: true,
  }),

  config: () => ({
    title: "Temporarily unavailable",
    message:
      "This part of the system is not available at the moment. It has been reported to the technical team.",
    retryable: false,
  }),

  runtime: (o) => ({
    title: "Something went wrong",
    message: `${subjectPhrase(o, "That")} could not be ${o?.action ?? "completed"}. The problem has been reported to the technical team — please try again.`,
    retryable: true,
  }),

  unknown: () => ({
    title: "Something went wrong",
    message:
      "An unexpected problem stopped that from finishing. It has been reported to the technical team — please try again.",
    retryable: true,
  }),
};

/** The sentence a user sees for a given kind of failure. */
export function friendlyMessage(kind: ErrorKind, options?: MessageOptions): FriendlyMessage {
  return (BY_KIND[kind] ?? BY_KIND.unknown)(options);
}

/**
 * The one-line form, for a toast, a form-level error or a `{ error }` returned
 * from a server action. Includes the reference code when there is one, because
 * that is the only thing that connects what the user saw to what a developer can
 * look up.
 */
export function friendlyLine(
  kind: ErrorKind,
  reference?: string | null,
  options?: MessageOptions,
): string {
  const { message } = friendlyMessage(kind, options);
  return reference ? `${message} (Reference: ${reference})` : message;
}

// ---------------------------------------------------------------------------
// MODULES — the feature areas an error is grouped under. Derived from the route
// so every existing and future page is covered without a registration step.
// ---------------------------------------------------------------------------
const MODULE_BY_PREFIX: [string, string][] = [
  ["/api/errors", "error-monitoring"],
  ["/dev/error-logs", "error-monitoring"],
  ["/inventory/import", "inventory-import"],
  ["/inventory/release", "plot-release"],
  ["/inventory", "inventory"],
  ["/available-plots", "inventory"],
  ["/bookings", "bookings"],
  ["/post-sales", "post-sales"],
  ["/payments", "payments"],
  ["/receipts", "receipts"],
  ["/registrations", "registrations"],
  ["/customers", "customers"],
  ["/projects", "projects"],
  ["/plots", "plots"],
  ["/users", "partners"],
  ["/in-house", "in-house-team"],
  ["/business-operators", "tokens"],
  ["/tokens", "tokens"],
  ["/requests", "requests"],
  ["/feedback", "feedback"],
  ["/f/", "feedback-public"],
  ["/reports", "reports"],
  ["/activity", "activity-log"],
  ["/page-config", "page-config"],
  ["/settings", "settings"],
  ["/profile", "profile"],
  ["/dashboard", "dashboard"],
  ["/login", "auth"],
  ["/change-password", "auth"],
  ["/complete-profile", "onboarding"],
  ["/api", "api"],
];

/** Which feature area does this path belong to? "app" when nothing matches. */
export function moduleForPath(pathname: string | null | undefined): string {
  if (!pathname) return "app";
  let path = pathname;
  // Accept a full URL as well as a path.
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      /* keep the original */
    }
  }
  const hit = MODULE_BY_PREFIX.find(([p]) => path === p || path.startsWith(p));
  return hit?.[1] ?? "app";
}
