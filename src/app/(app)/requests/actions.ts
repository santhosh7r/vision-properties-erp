"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { requireUser, requireCapability } from "@/lib/auth";
import { getDownlineIds } from "@/lib/hierarchy";
import { logAudit } from "@/lib/audit";
import {
  REQUEST_CHAIN,
  initialStageFor,
  nextStage,
  canActOnStage,
  requestTypeMeta,
  isRequestComplete,
  type ServiceRequestType,
  type RequestStage,
} from "@/lib/requests";
import type { SupabaseClient } from "@supabase/supabase-js";

function s(v: FormDataEntryValue | null): string {
  return String(v || "").trim();
}
function nullable(v: FormDataEntryValue | null): string | null {
  const t = s(v);
  return t === "" ? null : t;
}

const VALID_TYPES = Object.keys(REQUEST_CHAIN) as ServiceRequestType[];

// A salesperson's cab-token balance is the SUM of their coupon ledger rows of
// type 'cab' (admin issues positive rows; approvals insert −1 rows). Fails open
// to 0 if the coupons table isn't migrated yet.
async function cabTokenBalance(sb: SupabaseClient, userId: string): Promise<number> {
  const { data } = await sb.from("coupons").select("quantity").eq("user_id", userId).eq("type", "cab");
  return ((data ?? []) as { quantity: number }[]).reduce((sum, r) => sum + (r.quantity ?? 0), 0);
}

// ---------------------------------------------------------------------------
// CREATE — a salesperson raises a request of a given type.
// ---------------------------------------------------------------------------

// The content fields written to a service_requests row.
interface RequestFields {
  customer_id: string | null;
  booking_id: string | null;
  project_id: string | null;
  subject: string | null;
  details: string | null;
  visit_date: string | null;
  pickup: string | null;
}

// Parse the form into request fields and confirm the actor OWNS every relation
// they referenced (customer / booking / project). Returns null if any provided
// relation isn't theirs. Does NOT enforce required-ness — callers decide that
// (submitting is strict; saving a draft is lenient).
async function parseRequestFields(
  sb: SupabaseClient,
  actorId: string,
  formData: FormData,
): Promise<RequestFields | null> {
  const customer_id = nullable(formData.get("customer_id"));
  const booking_id = nullable(formData.get("booking_id"));
  let project_id = nullable(formData.get("project_id"));

  // A customer is "theirs" if they created it or have booked with their own id.
  if (customer_id) {
    const { data: cust } = await sb
      .from("customers")
      .select("id, created_by")
      .eq("id", customer_id)
      .maybeSingle();
    if (!cust) return null;
    if (cust.created_by !== actorId) {
      const { data: ownBk } = await sb
        .from("bookings")
        .select("id")
        .eq("customer_id", customer_id)
        .or(`created_by.eq.${actorId},partner_id.eq.${actorId}`)
        .limit(1)
        .maybeSingle();
      if (!ownBk) return null;
    }
  }
  if (booking_id) {
    const ids = await getDownlineIds(sb, actorId);
    const { data: bk } = await sb
      .from("bookings")
      .select("id, created_by, partner_id")
      .eq("id", booking_id)
      .maybeSingle();
    if (!bk) return null;
    const owns =
      (bk.created_by && ids.includes(bk.created_by)) ||
      (bk.partner_id && ids.includes(bk.partner_id));
    if (!owns) return null;
  }
  // The project must be one the actor PERSONALLY blocked or booked.
  if (project_id) {
    const { data: ownProj } = await sb
      .from("bookings")
      .select("id")
      .eq("project_id", project_id)
      .or(`created_by.eq.${actorId},partner_id.eq.${actorId}`)
      .limit(1)
      .maybeSingle();
    if (!ownProj) return null;
  }
  // Fall back to the booking's project when none was supplied.
  if (!project_id && booking_id) {
    const { data: bk } = await sb.from("bookings").select("project_id").eq("id", booking_id).maybeSingle();
    project_id = bk?.project_id ?? null;
  }

  return {
    customer_id,
    booking_id,
    project_id,
    subject: nullable(formData.get("subject")),
    details: nullable(formData.get("details")),
    visit_date: nullable(formData.get("visit_date")),
    pickup: nullable(formData.get("pickup")),
  };
}

// A Director must hold a cab token to submit a cab request (spent on final
// approval); a Senior Director is unlimited. Returns false if the gate fails.
async function cabGateOk(sb: SupabaseClient, role: string, actorId: string): Promise<boolean> {
  if (role !== "senior_director" && role !== "director") return false;
  if (role === "director") return (await cabTokenBalance(sb, actorId)) >= 1;
  return true;
}

export async function createServiceRequest(formData: FormData): Promise<void> {
  const actor = await requireCapability("create_request");
  // Admin only approves requests — they never raise them.
  if (actor.role === "admin") return;
  const sb = getSupabase();

  const type = s(formData.get("type")) as ServiceRequestType;
  if (!VALID_TYPES.includes(type)) return;
  const meta = requestTypeMeta(type);
  const draft_id = nullable(formData.get("draft_id"));

  if (type === "cab" && !(await cabGateOk(sb, actor.role, actor.id))) return;

  const fields = await parseRequestFields(sb, actor.id, formData);
  if (!fields) return;
  if (meta.needsCustomer && !fields.customer_id) return;
  if (meta.needsBooking && !fields.booking_id) return;

  const stage = initialStageFor(type, actor.role);

  // Submitting an edited draft updates that row in place; otherwise insert new.
  if (draft_id) {
    const { error } = await sb
      .from("service_requests")
      .update({ type, status: "pending", stage, ...fields, updated_at: new Date().toISOString() })
      .eq("id", draft_id)
      .eq("requested_by", actor.id)
      .eq("status", "draft");
    if (!error) await logAudit(actor, "request", draft_id, "submit", meta.label);
  } else {
    const { data, error } = await sb
      .from("service_requests")
      .insert({ type, status: "pending", stage, ...fields, requested_by: actor.id })
      .select("id")
      .single();
    if (!error && data) await logAudit(actor, "request", data.id, "create", meta.label);
  }
  revalidatePath("/requests");
}

// ---------------------------------------------------------------------------
// SAVE DRAFT — store a (possibly incomplete) request as a draft. No required
// fields and no token gate; only ownership of any referenced relation is
// checked. Updates the draft in place when editing an existing one.
// ---------------------------------------------------------------------------
export async function saveDraftRequest(formData: FormData): Promise<void> {
  const actor = await requireCapability("create_request");
  if (actor.role === "admin") return;
  const sb = getSupabase();

  const type = s(formData.get("type")) as ServiceRequestType;
  if (!VALID_TYPES.includes(type)) return;
  const draft_id = nullable(formData.get("draft_id"));

  const fields = await parseRequestFields(sb, actor.id, formData);
  if (!fields) return;

  if (draft_id) {
    await sb
      .from("service_requests")
      .update({ type, ...fields, updated_at: new Date().toISOString() })
      .eq("id", draft_id)
      .eq("requested_by", actor.id)
      .eq("status", "draft");
  } else {
    await sb.from("service_requests").insert({
      type,
      status: "draft",
      stage: initialStageFor(type, actor.role),
      ...fields,
      requested_by: actor.id,
    });
  }
  revalidatePath("/requests");
}

// ---------------------------------------------------------------------------
// SUBMIT DRAFT — promote an existing draft straight to the approval chain from
// the list (without reopening the form). Validates completeness + cab gate.
// ---------------------------------------------------------------------------
export async function submitDraftRequest(formData: FormData): Promise<void> {
  const actor = await requireCapability("create_request");
  if (actor.role === "admin") return;
  const sb = getSupabase();
  const id = s(formData.get("id"));
  if (!id) return;

  const { data: draft } = await sb
    .from("service_requests")
    .select("id, type, customer_id, booking_id, project_id, visit_date, details, status, requested_by")
    .eq("id", id)
    .maybeSingle();
  if (!draft || draft.status !== "draft" || draft.requested_by !== actor.id) return;

  const type = draft.type as ServiceRequestType;
  if (!isRequestComplete(type, draft)) return;
  if (type === "cab" && !(await cabGateOk(sb, actor.role, actor.id))) return;

  await sb
    .from("service_requests")
    .update({
      status: "pending",
      stage: initialStageFor(type, actor.role),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("requested_by", actor.id)
    .eq("status", "draft");

  await logAudit(actor, "request", id, "submit", requestTypeMeta(type).label);
  revalidatePath("/requests");
}

// ---------------------------------------------------------------------------
// DELETE DRAFT — discard a draft the user no longer wants.
// ---------------------------------------------------------------------------
export async function deleteDraftRequest(formData: FormData): Promise<void> {
  const actor = await requireCapability("create_request");
  if (actor.role === "admin") return;
  const sb = getSupabase();
  const id = s(formData.get("id"));
  if (!id) return;
  await sb.from("service_requests").delete().eq("id", id).eq("requested_by", actor.id).eq("status", "draft");
  revalidatePath("/requests");
}

// ---------------------------------------------------------------------------
// ADVANCE — an approver moves the request to the next stage (or completes it).
// ---------------------------------------------------------------------------
export async function advanceServiceRequest(formData: FormData): Promise<void> {
  const actor = await requireUser();
  const sb = getSupabase();
  const id = s(formData.get("id"));
  if (!id) return;

  const { data: req } = await sb
    .from("service_requests")
    .select("id, type, stage, status, booking_id, requested_by")
    .eq("id", id)
    .maybeSingle();
  if (!req || req.status !== "pending") return;

  const stage = req.stage as RequestStage;
  const type = req.type as ServiceRequestType;
  if (!canActOnStage(actor.role, stage)) return;

  // A cab request at the Senior Director stage may only be approved by the
  // requester's OWN Senior Director (i.e. the requester is in their downline) —
  // or by Admin as a backstop. This keeps it within the right branch.
  if (type === "cab" && stage === "senior" && actor.role !== "admin") {
    const ids = await getDownlineIds(sb, actor.id);
    if (!req.requested_by || !ids.includes(req.requested_by)) return;
  }

  const next = nextStage(type, stage);
  const nowIso = new Date().toISOString();

  const update: Record<string, unknown> = { stage: next, updated_at: nowIso };
  if (stage === "senior") {
    update.senior_decided_by = actor.id;
    update.senior_decided_at = nowIso;
  }
  const response = nullable(formData.get("response"));
  if (response !== null) update.response = response;

  if (next === "done") {
    update.status = "approved";
    update.final_decided_by = actor.id;
    update.final_decided_at = nowIso;
  }

  await sb.from("service_requests").update(update).eq("id", id);

  // Side effect: a fully-approved cab request spends ONE cab token from the
  // requesting Director's bank — recorded as a −1 ledger row so balances stay a
  // simple sum. Senior Directors are unlimited, so nothing is deducted for them.
  if (next === "done" && type === "cab" && req.requested_by) {
    const { data: reqUser } = await sb
      .from("users")
      .select("role")
      .eq("id", req.requested_by)
      .maybeSingle();
    if ((reqUser?.role as string | undefined) === "director") {
      await sb.from("coupons").insert({
        user_id: req.requested_by,
        type: "cab",
        quantity: -1,
        value: 0,
        source: "auto",
        note: "Cab request approved",
        issued_by: actor.id,
      });
    }
  }

  // Side effect: a completed cancellation cancels the booking and frees the plot
  // for the next customer (refund handled by accounts at this stage).
  if (next === "done" && type === "cancellation" && req.booking_id) {
    const { data: bk } = await sb
      .from("bookings")
      .select("id, plot_id, advance_paid")
      .eq("id", req.booking_id)
      .maybeSingle();
    if (bk) {
      await sb
        .from("bookings")
        .update({
          status: "cancelled",
          released_at: nowIso,
          refund_status: "paid",
          refund_amount: bk.advance_paid ?? 0,
          refund_approved_by: actor.id,
          refund_approved_at: nowIso,
          refund_paid_at: nowIso,
        })
        .eq("id", bk.id);
      if (bk.plot_id) {
        // Hold as 'cancelled' for Admin to release from the Plot Release page —
        // the requesting panel still sees the cancellation as completed.
        await sb.from("plots").update({ status: "cancelled" }).eq("id", bk.plot_id);
      }
    }
  }

  await logAudit(
    actor,
    "request",
    id,
    next === "done" ? "approve" : "forward",
    `${requestTypeMeta(type).label} → ${next === "done" ? "completed" : next}`,
  );
  revalidatePath("/requests");
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// DECLINE — any approver in the chain can reject the request.
// ---------------------------------------------------------------------------
export async function declineServiceRequest(formData: FormData): Promise<void> {
  const actor = await requireUser();
  const sb = getSupabase();
  const id = s(formData.get("id"));
  if (!id) return;

  const { data: req } = await sb
    .from("service_requests")
    .select("id, type, stage, status")
    .eq("id", id)
    .maybeSingle();
  if (!req || req.status !== "pending") return;
  if (!canActOnStage(actor.role, req.stage as RequestStage)) return;

  await sb
    .from("service_requests")
    .update({
      status: "declined",
      stage: "done",
      final_decided_by: actor.id,
      final_decided_at: new Date().toISOString(),
      decline_reason: nullable(formData.get("reason")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  await logAudit(actor, "request", id, "decline", requestTypeMeta(req.type as ServiceRequestType).label);
  revalidatePath("/requests");
}
