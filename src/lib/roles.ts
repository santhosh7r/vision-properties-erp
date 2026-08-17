// ============================================================================
// Role definitions, hierarchy and permission helpers.
// Mirrors the v0.1 board: Admin -> Sales hierarchy + Business operators.
// ============================================================================

export type Role =
  | "admin"
  | "senior_director"
  | "director"
  | "business_manager"
  | "business_partner"
  | "finance"
  | "legal"
  | "pre_sales"
  | "post_sales"
  | "pre_post_sales"
  | "digital";

export const ROLES: Role[] = [
  "admin",
  "senior_director",
  "director",
  "business_manager",
  "business_partner",
  "finance",
  "legal",
  "pre_sales",
  "post_sales",
  "pre_post_sales",
  "digital",
];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  senior_director: "Senior Director",
  director: "Director",
  business_manager: "Business Manager",
  business_partner: "Business Partner",
  finance: "Finance / Billing",
  legal: "Legal Team",
  pre_sales: "Pre-Sales",
  post_sales: "Post-Sales",
  pre_post_sales: "Pre & Post-Sales",
  digital: "Digital Team",
};

// Sales hierarchy, top -> bottom. Used for "who manages whom".
export const SALES_HIERARCHY: Role[] = [
  "senior_director",
  "director",
  "business_manager",
  "business_partner",
];

export const BUSINESS_OPERATORS: Role[] = ["finance", "legal"];

// In-house desks — branch staff, NOT part of the partner/sales tree. A Pre-Sales
// or Post-Sales desk belongs to one district (Chennai / Trichy) and works every
// deal in that district; Digital is a company-wide desk. They report straight to
// the company (Admin), carry no partner code, never appear in the hierarchy tree
// and nobody reports to them.
// `pre_post_sales` is the SAME desk staffed by one person: a small branch where
// the same employee runs the deal from walk-in to registration. It is one role,
// not two — the union of the two desks' capabilities and menus — because the
// account still has exactly one row, one district and one login.
export const IN_HOUSE_ROLES: Role[] = ["pre_sales", "post_sales", "pre_post_sales", "digital"];

// A desk belongs to its own role AND to the combined Pre & Post-Sales role — one
// person covering both desks of a small branch is on both lists. Used for menu
// membership and for the page guards that ask "is this a Pre-Sales desk?".
export const PRE_SALES_DESK_ROLES: Role[] = ["pre_sales", "pre_post_sales"];
export const POST_SALES_DESK_ROLES: Role[] = ["post_sales", "pre_post_sales"];
// Either desk — the work both of them share.
export const EITHER_DESK_ROLES: Role[] = ["pre_sales", "post_sales", "pre_post_sales"];

// Every non-sales account: Admin, the business operators and the in-house desks.
// "Staff" is the opposite of "in the partner tree", and is what decides that an
// account skips the registration form and attaches directly to the company.
export const STAFF_ROLES: Role[] = ["admin", ...BUSINESS_OPERATORS, ...IN_HOUSE_ROLES];

export function isSalesRole(role: Role): boolean {
  return SALES_HIERARCHY.includes(role);
}

export function isInHouseRole(role: Role): boolean {
  return IN_HOUSE_ROLES.includes(role);
}

// Desks confined to ONE district. A Chennai Pre-Sales user works only Chennai
// projects and the bookings, payments and registrations that hang off them; a
// Trichy desk sees only Trichy. Enforced in lib/scope.ts, which every scoped page
// and server action routes through.
export function isDistrictScoped(role: Role): boolean {
  return role === "pre_sales" || role === "post_sales" || role === "pre_post_sales";
}

// Every rung of the sales hierarchy — Senior Director, Director, Business
// Manager and Business Partner — is onboarded through the full VISION PROPERTIES
// registration form (personal / professional / nominee / declaration), and none
// of them may use the app until those details exist. Admin, Finance and Legal
// are staff accounts and are exempt.
//
// Deliberately its own list rather than an alias of isSalesRole: "is part of the
// sales tree" and "must sign the registration form" are different questions that
// happen to have the same answer today, and one changing must not silently
// change the other.
export const REGISTRATION_ROLES: Role[] = [
  "senior_director",
  "director",
  "business_manager",
  "business_partner",
];

export function requiresRegistration(role: Role): boolean {
  return REGISTRATION_ROLES.includes(role);
}

// The head of a sales network — the only sales role that sees aggregated TEAM /
// network data (downline activity, downline customers). Directors and below get a
// purely personal view of their own work, not their team's.
export function isNetworkHead(role: Role): boolean {
  return role === "senior_director";
}

// Human-readable sales ID prefix per role (matches the DB trigger in
// supabase/schema.sql). Codes are PREFIX + 2 random digits, e.g. VPSD47.
// Non-sales roles have no code.
//   senior_director -> VPSD, director -> VPD, business_manager -> VPBM, business_partner -> VPBP
export const SALES_CODE_PREFIX: Partial<Record<Role, string>> = {
  senior_director: "VPSD",
  director: "VPD",
  business_manager: "VPBM",
  business_partner: "VPBP",
};

// The role a manager of `role` must have (one level up). Finance, Legal and the
// in-house desks (Pre-Sales / Post-Sales / Digital) connect DIRECTLY to the
// company, so their manager is the Admin. Admin itself sits at the very top and
// has no manager (null).
export function managerRoleOf(role: Role): Role | null {
  if (role !== "admin" && STAFF_ROLES.includes(role)) return "admin";
  const idx = SALES_HIERARCHY.indexOf(role);
  if (idx > 0) return SALES_HIERARCHY[idx - 1];
  if (idx === 0) return "admin"; // senior_director -> admin
  return null; // admin
}

// Sales roles strictly BELOW `role` in the hierarchy (top -> bottom order).
//   admin            -> [senior_director, director, business_manager, business_partner]
//   senior_director  -> [director, business_manager, business_partner]
//   director         -> [business_manager, business_partner]
//   business_manager -> [business_partner]
//   business_partner -> []   (leaf)
export function rolesBelow(role: Role): Role[] {
  if (role === "admin") return [...SALES_HIERARCHY];
  const idx = SALES_HIERARCHY.indexOf(role);
  if (idx === -1) return [];
  return SALES_HIERARCHY.slice(idx + 1);
}

// Roles that may be created beneath `parentRole`. Anyone can add ANY role below
// their own level directly under themselves (or anyone in their downline) — an SD
// can create a Partner straight away without first creating the in-between rungs.
// The new member simply reports to whoever created them.
export function creatableRolesUnder(parentRole: Role): Role[] {
  return rolesBelow(parentRole);
}

// May a user whose role is `managerRole` be the manager (direct parent) of a
// user whose role is `childRole`? Used to validate placement server-side.
//   - Senior Director and every staff account (Finance, Legal, Pre-Sales,
//     Post-Sales, Digital) connect DIRECTLY to the company (Admin).
//   - Admin sits at the top and has no manager.
//   - Other sales roles may sit under Admin or ANY sales role above them.
export function canManageRole(managerRole: Role, childRole: Role): boolean {
  if (childRole === "admin") return false;
  if (childRole === "senior_director" || STAFF_ROLES.includes(childRole)) {
    return managerRole === "admin";
  }
  // director / business_manager / business_partner
  if (managerRole === "admin") return true;
  return rolesBelow(managerRole).includes(childRole);
}

// ---------------------------------------------------------------------------
// Permissions — coarse capability flags per role (app-level guard).
// ---------------------------------------------------------------------------
export type Capability =
  | "manage_users"
  // READ-ONLY partner directory (the View Partner tree). Split out from
  // `manage_users` so a branch desk can look a partner up — they type Partner
  // IDs onto every booking — without gaining the power to block an account,
  // re-level it or move it between teams.
  | "view_partners"
  | "manage_team"
  | "manage_projects"
  | "manage_plots"
  | "manage_customers"
  | "create_blocking"
  | "create_booking"
  | "approve_booking"
  // ADMIN ONLY. Every blocking/booking is raised as 'pending' and does nothing
  // to the plot until an Admin confirms it here — see confirmBooking.
  | "confirm_booking"
  | "cancel_booking"
  | "request_cancellation"
  | "record_payment"
  | "manage_registration"
  | "approve_refund"
  | "manage_transfer"
  | "request_cab"
  | "approve_cab"
  | "create_request"
  | "view_finance"
  | "view_legal"
  | "view_reports"
  // Desk-level gates for the two branch workspaces. Kept separate from the
  // fine-grained action capabilities above so "may open the Pre-Sales desk" and
  // "may confirm a booking" stay independently grantable.
  | "view_pre_sales"
  | "view_post_sales"
  // ADMIN ONLY. Nothing ever returns to inventory on its own — expired holds
  // and cancelled plots queue up on Plot Release and stay held until an Admin
  // releases (or extends) them there. Deliberately NOT `manage_plots`: working
  // that queue must not carry the power to add, re-price or delete inventory.
  | "release_plot"
  // OPEN the Plot Release page without being able to act on it. The Post-Sales
  // desk works the queue day to day and needs to see what is waiting and chase
  // it, but the release itself stays the Admin's call.
  | "view_plot_release";

// ── In-house branch desks (district-scoped — see isDistrictScoped) ───────────
// Pre-Sales: the front of the deal. Blocks and books plots for walk-in
// customers of their district and gives the "Pre-sales approval" on site-visit
// / cab requests (the stage that previously only an Admin could clear — see
// STAGE_ROLES in requests.ts). What it RAISES is only ever 'pending':
// confirming is Admin-only, and cancelling stays with Admin / Post-Sales, so
// they request a cancellation like every sales role.
const PRE_SALES_CAPS: Capability[] = [
  "manage_customers",
  "view_partners",
  "create_blocking",
  "create_booking",
  "approve_booking",
  "request_cancellation",
  "request_cab",
  "approve_cab",
  "view_pre_sales",
];

// Post-Sales: everything after the deal is signed — collections, receipts,
// cancellation + refund, and registration. Blocking / booking now sits in the
// Post-Sales section of the sidebar and is worked by BOTH branch desks, so this
// desk holds the create powers too (confirming stays Admin-only). Releasing a
// plot back to inventory is Admin-only as well — this desk sees the queue build
// up but does not act on it.
const POST_SALES_CAPS: Capability[] = [
  // Both desks work the client book and look partners up — a Post-Sales desk
  // that can raise a blocking needs the customer behind it just as much.
  "manage_customers",
  "view_partners",
  "create_blocking",
  "create_booking",
  "record_payment",
  "cancel_booking",
  "approve_refund",
  "manage_registration",
  // Plot Release is the desk's own queue: it extends holds and releases plots
  // back to the company itself. (`view_plot_release` alone would open the page
  // read-only — kept in the set so the page guard is satisfied either way.)
  "release_plot",
  "view_plot_release",
  "view_post_sales",
];

const CAPABILITIES: Record<Role, Capability[]> = {
  admin: [
    "manage_users",
    "view_partners",
    "manage_team",
    "manage_projects",
    "manage_plots",
    "manage_customers",
    "create_blocking",
    "create_booking",
    "approve_booking",
    "confirm_booking",
    "cancel_booking",
    "record_payment",
    "manage_registration",
    "approve_refund",
    "manage_transfer",
    "approve_cab",
    "create_request",
    "view_finance",
    "view_legal",
    "view_reports",
    "view_pre_sales",
    "view_post_sales",
    "release_plot",
    "view_plot_release",
  ],
  // Only Admin holds `confirm_booking`, `cancel_booking` and `release_plot`.
  // A sales role raises a blocking/booking as 'pending' and waits for the Admin
  // to confirm it; to undo one it files a `request_cancellation` (with a reason)
  // for an Admin to action — see Payments & Cancellation.
  senior_director: [
    "manage_team",
    "manage_customers",
    "create_blocking",
    "approve_booking",
    "request_cancellation",
    "manage_transfer",
    "request_cab",
    "create_request",
    "view_reports",
  ],
  director: [
    "manage_team",
    "manage_customers",
    "create_blocking",
    "approve_booking",
    "request_cancellation",
    "manage_transfer",
    "request_cab",
    "create_request",
    "view_reports",
  ],
  // Business Manager & Business Partner cannot raise requests (no `create_request`)
  // — only Senior Director and Director touch the Requests section.
  business_manager: [
    "manage_team",
    "manage_customers",
    "create_blocking",
    "approve_booking",
    "request_cancellation",
    "manage_transfer",
    "request_cab",
    "view_reports",
  ],
  business_partner: ["manage_customers", "create_blocking", "request_cancellation", "request_cab"],
  finance: ["record_payment", "view_finance", "view_reports"],
  legal: ["manage_registration", "view_legal", "view_reports"],
  // ── In-house branch desks (district-scoped — see isDistrictScoped) ─────────
  pre_sales: PRE_SALES_CAPS,
  post_sales: POST_SALES_CAPS,
  // One person running both desks of a branch: the union, derived rather than
  // re-listed so widening either desk widens this automatically. Holding both
  // `cancel_booking` and `request_cancellation` is harmless — every cancel UI
  // offers the request only when the direct power is absent.
  pre_post_sales: [...new Set([...PRE_SALES_CAPS, ...POST_SALES_CAPS])],
  // Digital: login only for now — the desk's scope is not defined yet, so it
  // gets the dashboard and nothing else rather than a guessed set of powers.
  digital: [],
};

export function can(role: Role | undefined | null, cap: Capability): boolean {
  if (!role) return false;
  return CAPABILITIES[role]?.includes(cap) ?? false;
}
