"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { requireCapability } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

function s(v: FormDataEntryValue | null): string {
  return String(v || "").trim();
}
function nullable(v: FormDataEntryValue | null): string | null {
  const t = s(v);
  return t === "" ? null : t;
}

// ---------------------------------------------------------------------------
// CREATE — a salesperson requests a cab for one of THEIR OWN clients.
// ---------------------------------------------------------------------------
export async function createCabRequest(formData: FormData): Promise<void> {
  const actor = await requireCapability("request_cab");
  const sb = getSupabase();

  const customer_id = s(formData.get("customer_id"));
  const cab_date = s(formData.get("cab_date"));
  if (!customer_id || !cab_date) return;

  // The client must belong to the requester (admins may raise for anyone). A
  // client is theirs if they created it OR it's on a booking made with their id.
  const { data: cust } = await sb
    .from("customers")
    .select("id, created_by")
    .eq("id", customer_id)
    .maybeSingle();
  if (!cust) return;
  if (actor.role !== "admin" && cust.created_by !== actor.id) {
    const { data: ownBk } = await sb
      .from("bookings")
      .select("id")
      .eq("customer_id", customer_id)
      .or(`created_by.eq.${actor.id},partner_id.eq.${actor.id}`)
      .limit(1)
      .maybeSingle();
    if (!ownBk) return;
  }

  const { data, error } = await sb
    .from("cab_requests")
    .insert({
      customer_id,
      cab_date,
      pickup: nullable(formData.get("pickup")),
      notes: nullable(formData.get("notes")),
      requested_by: actor.id,
      status: "pending",
    })
    .select("id")
    .single();

  if (!error && data) {
    await logAudit(actor, "cab_request", data.id, "create", `cab on ${cab_date}`);
  }
  revalidatePath("/requests");
}

// ---------------------------------------------------------------------------
// APPROVE / DECLINE — admin only.
// ---------------------------------------------------------------------------
export async function approveCabRequest(formData: FormData): Promise<void> {
  const actor = await requireCapability("approve_cab");
  const sb = getSupabase();
  const id = s(formData.get("id"));
  if (!id) return;

  await sb
    .from("cab_requests")
    .update({
      status: "approved",
      decided_by: actor.id,
      decided_at: new Date().toISOString(),
      decline_reason: null,
    })
    .eq("id", id);
  await logAudit(actor, "cab_request", id, "approve");
  revalidatePath("/requests");
}

export async function declineCabRequest(formData: FormData): Promise<void> {
  const actor = await requireCapability("approve_cab");
  const sb = getSupabase();
  const id = s(formData.get("id"));
  if (!id) return;

  await sb
    .from("cab_requests")
    .update({
      status: "declined",
      decided_by: actor.id,
      decided_at: new Date().toISOString(),
      decline_reason: nullable(formData.get("reason")),
    })
    .eq("id", id);
  await logAudit(actor, "cab_request", id, "decline");
  revalidatePath("/requests");
}

// ---------------------------------------------------------------------------
// RESCHEDULE — the requester (or admin) changes the date. This re-submits the
// request as pending, clearing any prior approve/decline decision.
// ---------------------------------------------------------------------------
export async function rescheduleCabRequest(formData: FormData): Promise<void> {
  const actor = await requireCapability("request_cab");
  const sb = getSupabase();
  const id = s(formData.get("id"));
  const cab_date = s(formData.get("cab_date"));
  if (!id || !cab_date) return;

  const { data: req } = await sb
    .from("cab_requests")
    .select("requested_by")
    .eq("id", id)
    .maybeSingle();
  if (!req) return;
  if (actor.role !== "admin" && req.requested_by !== actor.id) return;

  await sb
    .from("cab_requests")
    .update({
      cab_date,
      status: "pending",
      decided_by: null,
      decided_at: null,
      decline_reason: null,
    })
    .eq("id", id);
  await logAudit(actor, "cab_request", id, "reschedule", `cab on ${cab_date}`);
  revalidatePath("/requests");
}
