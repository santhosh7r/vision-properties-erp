import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

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
  // Developer-only tooling (Error Logs). The cookie gate here is the cheap
  // first pass; requireDevUser() on the page is what actually restricts it to
  // the hidden dev/support account.
  "/dev",
];

// The app layout enforces Page Config on every route, and a layout is not told
// which URL it is rendering — so the path is forwarded to it as a header.
//
// The SAME header is what the error monitoring layer uses to attribute an error
// to a page and a module (see requestContext in lib/errors/capture.ts). That is
// why it is now set for EVERY request rather than only the protected ones: an
// error on the login screen or the public feedback form is exactly the kind
// worth having, and without this it would be logged with no route at all.
const PATH_HEADER = "x-pathname";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const headers = new Headers(req.headers);
  headers.set(PATH_HEADER, pathname);
  const forward = () => NextResponse.next({ request: { headers } });

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (!isProtected) return forward();

  if (!req.cookies.has(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return forward();
}

export const config = {
  matcher: [
    /*
     * Every request EXCEPT the ones with nothing to attribute: Next's own build
     * output, the image optimiser, and files served straight from /public.
     * Matching broadly is what lets one middleware serve both jobs above; the
     * exclusions keep it off the static hot path.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.png|logo-mark.png|apple-icon.png|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|woff|woff2|ttf|xlsx|pdf)$).*)",
  ],
};
