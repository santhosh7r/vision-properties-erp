// ============================================================================
// Service-request domain model — the five request types on the Senior Director
// panel and their approval chains. Pure data + helpers, safe on client & server.
//
//   site_visit    senior -> presales(admin)            (final approval to proceed)
//   legal_query   legal                                (legal reverts in-thread)
//   draft         senior -> legal                      (legal final approval)
//   registration  legal                                (straight to legal)
//   cancellation  senior -> accounts(finance)          (refund, then plot freed)
// ============================================================================

import type { Role } from "./roles";

export type ServiceRequestType =
  | "site_visit"
  | "legal_query"
  | "draft"
  | "registration"
  | "cancellation"
  | "cab";

export type ServiceRequestStatus = "pending" | "approved" | "declined" | "draft";

// Who the request currently sits with. 'done' = chain complete (approved).
export type RequestStage = "senior" | "presales" | "legal" | "accounts" | "done";

// The ordered approval chain per type. The request starts on chain[0] and
// advances one stage per approval; advancing past the last stage marks it
// approved (stage 'done').
export const REQUEST_CHAIN: Record<ServiceRequestType, RequestStage[]> = {
  site_visit: ["senior", "presales"],
  legal_query: ["legal"],
  draft: ["senior", "legal"],
  registration: ["legal"],
  cancellation: ["senior", "accounts"],
  // Cab: a Director's request is approved by their Senior Director, then Admin.
  // A Senior Director's own request starts at the Admin stage (see
  // initialStageFor) since there's no SD above them.
  cab: ["senior", "presales"],
};

// Roles allowed to act on a request sitting at a given stage. Admin can act on
// any stage as a backstop. ('pre-sales' and 'accounts' map to existing roles.)
export const STAGE_ROLES: Record<RequestStage, Role[]> = {
  senior: ["senior_director", "admin"],
  presales: ["admin"],
  legal: ["legal", "admin"],
  accounts: ["finance", "admin"],
  done: [],
};

export const STAGE_LABEL: Record<RequestStage, string> = {
  senior: "Senior Director",
  presales: "Pre-sales approval",
  legal: "Legal team",
  accounts: "Accounts / refund",
  done: "Completed",
};

export interface RequestTypeMeta {
  key: ServiceRequestType;
  label: string;
  noun: string; // singular noun for buttons / empty states
  description: string;
  needsCustomer: boolean;
  needsBooking: boolean;
}

export const REQUEST_TYPES: RequestTypeMeta[] = [
  {
    key: "site_visit",
    label: "Site Visit",
    noun: "site visit",
    description:
      "Arrange a customer site visit. Approved by the senior, then pre-sales for final go-ahead.",
    needsCustomer: true,
    needsBooking: false,
  },
  {
    key: "legal_query",
    label: "Legal Query",
    noun: "legal query",
    description: "Raise a query to the legal team. They revert back in the same request.",
    needsCustomer: true,
    needsBooking: false,
  },
  {
    key: "draft",
    label: "Draft",
    noun: "draft",
    description: "Request a sale draft. Senior approves, then legal team finalises.",
    needsCustomer: true,
    needsBooking: true,
  },
  {
    key: "registration",
    label: "Registration",
    noun: "registration",
    description: "Send a booking to the legal team for registration.",
    needsCustomer: true,
    needsBooking: true,
  },
  {
    key: "cancellation",
    label: "Cancellation",
    noun: "cancellation",
    description:
      "Cancel a booking. Senior approves, accounts processes the refund, the plot is freed.",
    needsCustomer: true,
    needsBooking: true,
  },
  {
    key: "cab",
    label: "Cab",
    noun: "cab request",
    description:
      "Request a cab for a project. Your Senior Director approves, then Admin. A Director spends one cab token on final approval.",
    needsCustomer: true,
    needsBooking: false,
  },
];

export function requestTypeMeta(type: ServiceRequestType): RequestTypeMeta {
  return REQUEST_TYPES.find((t) => t.key === type) ?? REQUEST_TYPES[0];
}

// A project is required for every type except a general legal query.
export function requiresProject(type: ServiceRequestType): boolean {
  return type !== "legal_query";
}
// Types that collect a (required) date — kept in sync with the form's DATE_FIELD.
export function requiresDate(type: ServiceRequestType): boolean {
  return type === "site_visit" || type === "registration" || type === "cab";
}
// Types whose free-text body is mandatory.
export function requiresDetails(type: ServiceRequestType): boolean {
  return type === "legal_query" || type === "cancellation";
}

// Whether a draft has every field its type needs to be submitted for approval.
export function isRequestComplete(
  type: ServiceRequestType,
  f: {
    customer_id?: string | null;
    booking_id?: string | null;
    project_id?: string | null;
    visit_date?: string | null;
    details?: string | null;
  },
): boolean {
  const meta = requestTypeMeta(type);
  if (meta.needsCustomer && !f.customer_id) return false;
  if (meta.needsBooking && !f.booking_id) return false;
  if (requiresProject(type) && !f.project_id) return false;
  if (requiresDate(type) && !f.visit_date) return false;
  if (requiresDetails(type) && !f.details) return false;
  return true;
}

// First stage a new request of this type lands on.
export function initialStage(type: ServiceRequestType): RequestStage {
  return REQUEST_CHAIN[type][0];
}

// Role-aware entry stage. A Senior Director raising a cab request has no SD above
// them, so it goes straight to the Admin stage; everyone else starts at chain[0].
export function initialStageFor(type: ServiceRequestType, role: Role): RequestStage {
  if (type === "cab" && role === "senior_director") return "presales";
  return initialStage(type);
}

// The stage that follows `stage` for this type, or 'done' if it's the last one.
export function nextStage(type: ServiceRequestType, stage: RequestStage): RequestStage {
  const chain = REQUEST_CHAIN[type];
  const i = chain.indexOf(stage);
  if (i === -1 || i >= chain.length - 1) return "done";
  return chain[i + 1];
}

// May `role` act (approve / handle / decline) on a request at `stage`?
export function canActOnStage(role: Role, stage: RequestStage): boolean {
  return STAGE_ROLES[stage]?.includes(role) ?? false;
}

// Roles that ever appear as an approver across all chains — used for nav.
export function requestActorRoles(): Role[] {
  const set = new Set<Role>();
  for (const stage of Object.keys(STAGE_ROLES) as RequestStage[]) {
    for (const r of STAGE_ROLES[stage]) set.add(r);
  }
  return [...set];
}

// Human label for the action an approver takes at a stage (the button text).
export function actionLabel(type: ServiceRequestType, stage: RequestStage): string {
  if (type === "cab") {
    // Cab: SD forwards to Admin; Admin gives final approval.
    return nextStage(type, stage) === "done" ? "Approve (final)" : "Approve & forward";
  }
  if (stage === "accounts") return "Process refund";
  if (stage === "legal") {
    if (type === "legal_query") return "Send response";
    if (type === "registration") return "Complete registration";
    return "Approve (final)";
  }
  // last stage of the chain → final approval, otherwise forward
  return nextStage(type, stage) === "done" ? "Approve (final)" : "Approve & forward";
}
