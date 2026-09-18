"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { requireCapability } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getDownlineIds } from "@/lib/hierarchy";
import { isHiddenUser } from "@/lib/hidden-users";
import {
  EMPTY_PARTNER_FIELDS,
  generatePassword,
  generateResetPassword,
  readPartnerFields,
} from "@/lib/partner-registration";
import {
  ROLES,
  ROLE_LABELS,
  managerRoleOf,
  canManageRole,
  creatableRolesUnder,
  isDistrictScoped,
  isSalesRole,
  hasFullAccess,
  requiresRegistration,
  type Role,
} from "@/lib/roles";
import { DISTRICTS } from "@/lib/options";

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

// The company itself: the oldest Admin row, which every staff account and every
// Senior Director hangs off.
async function companyId(sb: ReturnType<typeof getSupabase>): Promise<string | null> {
  const { data } = await sb
    .from("users")
    .select("id")
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// Who a new member reports to when no manager / Reference ID was given: the
// person creating them — but ONLY if that person is in the sales tree. A
// full-access STAFF account (Admin, General Manager) is not, so a member they
// create attaches to the company itself instead of dangling off a desk that no
// hierarchy query walks.
async function defaultParent(
  sb: ReturnType<typeof getSupabase>,
  actor: { id: string; role: Role },
): Promise<string | null> {
  return isSalesRole(actor.role) ? actor.id : await companyId(sb);
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
  const isAdmin = hasFullAccess(actor.role);

  const full_name = s(formData.get("full_name"));
  const email = s(formData.get("email")).toLowerCase();
  const mobile = nullable(formData.get("mobile"));
  const district = nullable(formData.get("district"));
  const role = s(formData.get("role")) as Role;
  const manager_id = s(formData.get("manager_id")) || null;

  if (!ROLES.includes(role)) return { error: "Pick a role." };
  if (!full_name || !email) return { error: "Full name and email are required." };

  // A Pre-Sales / Post-Sales desk IS its district — every list and action it can
  // reach is filtered by it, so an account without one would open onto empty
  // screens. Reject that here rather than creating a login that cannot work.
  if (isDistrictScoped(role) && (!district || !DISTRICTS.includes(district))) {
    return { error: `Pick the district this ${ROLE_LABELS[role]} desk covers (${DISTRICTS.join(" or ")}).` };
  }

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
      // No reference given → reports to whoever created them (or to the company,
      // when the creator is staff and sits outside the tree).
      finalManagerId = await defaultParent(sb, actor);
    }
  } else if (need === "admin") {
    if (manager_id) {
      const { data: parent } = await sb.from("users").select("role").eq("id", manager_id).maybeSingle();
      if (!parent || (parent.role as Role) !== "admin") return { error: "Invalid manager for this role." };
    } else {
      // Attach directly to the company: the oldest Admin account.
      finalManagerId = await companyId(sb);
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
      finalManagerId = await defaultParent(sb, actor);
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
      // A staff account is created with a password an ADMIN typed and then reads
      // out — the form calls it "Temporary Password", so make it actually
      // temporary: the app forces a change before the account can be used.
      // Sales roles get a server-generated password shown once instead, and are
      // already stopped at the registration form on first sign-in.
      ...(needsForm ? {} : { settings: { must_change_password: true } }),
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
      finalManagerId = await companyId(sb);
    }
  } else if (need) {
    if (manager_id) {
      const { data: parent } = await sb.from("users").select("role").eq("id", manager_id).maybeSingle();
      if (!parent || !canManageRole(parent.role as Role, role)) return;
    } else {
      finalManagerId = await defaultParent(sb, actor);
    }
  }

  await sb.from("users").update({ role, manager_id: finalManagerId }).eq("id", id);
  await logAudit(actor, "user", id, "placement_change", role);
  revalidatePath("/users");
}

// Move a branch desk (Pre-Sales / Post-Sales) to a different district — the one
// setting that decides everything that account can see. Admin-only, and refused
// for roles where a district is only a sorting hint rather than a boundary, so
// this page can never silently re-scope a partner's whole view.
export async function updateUserDistrict(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_users");
  const id = String(formData.get("id") || "");
  const district = String(formData.get("district") || "").trim();
  if (!id || !DISTRICTS.includes(district)) return;

  const sb = getSupabase();
  const { data: target } = await sb.from("users").select("role").eq("id", id).maybeSingle();
  if (!target || !isDistrictScoped(target.role as Role)) return;

  await sb.from("users").update({ district }).eq("id", id);
  await logAudit(actor, "user", id, "district_change", district);
  revalidatePath("/in-house");
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
  revalidatePath("/in-house");
}

// ============================================================================
// RESET A LOGIN'S PASSWORD  (Administration › Block / Change Team & Level)
//
// The company Admin is the only account that can do this — `reset_password` is
// the single capability withheld from a General Manager (see lib/roles.ts),
// because handing out a new password is effectively handing over that person's
// identity.
//
// Five things make this safe rather than just convenient:
//
//  1. The Admin NEVER CHOOSES the password. It is generated from crypto random
//     bytes, so a whole team cannot end up sharing one guessable password the
//     office types from memory.
//  2. The Admin RE-ENTERS THEIR OWN PASSWORD to authorise it. A capability check
//     only proves which account is asking; it does not prove a human is at the
//     keyboard. Without this, an unattended Admin tab (or a CSRF-ish replay of
//     this action) could reset every partner in the company silently. This is
//     the one control that makes "Admin only" mean something.
//  3. The new password is FORCED TO CHANGE on first sign-in
//     (settings.must_change_password → requireUser holds them at
//     /change-password, which also refuses re-typing the temporary one). So the
//     Admin's knowledge of it expires the moment the partner logs in.
//  4. EVERY EXISTING SESSION IS KILLED by bumping session_version — the same
//     mechanism as "Sign out everywhere". A reset must evict whoever is already
//     signed in on that account, otherwise resetting a compromised login does
//     nothing about the intruder currently using it.
//  5. It is AUDITED, and the password is never written to the audit log, the
//     server log or the database in plaintext — only its bcrypt hash is stored,
//     and the cleartext is returned to this one response and never again.
//
// Refused for: the Admin's own account (Settings requires the current password —
// that proof must not be bypassable from here), any other Admin (a takeover
// vector, and it keeps an Admin from being locked out by a peer), and the hidden
// dev/support login.
// ============================================================================
export interface ResetPasswordState {
  error?: string;
  /** Present only on success — the one and only time the password is shown. */
  done?: {
    name: string;
    email: string;
    code: string | null;
    role: Role;
    password: string;
  };
}

export async function resetUserPassword(
  _prev: ResetPasswordState | undefined,
  formData: FormData,
): Promise<ResetPasswordState> {
  const actor = await requireCapability("reset_password");
  const sb = getSupabase();

  const id = s(formData.get("id"));
  const actorPassword = String(formData.get("actor_password") || "");
  if (!id) return { error: "No account selected." };
  if (!actorPassword) return { error: "Enter your own password to authorise this reset." };

  // (2) Re-authenticate the Admin BEFORE anything is read about the target, so a
  // failed attempt cannot even be used to probe who exists.
  const { data: me } = await sb
    .from("users")
    .select("password_hash")
    .eq("id", actor.id)
    .maybeSingle();
  const myHash = (me as { password_hash?: string } | null)?.password_hash;
  if (!myHash || !(await bcrypt.compare(actorPassword, myHash))) {
    return { error: "That is not your password. Nothing was changed." };
  }

  if (id === actor.id) {
    return {
      error:
        "Use Settings to change your own password — it asks for your current one, and that check must not be skipped here.",
    };
  }

  const { data: targetRow } = await sb
    .from("users")
    .select("id, full_name, email, role, partner_code, settings, session_version")
    .eq("id", id)
    .maybeSingle();
  const target = targetRow as
    | {
        id: string;
        full_name: string;
        email: string;
        role: Role;
        partner_code: string | null;
        settings: Record<string, unknown> | null;
        session_version: number | null;
      }
    | null;

  // A hidden dev/support login reports as "not found" rather than "refused" —
  // it is invisible in every other panel and must not be discoverable here.
  if (!target || isHiddenUser(target.email)) return { error: "Account not found." };
  if (target.role === "admin") {
    return { error: "An Admin's password cannot be reset here. They change it themselves in Settings." };
  }

  // (1) Generated, not chosen: "Vision@" + a random 8-character tail from the
  // unambiguous alphabet (no 0/O/1/l/I), because this gets read out over the
  // phone or pasted into a message before the partner changes it. The prefix is
  // branding; the tail is the secret, and it is different every single time —
  // see generateResetPassword for why there is no fixed default.
  const password = generateResetPassword();
  const password_hash = await bcrypt.hash(password, 10);

  // (3) + (4), written together so a reset can never land the new password
  // without also forcing the change and evicting the old sessions.
  const settings = { ...(target.settings ?? {}), must_change_password: true };
  const session_version = (target.session_version ?? 0) + 1;

  const { error } = await sb
    .from("users")
    .update({ password_hash, settings, session_version })
    .eq("id", id);
  if (error) return { error: "The reset could not be saved. Nothing was changed." };

  // (5) Audited by WHO the reset was for — never what it was set to.
  await logAudit(actor, "user", id, "password_reset", target.partner_code ?? target.email);
  revalidatePath("/users");
  revalidatePath("/in-house");

  return {
    done: {
      name: target.full_name,
      email: target.email,
      code: target.partner_code,
      role: target.role,
      password,
    },
  };
}
