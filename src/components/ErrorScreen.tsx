"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { reportClientError } from "@/lib/errors/report-client";
import { friendlyMessage } from "@/lib/errors/messages";
import { classifyError } from "@/lib/errors/classify";
import type { ErrorSource } from "@/lib/errors/types";

// ---------------------------------------------------------------------------
// What a caught render error looks like to a user. Used by every error boundary
// in the app.
//
// The rule it enforces: `error` goes to the REPORTER, never to the screen. The
// object arrives with a real message and a real stack (in development, always;
// in production, for client-side errors), and none of it is rendered. What the
// user gets is a sentence chosen from the error's classified kind, plus a
// reference code — and that is identical for an Admin, a Developer and a
// Business Partner. A developer who wants the stack opens Error Logs.
//
// `error.digest` is Next.js's own id for a server error; it is passed to the
// reporter so a client boundary and its server log line up.
// ---------------------------------------------------------------------------

export default function ErrorScreen({
  error,
  reset,
  source = "browser",
  /** Rendered standalone (global-error) rather than inside the app shell. */
  standalone = false,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  source?: ErrorSource;
  standalone?: boolean;
}) {
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    // One report per distinct error instance, not one per re-render.
    const id = reportClientError(error, {
      source,
      digest: error?.digest ?? null,
      severity: "error",
      context: { boundary: standalone ? "global-error" : "error" },
    });
    setReference(id);
  }, [error, source, standalone]);

  const friendly = friendlyMessage(classifyError(error).kind);

  return (
    <div
      className="flex min-h-[60vh] w-full items-center justify-center p-6"
      style={standalone ? { minHeight: "100vh", background: "var(--background)" } : undefined}
    >
      <div className="w-full max-w-md text-center">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-bold"
          style={{ background: "var(--brand-red-soft)", color: "var(--brand-red)" }}
          aria-hidden
        >
          !
        </div>

        <h1 className="mt-5 text-[19px] font-semibold tracking-tight">{friendly.title}</h1>
        <p className="mt-2 text-sm text-[var(--text-2)]">{friendly.message}</p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {reset && (
            <button type="button" className="btn-primary" onClick={() => reset()}>
              Try again
            </button>
          )}
          {standalone ? (
            <a href="/dashboard" className="btn-ghost">
              Go to dashboard
            </a>
          ) : (
            <Link href="/dashboard" className="btn-ghost">
              Go to dashboard
            </Link>
          )}
        </div>

        {reference && (
          <p className="mt-6 text-[11px] text-[var(--muted)]">
            Reference: <span className="font-mono font-medium">{reference}</span>
            <br />
            Quote this if you contact support.
          </p>
        )}
      </div>
    </div>
  );
}
