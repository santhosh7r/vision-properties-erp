import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "./session";
import { isHiddenUser } from "./hidden-users";
import { isDistrictScoped } from "./roles";

// ============================================================================
// DISTRICT SCOPE — the branch desks (Pre-Sales / Post-Sales) see ONE district.
//
// A Chennai Pre-Sales desk works Chennai projects and everything hanging off
// them; a Trichy desk works Trichy. The district lives on the user row
// (users.district, one of lib/options.ts DISTRICTS) and everything else is
// derived from it: a project belongs to a district, and a plot / booking /
// payment / registration belongs to whichever project it points at.
//
// Every scoped page and server action routes through here rather than repeating
// the join, so "which records may this desk touch" has exactly one answer.
//
// Roles that are NOT district-scoped (Admin, Finance, Legal, the sales tree)
// get `null` back — meaning "no district filter", not "no access". Access
// itself is decided by capabilities, never by this module.
// ============================================================================

export interface DistrictScope {
  /** The desk's branch, e.g. "Chennai". Null when the account has none set. */
  district: string | null;
  /** Ids of every project in that branch. Empty = the desk sees nothing. */
  projectIds: string[];
}

/**
 * PostgREST `or=(…)` takes a comma-separated list, so a value containing a comma
 * or a paren would break out of the filter. Branch names never contain either —
 * strip them rather than trust that.
 */
function safeFilterValue(v: string): string {
  return v.replace(/[,()]/g, " ").trim();
}

/**
 * Which projects belong to branch `name`.
 *
 * A project carries BOTH a city and a district, and for this business they
 * routinely differ: Vision's Skyway is in Chennai CITY but Kancheepuram
 * DISTRICT. The branches are cities ("the Chennai desk", "the Trichy desk"), so
 * matching on district alone found nothing for Chennai and hid four of Trichy's
 * five projects. Match either column: a project is the Chennai branch's if it
 * sits in Chennai city OR Chennai district.
 *
 * ilike, not eq, because both columns are free text on older rows ("chennai").
 */
export function branchProjectFilter(name: string): string {
  const v = safeFilterValue(name);
  return `city.ilike.${v},district.ilike.${v}`;
}

/** Does a project row belong to branch `name`? The in-memory twin of the above. */
export function projectMatchesBranch(
  project: { city?: string | null; district?: string | null },
  name: string,
): boolean {
  const want = name.trim().toLowerCase();
  return (
    (project.city ?? "").trim().toLowerCase() === want ||
    (project.district ?? "").trim().toLowerCase() === want
  );
}

/**
 * The district filter for `user`, or null when their role isn't scoped.
 *
 * A scoped account with NO district on file gets an EMPTY project list rather
 * than the whole company: an unconfigured branch login must fail closed, and an
 * Admin fixes it by setting the district on the user.
 */
export async function getDistrictScope(
  sb: SupabaseClient,
  user: Pick<SessionUser, "id" | "role"> & { email?: string | null },
): Promise<DistrictScope | null> {
  if (!isDistrictScoped(user.role)) return null;
  // The hidden dev/support account role-switches to PREVIEW a desk. It has no
  // district of its own, so failing closed would show it an empty Plot Release,
  // empty bookings and empty everything — looking like a broken page rather than
  // an unscoped account. It sees company-wide instead, matching getDownlineIds,
  // which likewise hands the dev account the whole picture.
  if (isHiddenUser(user.email)) return null;
  return resolveScope(sb, user.id);
}

// Wrapped in React's cache() so the two round-trips happen ONCE per request, no
// matter how many pages, helpers and actions ask for the scope. Keyed on the
// user id (a string) rather than the session object, so callers holding
// different references to the same user still share the result.
const resolveScope = cache(
  async function resolveScope(sb: SupabaseClient, userId: string): Promise<DistrictScope> {
    const { data: me } = await sb.from("users").select("district").eq("id", userId).maybeSingle();
    const district = ((me as { district?: string | null } | null)?.district ?? "").trim() || null;
    if (!district) return { district: null, projectIds: [] };

    const { data: projects } = await sb.from("projects").select("id").or(branchProjectFilter(district));
    return {
      district,
      projectIds: ((projects ?? []) as { id: string }[]).map((p) => p.id),
    };
  },
);

/**
 * "Sees every record, unfiltered." True for Admin, and for the hidden dev/support
 * account whatever role it is previewing.
 *
 * Pages that are neither district-scoped nor Admin normally fall back to "just my
 * own records" (customers I created, deals I raised). For the dev account that
 * fallback yields NOTHING — it has created nothing — so a role preview showed
 * empty tables that looked like broken pages. getDownlineIds already hands the dev
 * account every id for exactly this reason; this is the same idea for the
 * ownership fallbacks that do not go through it.
 */
export function seesAllRecords(
  user: Pick<SessionUser, "role"> & { email?: string | null },
): boolean {
  return user.role === "admin" || isHiddenUser(user.email);
}

/**
 * Apply a scope to a query on a table that has a `project_id` column
 * (bookings, plots, registrations). A no-op when `scope` is null.
 *
 * `.in("project_id", [])` matches nothing, which is exactly what a desk with no
 * district (or a district with no projects) should see.
 */
export function withProjectScope<T>(query: T, scope: DistrictScope | null, column = "project_id"): T {
  if (!scope) return query;
  return (query as { in: (c: string, v: string[]) => T }).in(column, scope.projectIds);
}

/** Does this scope allow touching `projectId`? Unscoped roles always pass. */
export function projectInScope(scope: DistrictScope | null, projectId: string | null | undefined): boolean {
  if (!scope) return true;
  return !!projectId && scope.projectIds.includes(projectId);
}

/**
 * Guard for a server action working on ONE booking: resolves the booking's
 * project and checks it against the actor's scope. Returns true when the action
 * may proceed (always true for unscoped roles).
 *
 * Capability checks answer "may this role ever do this?"; this answers "may this
 * desk do it to THIS record?" — both are required on a scoped action.
 */
export async function bookingInScope(
  sb: SupabaseClient,
  user: Pick<SessionUser, "id" | "role">,
  bookingId: string,
): Promise<boolean> {
  const scope = await getDistrictScope(sb, user);
  if (!scope) return true;
  const { data } = await sb.from("bookings").select("project_id").eq("id", bookingId).maybeSingle();
  return projectInScope(scope, (data as { project_id?: string | null } | null)?.project_id);
}

/** Same guard, for an action addressed by plot id (plot release / extend). */
export async function plotInScope(
  sb: SupabaseClient,
  user: Pick<SessionUser, "id" | "role">,
  plotId: string,
): Promise<boolean> {
  const scope = await getDistrictScope(sb, user);
  if (!scope) return true;
  const { data } = await sb.from("plots").select("project_id").eq("id", plotId).maybeSingle();
  return projectInScope(scope, (data as { project_id?: string | null } | null)?.project_id);
}
