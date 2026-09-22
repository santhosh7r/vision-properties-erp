import type { Instrumentation } from "next";

// ---------------------------------------------------------------------------
// The framework-level capture hook. This is what makes the system GLOBAL rather
// than per-page.
//
// `onRequestError` is called by Next.js for EVERY uncaught server-side error, in
// every server layer: server components, server actions, route handlers,
// middleware, the RSC payload, streaming renders — including code written next
// month that knows nothing about this system. Nothing has to opt in, and no page
// can forget.
//
// `register()` adds the two process-level nets underneath it: an unhandled
// promise rejection or an uncaught exception outside any request (a timer, a
// detached async call, a background task) would otherwise be invisible.
// ---------------------------------------------------------------------------

let processHandlersInstalled = false;

export async function register(): Promise<void> {
  // The Edge runtime has no process to attach to, and onRequestError already
  // covers everything that runs there.
  //
  // Tested by exclusion rather than by `=== "nodejs"`: NEXT_RUNTIME is not set
  // on every host, and requiring it meant these handlers were silently never
  // installed — an unhandled rejection outside a request went unrecorded, which
  // is exactly the case they exist for.
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (typeof process?.on !== "function") return;
  // register() can run more than once (fast refresh, multiple entrypoints).
  if (processHandlersInstalled) return;
  processHandlersInstalled = true;

  // The capture module is loaded lazily, INSIDE each handler, rather than once
  // here. Instrumentation is loaded by Next in its own bootstrap context; if
  // that import were to fail at registration time the whole function would
  // reject and NEITHER handler would ever be installed — the failure mode is
  // silent and total. Resolving it per-event means a bad import costs one lost
  // log line instead of the entire process-level net.
  const report = async (err: unknown, severity: "error" | "critical", handler: string) => {
    try {
      const { captureErrorSync } = await import("./lib/errors/capture");
      captureErrorSync(err, {
        source: "node",
        module: "process",
        severity,
        context: { handler },
      });
    } catch {
      /* nothing left to do — never let the reporter crash the process */
    }
  };

  process.on("unhandledRejection", (reason: unknown) => {
    void report(reason, "error", "unhandledRejection");
  });

  process.on("uncaughtException", (err: unknown) => {
    // Critical: the process is in an undefined state from here on. We record it
    // and deliberately do NOT exit — Next.js owns that decision, and killing the
    // server from inside a logging hook would turn one bad request into an
    // outage.
    void report(err, "critical", "uncaughtException");
  });
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  try {
    const { captureError } = await import("./lib/errors/capture");
    const { moduleForPath } = await import("./lib/errors/messages");
    const { decodeSessionToken, SESSION_COOKIE } = await import("./lib/session");
    const { requestIdFrom } = await import("./lib/errors/runtime");

    const headers = new Headers(
      Object.entries(request.headers ?? {}).flatMap(([k, v]) =>
        v === undefined ? [] : [[k, Array.isArray(v) ? v.join(", ") : String(v)] as [string, string]],
      ),
    );

    // Read the signed-in user straight off the cookie. No database round-trip:
    // this hook runs while a request is already failing, and a query here could
    // fail too.
    const cookie = headers.get("cookie") ?? "";
    const token = cookie
      .split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith(`${SESSION_COOKIE}=`))
      ?.slice(SESSION_COOKIE.length + 1);
    const user = await decodeSessionToken(token ? decodeURIComponent(token) : null);

    const path = request.path ?? null;
    const isApi = Boolean(path && path.startsWith("/api/"));

    await captureError(err, {
      source: sourceFor(context.routerKind, context.routeType, isApi),
      route: path,
      apiEndpoint: isApi ? (context.routePath ?? path) : null,
      httpMethod: request.method ?? null,
      module: moduleForPath(path),
      requestId: requestIdFrom(headers),
      userAgent: headers.get("user-agent"),
      url: path,
      user: user ? { id: user.id, email: user.email, role: user.role } : null,
      context: {
        router: context.routerKind,
        route_type: context.routeType,
        route_path: context.routePath,
        // Next.js gives the browser only this digest for a server error; it is
        // the single thread tying what the user saw to this row.
        rendered_by: context.renderSource ?? null,
      },
    });
  } catch {
    // A failure inside the error hook must never surface. Next.js would log it
    // to stdout and, worse, it could mask the original error.
  }
};

function sourceFor(
  routerKind: string,
  routeType: string,
  isApi: boolean,
): "action" | "route" | "rsc" | "middleware" | "server" {
  if (routeType === "action") return "action";
  if (routeType === "middleware") return "middleware";
  if (routeType === "route" || isApi) return "route";
  if (routerKind === "App Router" || routeType === "render") return "rsc";
  return "server";
}
