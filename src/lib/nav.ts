import type { Role } from "./roles";
import type { IconName } from "@/components/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  roles: Role[];
  // optional grouping for section headers in the sidebar
  group: "Overview" | "Inventory" | "Sales" | "Operations" | "Administration";
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

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: ALL, group: "Overview" },
  { href: "/projects", label: "Projects", icon: "building", roles: ALL, group: "Inventory" },
  { href: "/plots", label: "Plot Inventory", icon: "grid", roles: ALL, group: "Inventory" },
  { href: "/customers", label: "Customers", icon: "userCircle", roles: SALES, group: "Sales" },
  { href: "/bookings", label: "Bookings & Blocking", icon: "fileText", roles: [...SALES, "finance"], group: "Sales" },
  { href: "/requests", label: "Cab Requests", icon: "clock", roles: SALES, group: "Sales" },
  { href: "/payments", label: "Payments", icon: "creditCard", roles: ["admin", "finance"], group: "Operations" },
  { href: "/registrations", label: "Registrations", icon: "scroll", roles: ["admin", "legal"], group: "Operations" },
  { href: "/business-operators", label: "Business Operators", icon: "briefcase", roles: ["admin", "senior_director", "director", "business_manager"], group: "Sales" },
  { href: "/users", label: "Users & Hierarchy", icon: "users", roles: ["admin"], group: "Administration" },
  { href: "/settings", label: "Settings", icon: "cog", roles: ["admin"], group: "Administration" },
];

export function navFor(role: Role): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role));
}
