"use server";

import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";

// Update the signed-in user's own profile (name / email / mobile / home city).
// City feeds the sales panels' "your city first" inventory ordering.
export async function updateMyProfile(formData: FormData): Promise<void> {
  const user = await requireUser();
  const full_name = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const mobile = String(formData.get("mobile") || "").trim() || null;
  const district = String(formData.get("district") || "").trim() || null;
  if (!full_name || !email) redirect("/profile?err=profile");

  const sb = getSupabase();
  const { data: clash } = await sb
    .from("users")
    .select("id")
    .eq("email", email)
    .neq("id", user.id)
    .maybeSingle();
  if (clash) redirect("/profile?err=email");

  await sb.from("users").update({ full_name, email, mobile, district }).eq("id", user.id);
  // Re-issue the session so the new name/email show immediately in the header.
  await createSession({ id: user.id, full_name, email, role: user.role });
  await logAudit(user, "user", user.id, "profile_update");
  redirect("/profile?ok=1");
}
