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
//   - Senior Director, Finance, Legal connect DIRECTLY to the company (Admin).
//   - Admin sits at the top and has no manager.
//   - Other sales roles may sit under Admin or ANY sales role above them.
export function canManageRole(managerRole: Role, childRole: Role): boolean {
  if (childRole === "admin") return false;
  if (childRole === "senior_director" || childRole === "finance" || childRole === "legal") {
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
  | "manage_team"
  | "manage_projects"
  | "manage_plots"
  | "manage_customers"
  | "create_blocking"
  | "create_booking"
  | "approve_booking"
  | "confirm_booking"
  | "cancel_booking"
  | "record_payment"
  | "manage_registration"
  | "approve_refund"
  | "manage_transfer"
  | "request_cab"
  | "approve_cab"
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
    "view_finance",
    "view_legal",
    "view_reports",
  ],
  senior_director: [
    "manage_team",
    "manage_customers",
    "create_blocking",
    "approve_booking",
    "confirm_booking",
    "cancel_booking",
    "manage_transfer",
    "request_cab",
    "view_reports",
  ],
  director: [
    "manage_team",
    "manage_customers",
    "create_blocking",
    "approve_booking",
    "confirm_booking",
    "cancel_booking",
    "manage_transfer",
    "request_cab",
    "view_reports",
  ],
  business_manager: [
    "manage_team",
    "manage_customers",
    "create_blocking",
    "approve_booking",
    "confirm_booking",
    "cancel_booking",
    "manage_transfer",
    "request_cab",
    "view_reports",
  ],
  business_partner: ["manage_customers", "create_blocking", "request_cab"],
  finance: ["record_payment", "view_finance", "view_reports"],
  legal: ["manage_registration", "view_legal", "view_reports"],
};

export function can(role: Role | undefined | null, cap: Capability): boolean {
  if (!role) return false;
  return CAPABILITIES[role]?.includes(cap) ?? false;
}
