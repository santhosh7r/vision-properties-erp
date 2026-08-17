import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// Lightweight gate: routes under the dashboard require a session cookie to be
// present. Full verification + role checks happen in the server components via
// requireUser()/requireCapability().
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/projects",
  "/plots",
  "/customers",
  "/bookings",
  "/receipts",
  "/payments",
  "/post-sales",
  "/inventory",
  "/registrations",
  "/users",
  "/settings",
  "/available-plots",
  "/business-operators",
  "/tokens",
  "/reports",
  "/requests",
  "/feedback",
  "/in-house",
  "/activity",
  "/page-config",
  "/profile",
];

// The app layout enforces Page Config on every route, and a layout is not told
// which URL it is rendering — so the path is forwarded to it as a header.
const PATH_HEADER = "x-pathname";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (!isProtected) return NextResponse.next();

  const hasSession = req.cookies.has(SESSION_COOKIE);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  const headers = new Headers(req.headers);
  headers.set(PATH_HEADER, pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/projects/:path*",
    "/plots/:path*",
    "/customers/:path*",
    "/bookings/:path*",
    "/receipts/:path*",
    "/payments/:path*",
    "/post-sales/:path*",
    "/inventory/:path*",
    "/registrations/:path*",
    "/users/:path*",
    "/settings/:path*",
    "/available-plots/:path*",
    "/business-operators/:path*",
    "/tokens/:path*",
    "/reports/:path*",
    "/requests/:path*",
    "/feedback/:path*",
    "/in-house/:path*",
    "/activity/:path*",
    "/page-config/:path*",
    "/profile/:path*",
  ],
};
