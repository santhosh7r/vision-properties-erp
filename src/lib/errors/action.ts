import "server-only";
import { captureError } from "./capture";
import { classifyError, isBenignAbort, isControlFlow } from "./classify";
import { friendlyLine, friendlyMessage, type MessageOptions } from "./messages";
import type { ErrorContext, ErrorKind } from "./types";

// ---------------------------------------------------------------------------
// Server-side helpers for the two shapes a failure takes in this codebase.
//
// Next.js's onRequestError (src/instrumentation.ts) already catches everything
// a server action or route handler THROWS. These helpers are for the other half:
// code that wants to keep rendering and hand the user a message back, typically
// as the `{ error }` that this app's actions already return to their forms.
//
// The contract every one of them keeps:
//   • framework control flow (redirect / notFound) is re-thrown untouched —
//     swallowing it would silently break navigation;
//   • the raw error is captured;
//   • what comes back is friendly text plus a reference code, never the
//     original message.
// ---------------------------------------------------------------------------

export interface FailureResult {
  ok: false;
  /** The sentence to render. Always safe to show to any user. */
  error: string;
  /** Heading, when the surface has room for one. */
  title: string;
  /** The code to quote to support — matches the Error Logs row. */
  reference: string;
  kind: ErrorKind;
}

/**
 * Report an error and get back something safe to show. The building block the
 * other helpers are written in terms of; reach for it directly inside an
 * existing try/catch.
 *
 *   } catch (err) {
 *     const failure = await toFailure(err, { subject: "booking", action: "saved" });
 *     return { error: failure.error };
 *   }
 */
export async function toFailure(
  err: unknown,
  options: MessageOptions & { context?: ErrorContext } = {},
): Promise<FailureResult> {
  if (isControlFlow(err)) throw err;

  const { kind } = classifyError(err);
  const { eventId } = await captureError(err, {
    source: "action",
    ...(options.context ?? {}),
  });
  const friendly = friendlyMessage(kind, options);

  return {
    ok: false,
    error: friendlyLine(kind, eventId, options),
    title: friendly.title,
    reference: eventId,
    kind,
  };
}

/**
 * Wrap a server action body. Anything thrown inside is captured and converted;
 * the action's own return value passes straight through.
 *
 *   export async function saveBooking(form: FormData) {
 *     return guardAction(
 *       async () => { ...; return { ok: true }; },
 *       { subject: "booking", action: "saved" },
 *     );
 *   }
 *
 * Note the return type: callers must already handle `{ error }`, which every
 * form in this app does.
 */
export async function guardAction<T>(
  fn: () => Promise<T>,
  options: MessageOptions & { context?: ErrorContext } = {},
): Promise<T | FailureResult> {
  try {
    return await fn();
  } catch (err) {
    if (isControlFlow(err)) throw err;
    return toFailure(err, options);
  }
}

/**
 * For work that is allowed to fail without the page failing — a side panel's
 * count, an optional lookup, a best-effort enrichment. The error is still
 * recorded (that is the difference from a bare `catch {}`, which is how a bug
 * stays invisible for six months) and the caller gets the fallback.
 */
export async function guardOptional<T>(
  fn: () => Promise<T>,
  fallback: T,
  context: ErrorContext = {},
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isControlFlow(err)) throw err;
    if (!isBenignAbort(err)) {
      await captureError(err, { severity: "warning", ...context });
    }
    return fallback;
  }
}

/**
 * Turn a Supabase `{ error }` into a thrown, captured failure at the point it
 * happened. The instrumented client already RECORDS every such error, but a
 * `{ data }` destructure that ignores `error` still carries on with `null` data;
 * this is how a call site says "this one actually has to have worked".
 *
 *   const { data, error } = await sb.from("plots").select("*");
 *   assertOk(error, "load plots");
 */
export function assertOk(
  error: unknown,
  operation: string,
): asserts error is null | undefined {
  if (!error) return;
  const e = error as { message?: string };
  const wrapped = new Error(`${operation} failed: ${e?.message ?? "database error"}`);
  // Carry the original across so classification still sees the SQLSTATE, the
  // details and the hint rather than just our sentence.
  Object.assign(wrapped, error, { name: "SupabaseError" });
  throw wrapped;
}
