import type { Role } from "./roles";
import type { IconName } from "@/components/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  roles: Role[];
  // optional grouping for section headers in the sidebar
  group: "Overview" | "Inventory" | "Sales" | "Operations" | "Reports" | "Administration";
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

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: ALL, group: "Overview" },
  // Shared inventory tables — visible to every role except admin.
  { href: "/projects", label: "Projects", icon: "building", roles: ALL_NON_ADMIN, group: "Inventory" },
  { href: "/plots", label: "Plot Inventory", icon: "grid", roles: ALL_NON_ADMIN, group: "Inventory" },
  // Admin-only inventory workspace (card-based).
  { href: "/inventory/add-project", label: "Add Project", icon: "building", roles: ["admin"], group: "Inventory" },
  { href: "/inventory/add-plots", label: "Add Plots", icon: "cube", roles: ["admin"], group: "Inventory" },
  { href: "/inventory/manage", label: "Manage/Edit Plots", icon: "layers", roles: ["admin"], group: "Inventory" },
  { href: "/customers", label: "Customers", icon: "userCircle", roles: SALES, group: "Sales" },
  { href: "/bookings", label: "Bookings & Blocking", icon: "fileText", roles: [...SALES, "finance"], group: "Sales" },
  { href: "/requests", label: "Requests", icon: "clock", roles: ["senior_director", "director", "business_manager", "business_partner", "finance", "legal"], group: "Sales" },
  { href: "/requests", label: "Approvals", icon: "clock", roles: ["admin"], group: "Operations" },
  { href: "/payments", label: "Payments", icon: "creditCard", roles: ["admin", "finance"], group: "Operations" },
  { href: "/registrations", label: "Registrations", icon: "scroll", roles: ["admin", "legal"], group: "Operations" },
  { href: "/business-operators", label: "Business Operators", icon: "briefcase", roles: ["admin", "senior_director", "director", "business_manager"], group: "Sales" },
  { href: "/reports", label: "Reports", icon: "barChart", roles: ["admin", "senior_director", "director", "business_manager", "finance", "legal"], group: "Reports" },
  { href: "/users", label: "Users & Hierarchy", icon: "users", roles: ["admin"], group: "Administration" },
  { href: "/settings", label: "Settings", icon: "cog", roles: ["admin"], group: "Administration" },
];

export function navFor(role: Role): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role));
}
