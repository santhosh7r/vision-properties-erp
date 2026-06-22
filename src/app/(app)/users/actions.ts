"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { requireCapability } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ROLES, managerRoleOf, type Role } from "@/lib/roles";

export async function createUser(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_users");
  const sb = getSupabase();

  const full_name = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const mobile = String(formData.get("mobile") || "").trim() || null;
  const role = String(formData.get("role") || "") as Role;
  const manager_id = String(formData.get("manager_id") || "") || null;

  if (!full_name || !email || !password || !ROLES.includes(role)) return;

  // Placement rule: a member sits directly under a parent whose role is exactly
  // one level above theirs (managerRoleOf). Director/Manager/Partner REQUIRE a
  // specific parent; Senior Director, Finance and Legal attach to the company
  // (Admin) — auto-linked here when none is supplied. Enforced server-side so
  // the rule holds no matter which client posts the form.
  const need = managerRoleOf(role); // admin for SD/finance/legal, role-1 for sales, null for admin
  let finalManagerId = manager_id;
  if (need === "admin") {
    if (manager_id) {
      const { data: parent } = await sb.from("users").select("role").eq("id", manager_id).maybeSingle();
      if (!parent || (parent.role as Role) !== "admin") return;
    } else {
      // Attach directly to the company: the oldest Admin account.
      const { data: company } = await sb
        .from("users")
        .select("id")
        .eq("role", "admin")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      finalManagerId = company?.id ?? null;
    }
  } else if (need) {
    // Director / Manager / Partner must have a parent of exactly the right role.
    if (!manager_id) return;
    const { data: parent } = await sb.from("users").select("role").eq("id", manager_id).maybeSingle();
    if (!parent || (parent.role as Role) !== need) return;
  }

  const password_hash = await bcrypt.hash(password, 10);
  const { data, error } = await sb
    .from("users")
    .insert({ full_name, email, password_hash, mobile, role, manager_id: finalManagerId })
    .select("id")
    .single();

  if (!error && data) {
    await logAudit(actor, "user", data.id, "create", `${full_name} (${role})`);
  }
  revalidatePath("/users");
}

export async function toggleUserActive(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_users");
  const id = String(formData.get("id") || "");
  const next = String(formData.get("next") || "") === "true";
  if (!id) return;
  await getSupabase().from("users").update({ is_active: next }).eq("id", id);
  await logAudit(actor, "user", id, next ? "activate" : "deactivate");
  revalidatePath("/users");
}
