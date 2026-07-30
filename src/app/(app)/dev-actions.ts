"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { setDevRole } from "@/lib/session";
import { ROLES, type Role } from "@/lib/roles";

/**
 * Switch the hidden dev account into another role for this session.
 *
 * Rejected for every other account — `setDevRole` re-checks that the caller is a
 * hidden dev login before re-issuing the token, so a crafted POST from a real
 * user cannot escalate itself. An empty / unknown value drops the override and
 * returns the account to its real role.
 *
 * The redirect at the end is NOT cosmetic. `getSession` is wrapped in React's
 * `cache()`, so within THIS request it keeps returning the pre-switch token —
 * re-rendering here would paint the old role and the client router would cache
 * that stale shell. A redirect forces a brand-new request that reads the new
 * cookie from scratch, so every part of the UI agrees on who you are.
 */
export async function switchDevRole(formData: FormData): Promise<void> {
  const raw = String(formData.get("role") || "").trim();
  const role = ROLES.includes(raw as Role) ? (raw as Role) : null;
  await setDevRole(role);

  // Come back to the page you were on. Guard the value: it is a form field, and
  // "//evil.com" is a protocol-relative URL that would redirect off-site.
  const path = String(formData.get("path") || "");
  const safe = path.startsWith("/") && !path.startsWith("//") ? path : "/dashboard";

  revalidatePath("/", "layout");
  redirect(safe);
}
