import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { captureError } from "@/lib/errors/capture";
import { moduleForPath } from "@/lib/errors/messages";
import { clientKey, rateLimit } from "@/lib/errors/rate-limit";
import { requestIdFrom } from "@/lib/errors/runtime";
import { ERROR_SOURCES, SEVERITIES } from "@/lib/errors/types";
import { decodeSessionToken, SESSION_COOKIE } from "@/lib/session";

// ---------------------------------------------------------------------------
// POST /api/errors/report — the browser's way into the error log.
//
// This is the only unauthenticated write path in the application, because it has
// to be: the errors most worth seeing are the ones on the login screen and the
// public feedback form, where there is no session yet. Everything below exists
// to make that safe.
//
//   • The service-role key never leaves the server. The browser posts a plain
//     JSON description of what happened; this route decides what is stored.
//   • The payload is validated and size-capped BEFORE anything is read from it.
//   • Identity is taken from the session cookie on the server. A client claim
//     about who it is would be trusted by nobody and is not even parsed.
//   • Rate-limited per address, and again per session, so the endpoint cannot be
//     used to flood the table.
//   • It answers 204 whatever happens. A reporting endpoint that returns errors
//     would have the browser reporting the failure of its own error report.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generous enough for a real React stack + component stack, small enough that a
// body this size cannot be used as an upload channel.
const MAX_BODY_BYTES = 64 * 1024;

// Per address: a broken page can legitimately fire a burst, so the window is
// short and the allowance is not stingy. Sustained abuse still hits the wall.
const IP_LIMIT = 30;
const IP_WINDOW_MS = 60_000;
const SESSION_LIMIT = 60;
const SESSION_WINDOW_MS = 60_000;

const Payload = z.object({
  name: z.string().max(200).optional(),
  message: z.string().max(4000).optional(),
  stack: z.string().max(20_000).optional(),
  componentStack: z.string().max(20_000).optional(),
  // The browser's own reference, so what the user was shown matches the row.
  eventId: z.string().max(60).optional(),
  digest: z.string().max(200).optional(),
  route: z.string().max(500).optional(),
  url: z.string().max(1000).optional(),
  source: z.enum(ERROR_SOURCES as [string, ...string[]]).optional(),
  severity: z.enum(SEVERITIES as [string, ...string[]]).optional(),
  kind: z.string().max(40).optional(),
  httpStatus: z.number().int().min(100).max(599).optional(),
  apiEndpoint: z.string().max(500).optional(),
  occurredAt: z.string().max(40).optional(),
  count: z.number().int().min(1).max(500).optional(),
  context: z.record(z.unknown()).optional(),
});

function noContent(headers?: Record<string, string>): NextResponse {
  return new NextResponse(null, { status: 204, headers });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const ip = clientKey(req.headers);
    const ipCheck = rateLimit(`err:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
    if (!ipCheck.allowed) {
      return new NextResponse(null, {
        status: 429,
        headers: { "retry-after": String(ipCheck.retryAfter) },
      });
    }

    // Reject an oversized body on the declared length before reading it, and
    // again on the real length after — a missing or lying header is not a way in.
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) return noContent();

    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return noContent();

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return noContent();
    }

    const parsed = Payload.safeParse(json);
    if (!parsed.success) return noContent();
    const body = parsed.data;

    // WHO — from the cookie, never from the body.
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const user = await decodeSessionToken(token);
    if (user) {
      const sessionCheck = rateLimit(`err:user:${user.id}`, SESSION_LIMIT, SESSION_WINDOW_MS);
      if (!sessionCheck.allowed) {
        return new NextResponse(null, {
          status: 429,
          headers: { "retry-after": String(sessionCheck.retryAfter) },
        });
      }
    }

    // Rebuild an Error so the capture layer classifies and fingerprints a client
    // report exactly as it would a server one — same groups, same severities.
    const err = new Error(body.message || "Unknown client error");
    err.name = body.name || "ClientError";
    err.stack = body.stack || undefined;

    const route = body.route ?? pathOf(body.url) ?? null;

    const result = await captureError(err, {
      source: (body.source as "browser") ?? "browser",
      severity: body.severity as "error" | undefined,
      route,
      url: body.url ?? null,
      apiEndpoint: body.apiEndpoint ?? null,
      httpStatus: body.httpStatus ?? null,
      httpMethod: null,
      module: moduleForPath(route),
      componentStack: body.componentStack ?? null,
      digest: body.digest ?? null,
      eventId: body.eventId ?? null,
      occurredAt: body.occurredAt ?? null,
      count: body.count ?? 1,
      requestId: requestIdFrom(req.headers),
      userAgent: req.headers.get("user-agent"),
      user: user ? { id: user.id, email: user.email, role: user.role } : null,
      context: body.context ?? null,
    });

    // The reference is the only thing worth telling the browser, and it is not
    // sensitive — it is the code the user is already being shown.
    return NextResponse.json({ ok: true, reference: result.eventId }, { status: 200 });
  } catch {
    // Including a failure to read the request at all.
    return noContent();
  }
}

function pathOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url, "http://localhost").pathname;
  } catch {
    return null;
  }
}

// Anything but POST is a probe. Say nothing useful.
export async function GET(): Promise<NextResponse> {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
