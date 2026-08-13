// ============================================================================
// Service-request domain model — the five request types on the Senior Director
// panel and their approval chains. Pure data + helpers, safe on client & server.
//
//   cab           senior -> presales(admin)            (site visit + its cab)
//   legal_query   legal                                (legal reverts in-thread)
//   registration  legal                                (straight to legal)
//   cancellation  senior -> accounts(finance)          (refund, then plot freed)
//
// `cab` absorbed the old `site_visit` type: a site visit and the cab that takes
// the customer there were always one errand raised twice. `draft` was removed.
// Both values remain in the Postgres enum (values cannot be dropped safely) but
// nothing in the app reads or writes them.
// ============================================================================

import { can, type Role } from "./roles";

export type ServiceRequestType =
  | "legal_query"
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
  legal_query: ["legal"],
  registration: ["legal"],
  cancellation: ["senior", "accounts"],
  // Cab: a Director's request is approved by their Senior Director, then Admin.
  // A Senior Director's own request starts at the Admin stage (see
  // initialStageFor) since there's no SD above them.
  cab: ["senior", "presales"],
};

// Roles allowed to act on a request sitting at a given stage. Admin can act on
// any stage as a backstop. ('accounts' maps to Finance.)
export const STAGE_ROLES: Record<RequestStage, Role[]> = {
  senior: ["senior_director", "admin"],
  // The Pre-Sales desk owns this stage now that the role exists; Admin stays on
  // it as the backstop that cleared it before the desk did.
  presales: ["pre_sales", "admin"],
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
  /**
   * Roles allowed to RAISE this type (approving is governed separately by
   * STAGE_ROLES). An empty list means nobody can raise it — the type still
   * exists so any historical rows keep rendering and moving through their chain.
   */
  raiseRoles: Role[];
}

export const REQUEST_TYPES: RequestTypeMeta[] = [
  {
    key: "legal_query",
    label: "Legal Query",
    noun: "legal query",
    description: "Raise a query to the legal team. They revert back in the same request.",
    // A legal query is always ABOUT a booked plot — the booking identifies the
    // customer and project on its own, so neither is asked for separately.
    needsCustomer: false,
    needsBooking: true,
    raiseRoles: ["senior_director", "director"],
  },
  {
    key: "registration",
    label: "Registration",
    noun: "registration",
    description: "Send a booking to the legal team for registration.",
    needsCustomer: true,
    needsBooking: true,
    raiseRoles: [],
  },
  {
    key: "cancellation",
    label: "Cancellation",
    noun: "cancellation",
    description:
      "Cancel a booking. Senior approves, accounts processes the refund, the plot is freed.",
    needsCustomer: true,
    needsBooking: true,
    raiseRoles: [],
  },
  {
    key: "cab",
    label: "Cab",
    noun: "cab request",
    description:
      "Arrange a customer site visit and the cab for it. Your Senior Director approves, then Admin. A Director spends one cab token on final approval.",
    // Raised for a WALK-IN before any customer record exists — the name and
    // phone are typed on the form (customer_name / customer_phone) rather than
    // picked from the customers table. See migration 0026.
    needsCustomer: false,
    needsBooking: false,
    raiseRoles: ["senior_director", "director"],
  },
];

export function requestTypeMeta(type: ServiceRequestType): RequestTypeMeta {
  return REQUEST_TYPES.find((t) => t.key === type) ?? REQUEST_TYPES[0];
}

/**
 * May `role` raise a NEW request of this type? Two gates, both required: the
 * role must hold `create_request` at all, and the type must list it in
 * `raiseRoles`. Approving is separate — see `canActOnStage`.
 *
 * Today Legal Query and Cab are raisable, both by Senior Director and Director
 * only. Widening a type is a one-line change to its `raiseRoles`.
 */
export function canRaiseRequest(role: Role, type: ServiceRequestType): boolean {
  if (!can(role, "create_request")) return false;
  return requestTypeMeta(type).raiseRoles.includes(role);
}

/** The types `role` may raise — drives the "New request" menu. */
export function raisableTypes(role: Role): RequestTypeMeta[] {
  return REQUEST_TYPES.filter((t) => canRaiseRequest(role, t.key));
}

// ---------------------------------------------------------------------------
// CAB / SITE VISIT — walk-in details, travel arrangement, lead-time rule.
// ---------------------------------------------------------------------------

export const TRAVEL_MODES = [
  { value: "own", label: "Own" },
  { value: "company", label: "Company" },
  { value: "red_taxi", label: "Red Taxi" },
] as const;

export const CAB_TYPES = [
  { value: "4_seater", label: "4 Seater" },
  { value: "7_seater", label: "7 Seater" },
  { value: "van", label: "Van" },
] as const;

export function travelModeLabel(v: string | null | undefined): string | null {
  return TRAVEL_MODES.find((m) => m.value === v)?.label ?? v ?? null;
}

/**
 * Does this travel mode need a vehicle size? No cab is booked when the customer
 * drives themselves, so asking for a seat count would record a vehicle that was
 * never arranged.
 */
export function needsCabType(travelMode: string | null | undefined): boolean {
  return !!travelMode && travelMode !== "own";
}
export function cabTypeLabel(v: string | null | undefined): string | null {
  return CAB_TYPES.find((c) => c.value === v)?.label ?? v ?? null;
}

// A visit must be booked at least this far ahead: book at 6:30 → earliest visit
// time is 7:30.
export const VISIT_LEAD_MS = 60 * 60 * 1000;

// India is a fixed UTC+5:30 with no DST. The form collects WALL-CLOCK IST, but
// the server may well run in UTC — so convert explicitly instead of relying on
// `new Date("2026-07-31T19:30")`, which would silently use the host's zone and
// shift the deadline by hours.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Epoch ms for a wall-clock IST `date` (YYYY-MM-DD) + `time` (HH:MM). */
export function istEpoch(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
  return Date.UTC(y, m - 1, d, hh, mm) - IST_OFFSET_MS;
}

/** Wall-clock IST "now", as {date, time} strings the form's inputs understand. */
export function istNowParts(now = Date.now()): { date: string; time: string } {
  const d = new Date(now + IST_OFFSET_MS);
  return {
    date: d.toISOString().slice(0, 10),
    time: d.toISOString().slice(11, 16),
  };
}

/**
 * Is this visit far enough ahead? `true` when the visit is at least an hour from
 * now. Missing date or time is NOT a lead-time failure — required-ness is the
 * caller's job (a half-filled draft must still be savable).
 */
export function visitLeadTimeOk(
  date: string | null | undefined,
  time: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!date || !time) return true;
  const at = istEpoch(date, time.slice(0, 5));
  if (Number.isNaN(at)) return true;
  return at >= now + VISIT_LEAD_MS;
}

/** The earliest visit time bookable right now, for the form's `min` attribute. */
export function earliestVisitParts(now = Date.now()): { date: string; time: string } {
  return istNowParts(now + VISIT_LEAD_MS);
}

// A project is required for every type except a general legal query.
export function requiresProject(type: ServiceRequestType): boolean {
  return type !== "legal_query";
}
// Types that collect a (required) date — kept in sync with the form's DATE_FIELD.
export function requiresDate(type: ServiceRequestType): boolean {
  return type === "registration" || type === "cab";
}
// Types whose free-text body is mandatory.
export function requiresDetails(type: ServiceRequestType): boolean {
  return type === "legal_query" || type === "cancellation";
}
// Types whose subject line is mandatory — a legal query is filed under its Title.
export function requiresSubject(type: ServiceRequestType): boolean {
  return type === "legal_query";
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
    subject?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    visit_time?: string | null;
    travel_mode?: string | null;
    cab_type?: string | null;
  },
): boolean {
  const meta = requestTypeMeta(type);
  if (meta.needsCustomer && !f.customer_id) return false;
  if (meta.needsBooking && !f.booking_id) return false;
  if (requiresProject(type) && !f.project_id) return false;
  if (requiresDate(type) && !f.visit_date) return false;
  if (requiresDetails(type) && !f.details) return false;
  if (requiresSubject(type) && !f.subject) return false;
  // Cab / site visit: typed walk-in details + the time and travel arrangement.
  if (type === "cab") {
    if (!f.customer_name || !f.customer_phone) return false;
    if (!f.visit_time || !f.travel_mode) return false;
    // Cab type only matters when a cab is actually being arranged.
    if (needsCabType(f.travel_mode) && !f.cab_type) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// POINT-FORM BODIES — a legal query is written as points, one per line.
// ---------------------------------------------------------------------------

export const POINT_BULLET = "• ";

/** Types whose details field is entered (and shown) as bullet points. */
export function usesPoints(type: ServiceRequestType): boolean {
  return type === "legal_query";
}

/**
 * Split a point-form body into its individual points, bullets and blank lines
 * stripped. Returns [] for empty input, so callers can fall back to plain text.
 */
export function toPoints(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*[•\-*]\s*/, "").trim())
    .filter(Boolean);
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
