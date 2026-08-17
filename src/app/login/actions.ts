"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { createSession, destroySession } from "@/lib/session";
import { isHiddenUser } from "@/lib/hidden-users";
import { logAudit } from "@/lib/audit";
import { roleCanLogin } from "@/lib/access";
import type { Role } from "@/lib/roles";

export async function login(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const identifier = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!identifier || !password) return { error: "Email / Sales ID and password are required." };
  if (!supabaseConfigured()) {
    return {
      error:
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local, then run the schema and `npm run db:seed`.",
    };
  }

  // Admins / Finance / Legal sign in with their email; sales people sign in with
  // their Sales ID (partner_code, e.g. VPSD22). Anything containing "@" is treated
  // as an email, otherwise we match the (upper-cased) partner_code.
  const isEmail = identifier.includes("@");
  const lookup = getSupabase()
    .from("users")
    .select("id, full_name, email, password_hash, role, is_active");
  const { data: user, error } = await (isEmail
    ? lookup.eq("email", identifier.toLowerCase())
    : lookup.eq("partner_code", identifier.toUpperCase())
  ).maybeSingle();

  if (error || !user) return { error: "Invalid login or password." };
  if (!user.is_active) return { error: "This account is deactivated." };

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return { error: "Invalid login or password." };
  // PAGE CONFIG · "Can log in". Checked AFTER the password so a wrong password
  // and a switched-off role are indistinguishable to someone guessing. Admin is
  // never blocked, so this can't lock everyone out of the app.
  if (!(await roleCanLogin(user.role as Role))) {
    return { error: "Logins are currently switched off for your role. Contact the Admin." };
  }

  await createSession({
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
  });
  // A fresh login always starts on the real role — any dev role override from a
  // previous session dies with the old token. (logAudit skips hidden accounts.)
  await logAudit(
    {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      realRole: user.role,
      isDev: isHiddenUser(user.email),
    },
    "user",
    user.id,
    "login",
  );

  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
