"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { requireCapability } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ROLES, managerRoleOf, canManageRole, type Role } from "@/lib/roles";

export async function createUser(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_users");
  const sb = getSupabase();

  const full_name = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const mobile = String(formData.get("mobile") || "").trim() || null;
  const district = String(formData.get("district") || "").trim() || null;
  const role = String(formData.get("role") || "") as Role;
  const manager_id = String(formData.get("manager_id") || "") || null;

  if (!full_name || !email || !password || !ROLES.includes(role)) return;

  // Placement rule: Senior Director, Finance and Legal connect DIRECTLY to the
  // company (Admin) — auto-linked here when none is supplied. Director / Manager /
  // Partner may sit under Admin OR any sales role above them (canManageRole), so a
  // higher role can create someone several rungs below directly. When no manager
  // is chosen they report to the creating Admin. Admin itself has no manager.
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
    // Director / Manager / Partner: validate the chosen parent can manage this
    // role; default to the creating Admin when no parent is supplied.
    if (manager_id) {
      const { data: parent } = await sb.from("users").select("role").eq("id", manager_id).maybeSingle();
      if (!parent || !canManageRole(parent.role as Role, role)) return;
    } else {
      finalManagerId = actor.id;
    }
  }

  const password_hash = await bcrypt.hash(password, 10);
  const { data, error } = await sb
    .from("users")
    .insert({ full_name, email, password_hash, mobile, district, role, manager_id: finalManagerId })
    .select("id")
    .single();

  if (!error && data) {
    await logAudit(actor, "user", data.id, "create", `${full_name} (${role})`);
  }
  revalidatePath("/users");
}

// Change Team / Level (Admin panel · Partners) — reassign a user's role and/or
// the manager they report to. Validates placement the same way createUser does.
// Note: the human-readable partner_code (set by a trigger on insert) is left
// unchanged on a level change.
export async function updateUserPlacement(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_users");
  const sb = getSupabase();

  const id = String(formData.get("id") || "");
  const role = String(formData.get("role") || "") as Role;
  const manager_id = String(formData.get("manager_id") || "") || null;
  if (!id || !ROLES.includes(role) || role === "admin") return;
  if (manager_id === id) return; // can't report to oneself

  const need = managerRoleOf(role);
  let finalManagerId = manager_id;
  if (need === "admin") {
    if (manager_id) {
      const { data: parent } = await sb.from("users").select("role").eq("id", manager_id).maybeSingle();
      if (!parent || (parent.role as Role) !== "admin") return;
    } else {
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
    if (manager_id) {
      const { data: parent } = await sb.from("users").select("role").eq("id", manager_id).maybeSingle();
      if (!parent || !canManageRole(parent.role as Role, role)) return;
    } else {
      finalManagerId = actor.id;
    }
  }

  await sb.from("users").update({ role, manager_id: finalManagerId }).eq("id", id);
  await logAudit(actor, "user", id, "placement_change", role);
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
