"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { requireCapability } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getDownlineIds } from "@/lib/hierarchy";
import {
  EMPTY_PARTNER_FIELDS,
  generatePassword,
  readPartnerFields,
} from "@/lib/partner-registration";
import {
  ROLES,
  ROLE_LABELS,
  managerRoleOf,
  canManageRole,
  creatableRolesUnder,
  requiresRegistration,
  type Role,
} from "@/lib/roles";

export interface CreateUserState {
  error?: string;
  created?: {
    name: string;
    email: string;
    code: string | null;
    role: Role;
    /** Only set when the server generated the password (Business Partner). */
    password?: string;
  };
}

function s(v: FormDataEntryValue | null): string {
  return String(v || "").trim();
}
function nullable(v: FormDataEntryValue | null): string | null {
  return s(v) || null;
}

export async function createUser(
  _prev: CreateUserState | undefined,
  formData: FormData,
): Promise<CreateUserState> {
  // Every role WITH a downline can add members — Admin plus Senior Director /
  // Director / Business Manager. A Business Partner is a leaf and has no
  // `manage_team`, so they never reach here.
  const actor = await requireCapability("manage_team");
  const sb = getSupabase();
  const isAdmin = actor.role === "admin";

  const full_name = s(formData.get("full_name"));
  const email = s(formData.get("email")).toLowerCase();
  const mobile = nullable(formData.get("mobile"));
  const district = nullable(formData.get("district"));
  const role = s(formData.get("role")) as Role;
  const manager_id = s(formData.get("manager_id")) || null;

  if (!ROLES.includes(role)) return { error: "Pick a role." };
  if (!full_name || !email) return { error: "Full name and email are required." };

  // A sales manager may only create roles strictly BELOW their own — a Senior
  // Director can add a Director / Business Manager / Business Partner, a
  // Business Manager only a Business Partner. Never an operator or an Admin.
  // (Admin keeps the unrestricted picker.)
  if (!isAdmin && !creatableRolesUnder(actor.role).includes(role)) {
    return {
      error: `A ${ROLE_LABELS[actor.role]} cannot create a ${ROLE_LABELS[role] ?? role}.`,
    };
  }
  // Their own team, resolved once — used below to confine the placement.
  const team = isAdmin ? null : new Set(await getDownlineIds(sb, actor.id));

  // Every sales role — Senior Director, Director, Business Manager, Business
  // Partner — is onboarded through the full registration form, so the password is
  // generated here (the form has no password field to type into) and the extra
  // personal / nominee / declaration fields are mandatory. Staff accounts
  // (Admin / Finance / Legal) keep the short form where the admin sets a
  // temporary password themselves.
  const needsForm = requiresRegistration(role);
  let password: string;
  let generated: string | undefined;
  if (needsForm) {
    generated = generatePassword();
    password = generated;
  } else {
    password = String(formData.get("password") || "");
    if (password.length < 6) return { error: "Temporary password must be at least 6 characters." };
  }

  // Registration-form fields — captured for sales roles, NULL for staff accounts.
  let partnerFields = EMPTY_PARTNER_FIELDS;
  if (needsForm) {
    const read = readPartnerFields(formData, mobile);
    if ("error" in read) return { error: read.error };
    partnerFields = read.fields;
  }

  // Placement rule: Senior Director, Finance and Legal connect DIRECTLY to the
  // company (Admin) — auto-linked here when none is supplied. Director / Manager /
  // Partner may sit under Admin OR any sales role above them (canManageRole), so a
  // higher role can create someone several rungs below directly. When no manager
  // is chosen they report to the creating Admin. Admin itself has no manager.
  const need = managerRoleOf(role); // admin for SD/finance/legal, role-1 for sales, null for admin
  let finalManagerId = manager_id;
  // Only a Business Partner is placed by typed Reference ID. Senior Director /
  // Director / Business Manager now fill in the same registration form but are
  // still placed with the searchable manager picker below — the list of possible
  // parents for those tiers is small enough to browse.
  if (role === "business_partner") {
    // The form's "Reference ID" IS the reporting parent, typed as a partner code
    // (VPBM12 / VPD07 / …) rather than picked from a list — the list stops being
    // usable once there are thousands of partners.
    const reference_code = s(formData.get("reference_code"));
    if (reference_code) {
      const { data: parent } = await sb
        .from("users")
        .select("id, full_name, role, is_active")
        .ilike("partner_code", reference_code)
        .maybeSingle();
      if (!parent) return { error: `No partner found with Reference ID "${reference_code}".` };
      if (!parent.is_active) {
        return { error: `Reference ID "${reference_code}" (${parent.full_name}) is blocked.` };
      }
      if (!canManageRole(parent.role as Role, role)) {
        return {
          error: `${parent.full_name} is a ${ROLE_LABELS[parent.role as Role]} — a Business Partner cannot report to them.`,
        };
      }
      // A sales manager may only refer into their own team.
      if (team && !team.has(parent.id)) {
        return {
          error: `Reference ID "${reference_code}" (${parent.full_name}) is not in your team.`,
        };
      }
      finalManagerId = parent.id;
    } else {
      finalManagerId = actor.id; // no reference given → reports to whoever created them
    }
  } else if (need === "admin") {
    if (manager_id) {
      const { data: parent } = await sb.from("users").select("role").eq("id", manager_id).maybeSingle();
      if (!parent || (parent.role as Role) !== "admin") return { error: "Invalid manager for this role." };
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
    // Director / Manager: validate the chosen parent can manage this role;
    // default to the creating manager when no parent is supplied.
    if (manager_id) {
      const { data: parent } = await sb.from("users").select("role").eq("id", manager_id).maybeSingle();
      if (!parent || !canManageRole(parent.role as Role, role)) {
        return { error: "That manager cannot hold this role beneath them." };
      }
      // A sales manager may only place someone inside their own team.
      if (team && !team.has(manager_id)) {
        return { error: "You can only add members under yourself or your own team." };
      }
    } else {
      finalManagerId = actor.id;
    }
  }

  const { data: dupe } = await sb.from("users").select("id").eq("email", email).maybeSingle();
  if (dupe) return { error: `An account with the email ${email} already exists.` };

  const password_hash = await bcrypt.hash(password, 10);
  const { data, error } = await sb
    .from("users")
    .insert({
      full_name,
      email,
      password_hash,
      mobile,
      district,
      role,
      manager_id: finalManagerId,
      ...partnerFields,
    })
    .select("id, partner_code")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not create the account." };

  await logAudit(actor, "user", data.id, "create", `${full_name} (${role})`);
  revalidatePath("/users");
  return {
    created: {
      name: full_name,
      email,
      code: data.partner_code ?? null,
      role,
      password: generated,
    },
  };
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
