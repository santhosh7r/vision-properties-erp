"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { requireCapability } from "@/lib/auth";
import { logAudit, notify } from "@/lib/audit";
import { totalPlotValue } from "@/lib/format";
import { computeAdvanceRequired, computeRefund, addWorkingDays } from "@/lib/sop";
import type { BookMode, LoanTokenBy } from "@/lib/types";

function s(v: FormDataEntryValue | null): string {
  return String(v || "").trim();
}
function nullable(v: FormDataEntryValue | null): string | null {
  const t = s(v);
  return t === "" ? null : t;
}

// ---------------------------------------------------------------------------
// LOOK UP a sales person by their Partner ID (SD#/D#/BM#/BP#). Returns the
// partner's name plus the director above them in the chain (their nearest
// `director` ancestor, falling back to a senior_director). Used by the booking
// form so entering a Partner ID auto-fills Partner Name + Director ID/Name.
// ---------------------------------------------------------------------------
interface SalesRef {
  id: string;
  code: string | null;
  name: string;
}
export interface SalesLookup {
  ok: boolean;
  error?: string;
  partner?: SalesRef;
  seniorDirector?: SalesRef | null;
  director?: SalesRef | null;
}

export async function lookupSalesPerson(rawCode: string): Promise<SalesLookup> {
  const code = String(rawCode || "").trim();
  if (!code) return { ok: false, error: "Enter a Partner ID." };

  const sb = getSupabase();
  const { data: person } = await sb
    .from("users")
    .select("id, full_name, role, manager_id, partner_code, is_active")
    .ilike("partner_code", code)
    .maybeSingle();
  if (!person) return { ok: false, error: `No sales partner found for "${code}".` };
  if (!person.is_active) return { ok: false, error: `${person.partner_code} is inactive.` };

  // Walk up the manager chain to find the governing director.
  const { data: all } = await sb
    .from("users")
    .select("id, full_name, role, manager_id, partner_code");
  type Node = { id: string; full_name: string; role: string; manager_id: string | null; partner_code: string | null };
  const byId = new Map<string, Node>((all ?? []).map((u) => [u.id, u as Node]));

  const findAncestor = (start: Node, role: string): Node | null => {
    let cur: Node | undefined | null = start;
    let guard = 0;
    while (cur && guard++ < 1000) {
      if (cur.role === role) return cur;
      cur = cur.manager_id ? byId.get(cur.manager_id) : null;
    }
    return null;
  };

  const start = person as unknown as Node;
  const director = findAncestor(start, "director");
  const seniorDirector = findAncestor(start, "senior_director");
  const ref = (n: Node | null) =>
    n ? { id: n.id, code: n.partner_code, name: n.full_name } : null;

  return {
    ok: true,
    partner: { id: person.id, code: person.partner_code, name: person.full_name },
    seniorDirector: ref(seniorDirector),
    director: ref(director),
  };
}

// ---------------------------------------------------------------------------
// CREATE — block or book a plot (board: the big blocking/booking form)
// ---------------------------------------------------------------------------
export async function createBooking(formData: FormData): Promise<void> {
  const plot_id = s(formData.get("plot_id"));
  const mode = s(formData.get("book_mode")) as BookMode;
  if (!plot_id || (mode !== "blocking" && mode !== "booking")) return;

  // Sales roles may BLOCK; only Admin may BOOK. Gate on the matching capability.
  const actor = await requireCapability(mode === "booking" ? "create_booking" : "create_blocking");
  const sb = getSupabase();

  // Load plot + project for pricing/config; verify availability.
  const { data: plot } = await sb
    .from("plots")
    .select("*, projects(*)")
    .eq("id", plot_id)
    .maybeSingle();
  if (!plot) return;
  if (plot.status !== "available") {
    redirect(`/plots/${plot_id}?err=unavailable`);
  }
  const project = plot.projects;

  // --- Amounts & lock gate (computed BEFORE touching customer/booking) -------
  // Required amounts come from the PROJECT config only — they are set at project
  // creation and are NOT editable on the booking form (the form is read-only for
  // these). The form is the source of truth ONLY for how much is paid now.
  const value = totalPlotValue(plot.sqft, plot.price_per_sqft);
  // §2: advance = max(advance_percent % of value, advance_min_amount).
  const advance_required = computeAdvanceRequired(
    value,
    project.advance_percent,
    project.advance_min_amount,
  );
  const blocking_amount = Number(project.blocking_amount);
  const amountPaidNow = Number(formData.get("amount_paid_now") || 0);
  const paymentMode = nullable(formData.get("payment_mode"));

  // Board logic: a plot only leaves 'available' when the qualifying amount is
  // actually paid IN FULL — blocking needs the full blocking amount, booking
  // needs the full advance. If underpaid, no hold is created and the plot stays
  // available for anyone else to block. (We gate here, before creating a
  // customer, so a rejected attempt leaves no orphan records.)
  const requiredToLock = mode === "blocking" ? blocking_amount : advance_required;
  if (amountPaidNow < requiredToLock) {
    redirect(`/bookings/new?plot=${plot_id}&mode=${mode}&err=underpaid`);
  }

  // Resolve customer: existing id, or create new (with duplicate guard).
  let customer_id = s(formData.get("customer_id"));
  if (!customer_id) {
    const name = s(formData.get("name"));
    const mobile = s(formData.get("mobile"));
    if (!name || !mobile) redirect(`/bookings/new?plot=${plot_id}&mode=${mode}&err=customer`);

    const { data: existingCust } = await sb
      .from("customers")
      .select("id")
      .eq("mobile", mobile)
      .maybeSingle();
    if (existingCust) {
      customer_id = existingCust.id;
    } else {
      const { data: newCust, error } = await sb
        .from("customers")
        .insert({
          name,
          mobile,
          email: nullable(formData.get("email")),
          dob: nullable(formData.get("dob")),
          street: nullable(formData.get("street")),
          area: nullable(formData.get("area")),
          pincode: nullable(formData.get("pincode")),
          state: nullable(formData.get("state")),
          district: nullable(formData.get("district")),
          country: nullable(formData.get("country")),
          occupation: nullable(formData.get("occupation")),
          occupation_remarks: nullable(formData.get("occupation_remarks")),
          created_by: actor.id,
        })
        .select("id")
        .single();
      if (error || !newCust) return;
      customer_id = newCust.id;
    }
  }

  // Window deadline (board: blocking -> N hours; booking -> N days).
  const now = Date.now();
  const expires_at =
    mode === "blocking"
      ? new Date(now + project.blocking_window_hours * 3_600_000).toISOString()
      : new Date(now + project.booking_window_days * 86_400_000).toISOString();

  const { data: booking, error: bookErr } = await sb
    .from("bookings")
    .insert({
      plot_id,
      customer_id,
      project_id: project.id,
      plot_sqft: plot.sqft,
      total_plot_value: value,
      nominee_name: nullable(formData.get("nominee_name")),
      nominee_mobile: nullable(formData.get("nominee_mobile")),
      nominee_relationship: nullable(formData.get("nominee_relationship")),
      partner_id: nullable(formData.get("partner_id")),
      partner_code: nullable(formData.get("partner_code")),
      partner_name: nullable(formData.get("partner_name")),
      senior_director_id: nullable(formData.get("senior_director_id")),
      senior_director_code: nullable(formData.get("senior_director_code")),
      senior_director_name: nullable(formData.get("senior_director_name")),
      director_id: nullable(formData.get("director_id")),
      director_code: nullable(formData.get("director_code")),
      director_name: nullable(formData.get("director_name")),
      tentative_registration_date: nullable(formData.get("tentative_registration_date")),
      mode_of_payment: nullable(formData.get("mode_of_payment")),
      loan_token_by: (nullable(formData.get("loan_token_by")) as LoanTokenBy | null) ?? null,
      booked_date: nullable(formData.get("booked_date")) ?? new Date().toISOString().slice(0, 10),
      remarks: nullable(formData.get("remarks")),
      book_mode: mode,
      blocking_amount: mode === "blocking" ? blocking_amount : 0,
      advance_required,
      advance_paid: 0,
      status: "pending",
      payment_status: "pending",
      expires_at,
      created_by: actor.id,
    })
    .select("id")
    .single();

  // Unique index may reject if another active booking exists for this plot.
  if (bookErr || !booking) {
    redirect(`/plots/${plot_id}?err=conflict`);
  }

  // Move plot into blocked/booked.
  await sb
    .from("plots")
    .update({ status: mode === "blocking" ? "blocked" : "booked" })
    .eq("id", plot_id);

  // Optional initial payment (blocking amount or advance).
  if (amountPaidNow > 0) {
    await sb.from("payments").insert({
      booking_id: booking.id,
      amount: amountPaidNow,
      kind: mode === "blocking" ? "blocking" : "advance",
      mode: paymentMode,
      status: "completed",
      recorded_by: actor.id,
    });
    await recomputePayment(booking.id);
  }

  await logAudit(actor, "booking", booking.id, mode === "blocking" ? "block" : "book", `plot ${plot.plot_no}`);
  await notify(
    booking.id,
    "sms",
    null,
    mode === "blocking"
      ? `Plot ${plot.plot_no} blocked. Book within ${project.blocking_window_hours} hours to confirm.`
      : `Booking received for plot ${plot.plot_no}. Advance ${advance_required}. Project: ${project.name}.`,
  );

  redirect(`/bookings/${booking.id}`);
}

// Recompute advance_paid + payment_status from the payments ledger.
async function recomputePayment(bookingId: string): Promise<void> {
  const sb = getSupabase();
  const { data: pays } = await sb
    .from("payments")
    .select("amount, status")
    .eq("booking_id", bookingId)
    .eq("status", "completed");
  const paid = (pays ?? []).reduce((sum, p) => sum + Number(p.amount), 0);

  const { data: b } = await sb
    .from("bookings")
    .select("total_plot_value")
    .eq("id", bookingId)
    .maybeSingle();
  const total = Number(b?.total_plot_value || 0);

  await sb
    .from("bookings")
    .update({
      advance_paid: paid,
      payment_status: total > 0 && paid >= total ? "completed" : "pending",
    })
    .eq("id", bookingId);
}

// ---------------------------------------------------------------------------
// RECORD PAYMENT (finance/admin)
// ---------------------------------------------------------------------------
export async function recordPayment(formData: FormData): Promise<void> {
  const actor = await requireCapability("record_payment");
  const sb = getSupabase();
  const booking_id = s(formData.get("booking_id"));
  const amount = Number(formData.get("amount") || 0);
  const kind = s(formData.get("kind")) || "installment";
  const mode = nullable(formData.get("mode"));
  if (!booking_id || amount <= 0) return;

  await sb.from("payments").insert({
    booking_id,
    amount,
    kind,
    mode,
    status: "completed",
    recorded_by: actor.id,
  });
  await recomputePayment(booking_id);
  await logAudit(actor, "payment", booking_id, "record", `₹${amount} (${kind})`);
  await notify(booking_id, "sms", null, `Payment of ₹${amount} received and recorded.`);
  revalidatePath(`/bookings/${booking_id}`);
  revalidatePath("/payments");
}

// ---------------------------------------------------------------------------
// EDIT DETAILS — update the captured (non-financial) fields of a booking.
// Plot, customer, amounts and status are managed through their own flows; this
// only edits the descriptive details (nominee, partner/director, dates, remarks).
// ---------------------------------------------------------------------------
export async function updateBooking(formData: FormData): Promise<void> {
  // Editing applies to both blockings and bookings — gate on create_blocking
  // (held by all sales roles and Admin).
  const actor = await requireCapability("create_blocking");
  const sb = getSupabase();
  const id = s(formData.get("id"));
  if (!id) return;

  await sb
    .from("bookings")
    .update({
      nominee_name: nullable(formData.get("nominee_name")),
      nominee_mobile: nullable(formData.get("nominee_mobile")),
      nominee_relationship: nullable(formData.get("nominee_relationship")),
      partner_id: nullable(formData.get("partner_id")),
      partner_code: nullable(formData.get("partner_code")),
      partner_name: nullable(formData.get("partner_name")),
      senior_director_id: nullable(formData.get("senior_director_id")),
      senior_director_code: nullable(formData.get("senior_director_code")),
      senior_director_name: nullable(formData.get("senior_director_name")),
      director_id: nullable(formData.get("director_id")),
      director_code: nullable(formData.get("director_code")),
      director_name: nullable(formData.get("director_name")),
      tentative_registration_date: nullable(formData.get("tentative_registration_date")),
      mode_of_payment: nullable(formData.get("mode_of_payment")),
      loan_token_by: (nullable(formData.get("loan_token_by")) as LoanTokenBy | null) ?? null,
      booked_date: nullable(formData.get("booked_date")),
      remarks: nullable(formData.get("remarks")),
    })
    .eq("id", id);

  await logAudit(actor, "booking", id, "edit", "details updated");
  revalidatePath(`/bookings/${id}`);
  revalidatePath("/bookings");
  redirect(`/bookings/${id}`);
}

// ---------------------------------------------------------------------------
// CONFIRM / CANCEL (board: Booking List actions)
// ---------------------------------------------------------------------------
export async function confirmBooking(formData: FormData): Promise<void> {
  const actor = await requireCapability("confirm_booking");
  const sb = getSupabase();
  const id = s(formData.get("id"));
  if (!id) return;

  const { data: booking } = await sb
    .from("bookings")
    .select("id, plot_id, book_mode, customers(mobile)")
    .eq("id", id)
    .maybeSingle();
  if (!booking) return;

  await sb.from("bookings").update({ status: "confirmed", expires_at: null }).eq("id", id);
  // Confirming a blocking promotes it to a booking; plot becomes booked.
  await sb.from("plots").update({ status: "booked" }).eq("id", booking.plot_id);

  await logAudit(actor, "booking", id, "confirm");
  await notify(id, "sms", null, "Booking Confirmed. Plot details and registration to follow.");
  revalidatePath(`/bookings/${id}`);
  revalidatePath("/bookings");
}

export async function cancelBooking(formData: FormData): Promise<void> {
  const actor = await requireCapability("cancel_booking");
  const sb = getSupabase();
  const id = s(formData.get("id"));
  if (!id) return;

  const { data: booking } = await sb
    .from("bookings")
    .select("plot_id, advance_paid, booked_date, created_at, projects(*)")
    .eq("id", id)
    .maybeSingle();
  if (!booking) return;

  // §3 Refund computation from the project's editable policy.
  const project = booking.projects as unknown as {
    cancel_full_refund_days: number;
    cancellation_charge: number;
    refund_processing_days: number;
  };
  const blockingDate = booking.booked_date ?? booking.created_at;
  const nowIso = new Date().toISOString();
  const paid = Number(booking.advance_paid || 0);
  const r = computeRefund(project, blockingDate, nowIso, paid);
  // Refund needs COO approval only when money is actually owed back.
  const refund_status = r.refund > 0 ? "pending_approval" : "none";

  await sb
    .from("bookings")
    .update({
      status: "cancelled",
      released_at: nowIso,
      cancellation_reason: nullable(formData.get("reason")),
      cancellation_charge: r.charge,
      refund_amount: r.refund,
      refund_status,
    })
    .eq("id", id);
  await sb.from("plots").update({ status: "available" }).eq("id", booking.plot_id);

  await logAudit(
    actor,
    "booking",
    id,
    "cancel",
    `${r.daysSinceBlocking}d since blocking · refund ₹${r.refund}${r.charge ? ` (charge ₹${r.charge})` : ""}`,
  );
  await notify(
    id,
    "sms",
    null,
    r.refund > 0
      ? `Booking cancelled. Refund of ₹${r.refund} is pending approval${r.charge ? ` (₹${r.charge} admin charge deducted)` : ""}.`
      : "Booking cancelled. The plot has been released back to inventory.",
  );
  revalidatePath(`/bookings/${id}`);
  revalidatePath("/bookings");
}

// §3 COO approval of a refund. Sets the payout due date from the policy SLA.
export async function approveRefund(formData: FormData): Promise<void> {
  const actor = await requireCapability("approve_refund");
  const sb = getSupabase();
  const id = s(formData.get("id"));
  if (!id) return;

  const { data: booking } = await sb
    .from("bookings")
    .select("refund_status, projects(refund_processing_days)")
    .eq("id", id)
    .maybeSingle();
  if (!booking || booking.refund_status !== "pending_approval") return;

  const slaDays =
    (booking.projects as unknown as { refund_processing_days: number }).refund_processing_days ?? 5;
  const due = addWorkingDays(new Date(), slaDays).toISOString().slice(0, 10);

  await sb
    .from("bookings")
    .update({
      refund_status: "approved",
      refund_approved_by: actor.id,
      refund_approved_at: new Date().toISOString(),
      refund_due_date: due,
    })
    .eq("id", id);
  await logAudit(actor, "booking", id, "refund_approve", `payout due ${due}`);
  await notify(id, "sms", null, `Refund approved. Payout will be processed by ${due}.`);
  revalidatePath(`/bookings/${id}`);
}

// §3 Finance marks the approved refund as paid out.
export async function markRefundPaid(formData: FormData): Promise<void> {
  const actor = await requireCapability("record_payment");
  const sb = getSupabase();
  const id = s(formData.get("id"));
  if (!id) return;

  const { data: booking } = await sb
    .from("bookings")
    .select("refund_status, refund_amount")
    .eq("id", id)
    .maybeSingle();
  if (!booking || booking.refund_status !== "approved") return;

  await sb
    .from("bookings")
    .update({ refund_status: "paid", refund_paid_at: new Date().toISOString() })
    .eq("id", id);
  await logAudit(actor, "booking", id, "refund_paid", `₹${booking.refund_amount ?? 0}`);
  await notify(id, "sms", null, `Refund of ₹${booking.refund_amount ?? 0} has been paid out.`);
  revalidatePath(`/bookings/${id}`);
  revalidatePath("/payments");
}

// ---------------------------------------------------------------------------
// §7 TRANSFER / CHANGE PLOT — move a booking to another available plot.
// Upgrade (higher value) = no charge; downgrade (lower value) = configurable
// transfer charge. "Subject to availability and approval" → gated by
// manage_transfer capability.
// ---------------------------------------------------------------------------
export async function transferBooking(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_transfer");
  const sb = getSupabase();
  const id = s(formData.get("id"));
  const to_plot_id = s(formData.get("to_plot_id"));
  if (!id || !to_plot_id) return;

  const { data: booking } = await sb
    .from("bookings")
    .select("id, plot_id, project_id, status, book_mode, total_plot_value, projects(advance_percent, advance_min_amount, transfer_charge)")
    .eq("id", id)
    .maybeSingle();
  if (!booking || booking.status === "cancelled") return;
  if (to_plot_id === booking.plot_id) redirect(`/bookings/${id}?err=same_plot`);

  // New plot must be available and in the same project.
  const { data: toPlot } = await sb
    .from("plots")
    .select("id, project_id, plot_no, sqft, price_per_sqft, status")
    .eq("id", to_plot_id)
    .maybeSingle();
  if (!toPlot || toPlot.status !== "available" || toPlot.project_id !== booking.project_id) {
    redirect(`/bookings/${id}?err=transfer_unavailable`);
  }

  const proj = booking.projects as unknown as {
    advance_percent: number;
    advance_min_amount: number;
    transfer_charge: number;
  };
  const from_value = Number(booking.total_plot_value || 0);
  const to_value = totalPlotValue(toPlot.sqft, toPlot.price_per_sqft);
  const kind = to_value > from_value ? "upgrade" : to_value < from_value ? "downgrade" : "lateral";
  const charge = kind === "downgrade" ? Number(proj.transfer_charge || 0) : 0;
  const advance_required = computeAdvanceRequired(to_value, proj.advance_percent, proj.advance_min_amount);

  // Current plot lifecycle state carries over to the new plot.
  const { data: fromPlot } = await sb.from("plots").select("status").eq("id", booking.plot_id).maybeSingle();
  const carriedStatus = fromPlot?.status === "booked" ? "booked" : "blocked";

  await sb.from("plots").update({ status: "available" }).eq("id", booking.plot_id);
  await sb.from("plots").update({ status: carriedStatus }).eq("id", to_plot_id);
  await sb
    .from("bookings")
    .update({
      plot_id: to_plot_id,
      plot_sqft: toPlot.sqft,
      total_plot_value: to_value,
      advance_required,
    })
    .eq("id", id);

  await sb.from("plot_transfers").insert({
    booking_id: id,
    from_plot_id: booking.plot_id,
    to_plot_id,
    from_value,
    to_value,
    kind,
    charge,
    remarks: nullable(formData.get("remarks")),
    approved_by: actor.id,
    created_by: actor.id,
  });

  await recomputePayment(id);
  await logAudit(actor, "booking", id, "transfer", `${kind} → plot ${toPlot.plot_no}${charge ? ` (charge ₹${charge})` : ""}`);
  await notify(
    id,
    "sms",
    null,
    `Plot changed to ${toPlot.plot_no} (${kind}).${charge ? ` Transfer charge ₹${charge} applies.` : ""}`,
  );
  revalidatePath(`/bookings/${id}`);
}

// ---------------------------------------------------------------------------
// CONVERT a blocking into a full booking
// ---------------------------------------------------------------------------
export async function convertToBooking(formData: FormData): Promise<void> {
  const actor = await requireCapability("create_booking");
  const sb = getSupabase();
  const id = s(formData.get("id"));
  if (!id) return;

  const { data: booking } = await sb
    .from("bookings")
    .select("id, plot_id, project_id")
    .eq("id", id)
    .maybeSingle();
  if (!booking) return;

  const { data: project } = await sb
    .from("projects")
    .select("booking_window_days")
    .eq("id", booking.project_id)
    .maybeSingle();
  const days = project?.booking_window_days ?? 15;
  const expires_at = new Date(Date.now() + days * 86_400_000).toISOString();

  await sb.from("bookings").update({ book_mode: "booking", expires_at }).eq("id", id);
  await sb.from("plots").update({ status: "booked" }).eq("id", booking.plot_id);
  await logAudit(actor, "booking", id, "convert_to_booking");
  await notify(id, "sms", null, "Your hold has been converted to a booking.");
  revalidatePath(`/bookings/${id}`);
}
