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
  "/registrations",
  "/users",
  "/settings",
];

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
  return NextResponse.next();
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
    "/registrations/:path*",
    "/users/:path*",
    "/settings/:path*",
  ],
};
