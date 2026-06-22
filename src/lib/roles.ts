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
  | "legal";

export const ROLES: Role[] = [
  "admin",
  "senior_director",
  "director",
  "business_manager",
  "business_partner",
  "finance",
  "legal",
];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  senior_director: "Senior Director",
  director: "Director",
  business_manager: "Business Manager",
  business_partner: "Business Partner",
  finance: "Finance / Billing",
  legal: "Legal Team",
};

// Sales hierarchy, top -> bottom. Used for "who manages whom".
export const SALES_HIERARCHY: Role[] = [
  "senior_director",
  "director",
  "business_manager",
  "business_partner",
];

export const BUSINESS_OPERATORS: Role[] = ["finance", "legal"];

export function isSalesRole(role: Role): boolean {
  return SALES_HIERARCHY.includes(role);
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

// The role a manager of `role` must have (one level up). Finance & Legal are
// operators that connect DIRECTLY to the company, so their manager is the Admin.
// Admin itself sits at the very top and has no manager (null).
export function managerRoleOf(role: Role): Role | null {
  if (role === "finance" || role === "legal") return "admin";
  const idx = SALES_HIERARCHY.indexOf(role);
  if (idx > 0) return SALES_HIERARCHY[idx - 1];
  if (idx === 0) return "admin"; // senior_director -> admin
  return null; // admin
}

// Role that may be created DIRECTLY beneath `parentRole` — strictly the next
// rung down (one level only). A member always sits directly under a parent whose
// role is exactly one above their own, so the chain is never skipped:
//   admin            -> [senior_director]   (company creates Senior Directors)
//   senior_director  -> [director]
//   director         -> [business_manager]
//   business_manager -> [business_partner]
//   business_partner -> []                  (leaf — creates no one)
// A creator higher up (e.g. an SD wanting a Partner) reaches DOWN their network
// and adds under the appropriate parent node — they don't place it under
// themselves. That reach is enforced separately (actorControls), not here.
export function creatableRolesUnder(parentRole: Role): Role[] {
  if (parentRole === "admin") return [SALES_HIERARCHY[0]];
  const idx = SALES_HIERARCHY.indexOf(parentRole);
  if (idx === -1 || idx >= SALES_HIERARCHY.length - 1) return [];
  return [SALES_HIERARCHY[idx + 1]];
}

// ---------------------------------------------------------------------------
// Permissions — coarse capability flags per role (app-level guard).
// ---------------------------------------------------------------------------
export type Capability =
  | "manage_users"
  | "manage_team"
  | "manage_projects"
  | "manage_plots"
  | "manage_customers"
  | "create_booking"
  | "approve_booking"
  | "confirm_booking"
  | "cancel_booking"
  | "record_payment"
  | "manage_registration"
  | "approve_refund"
  | "manage_transfer"
  | "view_finance"
  | "view_legal"
  | "view_reports";

const CAPABILITIES: Record<Role, Capability[]> = {
  admin: [
    "manage_users",
    "manage_team",
    "manage_projects",
    "manage_plots",
    "manage_customers",
    "create_booking",
    "approve_booking",
    "confirm_booking",
    "cancel_booking",
    "record_payment",
    "manage_registration",
    "approve_refund",
    "manage_transfer",
    "view_finance",
    "view_legal",
    "view_reports",
  ],
  senior_director: [
    "manage_team",
    "manage_customers",
    "create_booking",
    "approve_booking",
    "confirm_booking",
    "cancel_booking",
    "manage_transfer",
    "view_reports",
  ],
  director: [
    "manage_team",
    "manage_customers",
    "create_booking",
    "approve_booking",
    "confirm_booking",
    "cancel_booking",
    "manage_transfer",
    "view_reports",
  ],
  business_manager: [
    "manage_team",
    "manage_customers",
    "create_booking",
    "approve_booking",
    "confirm_booking",
    "cancel_booking",
    "manage_transfer",
    "view_reports",
  ],
  business_partner: ["manage_customers", "create_booking"],
  finance: ["record_payment", "view_finance", "view_reports"],
  legal: ["manage_registration", "view_legal", "view_reports"],
};

export function can(role: Role | undefined | null, cap: Capability): boolean {
  if (!role) return false;
  return CAPABILITIES[role]?.includes(cap) ?? false;
}
