"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { requireCapability } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ROLE_LABELS, creatableRolesUnder, type Role } from "@/lib/roles";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CreateMemberState {
  ok?: boolean;
  error?: string;
}

// True when `actorId` is `nodeId` itself or any ancestor of it — i.e. the node
// sits in the actor's own downline. Used to confine non-admin actions to their
// team. Walks up the manager chain from a single cheap id/manager_id fetch.
async function actorControls(
  sb: SupabaseClient,
  actorId: string,
  nodeId: string,
): Promise<boolean> {
  if (actorId === nodeId) return true;
  const { data } = await sb.from("users").select("id, manager_id");
  const parentOf = new Map((data ?? []).map((u) => [u.id as string, u.manager_id as string | null]));
  let cur = parentOf.get(nodeId) ?? null;
  let guard = 0;
  while (cur && guard++ < 100000) {
    if (cur === actorId) return true;
    cur = parentOf.get(cur) ?? null;
  }
  return false;
}

// Create a new sales-team member DIRECTLY UNDER a given parent node. The new
// member's role must sit strictly below the parent's role (enforced here, not
// just in the UI). The parent becomes the new member's manager.
export async function createTeamMember(
  _prev: CreateMemberState | undefined,
  formData: FormData,
): Promise<CreateMemberState> {
  const actor = await requireCapability("manage_team");
  const sb = getSupabase();

  const manager_id = String(formData.get("manager_id") || "").trim();
  const full_name = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const mobile = String(formData.get("mobile") || "").trim() || null;
  const role = String(formData.get("role") || "") as Role;

  if (!manager_id) return { error: "Missing parent node." };
  if (!full_name || !email || !password) {
    return { error: "Name, email and password are required." };
  }
  if (password.length < 6) return { error: "Password must be at least 6 characters." };

  // Validate placement against the LIVE parent role (not a client-sent value).
  const { data: parent } = await sb
    .from("users")
    .select("id, role, full_name, is_active")
    .eq("id", manager_id)
    .maybeSingle();
  if (!parent) return { error: "Parent user not found." };

  // A non-admin may only add under themselves or someone in their own downline.
  if (actor.role !== "admin") {
    const ok = await actorControls(sb, actor.id, manager_id);
    if (!ok) return { error: "You can only add members under yourself or your team." };
  }

  const allowed = creatableRolesUnder(parent.role as Role);
  if (!allowed.includes(role)) {
    return {
      error: `A ${ROLE_LABELS[parent.role as Role]} cannot add a ${
        ROLE_LABELS[role] ?? role
      } directly beneath them.`,
    };
  }

  // Duplicate-email guard (the DB also has a unique constraint as a backstop).
  const { data: dupe } = await sb.from("users").select("id").eq("email", email).maybeSingle();
  if (dupe) return { error: "A user with this email already exists." };

  const password_hash = await bcrypt.hash(password, 10);
  const { data, error } = await sb
    .from("users")
    .insert({ full_name, email, password_hash, mobile, role, manager_id })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not create the member. Please try again." };

  await logAudit(
    actor,
    "user",
    data.id,
    "create",
    `${full_name} (${role}) under ${parent.full_name}`,
  );
  revalidatePath("/business-operators");
  revalidatePath("/users");
  return { ok: true };
}

export async function toggleMemberActive(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_team");
  const sb = getSupabase();
  const id = String(formData.get("id") || "");
  const next = String(formData.get("next") || "") === "true";
  if (!id) return;

  // Non-admins can only (de)activate their own downline, never themselves.
  if (actor.role !== "admin") {
    if (id === actor.id) return;
    const ok = await actorControls(sb, actor.id, id);
    if (!ok) return;
  }

  await sb.from("users").update({ is_active: next }).eq("id", id);
  await logAudit(actor, "user", id, next ? "activate" : "deactivate");
  revalidatePath("/business-operators");
  revalidatePath("/users");
}
