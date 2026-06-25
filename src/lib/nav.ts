import type { Role } from "./roles";
import type { IconName } from "@/components/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  roles: Role[];
  // optional grouping for section headers in the sidebar
  group:
    | "Overview"
    | "Inventory"
    | "Pre-Sales"
    | "Post-Sales"
    | "Clients"
    | "Sales"
    | "Business Partners"
    | "Tokens"
    | "Operations"
    | "Reports"
    | "Administration";
}

const ALL: Role[] = [
  "admin",
  "senior_director",
  "director",
  "business_manager",
  "business_partner",
  "finance",
  "legal",
];
const SALES: Role[] = [
  "admin",
  "senior_director",
  "director",
  "business_manager",
  "business_partner",
];
// Everyone EXCEPT admin. Admin gets its own card-based Inventory pages (Add
// Project / Add Plots / Manage) instead of the shared read-only tables.
const ALL_NON_ADMIN: Role[] = ALL.filter((r) => r !== "admin");
// Sales tiers excluding admin — admin's blocking/booking/payment actions are
// surfaced as the dedicated Pre-Sales / Post-Sales items below instead.
const SALES_NON_ADMIN: Role[] = SALES.filter((r) => r !== "admin");

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: ALL, group: "Overview" },
  // Shared inventory tables — visible to every role except admin.
  { href: "/projects", label: "Projects", icon: "building", roles: ALL_NON_ADMIN, group: "Inventory" },
  { href: "/plots", label: "Plot Inventory", icon: "grid", roles: ALL_NON_ADMIN, group: "Inventory" },
  // Admin-only inventory workspace (card-based).
  { href: "/inventory/add-project", label: "Add Project", icon: "building", roles: ["admin"], group: "Inventory" },
  { href: "/inventory/add-plots", label: "Add Plots", icon: "cube", roles: ["admin"], group: "Inventory" },
  { href: "/inventory/manage", label: "Manage/Edit Plots", icon: "layers", roles: ["admin"], group: "Inventory" },
  { href: "/customers", label: "Customers", icon: "userCircle", roles: SALES, group: "Clients" },
  // Shared bookings list — non-admin sales + finance. Admin uses the Pre/Post-Sales
  // labelled actions below (which deep-link into this same engine via query params).
  { href: "/bookings", label: "Bookings & Blocking", icon: "fileText", roles: [...SALES_NON_ADMIN, "finance"], group: "Sales" },
  { href: "/requests", label: "Requests", icon: "clock", roles: ["senior_director", "director", "business_manager", "business_partner", "finance", "legal"], group: "Sales" },
  // --- Admin Pre-Sales actions (no duplicate logic — query-param entry points) ---
  { href: "/bookings/add", label: "Add Blocking & Booking", icon: "plus", roles: ["admin"], group: "Pre-Sales" },
  { href: "/bookings", label: "Blockings & Bookings", icon: "fileText", roles: ["admin"], group: "Pre-Sales" },
  // --- Admin Post-Sales actions ---
  // Part Payment + Fully Paid Receipt + Cancellation share one tabbed page.
  { href: "/post-sales", label: "Payments & Cancellation", icon: "creditCard", roles: ["admin"], group: "Post-Sales" },
  { href: "/inventory/release", label: "Plot Release", icon: "cube", roles: ["admin"], group: "Post-Sales" },
  { href: "/requests", label: "Approvals", icon: "clock", roles: ["admin"], group: "Operations" },
  // Payments list — finance only (admin reaches it via Part Payment / Fully Paid Receipt).
  { href: "/payments", label: "Payments", icon: "creditCard", roles: ["finance"], group: "Operations" },
  { href: "/registrations", label: "Registrations", icon: "scroll", roles: ["admin", "legal"], group: "Operations" },
  // Admin: token/coupon issuance lives in its own Tokens section. Sales managers
  // keep the team view ("Business Operators" → "My Team") under Business Partners.
  { href: "/business-operators", label: "Issue Token", icon: "creditCard", roles: ["admin"], group: "Tokens" },
  { href: "/business-operators", label: "Business Operators", icon: "briefcase", roles: ["senior_director", "director", "business_manager"], group: "Business Partners" },
  { href: "/reports", label: "Reports", icon: "barChart", roles: ["admin", "senior_director", "director", "business_manager", "finance", "legal"], group: "Reports" },
  // --- Admin Partners (all backed by the existing /users page + users/actions) ---
  { href: "/users?action=new", label: "Add New Partner", icon: "plus", roles: ["admin"], group: "Business Partners" },
  { href: "/users", label: "View Partner", icon: "users", roles: ["admin"], group: "Business Partners" },
  { href: "/users?view=manage", label: "Block / Change Team & Level", icon: "sitemap", roles: ["admin"], group: "Business Partners" },
  { href: "/settings", label: "Settings", icon: "cog", roles: ["admin"], group: "Administration" },
];

export function navFor(role: Role): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role));
}
