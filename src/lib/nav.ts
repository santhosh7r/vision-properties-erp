import {
  FULL_ACCESS_ROLES,
  PRE_SALES_DESK_ROLES,
  POST_SALES_DESK_ROLES,
  EITHER_DESK_ROLES,
  type Role,
} from "./roles";
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
  "general_manager",
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
const SALES: Role[] = [
  ...FULL_ACCESS_ROLES,
  "senior_director",
  "director",
  "business_manager",
  "business_partner",
];
// The full-access staff menu — Admin plus General Manager, which currently
// mirrors it item for item (see FULL_ACCESS_ROLES in roles.ts). Written as one
// list so a new Admin menu entry cannot be added for one and forgotten for the
// other; trimming the General Manager's menu later is a Page Config edit,
// which filters this list per page in access.navForUser.
const ADMIN_STAFF: Role[] = FULL_ACCESS_ROLES;
// Everyone EXCEPT the full-access staff. They get their own card-based
// Pre-Sales pages (Add Project / Add Plots / Manage) instead of the shared
// read-only tables.
const ALL_NON_ADMIN: Role[] = ALL.filter((r) => !ADMIN_STAFF.includes(r));
// Sales tiers excluding admin — admin's blocking/booking/payment actions are
// surfaced as the dedicated Pre-Sales / Post-Sales items below instead.
const SALES_NON_ADMIN: Role[] = SALES.filter((r) => !ADMIN_STAFF.includes(r));
// The four sales-role panels (hierarchy 1→4).
const SALES_TIERS: Role[] = ["senior_director", "director", "business_manager", "business_partner"];
// In-house desks — see IN_HOUSE_ROLES in roles.ts. Their menus are deliberately
// short: a branch desk gets its own workspace and nothing else.
const IN_HOUSE: Role[] = ["pre_sales", "post_sales", "pre_post_sales", "digital"];
// A desk's menu belongs to its own role AND to the combined Pre & Post-Sales
// role — one person covering both desks of a branch gets both workspaces in the
// sidebar, under their own section headers. Defined in roles.ts so the page
// guards and the menu can never drift apart.
const PRE_SALES_DESK = PRE_SALES_DESK_ROLES;
const POST_SALES_DESK = POST_SALES_DESK_ROLES;
// Items either branch desk works on — blocking/booking, the client book and the
// partner directory are shared by both.
const EITHER_DESK = EITHER_DESK_ROLES;

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: ALL, group: "Overview" },
  // Sales roles browse a card view of AVAILABLE inventory (their city first).
  // A Pre-Sales desk gets the same browser, confined to its own district.
  { href: "/available-plots", label: "Available Plots", icon: "grid", roles: [...SALES_TIERS, ...PRE_SALES_DESK], group: "Pre-Sales" },
  // Finance / Legal keep the original tables.
  { href: "/projects", label: "Projects", icon: "building", roles: ["finance", "legal"], group: "Pre-Sales" },
  { href: "/plots", label: "Plot Inventory", icon: "grid", roles: ["finance", "legal"], group: "Pre-Sales" },
  // Admin-only inventory workspace (card-based).
  { href: "/inventory/add-project", label: "Add Project", icon: "building", roles: ADMIN_STAFF, group: "Pre-Sales" },
  { href: "/inventory/add-plots", label: "Add Plots", icon: "cube", roles: ADMIN_STAFF, group: "Pre-Sales" },
  { href: "/inventory/manage", label: "Manage/Edit Plots", icon: "layers", roles: ADMIN_STAFF, group: "Pre-Sales" },
  { href: "/inventory/import", label: "Import from Excel", icon: "fileText", roles: ADMIN_STAFF, group: "Pre-Sales" },
  // The client book belongs to BOTH desks — either one may be the person in
  // front of the walk-in customer.
  { href: "/customers", label: "Customers", icon: "userCircle", roles: [...SALES, ...EITHER_DESK], group: "Clients" },
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
  // --- Post-Sales actions (no duplicate logic — query-param entry points) ---
  // Blocking/booking is worked by BOTH branch desks; admin sees it company-wide,
  // a desk sees its own district.
  { href: "/bookings/add", label: "Add Blocking & Booking", icon: "plus", roles: [...ADMIN_STAFF, ...EITHER_DESK], group: "Post-Sales" },
  { href: "/bookings", label: "Blockings & Bookings", icon: "fileText", roles: [...ADMIN_STAFF, ...EITHER_DESK], group: "Post-Sales" },
  // Part Payment + Fully Paid Receipt + Cancellation share one tabbed page.
  { href: "/post-sales", label: "Payments & Cancellation", icon: "creditCard", roles: [...ADMIN_STAFF, ...POST_SALES_DESK], group: "Post-Sales" },
  // Plot Release belongs to the Post-Sales desk as well as Admin: it is their
  // queue, and they extend and release from it themselves.
  { href: "/inventory/release", label: "Plot Release", icon: "cube", roles: [...ADMIN_STAFF, ...POST_SALES_DESK], group: "Post-Sales" },
  // Approvals inbox — Admin, plus Pre-Sales for the "Pre-sales approval" stage of
  // site-visit / cab requests (STAGE_ROLES.presales in lib/requests.ts).
  { href: "/requests", label: "Approvals", icon: "clock", roles: [...ADMIN_STAFF, ...PRE_SALES_DESK], group: "Operations" },
  // Payments list — finance only (admin reaches it via Part Payment / Fully Paid Receipt).
  { href: "/payments", label: "Payments", icon: "creditCard", roles: ["finance"], group: "Operations" },
  { href: "/registrations", label: "Registrations", icon: "scroll", roles: [...ADMIN_STAFF, "legal", ...POST_SALES_DESK], group: "Operations" },
  // Token/coupon issuance lives in its own Tokens section — Admin and the
  // Pre-Sales desk, which hands tokens to partners at the branch and records the
  // handover here. Sales managers keep the team view ("Business Operators" →
  // "My Team") under Business Partners; the same route serves both.
  { href: "/business-operators", label: "Issue Token", icon: "creditCard", roles: [...ADMIN_STAFF, ...PRE_SALES_DESK], group: "Tokens" },
  // Sales roles ONLY: a read-only view of the tokens THEY hold, plus their own
  // issue/redeem history. Deliberately not the branch desks — coupons are only
  // ever issued to the sales tree (see the Issue Token table), so a desk's own
  // balance is structurally always zero and this page was permanently empty for
  // them. Their token work is issuing, which lives on /business-operators above.
  { href: "/tokens", label: "Tokens", icon: "creditCard", roles: SALES_TIERS, group: "Tokens" },
  { href: "/business-operators", label: "My Team", icon: "briefcase", roles: ["senior_director", "director", "business_manager"], group: "Business Partners" },
  { href: "/reports", label: "Reports", icon: "barChart", roles: [...ADMIN_STAFF, "senior_director", "director", "business_manager", "finance", "legal"], group: "Reports" },
  // --- Partners (all backed by the existing /users page + users/actions) ---
  // Add New Partner is open to every role WITH a downline — Admin plus Senior
  // Director / Director / Business Manager (a Business Partner has nobody
  // beneath them, so they never see it). Non-admins may only pick roles below
  // their own and may only place the new member inside their own team; both are
  // enforced server-side in users/actions.ts, not just here.
  { href: "/users?action=new", label: "Add New Partner", icon: "plus", roles: [...ADMIN_STAFF, "senior_director", "director", "business_manager"], group: "Business Partners" },
  // View Partner is the READ-ONLY tree (`view_partners`) — Admin plus both branch
  // desks, who type Partner IDs onto every booking and need to look them up.
  // Block / Change Team stays ADMIN-ONLY; sales managers see their own team
  // through "My Team" (/business-operators) instead.
  { href: "/users", label: "View Partner", icon: "users", roles: [...ADMIN_STAFF, ...EITHER_DESK], group: "Business Partners" },
  { href: "/users?view=manage", label: "Block / Change Team & Level", icon: "sitemap", roles: ADMIN_STAFF, group: "Business Partners" },
  // Site Visit Feedback — Admin sees every response and edits the form; a Senior
  // Director sees their own team's responses; the Pre-Sales desk sees its own
  // district's, since site visits are its work (all enforced on the page).
  { href: "/feedback", label: "Site Visit Feedback", icon: "fileText", roles: [...ADMIN_STAFF, "senior_director", ...PRE_SALES_DESK], group: "Operations" },
  // The company's own staff — branch desks + company-wide. Lives under
  // Administration, not Business Partners: these people are not in the sales tree.
  { href: "/in-house", label: "My Team", icon: "users", roles: ADMIN_STAFF, group: "Administration" },
  { href: "/activity", label: "Activity Logs", icon: "clock", roles: ADMIN_STAFF, group: "Administration" },
  // Which role can open which page, and whether they may act on it. The menu
  // itself is filtered by what is set here — see lib/access.navForUser.
  { href: "/page-config", label: "Page Config", icon: "shieldLock", roles: ADMIN_STAFF, group: "Administration" },
  { href: "/settings", label: "Settings", icon: "cog", roles: ADMIN_STAFF, group: "Administration" },
  // Account — sales roles: one Profile page (details, tokens, password,
  // appearance, language, sign-out-everywhere). In-house desks get the same page
  // without the tokens block, so a new staff login can change its own password.
  { href: "/profile", label: "Profile", icon: "userCircle", roles: [...SALES_TIERS, ...IN_HOUSE], group: "Account" },
];

export function navFor(role: Role, isDev = false): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role) && (!n.devOnly || isDev));
}
