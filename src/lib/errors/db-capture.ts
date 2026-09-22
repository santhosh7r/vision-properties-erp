import { captureErrorSync } from "./capture";
import type { Severity } from "./types";

// ---------------------------------------------------------------------------
// The bridge between the instrumented Supabase client (lib/supabase.ts) and the
// capture layer.
//
// It exists as its own module for one reason: lib/supabase.ts must be able to
// report an error without importing the capture layer's world, and the capture
// layer must never import lib/supabase. Keeping the seam here makes that
// one-way dependency obvious and impossible to reintroduce by accident.
//
// It also owns the NOISE POLICY. PostgREST returns an `error` for things that
// are ordinary control flow in this codebase, and a monitoring table that fills
// up with them is a monitoring table nobody reads.
// ---------------------------------------------------------------------------

/** Never report on these — the error path's own traffic. */
const SELF_TABLES = new Set(["error_logs"]);

/**
 * Codes that are a normal outcome rather than a fault, and the severity they are
 * worth recording at. They ARE recorded — knowing a `.single()` found no row is
 * occasionally the clue — but at `info`, so the default view of the Error Logs
 * page (warnings and above) stays signal.
 */
const DOWNGRADE: Record<string, Severity> = {
  PGRST116: "info", // .single() matched zero rows, or more than one
  P0002: "info", // no_data_found raised inside a function
};

export function captureDbError(
  err: unknown,
  operation: string,
  table: string | undefined,
  rejected: boolean,
): void {
  try {
    if (table && SELF_TABLES.has(table)) return;

    const code =
      err && typeof err === "object" ? String((err as { code?: unknown }).code ?? "") : "";
    const severity = DOWNGRADE[code];

    // `kind` is deliberately left to classification. A transport-level
    // rejection is a network fault wearing a database call's clothes, and
    // forcing `database` here would hide that.
    captureErrorSync(err, {
      severity,
      context: {
        supabase_operation: operation,
        supabase_target: table ?? null,
        // Distinguishes "PostgREST answered with an error" from "the call never
        // completed" — the same SQLSTATE means very different things either way.
        delivery: rejected ? "rejected" : "returned",
      },
    });
  } catch {
    // The reporting path must never disturb the query that triggered it.
  }
}
