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
  | "cancellation";

export type ServiceRequestStatus = "pending" | "approved" | "declined";

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
    needsCustomer: false,
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
    needsCustomer: false,
    needsBooking: true,
  },
];

export function requestTypeMeta(type: ServiceRequestType): RequestTypeMeta {
  return REQUEST_TYPES.find((t) => t.key === type) ?? REQUEST_TYPES[0];
}

// First stage a new request of this type lands on.
export function initialStage(type: ServiceRequestType): RequestStage {
  return REQUEST_CHAIN[type][0];
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
  if (stage === "accounts") return "Process refund";
  if (stage === "legal") {
    if (type === "legal_query") return "Send response";
    if (type === "registration") return "Complete registration";
    return "Approve (final)";
  }
  // last stage of the chain → final approval, otherwise forward
  return nextStage(type, stage) === "done" ? "Approve (final)" : "Approve & forward";
}
