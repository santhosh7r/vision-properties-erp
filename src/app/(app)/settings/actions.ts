"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { createSession, destroySession } from "@/lib/session";
import { logAudit } from "@/lib/audit";

// Save a user's preferences (language) to users.settings.
export async function savePreferences(formData: FormData): Promise<void> {
  const user = await requireUser();
  const settings = {
    language: String(formData.get("language") || "en") === "ta" ? "ta" : "en",
  };
  await getSupabase().from("users").update({ settings }).eq("id", user.id);
  await logAudit(user, "user", user.id, "settings_update");
  redirect("/profile?ok=prefs");
}

// Sign out of every device: bump session_version so all existing tokens (which
// carry the old version) are rejected, then drop the current cookie.
export async function signOutEverywhere(): Promise<void> {
  const user = await requireUser();
  const sb = getSupabase();
  const { data } = await sb.from("users").select("session_version").eq("id", user.id).maybeSingle();
  const next = (((data as { session_version?: number } | null)?.session_version) ?? 0) + 1;
  await sb.from("users").update({ session_version: next }).eq("id", user.id);
  await logAudit(user, "user", user.id, "sign_out_everywhere");
  await destroySession();
  redirect("/login");
}

// Change the signed-in user's own password. `redirect_to` lets the caller pick
// where to return (admin → /settings, sales → /profile).
export async function changePassword(formData: FormData): Promise<void> {
  const user = await requireUser();
  const base = String(formData.get("redirect_to") || "/settings");
  const current = String(formData.get("current_password") || "");
  const next = String(formData.get("new_password") || "");
  const confirm = String(formData.get("confirm_password") || "");

  if (!current || !next) redirect(`${base}?err=missing`);
  if (next.length < 6) redirect(`${base}?err=short`);
  if (next !== confirm) redirect(`${base}?err=mismatch`);

  const sb = getSupabase();
  const { data } = await sb.from("users").select("password_hash").eq("id", user.id).maybeSingle();
  if (!data) redirect(`${base}?err=missing`);

  const ok = await bcrypt.compare(current, data.password_hash);
  if (!ok) redirect(`${base}?err=wrong`);

  const password_hash = await bcrypt.hash(next, 10);
  await sb.from("users").update({ password_hash }).eq("id", user.id);
  await logAudit(user, "user", user.id, "password_change");
  redirect(`${base}?ok=password`);
}

// Update the signed-in admin's own profile (name / email / mobile).
export async function updateProfile(formData: FormData): Promise<void> {
  const user = await requireUser();
  const full_name = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const mobile = String(formData.get("mobile") || "").trim() || null;
  if (!full_name || !email) redirect("/settings?err=profile");

  const sb = getSupabase();
  const { data: clash } = await sb
    .from("users")
    .select("id")
    .eq("email", email)
    .neq("id", user.id)
    .maybeSingle();
  if (clash) redirect("/settings?err=email");

  await sb.from("users").update({ full_name, email, mobile }).eq("id", user.id);
  // Re-issue the session so the new name/email show immediately.
  await createSession({ id: user.id, full_name, email, role: user.role });
  await logAudit(user, "user", user.id, "profile_update");
  revalidatePath("/settings");
  redirect("/settings?ok=profile");
}
