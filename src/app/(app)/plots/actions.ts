"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { requireCapability } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

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

export async function createPlot(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_plots");
  const project_id = String(formData.get("project_id") || "");
  const plot_category_id = String(formData.get("plot_category_id") || "") || null;
  const plot_no = String(formData.get("plot_no") || "").trim();
  const sqft = Number(formData.get("sqft") || 0);
  const price_per_sqft = Number(formData.get("price_per_sqft") || 0);
  const description = String(formData.get("description") || "").trim() || null;

  if (!project_id || !plot_no || sqft <= 0) return;

  const { data, error } = await getSupabase()
    .from("plots")
    .insert({ project_id, plot_category_id, plot_no, sqft, price_per_sqft, description, status: "available" })
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
