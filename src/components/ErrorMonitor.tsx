"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/errors/report-client";

// ---------------------------------------------------------------------------
// The browser-wide net, mounted once in the root layout.
//
// React error boundaries only catch errors thrown during RENDER. Everything else
// a browser can do wrong escapes them entirely:
//
//   • a throw inside an event handler, a setTimeout or a ResizeObserver
//   • a promise rejected with nobody to catch it
//   • a <script>/<img>/<link> that failed to load
//   • an API call that came back 500, or never came back at all
//
// The three listeners below cover the first three; the fetch wrapper covers the
// last. All four OBSERVE ONLY — they never swallow an event, never change a
// result, and never prevent the default behaviour. Uninstalled on unmount so
// Strict Mode's double-invoke and fast refresh cannot stack duplicates.
// ---------------------------------------------------------------------------

export default function ErrorMonitor() {
  useEffect(() => {
    // --- uncaught exceptions -------------------------------------------------
    const onError = (event: ErrorEvent) => {
      // A failed subresource fires an ErrorEvent with no `error` and the element
      // as the target — a different problem, and worth telling apart.
      if (!event.error && event.target && event.target !== window) {
        const el = event.target as HTMLElement & { src?: string; href?: string };
        const src = el.src || el.href;
        if (src) {
          reportClientError(new Error(`Failed to load ${el.tagName?.toLowerCase() ?? "resource"}`), {
            severity: "warning",
            context: { resource: String(src).slice(0, 500), tag: el.tagName },
          });
        }
        return;
      }
      reportClientError(event.error ?? event.message, {
        context: {
          handler: "window.onerror",
          at: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : null,
        },
      });
    };

    // --- unhandled promise rejections ---------------------------------------
    const onRejection = (event: PromiseRejectionEvent) => {
      reportClientError(event.reason, {
        context: { handler: "unhandledrejection" },
      });
    };

    // `true` — resource load failures do not bubble, so they are only visible
    // during the capture phase.
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);

    // --- failed API calls ----------------------------------------------------
    // Wraps fetch to notice our own endpoints failing. Strictly pass-through:
    // the original promise is returned untouched, so a caller that handles its
    // own errors is completely unaffected.
    const originalFetch = window.fetch;
    const wrapped: typeof window.fetch = async (input, init) => {
      const url = requestUrl(input);
      // Never observe the reporter itself — that is how a loop starts.
      if (url && url.includes("/api/errors/")) return originalFetch(input, init);

      try {
        const response = await originalFetch(input, init);
        // Only our own origin: a 500 from a third party is their business, and
        // reporting every cross-origin failure would be noise we cannot act on.
        if (!response.ok && response.status >= 500 && isSameOrigin(url)) {
          reportClientError(new Error(`Request failed with ${response.status}`), {
            severity: "error",
            apiEndpoint: pathOf(url),
            httpStatus: response.status,
            context: { handler: "fetch", method: methodOf(input, init) },
          });
        }
        return response;
      } catch (err) {
        if (isSameOrigin(url)) {
          reportClientError(err, {
            apiEndpoint: pathOf(url),
            context: { handler: "fetch", method: methodOf(input, init) },
          });
        }
        throw err; // pass-through — the caller's error handling is untouched
      }
    };
    window.fetch = wrapped;

    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
      // Only restore if nothing else has wrapped fetch since; clobbering another
      // wrapper would be worse than leaving ours in place.
      if (window.fetch === wrapped) window.fetch = originalFetch;
    };
  }, []);

  return null;
}

function requestUrl(input: RequestInfo | URL): string | null {
  try {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return (input as Request).url ?? null;
  } catch {
    return null;
  }
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method || (input as Request)?.method || "GET").toUpperCase();
}

function isSameOrigin(url: string | null): boolean {
  if (!url) return false;
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

function pathOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url, window.location.href).pathname;
  } catch {
    return null;
  }
}
