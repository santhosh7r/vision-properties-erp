"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { requireUser, requireCapability } from "@/lib/auth";
import { getDownlineIds } from "@/lib/hierarchy";
import { logAudit } from "@/lib/audit";
import {
  REQUEST_CHAIN,
  initialStage,
  nextStage,
  canActOnStage,
  requestTypeMeta,
  type ServiceRequestType,
  type RequestStage,
} from "@/lib/requests";

function s(v: FormDataEntryValue | null): string {
  return String(v || "").trim();
}
function nullable(v: FormDataEntryValue | null): string | null {
  const t = s(v);
  return t === "" ? null : t;
}

const VALID_TYPES = Object.keys(REQUEST_CHAIN) as ServiceRequestType[];

// ---------------------------------------------------------------------------
// CREATE — a salesperson raises a request of a given type.
// ---------------------------------------------------------------------------
export async function createServiceRequest(formData: FormData): Promise<void> {
  const actor = await requireCapability("create_request");
  // Admin only approves requests — they never raise them.
  if (actor.role === "admin") return;
  const sb = getSupabase();

  const type = s(formData.get("type")) as ServiceRequestType;
  if (!VALID_TYPES.includes(type)) return;
  const meta = requestTypeMeta(type);

  const customer_id = nullable(formData.get("customer_id"));
  const booking_id = nullable(formData.get("booking_id"));

  if (meta.needsCustomer && !customer_id) return;
  if (meta.needsBooking && !booking_id) return;

  // Ownership guard. A customer is "theirs" if they created it or booked with
  // their own id; a booking is theirs if created by / assigned to their downline.
  // (Admin returned above and never reaches here.)
  if (customer_id) {
    const { data: cust } = await sb
      .from("customers")
      .select("id, created_by")
      .eq("id", customer_id)
      .maybeSingle();
    if (!cust) return;
    if (cust.created_by !== actor.id) {
      const { data: ownBk } = await sb
        .from("bookings")
        .select("id")
        .eq("customer_id", customer_id)
        .or(`created_by.eq.${actor.id},partner_id.eq.${actor.id}`)
        .limit(1)
        .maybeSingle();
      if (!ownBk) return;
    }
  }
  if (booking_id) {
    const ids = await getDownlineIds(sb, actor.id);
    const { data: bk } = await sb
      .from("bookings")
      .select("id, created_by, partner_id")
      .eq("id", booking_id)
      .maybeSingle();
    if (!bk) return;
    const owns =
      (bk.created_by && ids.includes(bk.created_by)) ||
      (bk.partner_id && ids.includes(bk.partner_id));
    if (!owns) return;
  }

  // Resolve the project from the booking (best effort) for reporting.
  let project_id: string | null = null;
  if (booking_id) {
    const { data: bk } = await sb
      .from("bookings")
      .select("project_id")
      .eq("id", booking_id)
      .maybeSingle();
    project_id = bk?.project_id ?? null;
  }

  const { data, error } = await sb
    .from("service_requests")
    .insert({
      type,
      status: "pending",
      stage: initialStage(type),
      customer_id,
      booking_id,
      project_id,
      subject: nullable(formData.get("subject")),
      details: nullable(formData.get("details")),
      visit_date: nullable(formData.get("visit_date")),
      pickup: nullable(formData.get("pickup")),
      requested_by: actor.id,
    })
    .select("id")
    .single();

  if (!error && data) {
    await logAudit(actor, "request", data.id, "create", meta.label);
  }
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
    .select("id, type, stage, status, booking_id")
    .eq("id", id)
    .maybeSingle();
  if (!req || req.status !== "pending") return;

  const stage = req.stage as RequestStage;
  const type = req.type as ServiceRequestType;
  if (!canActOnStage(actor.role, stage)) return;

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
