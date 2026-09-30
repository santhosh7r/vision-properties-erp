import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../fetch-all";
import { exact, inr } from "../format";
import { withProjectScope, type DistrictScope } from "../scope";
import { ROLE_LABELS, type Role } from "../roles";
import { COUPON_TYPES, isValueCoupon, loanTokenByLabel } from "../options";
import { RELEASED_BY_ADMIN } from "../holds";
import { STAGE_LABEL, cabTypeLabel, travelModeLabel, type RequestStage } from "../requests";
import { COUPON_SOURCE_SELECT, describeTokenSource, type CouponSourceFields } from "../token-source";
import { PAYMENT_KIND_LABEL, bookingReceiptNo, paymentReceiptNo } from "@/app/receipts/data";
import { REPORT_BY_KEY, type ReportDef, type ReportKey } from "./catalog";
import { IST_OFFSET_MS, dateInPeriod, tsInPeriod, type ReportPeriod } from "./period";

// ---------------------------------------------------------------------------
// One fetcher per report. Each returns the rows for ONE month, already scoped,
// as plain cells plus the column layout — the page counts them and the export
// writes them, from the same call, so the number on screen is always the number
// of rows in the file.
//
// SCOPE mirrors the screens the data comes from:
//   • `scope` null  → company-wide (Admin, Finance, Legal).
//   • `scope` set   → a branch account (General Manager, Pre/Post-Sales desk):
//     only records on a project in its district. Payments and transfers carry
//     no project of their own, so they are scoped through their booking.
//   • Tokens stay company-wide, exactly as the Issue Token page shows them —
//     a desk issues to any salesperson who walks in.
// Every read pages past Supabase's 1000-row cap and throws on a query error: a
// short report that looks complete is worse than a failed download.
// ---------------------------------------------------------------------------

export type CellType = "text" | "date" | "datetime" | "money" | "number";

export interface ReportColumn {
  key: string;
  header: string;
  type?: CellType; // default text
  width?: number;
}

export type Cell = string | number | null;
export type ReportRow = Record<string, Cell>;

export interface ReportResult {
  def: ReportDef;
  columns: ReportColumn[];
  rows: ReportRow[];
  // Headline figures for the page card and the Summary sheet.
  highlights: string[];
}

export interface ReportContext {
  sb: SupabaseClient;
  period: ReportPeriod;
  scope: DistrictScope | null;
}

// Supabase rows are untyped JSON; each fetcher reads the fields it selected.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

const n = (v: unknown): number => exact(Number(v ?? 0) || 0);
const cap = (s: string | null | undefined) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "");
const count = <T>(rows: T[], pred: (r: T) => boolean) => rows.filter(pred).length;
const sum = <T>(rows: T[], f: (r: T) => number) => exact(rows.reduce((s, r) => s + f(r), 0));

/** "30 Sep 2026" for a timestamptz, in IST. Used in text cells only. */
function istDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

const BOOKING_STATUS: Record<string, string> = { pending: "Pending", confirmed: "Confirmed", cancelled: "Cancelled" };
const REFUND_STATUS: Record<string, string> = {
  none: "No refund",
  pending_approval: "Awaiting approval",
  approved: "Approved",
  paid: "Paid",
};
const REQUEST_STATUS: Record<string, string> = { pending: "Pending", approved: "Approved", declined: "Declined" };
const TRANSFER_KIND: Record<string, string> = { upgrade: "Upgrade", lateral: "Lateral", downgrade: "Downgrade" };

const roleLabel = (r: string | null | undefined) => (r ? (ROLE_LABELS[r as Role] ?? cap(r)) : "");
const stageLabel = (s: string | null | undefined) => (s ? (STAGE_LABEL[s as RequestStage] ?? cap(s)) : "");

/** Date range on a timestamptz column, as a PostgREST and() group. */
const tsRange = (col: string, p: ReportPeriod) => `${col}.gte.${p.startIso},${col}.lt.${p.endIso}`;
/** Date range on a date column. */
const dayRange = (col: string, p: ReportPeriod) => `${col}.gte.${p.startDate},${col}.lt.${p.endDate}`;

/** Scope a query through its embedded booking (payments, transfers). */
function viaBooking<Q>(q: Q, scope: DistrictScope | null): Q {
  if (!scope) return q;
  return (q as { in: (c: string, v: string[]) => Q }).in("bookings.project_id", scope.projectIds);
}

function all(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) {
  return fetchAllRows<Raw>(build, { strict: true });
}

// Shared booking cells — deal, plot, customer, sales chain.
const SALES_CHAIN_COLUMNS: ReportColumn[] = [
  { key: "partner_code", header: "Partner ID", width: 12 },
  { key: "partner", header: "Partner", width: 20 },
  { key: "director", header: "Director", width: 20 },
  { key: "senior_director", header: "Senior Director", width: 20 },
];
function salesChain(b: Raw | null | undefined): ReportRow {
  return {
    partner_code: b?.partner_code ?? "",
    partner: b?.partner_name ?? "",
    director: b?.director_name ?? "",
    senior_director: b?.senior_director_name ?? "",
  };
}

// ── Pre-Sales ───────────────────────────────────────────────────────────────

async function bookings(ctx: ReportContext): Promise<Omit<ReportResult, "def">> {
  const { sb, period: p, scope } = ctx;
  const raw = await all((from, to) =>
    withProjectScope(
      sb
        .from("bookings")
        .select(
          "id, receipt_no, created_at, booked_date, book_mode, status, payment_status, expired_at, block, plot_sqft, " +
            "total_plot_value, blocking_amount, advance_required, advance_paid, mode_of_payment, loan_token_by, " +
            "tentative_registration_date, partner_code, partner_name, director_name, senior_director_name, remarks, " +
            "plots(plot_no, block, sqft), projects(name), customers(name, mobile), creator:users!created_by(full_name)",
        )
        .or(`and(${tsRange("created_at", p)}),and(${dayRange("booked_date", p)})`),
      scope,
    )
      .order("created_at", { ascending: true })
      .order("id")
      .range(from, to),
  );

  const rows = raw.map((b): ReportRow => {
    const createdIn = tsInPeriod(b.created_at, p);
    const bookedIn = dateInPeriod(b.booked_date, p);
    // Why this record is in THIS month — never a guess, just which of the two
    // dates matched.
    const countedAs =
      createdIn && (bookedIn || !b.booked_date)
        ? "New this month"
        : createdIn
          ? `Entered this month · Booked Date ${b.booked_date}`
          : `Booked Date this month · entered ${istDay(b.created_at)}`;
    const total = n(b.total_plot_value);
    const paid = n(b.advance_paid);
    return {
      receipt_no: bookingReceiptNo(b as { id: string; receipt_no: string | null }),
      counted_as: countedAs,
      created_at: b.created_at,
      booked_date: b.booked_date,
      mode: cap(b.book_mode),
      status: `${BOOKING_STATUS[b.status] ?? cap(b.status)}${b.expired_at && b.status !== "cancelled" ? " · Expired" : ""}`,
      payment_status: cap(b.payment_status),
      project: b.projects?.name ?? "",
      block: b.block ?? b.plots?.block ?? "",
      plot_no: b.plots?.plot_no ?? "",
      sqft: n(b.plot_sqft ?? b.plots?.sqft),
      customer: b.customers?.name ?? "",
      mobile: b.customers?.mobile ?? "",
      total_value: total,
      blocking_amount: n(b.blocking_amount),
      advance_required: n(b.advance_required),
      paid,
      balance: exact(Math.max(0, total - paid)),
      mode_of_payment: b.mode_of_payment ?? "",
      loan_by: b.loan_token_by ? loanTokenByLabel(b.loan_token_by) : "",
      tentative_registration: b.tentative_registration_date,
      ...salesChain(b),
      entered_by: b.creator?.full_name ?? "",
      remarks: b.remarks ?? "",
    };
  });

  const live = raw.filter((b) => b.status !== "cancelled");
  return {
    columns: [
      { key: "receipt_no", header: "Receipt No", width: 12 },
      { key: "counted_as", header: "In This Month Because", width: 34 },
      { key: "created_at", header: "Entered On", type: "datetime" },
      { key: "booked_date", header: "Booked Date", type: "date" },
      { key: "mode", header: "Mode (now)", width: 11 },
      { key: "status", header: "Status (now)", width: 18 },
      { key: "payment_status", header: "Payment Status", width: 14 },
      { key: "project", header: "Project", width: 24 },
      { key: "block", header: "Block", width: 8 },
      { key: "plot_no", header: "Plot No", width: 9 },
      { key: "sqft", header: "Sq.ft", type: "number", width: 10 },
      { key: "customer", header: "Customer", width: 22 },
      { key: "mobile", header: "Mobile", width: 14 },
      { key: "total_value", header: "Plot Value", type: "money" },
      { key: "blocking_amount", header: "Blocking Amount", type: "money" },
      { key: "advance_required", header: "Advance Required", type: "money" },
      { key: "paid", header: "Paid So Far", type: "money" },
      { key: "balance", header: "Balance", type: "money" },
      { key: "mode_of_payment", header: "Mode of Payment", width: 15 },
      { key: "loan_by", header: "Loan Taken By", width: 15 },
      { key: "tentative_registration", header: "Tentative Registration", type: "date" },
      ...SALES_CHAIN_COLUMNS,
      { key: "entered_by", header: "Entered By", width: 18 },
      { key: "remarks", header: "Remarks", width: 30 },
    ],
    rows,
    highlights: [
      `${count(raw, (b) => b.book_mode === "blocking")} blockings · ${count(raw, (b) => b.book_mode === "booking")} bookings (current mode)`,
      `${count(raw, (b) => b.status === "cancelled")} since cancelled`,
      `Plot value ${inr(sum(live, (b) => n(b.total_plot_value)))} · paid ${inr(sum(live, (b) => n(b.advance_paid)))} (excl. cancelled)`,
    ],
  };
}

async function siteVisits(ctx: ReportContext): Promise<Omit<ReportResult, "def">> {
  const { sb, period: p, scope } = ctx;
  const raw = await all((from, to) =>
    withProjectScope(
      sb
        .from("service_requests")
        .select(
          "id, visit_date, visit_time, created_at, status, stage, customer_name, customer_phone, pickup, travel_mode, " +
            "cab_type, details, decline_reason, senior_decided_at, final_decided_at, customers(name, mobile), " +
            "project:projects!project_id(name), bookings(receipt_no, plots(plot_no, block)), " +
            "requester:users!requested_by(full_name, role, partner_code), senior:users!senior_decided_by(full_name), " +
            "approver:users!final_decided_by(full_name)",
        )
        .eq("type", "cab")
        .neq("status", "draft")
        .or(`and(${dayRange("visit_date", p)}),and(visit_date.is.null,${tsRange("created_at", p)})`),
      scope,
    )
      .order("created_at", { ascending: true })
      .order("id")
      .range(from, to),
  );
  // Paged by created_at for a stable cursor; presented by visit date.
  raw.sort((a, b) => String(a.visit_date ?? a.created_at).localeCompare(String(b.visit_date ?? b.created_at)));

  const rows = raw.map((r): ReportRow => ({
    visit_date: r.visit_date,
    visit_time: r.visit_time ? String(r.visit_time).slice(0, 5) : "",
    customer: r.customer_name ?? r.customers?.name ?? "",
    phone: r.customer_phone ?? r.customers?.mobile ?? "",
    project: r.project?.name ?? "",
    receipt_no: r.bookings?.receipt_no ?? "",
    plot_no: r.bookings?.plots?.plot_no ?? "",
    pickup: r.pickup ?? "",
    travel: travelModeLabel(r.travel_mode) ?? "",
    cab_type: cabTypeLabel(r.cab_type) ?? "",
    requested_by: r.requester?.full_name ?? "",
    requester_role: roleLabel(r.requester?.role),
    requester_code: r.requester?.partner_code ?? "",
    status: REQUEST_STATUS[r.status] ?? cap(r.status),
    stage: r.status === "pending" ? stageLabel(r.stage) : "",
    senior_by: r.senior?.full_name ?? "",
    senior_at: r.senior_decided_at,
    final_by: r.approver?.full_name ?? "",
    final_at: r.final_decided_at,
    decline_reason: r.decline_reason ?? "",
    requested_on: r.created_at,
    details: r.details ?? "",
  }));

  const byTravel = new Map<string, number>();
  for (const r of raw) {
    const k = travelModeLabel(r.travel_mode) ?? "Not set";
    byTravel.set(k, (byTravel.get(k) ?? 0) + 1);
  }
  return {
    columns: [
      { key: "visit_date", header: "Visit Date", type: "date" },
      { key: "visit_time", header: "Time", width: 8 },
      { key: "customer", header: "Customer", width: 22 },
      { key: "phone", header: "Phone", width: 14 },
      { key: "project", header: "Project", width: 24 },
      { key: "receipt_no", header: "Booking Receipt", width: 14 },
      { key: "plot_no", header: "Plot No", width: 9 },
      { key: "pickup", header: "Pickup", width: 24 },
      { key: "travel", header: "Travel", width: 11 },
      { key: "cab_type", header: "Cab Type", width: 11 },
      { key: "requested_by", header: "Requested By", width: 20 },
      { key: "requester_role", header: "Requester Role", width: 16 },
      { key: "requester_code", header: "Partner ID", width: 12 },
      { key: "status", header: "Status", width: 11 },
      { key: "stage", header: "Waiting On", width: 18 },
      { key: "senior_by", header: "Senior Director Decision By", width: 20 },
      { key: "senior_at", header: "Senior Director Decided At", type: "datetime" },
      { key: "final_by", header: "Final Decision By", width: 20 },
      { key: "final_at", header: "Final Decided At", type: "datetime" },
      { key: "decline_reason", header: "Decline Reason", width: 28 },
      { key: "requested_on", header: "Requested On", type: "datetime" },
      { key: "details", header: "Details", width: 30 },
    ],
    rows,
    highlights: [
      `${count(raw, (r) => r.status === "approved")} approved · ${count(raw, (r) => r.status === "pending")} pending · ${count(raw, (r) => r.status === "declined")} declined`,
      [...byTravel].map(([k, v]) => `${k} ${v}`).join(" · ") || "No visits",
    ],
  };
}

async function tokens(ctx: ReportContext): Promise<Omit<ReportResult, "def">> {
  const { sb, period: p } = ctx;
  const raw = await all((from, to) =>
    sb
      .from("coupons")
      .select(
        `id, created_at, type, quantity, value, source, note, ${COUPON_SOURCE_SELECT}, ` +
          "holder:users!user_id(full_name, partner_code, role), issuer:users!issued_by(full_name)",
      )
      .gte("created_at", p.startIso)
      .lt("created_at", p.endIso)
      .order("created_at", { ascending: true })
      .order("id")
      .range(from, to),
  );

  const typeLabel = Object.fromEntries(COUPON_TYPES.map((t) => [t.value, t.label]));
  const rows = raw.map((c): ReportRow => {
    const src = describeTokenSource(c as unknown as CouponSourceFields);
    const valueBased = isValueCoupon(c.type);
    const amount = valueBased ? n(c.value) : n(c.quantity);
    return {
      date: c.created_at,
      holder: c.holder?.full_name ?? "(removed user)",
      holder_code: c.holder?.partner_code ?? "",
      holder_role: roleLabel(c.holder?.role),
      token: typeLabel[c.type] ?? c.type,
      action: c.source === "redeem" || amount < 0 ? "Redeemed" : "Issued",
      quantity: valueBased ? null : amount,
      value: valueBased ? amount : null,
      source: src.originLabel,
      reference: src.reference,
      plot: src.plot,
      customer: src.customer,
      recorded_by: c.issuer?.full_name ?? (c.source === "auto" ? "System" : ""),
      note: c.note ?? "",
    };
  });

  // Per type: what went out and what came back, in that type's own unit.
  const highlights = COUPON_TYPES.map((t) => {
    const ofType = raw.filter((c) => c.type === t.value);
    if (!ofType.length) return null;
    const vb = isValueCoupon(t.value);
    const amt = (c: Raw) => (vb ? n(c.value) : n(c.quantity));
    const issued = sum(ofType.filter((c) => amt(c) > 0), amt);
    const redeemed = -sum(ofType.filter((c) => amt(c) < 0), amt);
    const f = (v: number) => (vb ? inr(v) : String(v));
    return `${t.label}: issued ${f(issued)} · redeemed ${f(redeemed)}`;
  }).filter((s): s is string => !!s);

  return {
    columns: [
      { key: "date", header: "Date", type: "datetime" },
      { key: "holder", header: "Holder", width: 22 },
      { key: "holder_code", header: "Partner ID", width: 12 },
      { key: "holder_role", header: "Role", width: 16 },
      { key: "token", header: "Token", width: 14 },
      { key: "action", header: "Action", width: 10 },
      { key: "quantity", header: "Quantity (Cab)", type: "number", width: 12 },
      { key: "value", header: "Value (₹)", type: "money" },
      { key: "source", header: "Source", width: 20 },
      { key: "reference", header: "Reference", width: 24 },
      { key: "plot", header: "For Plot", width: 30 },
      { key: "customer", header: "Customer", width: 22 },
      { key: "recorded_by", header: "Recorded By", width: 18 },
      { key: "note", header: "Note", width: 30 },
    ],
    rows,
    highlights: highlights.length ? highlights : ["No token movements"],
  };
}

// ── Post-Sales ──────────────────────────────────────────────────────────────

async function registrations(ctx: ReportContext): Promise<Omit<ReportResult, "def">> {
  const { sb, period: p, scope } = ctx;
  const raw = await all((from, to) =>
    withProjectScope(
      sb
        .from("registrations")
        .select(
          "id, register_number, register_date, block, plot_sqft, name_of_registrant, mobile, remarks, created_at, " +
            "plots(plot_no, block, sqft), projects(name), creator:users!created_by(full_name), " +
            "bookings(id, receipt_no, total_plot_value, advance_paid, partner_code, partner_name, director_name, senior_director_name, customers(name, mobile))",
        )
        .gte("register_date", p.startDate)
        .lt("register_date", p.endDate),
      scope,
    )
      .order("register_date", { ascending: true })
      .order("id")
      .range(from, to),
  );

  const rows = raw.map((r): ReportRow => ({
    register_number: r.register_number ?? "",
    register_date: r.register_date,
    project: r.projects?.name ?? "",
    block: r.block ?? r.plots?.block ?? "",
    plot_no: r.plots?.plot_no ?? "",
    sqft: n(r.plot_sqft ?? r.plots?.sqft),
    registrant: r.name_of_registrant ?? "",
    mobile: r.mobile ?? "",
    customer: r.bookings?.customers?.name ?? "",
    receipt_no: r.bookings ? bookingReceiptNo(r.bookings) : "",
    total_value: r.bookings ? n(r.bookings.total_plot_value) : null,
    paid: r.bookings ? n(r.bookings.advance_paid) : null,
    ...salesChain(r.bookings),
    recorded_by: r.creator?.full_name ?? "",
    recorded_on: r.created_at,
    remarks: r.remarks ?? "",
  }));

  return {
    columns: [
      { key: "register_number", header: "Register No", width: 14 },
      { key: "register_date", header: "Register Date", type: "date" },
      { key: "project", header: "Project", width: 24 },
      { key: "block", header: "Block", width: 8 },
      { key: "plot_no", header: "Plot No", width: 9 },
      { key: "sqft", header: "Sq.ft", type: "number", width: 10 },
      { key: "registrant", header: "Name of Registrant", width: 22 },
      { key: "mobile", header: "Mobile", width: 14 },
      { key: "customer", header: "Customer (Booking)", width: 22 },
      { key: "receipt_no", header: "Booking Receipt", width: 14 },
      { key: "total_value", header: "Plot Value", type: "money" },
      { key: "paid", header: "Paid", type: "money" },
      ...SALES_CHAIN_COLUMNS,
      { key: "recorded_by", header: "Recorded By", width: 18 },
      { key: "recorded_on", header: "Recorded On", type: "datetime" },
      { key: "remarks", header: "Remarks", width: 30 },
    ],
    rows,
    highlights: [
      `${raw.length} registrations · ${sum(rows, (r) => Number(r.sqft) || 0).toLocaleString("en-IN")} sq.ft`,
      `Plot value ${inr(sum(rows, (r) => Number(r.total_value) || 0))}`,
    ],
  };
}

const CANCEL_SELECT =
  "id, receipt_no, created_at, booked_date, released_at, book_mode, block, total_plot_value, advance_paid, " +
  "cancellation_reason, cancellation_charge, refund_amount, refund_status, refund_approved_at, refund_paid_at, " +
  "refund_due_date, cancel_request_reason, partner_code, partner_name, director_name, senior_director_name, " +
  "plots(plot_no, block), projects(name), customers(name, mobile), requester:users!cancel_requested_by(full_name)";

async function cancellations(ctx: ReportContext): Promise<Omit<ReportResult, "def">> {
  const { sb, period: p, scope } = ctx;
  const raw = await all((from, to) =>
    withProjectScope(
      sb
        .from("bookings")
        .select(CANCEL_SELECT)
        .eq("status", "cancelled")
        // Older cancellations predate released_at; the Post-Sales page dates
        // those by created_at, and so does this.
        .or(`and(${tsRange("released_at", p)}),and(released_at.is.null,${tsRange("created_at", p)})`),
      scope,
    )
      .order("created_at", { ascending: true })
      .order("id")
      .range(from, to),
  );
  raw.sort((a, b) => String(a.released_at ?? a.created_at).localeCompare(String(b.released_at ?? b.created_at)));

  const released = (b: Raw) => b.cancellation_reason === RELEASED_BY_ADMIN;
  const rows = raw.map((b): ReportRow => ({
    receipt_no: bookingReceiptNo(b as { id: string; receipt_no: string | null }),
    cancelled_on: b.released_at ?? b.created_at,
    type: released(b) ? "Released to company (Admin)" : "Cancelled",
    reason: released(b) ? "" : (b.cancellation_reason ?? ""),
    mode: cap(b.book_mode),
    project: b.projects?.name ?? "",
    block: b.block ?? b.plots?.block ?? "",
    plot_no: b.plots?.plot_no ?? "",
    customer: b.customers?.name ?? "",
    mobile: b.customers?.mobile ?? "",
    booked_date: b.booked_date,
    total_value: n(b.total_plot_value),
    paid: n(b.advance_paid),
    charge: n(b.cancellation_charge),
    refund_amount: n(b.refund_amount),
    refund_status: REFUND_STATUS[b.refund_status] ?? cap(b.refund_status),
    refund_approved_at: b.refund_approved_at,
    refund_paid_at: b.refund_paid_at,
    requested_by: b.requester?.full_name ?? "",
    request_reason: b.cancel_request_reason ?? "",
    ...salesChain(b),
  }));

  return {
    columns: [
      { key: "receipt_no", header: "Receipt No", width: 12 },
      { key: "cancelled_on", header: "Cancelled On", type: "datetime" },
      { key: "type", header: "Type", width: 26 },
      { key: "reason", header: "Reason", width: 28 },
      { key: "mode", header: "Mode", width: 10 },
      { key: "project", header: "Project", width: 24 },
      { key: "block", header: "Block", width: 8 },
      { key: "plot_no", header: "Plot No", width: 9 },
      { key: "customer", header: "Customer", width: 22 },
      { key: "mobile", header: "Mobile", width: 14 },
      { key: "booked_date", header: "Booked Date", type: "date" },
      { key: "total_value", header: "Plot Value", type: "money" },
      { key: "paid", header: "Paid", type: "money" },
      { key: "charge", header: "Cancellation Charge", type: "money" },
      { key: "refund_amount", header: "Refund Amount", type: "money" },
      { key: "refund_status", header: "Refund Status", width: 17 },
      { key: "refund_approved_at", header: "Refund Approved At", type: "datetime" },
      { key: "refund_paid_at", header: "Refund Paid At", type: "datetime" },
      { key: "requested_by", header: "Cancellation Requested By", width: 20 },
      { key: "request_reason", header: "Request Reason", width: 28 },
      ...SALES_CHAIN_COLUMNS,
    ],
    rows,
    highlights: [
      `${count(raw, (b) => !released(b))} cancelled · ${count(raw, released)} released to company`,
      `Charges ${inr(sum(raw, (b) => n(b.cancellation_charge)))} · refunds ${inr(sum(raw, (b) => n(b.refund_amount)))}`,
    ],
  };
}

async function transfers(ctx: ReportContext): Promise<Omit<ReportResult, "def">> {
  const { sb, period: p, scope } = ctx;
  const raw = await all((from, to) =>
    viaBooking(
      sb
        .from("plot_transfers")
        .select(
          "id, created_at, kind, from_value, to_value, charge, remarks, " +
            "bookings!inner(id, receipt_no, project_id, customers(name, mobile), projects(name)), " +
            "from:plots!from_plot_id(plot_no, block), to:plots!to_plot_id(plot_no, block), " +
            "approver:users!approved_by(full_name), creator:users!created_by(full_name)",
        )
        .gte("created_at", p.startIso)
        .lt("created_at", p.endIso),
      scope,
    )
      .order("created_at", { ascending: true })
      .order("id")
      .range(from, to),
  );

  const plotLabel = (pl: Raw | null) => (pl ? [pl.block ? `Block ${pl.block}` : null, `Plot ${pl.plot_no}`].filter(Boolean).join(" · ") : "");
  const rows = raw.map((t): ReportRow => ({
    date: t.created_at,
    receipt_no: t.bookings ? bookingReceiptNo(t.bookings) : "",
    customer: t.bookings?.customers?.name ?? "",
    mobile: t.bookings?.customers?.mobile ?? "",
    project: t.bookings?.projects?.name ?? "",
    from_plot: plotLabel(t.from),
    to_plot: plotLabel(t.to),
    kind: TRANSFER_KIND[t.kind] ?? cap(t.kind),
    from_value: n(t.from_value),
    to_value: n(t.to_value),
    difference: exact(n(t.to_value) - n(t.from_value)),
    charge: n(t.charge),
    approved_by: t.approver?.full_name ?? "",
    done_by: t.creator?.full_name ?? "",
    remarks: t.remarks ?? "",
  }));

  return {
    columns: [
      { key: "date", header: "Transferred On", type: "datetime" },
      { key: "receipt_no", header: "Booking Receipt", width: 14 },
      { key: "customer", header: "Customer", width: 22 },
      { key: "mobile", header: "Mobile", width: 14 },
      { key: "project", header: "Project", width: 24 },
      { key: "from_plot", header: "From Plot", width: 18 },
      { key: "to_plot", header: "To Plot", width: 18 },
      { key: "kind", header: "Kind", width: 11 },
      { key: "from_value", header: "From Value", type: "money" },
      { key: "to_value", header: "To Value", type: "money" },
      { key: "difference", header: "Difference", type: "money" },
      { key: "charge", header: "Transfer Charge", type: "money" },
      { key: "approved_by", header: "Approved By", width: 18 },
      { key: "done_by", header: "Done By", width: 18 },
      { key: "remarks", header: "Remarks", width: 30 },
    ],
    rows,
    highlights: [
      Object.entries(TRANSFER_KIND)
        .map(([k, label]) => `${count(raw, (t) => t.kind === k)} ${label.toLowerCase()}`)
        .join(" · "),
      `Transfer charges ${inr(sum(raw, (t) => n(t.charge)))}`,
    ],
  };
}

// ── Finance ─────────────────────────────────────────────────────────────────

async function payments(ctx: ReportContext): Promise<Omit<ReportResult, "def">> {
  const { sb, period: p, scope } = ctx;
  const raw = await all((from, to) =>
    viaBooking(
      sb
        .from("payments")
        .select(
          "id, receipt_no, paid_at, amount, kind, mode, reference, bank_name, instrument_date, status, " +
            "recorder:users!recorded_by(full_name), " +
            "bookings!inner(id, receipt_no, project_id, block, customers(name, mobile), projects(name), plots(plot_no, block))",
        )
        .gte("paid_at", p.startIso)
        .lt("paid_at", p.endIso),
      scope,
    )
      .order("paid_at", { ascending: true })
      .order("id")
      .range(from, to),
  );

  const rows = raw.map((x): ReportRow => ({
    receipt_no: paymentReceiptNo(x.bookings, x as { id: string; receipt_no: string | null }),
    paid_at: x.paid_at,
    booking_receipt: bookingReceiptNo(x.bookings),
    customer: x.bookings?.customers?.name ?? "",
    mobile: x.bookings?.customers?.mobile ?? "",
    project: x.bookings?.projects?.name ?? "",
    block: x.bookings?.block ?? x.bookings?.plots?.block ?? "",
    plot_no: x.bookings?.plots?.plot_no ?? "",
    kind: PAYMENT_KIND_LABEL[x.kind] ?? cap(x.kind),
    mode: x.mode ?? "",
    reference: x.reference ?? "",
    bank: x.bank_name ?? "",
    instrument_date: x.instrument_date,
    amount: n(x.amount),
    status: cap(x.status),
    recorded_by: x.recorder?.full_name ?? "",
  }));

  const done = raw.filter((x) => x.status === "completed");
  const byMode = new Map<string, number>();
  for (const x of done) byMode.set(x.mode || "Not set", exact((byMode.get(x.mode || "Not set") ?? 0) + n(x.amount)));
  return {
    columns: [
      { key: "receipt_no", header: "Receipt No", width: 14 },
      { key: "paid_at", header: "Paid On", type: "datetime" },
      { key: "booking_receipt", header: "Booking Receipt", width: 14 },
      { key: "customer", header: "Customer", width: 22 },
      { key: "mobile", header: "Mobile", width: 14 },
      { key: "project", header: "Project", width: 24 },
      { key: "block", header: "Block", width: 8 },
      { key: "plot_no", header: "Plot No", width: 9 },
      { key: "kind", header: "Kind", width: 15 },
      { key: "mode", header: "Mode", width: 13 },
      { key: "reference", header: "Reference", width: 18 },
      { key: "bank", header: "Bank", width: 18 },
      { key: "instrument_date", header: "Instrument Date", type: "date" },
      { key: "amount", header: "Amount", type: "money" },
      { key: "status", header: "Status", width: 11 },
      { key: "recorded_by", header: "Recorded By", width: 18 },
    ],
    rows,
    highlights: [
      `Collected ${inr(sum(done, (x) => n(x.amount)))} across ${done.length} payments` +
        (raw.length > done.length ? ` · ${raw.length - done.length} not completed` : ""),
      [...byMode].map(([k, v]) => `${k} ${inr(v)}`).join(" · ") || "No payments",
    ],
  };
}

async function refunds(ctx: ReportContext): Promise<Omit<ReportResult, "def">> {
  const { sb, period: p, scope } = ctx;
  const raw = await all((from, to) =>
    withProjectScope(
      sb
        .from("bookings")
        .select(CANCEL_SELECT)
        .gt("refund_amount", 0)
        .or(`and(${tsRange("refund_approved_at", p)}),and(${tsRange("refund_paid_at", p)})`),
      scope,
    )
      .order("created_at", { ascending: true })
      .order("id")
      .range(from, to),
  );

  const rows = raw.map((b): ReportRow => {
    const approvedIn = tsInPeriod(b.refund_approved_at, p);
    const paidIn = tsInPeriod(b.refund_paid_at, p);
    return {
      receipt_no: bookingReceiptNo(b as { id: string; receipt_no: string | null }),
      counted_as: approvedIn && paidIn ? "Approved & paid this month" : paidIn ? "Paid this month" : "Approved this month",
      customer: b.customers?.name ?? "",
      mobile: b.customers?.mobile ?? "",
      project: b.projects?.name ?? "",
      plot_no: b.plots?.plot_no ?? "",
      cancelled_on: b.released_at ?? b.created_at,
      paid: n(b.advance_paid),
      charge: n(b.cancellation_charge),
      refund_amount: n(b.refund_amount),
      refund_status: REFUND_STATUS[b.refund_status] ?? cap(b.refund_status),
      approved_at: b.refund_approved_at,
      due_date: b.refund_due_date,
      paid_at: b.refund_paid_at,
    };
  });

  return {
    columns: [
      { key: "receipt_no", header: "Receipt No", width: 12 },
      { key: "counted_as", header: "In This Month Because", width: 26 },
      { key: "customer", header: "Customer", width: 22 },
      { key: "mobile", header: "Mobile", width: 14 },
      { key: "project", header: "Project", width: 24 },
      { key: "plot_no", header: "Plot No", width: 9 },
      { key: "cancelled_on", header: "Cancelled On", type: "datetime" },
      { key: "paid", header: "Customer Had Paid", type: "money" },
      { key: "charge", header: "Cancellation Charge", type: "money" },
      { key: "refund_amount", header: "Refund Amount", type: "money" },
      { key: "refund_status", header: "Refund Status (now)", width: 17 },
      { key: "approved_at", header: "Approved At", type: "datetime" },
      { key: "due_date", header: "Due Date", type: "date" },
      { key: "paid_at", header: "Paid At", type: "datetime" },
    ],
    rows,
    highlights: [
      `Approved ${inr(sum(raw.filter((b) => tsInPeriod(b.refund_approved_at, p)), (b) => n(b.refund_amount)))}`,
      `Paid out ${inr(sum(raw.filter((b) => tsInPeriod(b.refund_paid_at, p)), (b) => n(b.refund_amount)))}`,
    ],
  };
}

// ── Legal ───────────────────────────────────────────────────────────────────

async function legalQueries(ctx: ReportContext): Promise<Omit<ReportResult, "def">> {
  const { sb, period: p, scope } = ctx;
  const raw = await all((from, to) =>
    withProjectScope(
      sb
        .from("service_requests")
        .select(
          "id, created_at, subject, details, response, status, stage, decline_reason, final_decided_at, " +
            "customers(name, mobile), project:projects!project_id(name), bookings(receipt_no), " +
            "requester:users!requested_by(full_name, role), approver:users!final_decided_by(full_name)",
        )
        .eq("type", "legal_query")
        .neq("status", "draft")
        .gte("created_at", p.startIso)
        .lt("created_at", p.endIso),
      scope,
    )
      .order("created_at", { ascending: true })
      .order("id")
      .range(from, to),
  );

  const rows = raw.map((r): ReportRow => ({
    raised_on: r.created_at,
    subject: r.subject ?? "",
    details: r.details ?? "",
    raised_by: r.requester?.full_name ?? "",
    raiser_role: roleLabel(r.requester?.role),
    customer: r.customers?.name ?? "",
    project: r.project?.name ?? "",
    receipt_no: r.bookings?.receipt_no ?? "",
    status: REQUEST_STATUS[r.status] ?? cap(r.status),
    stage: r.status === "pending" ? stageLabel(r.stage) : "",
    response: r.response ?? "",
    decided_by: r.approver?.full_name ?? "",
    decided_at: r.final_decided_at,
    decline_reason: r.decline_reason ?? "",
  }));

  return {
    columns: [
      { key: "raised_on", header: "Raised On", type: "datetime" },
      { key: "subject", header: "Subject", width: 28 },
      { key: "details", header: "Details", width: 40 },
      { key: "raised_by", header: "Raised By", width: 20 },
      { key: "raiser_role", header: "Role", width: 16 },
      { key: "customer", header: "Customer", width: 22 },
      { key: "project", header: "Project", width: 24 },
      { key: "receipt_no", header: "Booking Receipt", width: 14 },
      { key: "status", header: "Status", width: 11 },
      { key: "stage", header: "Waiting On", width: 16 },
      { key: "response", header: "Response", width: 40 },
      { key: "decided_by", header: "Decided By", width: 18 },
      { key: "decided_at", header: "Decided At", type: "datetime" },
      { key: "decline_reason", header: "Decline Reason", width: 28 },
    ],
    rows,
    highlights: [
      `${count(raw, (r) => r.status === "approved")} answered · ${count(raw, (r) => r.status === "pending")} pending · ${count(raw, (r) => r.status === "declined")} declined`,
    ],
  };
}

const FETCHERS: Record<ReportKey, (ctx: ReportContext) => Promise<Omit<ReportResult, "def">>> = {
  bookings,
  site_visits: siteVisits,
  tokens,
  registrations,
  cancellations,
  transfers,
  payments,
  refunds,
  legal_queries: legalQueries,
};

/** Run one report for one month. Throws if any read fails. */
export async function runReport(key: ReportKey, ctx: ReportContext): Promise<ReportResult> {
  const def = REPORT_BY_KEY.get(key);
  if (!def) throw new Error(`Unknown report: ${key}`);
  return { def, ...(await FETCHERS[key](ctx)) };
}
