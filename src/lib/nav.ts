import type { Role } from "./roles";
import type { IconName } from "@/components/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  roles: Role[];
  // Visible only to the hidden dev/support account (in addition to the roles).
  devOnly?: boolean;
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
    | "Administration"
    | "Account";
}

const ALL: Role[] = [
  "admin",
  "senior_director",
  "director",
  "business_manager",
  "business_partner",
  "finance",
  "legal",
  "pre_sales",
  "post_sales",
  "digital",
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
// The four sales-role panels (hierarchy 1→4).
const SALES_TIERS: Role[] = ["senior_director", "director", "business_manager", "business_partner"];
// In-house desks — see IN_HOUSE_ROLES in roles.ts. Their menus are deliberately
// short: a branch desk gets its own workspace and nothing else.
const IN_HOUSE: Role[] = ["pre_sales", "post_sales", "digital"];

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: ALL, group: "Overview" },
  // Sales roles browse a card view of AVAILABLE inventory (their city first).
  // A Pre-Sales desk gets the same browser, confined to its own district.
  { href: "/available-plots", label: "Available Plots", icon: "grid", roles: [...SALES_TIERS, "pre_sales"], group: "Inventory" },
  // Finance / Legal keep the original tables.
  { href: "/projects", label: "Projects", icon: "building", roles: ["finance", "legal"], group: "Inventory" },
  { href: "/plots", label: "Plot Inventory", icon: "grid", roles: ["finance", "legal"], group: "Inventory" },
  // Admin-only inventory workspace (card-based).
  { href: "/inventory/add-project", label: "Add Project", icon: "building", roles: ["admin"], group: "Inventory" },
  { href: "/inventory/add-plots", label: "Add Plots", icon: "cube", roles: ["admin"], group: "Inventory" },
  { href: "/inventory/manage", label: "Manage/Edit Plots", icon: "layers", roles: ["admin"], group: "Inventory" },
  { href: "/inventory/import", label: "Import from Excel", icon: "fileText", roles: ["admin"], group: "Inventory" },
  { href: "/customers", label: "Customers", icon: "userCircle", roles: [...SALES, "pre_sales"], group: "Clients" },
  // Shared bookings list — non-admin sales + finance. Admin uses the Pre/Post-Sales
  // labelled actions below (which deep-link into this same engine via query params).
  // Sales: split into the create flow + two scoped lists. Finance keeps the
  // combined "Bookings & Blocking" list.
  { href: "/bookings", label: "Bookings & Blocking", icon: "fileText", roles: ["finance"], group: "Sales" },
  { href: "/bookings/add", label: "New Blocking", icon: "plus", roles: SALES_TIERS, group: "Sales" },
  { href: "/bookings", label: "My Blockings & Bookings", icon: "fileText", roles: SALES_TIERS, group: "Sales" },
  // Requests — only Senior Director & Director raise/approve among sales roles
  // (Business Manager / Partner have no Requests). Finance/Legal keep their inbox.
  { href: "/requests", label: "Requests", icon: "clock", roles: ["senior_director", "director", "finance", "legal"], group: "Sales" },
  // --- Pre-Sales actions (no duplicate logic — query-param entry points) ---
  // Admin sees these company-wide; the Pre-Sales desk sees its own district.
  { href: "/bookings/add", label: "Add Blocking & Booking", icon: "plus", roles: ["admin", "pre_sales"], group: "Pre-Sales" },
  { href: "/bookings", label: "Blockings & Bookings", icon: "fileText", roles: ["admin", "pre_sales"], group: "Pre-Sales" },
  // --- Post-Sales actions ---
  // Part Payment + Fully Paid Receipt + Cancellation share one tabbed page.
  { href: "/post-sales", label: "Payments & Cancellation", icon: "creditCard", roles: ["admin", "post_sales"], group: "Post-Sales" },
  { href: "/inventory/release", label: "Plot Release", icon: "cube", roles: ["admin", "post_sales"], group: "Post-Sales" },
  // Approvals inbox — Admin, plus Pre-Sales for the "Pre-sales approval" stage of
  // site-visit / cab requests (STAGE_ROLES.presales in lib/requests.ts).
  { href: "/requests", label: "Approvals", icon: "clock", roles: ["admin", "pre_sales"], group: "Operations" },
  // Payments list — finance only (admin reaches it via Part Payment / Fully Paid Receipt).
  { href: "/payments", label: "Payments", icon: "creditCard", roles: ["finance"], group: "Operations" },
  { href: "/registrations", label: "Registrations", icon: "scroll", roles: ["admin", "legal", "post_sales"], group: "Operations" },
  // Admin: token/coupon issuance lives in its own Tokens section. Sales managers
  // keep the team view ("Business Operators" → "My Team") under Business Partners.
  { href: "/business-operators", label: "Issue Token", icon: "creditCard", roles: ["admin"], group: "Tokens" },
  // Sales roles: a read-only view of the tokens they hold + their issue/redeem history.
  { href: "/tokens", label: "Tokens", icon: "creditCard", roles: SALES_TIERS, group: "Tokens" },
  { href: "/business-operators", label: "My Team", icon: "briefcase", roles: ["senior_director", "director", "business_manager"], group: "Business Partners" },
  { href: "/reports", label: "Reports", icon: "barChart", roles: ["admin", "senior_director", "director", "business_manager", "finance", "legal"], group: "Reports" },
  // --- Partners (all backed by the existing /users page + users/actions) ---
  // Add New Partner is open to every role WITH a downline — Admin plus Senior
  // Director / Director / Business Manager (a Business Partner has nobody
  // beneath them, so they never see it). Non-admins may only pick roles below
  // their own and may only place the new member inside their own team; both are
  // enforced server-side in users/actions.ts, not just here.
  { href: "/users?action=new", label: "Add New Partner", icon: "plus", roles: ["admin", "senior_director", "director", "business_manager"], group: "Business Partners" },
  // View Partner / Block / Change Team stay ADMIN-ONLY — sales managers see their
  // own team through "My Team" (/business-operators) instead.
  { href: "/users", label: "View Partner", icon: "users", roles: ["admin"], group: "Business Partners" },
  { href: "/users?view=manage", label: "Block / Change Team & Level", icon: "sitemap", roles: ["admin"], group: "Business Partners" },
  // Site Visit Feedback — Admin sees every response and edits the form; a Senior
  // Director sees their own team's responses only (enforced on the page).
  { href: "/feedback", label: "Site Visit Feedback", icon: "fileText", roles: ["admin", "senior_director"], group: "Operations" },
  // The company's own staff — branch desks + company-wide. Lives under
  // Administration, not Business Partners: these people are not in the sales tree.
  { href: "/in-house", label: "My Team", icon: "users", roles: ["admin"], group: "Administration" },
  { href: "/activity", label: "Activity Logs", icon: "clock", roles: ["admin"], group: "Administration" },
  { href: "/settings", label: "Settings", icon: "cog", roles: ["admin"], group: "Administration" },
  // Account — sales roles: one Profile page (details, tokens, password,
  // appearance, language, sign-out-everywhere). In-house desks get the same page
  // without the tokens block, so a new staff login can change its own password.
  { href: "/profile", label: "Profile", icon: "userCircle", roles: [...SALES_TIERS, ...IN_HOUSE], group: "Account" },
];

export function navFor(role: Role, isDev = false): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role) && (!n.devOnly || isDev));
}
