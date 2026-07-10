"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";

// Forced "you must change your password" flow. Unlike the regular Settings/
// Profile change, it does NOT ask for the current password (the user just
// authenticated with it) — it just sets a new one and clears the
// must_change_password flag so the app becomes usable.
export async function forceChangePassword(formData: FormData): Promise<void> {
  const user = await getSession();
  if (!user) redirect("/login");

  const next = String(formData.get("new_password") || "");
  const confirm = String(formData.get("confirm_password") || "");

  if (!next) redirect("/change-password?err=missing");
  if (next.length < 8) redirect("/change-password?err=short");
  if (next !== confirm) redirect("/change-password?err=mismatch");

  const sb = getSupabase();
  const { data } = await sb.from("users").select("settings").eq("id", user.id).maybeSingle();
  const settings = { ...((data as { settings?: Record<string, unknown> } | null)?.settings ?? {}), must_change_password: false };

  const password_hash = await bcrypt.hash(next, 10);
  await sb.from("users").update({ password_hash, settings }).eq("id", user.id);
  await logAudit(user, "user", user.id, "password_change", "forced");

  redirect("/dashboard?ok=password");
}
