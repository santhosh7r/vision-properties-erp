"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { requireCapability } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function createCustomer(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_customers");
  const sb = getSupabase();

  const mobile = String(formData.get("mobile") || "").trim();
  const name = String(formData.get("name") || "").trim();
  if (!name || !mobile) return;

  // Duplicate detection by mobile, scoped to THIS salesperson's own book. The
  // same number under a different salesperson is a separate customer, so we only
  // block a duplicate the actor already owns (created).
  const { data: existing } = await sb
    .from("customers")
    .select("id")
    .eq("mobile", mobile)
    .eq("created_by", actor.id)
    .maybeSingle();
  if (existing) {
    redirect(`/customers/${existing.id}?dup=1`);
  }

  const payload = {
    name,
    mobile,
    email: emptyToNull(formData.get("email")),
    dob: emptyToNull(formData.get("dob")),
    street: emptyToNull(formData.get("street")),
    area: emptyToNull(formData.get("area")),
    pincode: emptyToNull(formData.get("pincode")),
    state: emptyToNull(formData.get("state")),
    district: emptyToNull(formData.get("district")),
    country: emptyToNull(formData.get("country")),
    occupation: emptyToNull(formData.get("occupation")),
    occupation_remarks: emptyToNull(formData.get("occupation_remarks")),
    created_by: actor.id,
  };

  const { data, error } = await sb.from("customers").insert(payload).select("id").single();
  if (error || !data) {
    // Unique(created_by, mobile) violation from a race — surface the actor's own
    // existing customer for this mobile.
    const { data: ex } = await sb
      .from("customers")
      .select("id")
      .eq("mobile", mobile)
      .eq("created_by", actor.id)
      .maybeSingle();
    if (ex) redirect(`/customers/${ex.id}?dup=1`);
    return;
  }
  await logAudit(actor, "customer", data.id, "create", name);

  const next = String(formData.get("next") || "");
  redirect(next ? next.replace("{id}", data.id) : `/customers/${data.id}`);
}

export async function updateCustomer(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_customers");
  const sb = getSupabase();

  const id = String(formData.get("id") || "");
  const mobile = String(formData.get("mobile") || "").trim();
  const name = String(formData.get("name") || "").trim();
  if (!id || !name || !mobile) return;

  // Block changing mobile to one already held by a DIFFERENT customer in the
  // SAME book — i.e. owned by whoever owns the record being edited (which may be
  // a salesperson, when an admin/network head edits on their behalf). A clash
  // with another salesperson's customer is allowed — their books are independent.
  const { data: current } = await sb
    .from("customers")
    .select("created_by")
    .eq("id", id)
    .maybeSingle();
  if (current?.created_by) {
    const { data: clash } = await sb
      .from("customers")
      .select("id")
      .eq("mobile", mobile)
      .eq("created_by", current.created_by)
      .neq("id", id)
      .maybeSingle();
    if (clash) {
      redirect(`/customers/${id}/edit?err=dup`);
    }
  }

  const payload = {
    name,
    mobile,
    email: emptyToNull(formData.get("email")),
    dob: emptyToNull(formData.get("dob")),
    street: emptyToNull(formData.get("street")),
    area: emptyToNull(formData.get("area")),
    pincode: emptyToNull(formData.get("pincode")),
    state: emptyToNull(formData.get("state")),
    district: emptyToNull(formData.get("district")),
    country: emptyToNull(formData.get("country")),
    occupation: emptyToNull(formData.get("occupation")),
    occupation_remarks: emptyToNull(formData.get("occupation_remarks")),
  };

  const { error } = await sb.from("customers").update(payload).eq("id", id);
  if (error) return;
  await logAudit(actor, "customer", id, "update", name);
  revalidatePath(`/customers/${id}`);
  revalidatePath("/customers");
  redirect(`/customers/${id}`);
}

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = String(v || "").trim();
  return s === "" ? null : s;
}
