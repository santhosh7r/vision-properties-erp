"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { requireCapability } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Plot Release (Admin panel · Sales · Post-Sales) — free a plot back to the
// company. Releases any active (pending/confirmed) booking WITHOUT a refund flow
// (distinct from a cancellation) and returns the plot to 'available' for the
// next customer. Admin-only.
export async function releasePlot(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_plots");
  const sb = getSupabase();
  const plot_id = String(formData.get("plot_id") || "");
  if (!plot_id) return;

  const nowIso = new Date().toISOString();

  const { data: booking } = await sb
    .from("bookings")
    .select("id")
    .eq("plot_id", plot_id)
    .in("status", ["pending", "confirmed"])
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (booking) {
    await sb
      .from("bookings")
      .update({
        status: "cancelled",
        released_at: nowIso,
        cancellation_reason: "Released by admin",
        refund_status: "none",
      })
      .eq("id", booking.id);
    await logAudit(actor, "booking", booking.id, "release", "plot released to company");
  }

  await sb.from("plots").update({ status: "available" }).eq("id", plot_id);
  await logAudit(actor, "plot", plot_id, "release");
  revalidatePath(`/plots/${plot_id}`);
  revalidatePath("/plots");
  revalidatePath("/inventory/release");
  revalidatePath("/dashboard");
}

// Create a plot group/category within a project (e.g. Phase 1, Premium).
export async function createPlotCategory(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_plots");
  const project_id = String(formData.get("project_id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!project_id || !name) return;

  const { data, error } = await getSupabase()
    .from("plot_categories")
    .insert({
      project_id,
      name,
      description: String(formData.get("description") || "").trim() || null,
    })
    .select("id")
    .single();
  if (!error && data) {
    await logAudit(actor, "plot_category", data.id, "create", name);
  }
  revalidatePath(`/projects/${project_id}`);
}

// Statuses a plot may be created with. booked/registered/sold require an actual
// transaction, so creation is limited to these.
const CREATABLE_PLOT_STATUSES = ["available", "blocked"] as const;

export async function createPlot(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_plots");
  const project_id = String(formData.get("project_id") || "");
  const plot_category_id = String(formData.get("plot_category_id") || "") || null;
  const plot_no = String(formData.get("plot_no") || "").trim();
  const sqft = Number(formData.get("sqft") || 0);
  const description = String(formData.get("description") || "").trim() || null;
  const statusInput = String(formData.get("status") || "available");
  const status = (CREATABLE_PLOT_STATUSES as readonly string[]).includes(statusInput)
    ? statusInput
    : "available";

  // Block (category) is mandatory — a plot must belong to a category.
  if (!project_id || !plot_category_id || !plot_no || sqft <= 0) return;

  const { data, error } = await getSupabase()
    .from("plots")
    .insert({ project_id, plot_category_id, plot_no, sqft, description, status })
    .select("id")
    .single();

  if (!error && data) {
    await logAudit(actor, "plot", data.id, "create", plot_no);
  }
  revalidatePath(`/projects/${project_id}`);
  revalidatePath("/plots");
}

// Re-assign a plot to a different category (or to uncategorised) after creation.
export async function updatePlotCategory(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_plots");
  const id = String(formData.get("id") || "");
  const project_id = String(formData.get("project_id") || "");
  const plot_category_id = String(formData.get("plot_category_id") || "") || null;
  if (!id) return;
  await getSupabase().from("plots").update({ plot_category_id }).eq("id", id);
  await logAudit(actor, "plot", id, "category_change", plot_category_id ?? "uncategorised");
  if (project_id) revalidatePath(`/projects/${project_id}`);
}

export async function updatePlotPrice(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_plots");
  const id = String(formData.get("id") || "");
  const price_per_sqft = Number(formData.get("price_per_sqft") || 0);
  if (!id) return;
  await getSupabase().from("plots").update({ price_per_sqft }).eq("id", id);
  await logAudit(actor, "plot", id, "price_update", String(price_per_sqft));
  revalidatePath(`/plots/${id}`);
}

// Full edit of a plot's details (no/plot no, sq.ft, price, category, description).
// Existing bookings snapshot their own value, so editing the plot is safe.
export async function updatePlot(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_plots");
  const id = String(formData.get("id") || "");
  const project_id = String(formData.get("project_id") || "");
  const plot_no = String(formData.get("plot_no") || "").trim();
  const sqft = Number(formData.get("sqft") || 0);
  const price_per_sqft = Number(formData.get("price_per_sqft") || 0);
  const plot_category_id = String(formData.get("plot_category_id") || "") || null;
  const description = String(formData.get("description") || "").trim() || null;
  if (!id || !plot_no || sqft <= 0) return;

  await getSupabase()
    .from("plots")
    .update({ plot_no, sqft, price_per_sqft, plot_category_id, description })
    .eq("id", id);
  await logAudit(actor, "plot", id, "update", plot_no);
  if (project_id) revalidatePath(`/inventory/manage/${project_id}`);
  revalidatePath("/plots");
}

// Delete a plot. Blocked if it has any bookings/registrations (FK is RESTRICT) —
// release/cancel those first.
export async function deletePlot(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_plots");
  const id = String(formData.get("id") || "");
  const project_id = String(formData.get("project_id") || "");
  if (!id) return;
  const sb = getSupabase();

  const [{ count: bookings }, { count: registrations }] = await Promise.all([
    sb.from("bookings").select("id", { count: "exact", head: true }).eq("plot_id", id),
    sb.from("registrations").select("id", { count: "exact", head: true }).eq("plot_id", id),
  ]);
  if ((bookings ?? 0) > 0 || (registrations ?? 0) > 0) {
    if (project_id) redirect(`/inventory/manage/${project_id}?error=plot_has_dependents`);
    return;
  }

  await sb.from("plots").delete().eq("id", id);
  await logAudit(actor, "plot", id, "delete", id);
  if (project_id) revalidatePath(`/inventory/manage/${project_id}`);
  revalidatePath("/plots");
}
