"use server";

import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { readPartnerFields } from "@/lib/partner-registration";
import { requiresRegistration } from "@/lib/roles";

export interface CompleteProfileState {
  error?: string;
}

/**
 * An existing sales account fills in the registration details its record was
 * created without. Same field list and same validation as creating a partner —
 * readPartnerFields is shared — so an account completed here is indistinguishable
 * from one registered through the full form on day one.
 *
 * Deliberately narrow: it writes ONLY the registration columns for the caller's
 * own row. Role, manager, email and password are not read from this form, so a
 * user cannot promote themselves or move in the hierarchy through it.
 */
export async function completeProfile(
  _prev: CompleteProfileState | undefined,
  formData: FormData,
): Promise<CompleteProfileState> {
  const user = await requireUser();

  // Staff accounts have no registration form, so nothing here can apply to them.
  if (!requiresRegistration(user.realRole)) redirect("/dashboard");

  const full_name = String(formData.get("full_name") || "").trim();
  const mobile = String(formData.get("mobile") || "").trim() || null;
  const district = String(formData.get("district") || "").trim() || null;

  if (!full_name) return { error: "Full name is required." };

  const read = readPartnerFields(formData, mobile);
  if ("error" in read) return { error: read.error };

  const { error } = await getSupabase()
    .from("users")
    .update({ full_name, mobile, district, ...read.fields })
    .eq("id", user.id);

  if (error) return { error: "Could not save your details. Please try again." };

  await logAudit(user, "user", user.id, "update", `${full_name} completed their registration`);
  redirect("/dashboard");
}
