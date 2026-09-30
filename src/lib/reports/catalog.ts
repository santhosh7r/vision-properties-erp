import { can, isSalesRole, type Capability, type Role } from "../roles";

// ---------------------------------------------------------------------------
// MONTHLY REPORTS — what can be exported, which department owns it, what puts a
// record "in" a month, and who may export it.
//
// Access is the capability that already opens the matching screen, so a report
// never shows someone data their own pages would not: Finance gets the money,
// Legal its queries, each desk its own work. Admin and the General Manager hold
// every capability. Sales roles get none — their data is scoped to a downline,
// which these exports do not implement (see lib/reports/data.ts scoping).
// ---------------------------------------------------------------------------

export type DepartmentKey = "pre_sales" | "post_sales" | "finance" | "legal";

export const DEPARTMENTS: { key: DepartmentKey; label: string }[] = [
  { key: "pre_sales", label: "Pre-Sales" },
  { key: "post_sales", label: "Post-Sales" },
  { key: "finance", label: "Finance / Accounts" },
  { key: "legal", label: "Legal" },
];

export type ReportKey =
  | "bookings"
  | "site_visits"
  | "tokens"
  | "registrations"
  | "cancellations"
  | "transfers"
  | "payments"
  | "refunds"
  | "legal_queries";

export interface ReportDef {
  key: ReportKey;
  title: string;
  department: DepartmentKey;
  description: string;
  // Plain-language rule for which records fall in the month. Printed on the page
  // and in the workbook, so nobody has to guess why a record is or is not there.
  countedBy: string;
  // Any one of these opens it.
  caps: Capability[];
}

export const REPORTS: ReportDef[] = [
  {
    key: "bookings",
    title: "Blockings & Bookings",
    department: "pre_sales",
    description: "Every blocking and booking with plot, customer, sales chain, value and amount paid.",
    countedBy:
      "Entered in the month, or whose Booked Date falls in the month (a blocking converted to a booking takes the conversion date).",
    caps: ["view_pre_sales", "view_post_sales", "view_finance"],
  },
  {
    key: "site_visits",
    title: "Site Visits / Cab Bookings",
    department: "pre_sales",
    description: "Cab and site-visit requests with travel details, requester and approval trail.",
    countedBy: "Visit date in the month (requested date for older requests without one). Drafts excluded.",
    caps: ["view_pre_sales"],
  },
  {
    key: "tokens",
    title: "Tokens & Coupons",
    department: "pre_sales",
    description: "Every Gold, Tools, Digital and Cab token issued or redeemed — who, how much, and for which plot.",
    countedBy: "Issued or redeemed in the month.",
    caps: ["issue_token"],
  },
  {
    key: "registrations",
    title: "Registrations",
    department: "post_sales",
    description: "Plots registered, with register number, registrant, value and sales chain.",
    countedBy: "Register date in the month.",
    caps: ["manage_registration"],
  },
  {
    key: "cancellations",
    title: "Cancellations & Plot Releases",
    department: "post_sales",
    description: "Cancelled bookings and plots released to the company, with charges and refund position.",
    countedBy: "Cancelled / released in the month.",
    caps: ["cancel_booking", "view_finance"],
  },
  {
    key: "transfers",
    title: "Plot Transfers",
    department: "post_sales",
    description: "Bookings moved to another plot — from, to, value change and charge.",
    countedBy: "Transferred in the month.",
    caps: ["view_post_sales"],
  },
  {
    key: "payments",
    title: "Payments Collected",
    department: "finance",
    description: "Every payment received against a booking — kind, mode, reference, bank and amount.",
    countedBy: "Payment date in the month.",
    caps: ["record_payment", "view_finance"],
  },
  {
    key: "refunds",
    title: "Refunds",
    department: "finance",
    description: "Refunds approved or paid out on cancelled bookings.",
    countedBy: "Refund approved or paid in the month.",
    caps: ["approve_refund", "view_finance"],
  },
  {
    key: "legal_queries",
    title: "Legal Queries",
    department: "legal",
    description: "Legal queries raised, with the response and decision.",
    countedBy: "Raised in the month. Drafts excluded.",
    caps: ["view_legal"],
  },
];

export const REPORT_BY_KEY = new Map(REPORTS.map((r) => [r.key, r]));

export function canExportReport(role: Role, report: ReportDef): boolean {
  if (isSalesRole(role)) return false;
  return report.caps.some((c) => can(role, c));
}

/** The reports this role may export, in catalogue order. */
export function reportsFor(role: Role): ReportDef[] {
  return REPORTS.filter((r) => canExportReport(role, r));
}
