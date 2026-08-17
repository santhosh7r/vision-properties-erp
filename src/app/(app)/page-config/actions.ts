"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { requireCapability } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { CONFIGURABLE_PAGES, PAGE_BY_KEY, type PageLevel } from "@/lib/pages";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/roles";

const LEVELS: PageLevel[] = ["none", "view", "edit"];

// Save one role's page grid. ADMIN ONLY, and Admin's own row can never be
// edited — the account that configures access must not be able to lock itself
// out of the app, so it is rejected here as well as being read-only in the UI.
export async function saveRoleAccess(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_users");
  const role = String(formData.get("role") || "") as Role;
  if (!ROLES.includes(role) || role === "admin") {
    redirect("/page-config?err=role");
  }
  const sb = getSupabase();
  const canLogin = String(formData.get("can_login") || "") === "on";

  // Every configurable page is written, not just the changed ones: a full
  // snapshot per save means the stored grid always matches what the Admin was
  // looking at, with no ambiguity about which rows are "unset" afterwards.
  const rows = CONFIGURABLE_PAGES.map((p) => {
    const raw = String(formData.get(`level:${p.key}`) || "none");
    const level = (LEVELS.includes(raw as PageLevel) ? raw : "none") as PageLevel;
    return { role, page_key: p.key, level, updated_by: actor.id, updated_at: new Date().toISOString() };
  });

  const { error: accessErr } = await sb.from("role_page_access").upsert(rows, {
    onConflict: "role,page_key",
  });
  const { error: settingErr } = await sb.from("role_settings").upsert(
    { role, can_login: canLogin, updated_by: actor.id, updated_at: new Date().toISOString() },
    { onConflict: "role" },
  );

  // Missing tables mean migration 0034 has not been applied. Say so instead of
  // reporting a save that did not happen — the page falls back to the code
  // defaults meanwhile, so nothing is broken, but nothing is stored either.
  if (accessErr || settingErr) {
    redirect("/page-config?err=not_migrated");
  }

  const summary = rows
    .filter((r) => r.level !== "none")
    .map((r) => `${PAGE_BY_KEY.get(r.page_key)?.label ?? r.page_key}:${r.level}`)
    .join(", ");
  await logAudit(
    actor,
    "role_access",
    role,
    "update",
    `${ROLE_LABELS[role]} · login ${canLogin ? "on" : "off"} · ${summary || "no pages"}`,
  );

  revalidatePath("/page-config");
  // The sidebar and every page guard read this, so refresh the whole shell.
  revalidatePath("/", "layout");
  redirect(`/page-config?ok=1&role=${role}`);
}

// Put a role back on the code defaults by deleting its stored rows.
export async function resetRoleAccess(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_users");
  const role = String(formData.get("role") || "") as Role;
  if (!ROLES.includes(role) || role === "admin") {
    redirect("/page-config?err=role");
  }
  const sb = getSupabase();
  const { error } = await sb.from("role_page_access").delete().eq("role", role);
  if (error) redirect("/page-config?err=not_migrated");
  await sb.from("role_settings").delete().eq("role", role);
  await logAudit(actor, "role_access", role, "reset", `${ROLE_LABELS[role]} back to defaults`);
  revalidatePath("/page-config");
  revalidatePath("/", "layout");
  redirect(`/page-config?ok=reset&role=${role}`);
}
