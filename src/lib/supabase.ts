import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { captureDbError } from "./errors/db-capture";

// Server-only Supabase client using the service role key.
// All data access goes through here (this is an internal back-office tool;
// access control is enforced at the application layer via roles).
//
// ── Error monitoring ────────────────────────────────────────────────────────
// The client handed out by getSupabase() is INSTRUMENTED: every query,
// mutation, RPC and storage call made anywhere in the app is observed, and any
// `{ error }` it resolves with is reported to the error monitoring system
// automatically. That is deliberate and is the reason this wrapper exists —
// PostgREST does not throw, it returns, so the dozens of call sites across the
// app that destructure `{ data }` and ignore `{ error }` were silently dropping
// every database failure on the floor. Instrumenting the client means they are
// all covered at once, and no future query has to remember to opt in.
//
// Observation only: the proxy never changes a result, never swallows an error
// and never adds a round-trip. If the monitoring side fails it is discarded.
//
// getRawSupabase() returns the UNinstrumented client — used by the error
// ingestion path itself, so writing a log can never recurse into logging.

let cached: SupabaseClient | null = null;
let rawCached: SupabaseClient | null = null;

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function create(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Copy .env.local.example to .env.local and fill in NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * The client every feature uses. Instrumented — see the note above.
 */
export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  cached = instrument(create());
  return cached;
}

/**
 * The client the error ingestion path uses. NOT instrumented, so a failure while
 * writing an error log cannot trigger another error log.
 */
export function getRawSupabase(): SupabaseClient {
  if (rawCached) return rawCached;
  rawCached = create();
  return rawCached;
}

// ---------------------------------------------------------------------------
// Instrumentation
//
// postgrest-js builds a query by chaining: `.from(t)` gives a QueryBuilder,
// `.select()/.insert()/…` give a FilterBuilder, the filter methods return
// `this`, and the whole thing is a thenable that resolves to `{ data, error }`.
//
// So the wrapper has to do two things and nothing else:
//   • follow the chain — wrap whatever a method returns, and hand the proxy back
//     (not the raw builder) when a method returns `this`, or the chain would
//     escape after the first `.eq()`;
//   • intercept `then` — look at the resolved value on the way past.
//
// Methods are invoked with the ORIGINAL object as `this`, never the proxy, so
// private fields and internal identity checks inside the library behave exactly
// as they would without the wrapper.
// ---------------------------------------------------------------------------

interface CallMeta {
  op: string;
  table?: string;
}

function isWrappable(v: unknown): v is object {
  if (v === null || typeof v !== "object") return false;
  if (Array.isArray(v)) return false;
  // Plain result objects ({ data, error }) are left alone; builders, promises
  // and other class instances are followed.
  const proto = Object.getPrototypeOf(v);
  return proto !== null && proto !== Object.prototype;
}

function wrap<T extends object>(target: T, meta: CallMeta): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      const value = Reflect.get(t, prop);

      if (prop === "then" && typeof value === "function") {
        return (
          onFulfilled?: ((v: unknown) => unknown) | null,
          onRejected?: ((r: unknown) => unknown) | null,
        ) =>
          Reflect.apply(value, t, [
            (result: unknown) => {
              observe(result, meta);
              return onFulfilled ? onFulfilled(result) : result;
            },
            (reason: unknown) => {
              // A rejection here is a transport failure (DNS, socket, abort)
              // rather than a PostgREST error payload — worth recording too.
              captureDbError(reason, meta.op, meta.table, true);
              if (onRejected) return onRejected(reason);
              throw reason;
            },
          ]);
      }

      if (typeof value === "function") {
        return (...args: unknown[]) => {
          const out = Reflect.apply(value, t, args);
          if (out === t) return receiver; // chained filter — keep the proxy
          return isWrappable(out) ? wrap(out, meta) : out;
        };
      }

      return value;
    },
  });
}

function observe(result: unknown, meta: CallMeta): void {
  if (!result || typeof result !== "object") return;
  const r = result as { error?: unknown };
  if (!r.error) return;
  captureDbError(r.error, meta.op, meta.table, false);
}

function instrument(client: SupabaseClient): SupabaseClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop);

      if (prop === "from" && typeof value === "function") {
        return (table: string, ...rest: unknown[]) =>
          wrap(Reflect.apply(value, target, [table, ...rest]) as object, {
            op: "query",
            table,
          });
      }
      if (prop === "rpc" && typeof value === "function") {
        return (fn: string, ...rest: unknown[]) =>
          wrap(Reflect.apply(value, target, [fn, ...rest]) as object, { op: "rpc", table: fn });
      }
      if (prop === "schema" && typeof value === "function") {
        // `.schema('x').from(...)` returns another client-like object; keep it
        // instrumented so a non-public schema is covered too.
        return (name: string) => instrument(Reflect.apply(value, target, [name]) as SupabaseClient);
      }
      if (prop === "storage" && isWrappable(value)) {
        return wrap(value, { op: "storage" });
      }

      if (typeof value === "function") {
        return (...args: unknown[]) => Reflect.apply(value, target, args);
      }
      // Fall back to the receiver-aware read for getters that need `this`.
      return value === undefined ? Reflect.get(target, prop, receiver) : value;
    },
  });
}
