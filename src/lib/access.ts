import "server-only";
import { cache } from "react";
import { getSupabase } from "./supabase";
import { NAV, type NavItem } from "./nav";
import { PAGES, PAGE_BY_KEY, defaultLevel, pageKeyForPath, type PageLevel } from "./pages";
import type { Role } from "./roles";
import type { SessionUser } from "./session";

// ---------------------------------------------------------------------------
// Page access — resolves an Admin's Page Config against the code defaults.
//
// Two layers, in this order:
//   1. `role_page_access` — only the rows an Admin has actually changed.
//   2. defaultLevel() in lib/pages.ts — derived from the menu, i.e. how the app
//      behaved before Page Config existed.
//
// Layer 1 is treated as OPTIONAL throughout. If migration 0034 has not been
// applied the query errors, and every lookup quietly falls through to the
// defaults — the app keeps working exactly as before instead of locking everyone
// out of everything. That failure mode is deliberate: this file decides who may
// open what, so its unavailable state has to be "as before", never "nothing".
//
// Admin is never looked up. Full access is hard-coded so the account that edits
// permissions cannot lock itself out.
// ---------------------------------------------------------------------------

export interface RoleAccess {
  // `${role}:${pageKey}` → level, for rows an Admin has overridden.
  overrides: Map<string, PageLevel>;
  // Roles an Admin has switched logins off for.
  loginBlocked: Set<string>;
  // False when the tables are missing (0034 not applied) — the Page Config page
  // uses this to say so plainly rather than silently saving nothing.
  configured: boolean;
}

// One load per request, shared by the layout, the page guards and the nav.
export const loadRoleAccess = cache(async (): Promise<RoleAccess> => {
  const sb = getSupabase();
  const overrides = new Map<string, PageLevel>();
  const loginBlocked = new Set<string>();

  const [{ data: accessRows, error }, { data: settingRows }] = await Promise.all([
    sb.from("role_page_access").select("role, page_key, level"),
    sb.from("role_settings").select("role, can_login"),
  ]);

  if (error) return { overrides, loginBlocked, configured: false };

  for (const r of (accessRows ?? []) as { role: string; page_key: string; level: PageLevel }[]) {
    overrides.set(`${r.role}:${r.page_key}`, r.level);
  }
  for (const r of (settingRows ?? []) as { role: string; can_login: boolean }[]) {
    if (!r.can_login) loginBlocked.add(r.role);
  }
  return { overrides, loginBlocked, configured: true };
});

// The level for one role on one page, overrides applied.
export function resolveLevel(access: RoleAccess, role: Role, pageKey: string): PageLevel {
  if (role === "admin") return "edit";
  const page = PAGE_BY_KEY.get(pageKey);
  // A page that follows another (a receipt follows its booking) is never
  // configured directly — resolve the page it hangs off instead.
  const key = page?.follows ?? pageKey;
  return access.overrides.get(`${role}:${key}`) ?? defaultLevel(role, key);
}

export async function pageLevel(role: Role, pageKey: string): Promise<PageLevel> {
  return resolveLevel(await loadRoleAccess(), role, pageKey);
}

// Has this role been switched off entirely? Checked at login.
export async function roleCanLogin(role: Role): Promise<boolean> {
  if (role === "admin") return true;
  const { loginBlocked } = await loadRoleAccess();
  return !loginBlocked.has(role);
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

// The sidebar for a user: the role's own items, minus anything Page Config has
// set to No access. A menu entry whose page an Admin has hidden simply is not
// there — and because the same resolution guards the route, typing the URL does
// not get round it.
export async function navForUser(user: SessionUser, isDev = false): Promise<NavItem[]> {
  const access = await loadRoleAccess();
  const role = user.role as Role;
  return NAV.filter((n) => {
    if (!n.roles.includes(role) || (n.devOnly && !isDev)) return false;
    const key = pageKeyForPath(n.href.split("?")[0]);
    // An item outside the registry is left alone rather than hidden by accident.
    if (!key) return true;
    return resolveLevel(access, role, key) !== "none";
  });
}

// Every page's level for one role — the Page Config grid.
export function levelsForRole(access: RoleAccess, role: Role): Map<string, PageLevel> {
  return new Map(PAGES.map((p) => [p.key, resolveLevel(access, role, p.key)]));
}
