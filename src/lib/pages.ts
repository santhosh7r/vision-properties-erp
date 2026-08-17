import { NAV, type NavItem } from "./nav";
import { ROLES, type Role } from "./roles";

// ---------------------------------------------------------------------------
// The PAGE REGISTRY — the grid an Admin ticks on Administration › Page Config,
// and the thing page access is stored against.
//
// A "page" is one row in that grid, not one route: the booking form and the
// booking it creates are the same page as far as permission goes, so a page owns
// several `paths`. Matching is longest-prefix-first, so /bookings/add resolves to
// its own page before /bookings claims it.
//
// `key` is what lands in the database. NEVER rename a key — that silently drops
// whatever an Admin configured against it. Change the label instead.
// ---------------------------------------------------------------------------

export type PageLevel = "none" | "view" | "edit";

export const LEVEL_LABEL: Record<PageLevel, string> = {
  none: "No access",
  view: "View only",
  edit: "View & edit",
};

export interface PageDef {
  key: string;
  label: string;
  group: NavItem["group"];
  paths: string[];
  // Pages that are opened FROM another page rather than the menu (a receipt, a
  // plot record). They inherit their level from the page they hang off, so an
  // Admin does not have to think about them.
  follows?: string;
}

export const PAGES: PageDef[] = [
  { key: "dashboard", label: "Dashboard", group: "Overview", paths: ["/dashboard"] },

  { key: "available_plots", label: "Available Plots", group: "Pre-Sales", paths: ["/available-plots"] },
  { key: "projects", label: "Projects", group: "Pre-Sales", paths: ["/projects"] },
  { key: "plots", label: "Plot Inventory", group: "Pre-Sales", paths: ["/plots"] },
  { key: "inventory_add_project", label: "Add Project", group: "Pre-Sales", paths: ["/inventory/add-project"] },
  { key: "inventory_add_plots", label: "Add Plots", group: "Pre-Sales", paths: ["/inventory/add-plots"] },
  { key: "inventory_manage", label: "Manage / Edit Plots", group: "Pre-Sales", paths: ["/inventory/manage"] },
  { key: "inventory_import", label: "Import from Excel", group: "Pre-Sales", paths: ["/inventory/import"] },

  { key: "customers", label: "Customers", group: "Clients", paths: ["/customers"] },

  { key: "bookings_add", label: "Add Blocking & Booking", group: "Post-Sales", paths: ["/bookings/add", "/bookings/new"] },
  { key: "bookings", label: "Blockings & Bookings", group: "Post-Sales", paths: ["/bookings"] },
  { key: "post_sales", label: "Payments & Cancellation", group: "Post-Sales", paths: ["/post-sales"] },
  { key: "inventory_release", label: "Plot Release", group: "Post-Sales", paths: ["/inventory/release"] },

  { key: "requests", label: "Approvals / Requests", group: "Operations", paths: ["/requests"] },
  { key: "payments", label: "Payments", group: "Operations", paths: ["/payments"] },
  { key: "registrations", label: "Registrations", group: "Operations", paths: ["/registrations"] },
  { key: "feedback", label: "Site Visit Feedback", group: "Operations", paths: ["/feedback"] },

  { key: "business_operators", label: "Issue Token / My Team", group: "Tokens", paths: ["/business-operators"] },
  { key: "tokens", label: "Tokens", group: "Tokens", paths: ["/tokens"] },

  { key: "users", label: "Business Partners", group: "Business Partners", paths: ["/users"] },

  { key: "reports", label: "Reports", group: "Reports", paths: ["/reports"] },

  { key: "in_house", label: "My Team (In-House)", group: "Administration", paths: ["/in-house"] },
  { key: "activity", label: "Activity Logs", group: "Administration", paths: ["/activity"] },
  { key: "page_config", label: "Page Config", group: "Administration", paths: ["/page-config"] },
  { key: "settings", label: "Settings", group: "Administration", paths: ["/settings"] },

  // Receipts follow Blockings & Bookings — whoever may open a deal may print its
  // bill. Profile is every signed-in user's own account page and is never gated.
  { key: "receipts", label: "Receipts / Bills", group: "Account", paths: ["/receipts"], follows: "bookings" },
  { key: "profile", label: "Profile", group: "Account", paths: ["/profile"] },
];

export const PAGE_BY_KEY = new Map(PAGES.map((p) => [p.key, p]));

// Pages an Admin may configure. Profile is excluded on purpose: taking a user's
// own account page away would leave them unable to change their password.
export const CONFIGURABLE_PAGES = PAGES.filter((p) => p.key !== "profile" && !p.follows);

// Longest path first so /bookings/add wins over /bookings and /inventory/release
// over /inventory.
const MATCH_ORDER = [...PAGES]
  .flatMap((p) => p.paths.map((path) => ({ path, key: p.key })))
  .sort((a, b) => b.path.length - a.path.length);

// Which page does this URL belong to? Null for anything outside the registry —
// the login screen, the public feedback form — which access control ignores.
export function pageKeyForPath(pathname: string): string | null {
  const hit = MATCH_ORDER.find((m) => pathname === m.path || pathname.startsWith(m.path + "/"));
  return hit?.key ?? null;
}

// ---------------------------------------------------------------------------
// DEFAULTS — what a role gets before an Admin changes anything.
//
// Read straight off NAV, so the app behaves EXACTLY as it does today until
// someone edits the grid: a role that has the menu item gets 'edit', a role that
// does not gets 'none'. The capability rules still gate individual actions on top
// (only Admin may confirm a booking or release a plot), so 'edit' here grants
// nothing a role could not already do.
// ---------------------------------------------------------------------------
export function defaultLevel(role: Role, pageKey: string): PageLevel {
  if (role === "admin") return "edit"; // Admin is locked to full access
  const page = PAGE_BY_KEY.get(pageKey);
  if (!page) return "none";
  if (page.key === "profile") return "edit"; // never gated
  if (page.follows) return defaultLevel(role, page.follows);
  const inNav = NAV.some(
    (n) =>
      n.roles.includes(role) &&
      page.paths.some((p) => n.href === p || n.href.startsWith(p + "?") || n.href.startsWith(p + "/")),
  );
  return inNav ? "edit" : "none";
}

// Every role the grid is shown for. Admin appears but is locked.
export const CONFIGURABLE_ROLES: Role[] = ROLES.filter((r) => r !== "admin");
