"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { requireCapability } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { ApprovalType, ProjectStatus, ProjectType } from "@/lib/types";

// Editable SOP policy config (shared by create + update). Defaults mirror the
// SOP but every value is overridable per project — nothing is hard-coded.
function policyFields(f: FormData) {
  const n = (key: string, fallback: number) => {
    const v = Number(f.get(key));
    return Number.isFinite(v) && f.get(key) !== null && String(f.get(key)) !== "" ? v : fallback;
  };
  return {
    blocking_amount: n("blocking_amount", 10000),
    blocking_window_hours: n("blocking_window_hours", 48),
    advance_percent: n("advance_percent", 5),
    advance_min_amount: n("advance_min_amount", 50000),
    booking_window_days: n("booking_window_days", 15),
    cancel_full_refund_days: n("cancel_full_refund_days", 3),
    cancellation_charge: n("cancellation_charge", 5000),
    refund_processing_days: n("refund_processing_days", 5),
    transfer_charge: n("transfer_charge", 5000),
  };
}

// Office Details (Admin panel · New Project Form §2). Branch is free text; the
// rest are per-sq.ft rupee rates feeding the Tokens/Coupons subsystem.
function officeFields(f: FormData) {
  const n = (key: string, fallback: number) => {
    const v = Number(f.get(key));
    return Number.isFinite(v) && f.get(key) !== null && String(f.get(key)) !== "" ? v : fallback;
  };
  return {
    branch: String(f.get("branch") || "").trim() || null,
    guideline_value: n("guideline_value", 0),
    director_gold_coupon: n("director_gold_coupon", 0),
    director_digital_coupon: n("director_digital_coupon", 0),
    senior_director_gold_coupon: n("senior_director_gold_coupon", 0),
    director_tools_coupon: n("director_tools_coupon", 0),
    senior_director_tools_coupon: n("senior_director_tools_coupon", 0),
  };
}

export async function createProject(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_projects");

  const payload = {
    name: String(formData.get("name") || "").trim(),
    district: String(formData.get("district") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    remarks: String(formData.get("remarks") || "").trim() || null,
    area: String(formData.get("area") || "").trim(),
    land_type: String(formData.get("land_type") || "").trim() || null,
    approval_type: String(formData.get("approval_type") || "") as ApprovalType,
    project_type: String(formData.get("project_type") || "") as ProjectType,
    ...officeFields(formData),
    ...policyFields(formData),
    status: (String(formData.get("status") || "active") as ProjectStatus),
    created_by: actor.id,
  };

  if (!payload.name || !payload.district || !payload.city || !payload.area) return;

  const { data, error } = await getSupabase()
    .from("projects")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) return;
  await logAudit(actor, "project", data.id, "create", payload.name);
  redirect(`/projects/${data.id}`);
}

export async function updateProject(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_projects");
  const id = String(formData.get("id") || "");
  if (!id) return;

  const payload = {
    name: String(formData.get("name") || "").trim(),
    district: String(formData.get("district") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    remarks: String(formData.get("remarks") || "").trim() || null,
    area: String(formData.get("area") || "").trim(),
    land_type: String(formData.get("land_type") || "").trim() || null,
    approval_type: String(formData.get("approval_type") || "") as ApprovalType,
    project_type: String(formData.get("project_type") || "") as ProjectType,
    ...officeFields(formData),
    ...policyFields(formData),
    status: String(formData.get("status") || "active") as ProjectStatus,
  };

  if (!payload.name || !payload.district || !payload.city || !payload.area) return;

  const { error } = await getSupabase().from("projects").update(payload).eq("id", id);
  if (error) return;

  await logAudit(actor, "project", id, "update", payload.name);
  revalidatePath(`/inventory/manage/${id}`);
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  redirect(`/inventory/manage/${id}`);
}

export async function deleteProject(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_projects");
  const id = String(formData.get("id") || "");
  if (!id) return;

  // bookings & registrations are ON DELETE RESTRICT — block the delete if any exist
  // (plots cascade automatically, so a project with only plots can still be removed).
  const sb = getSupabase();
  const [{ count: bookings }, { count: registrations }] = await Promise.all([
    sb.from("bookings").select("id", { count: "exact", head: true }).eq("project_id", id),
    sb.from("registrations").select("id", { count: "exact", head: true }).eq("project_id", id),
  ]);

  if ((bookings ?? 0) > 0 || (registrations ?? 0) > 0) {
    redirect(`/inventory/manage/${id}?error=has_dependents`);
  }

  const { error } = await sb.from("projects").delete().eq("id", id);
  if (error) redirect(`/inventory/manage/${id}?error=delete_failed`);

  await logAudit(actor, "project", id, "delete");
  revalidatePath("/projects");
  revalidatePath("/inventory/manage");
  redirect("/inventory/manage");
}

export async function updateProjectStatus(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_projects");
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "") as ProjectStatus;
  if (!id) return;
  await getSupabase().from("projects").update({ status }).eq("id", id);
  await logAudit(actor, "project", id, "status_change", status);
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
}
