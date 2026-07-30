import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { ROLES, type Role } from "./roles";
import { isHiddenUser } from "./hidden-users";
import { getSupabase } from "./supabase";

// Best-effort fetch of a user's current session_version. Fails OPEN (returns
// null) so a missing column / DB hiccup never locks anyone out.
async function currentSessionVersion(userId: string): Promise<number | null> {
  try {
    const { data } = await getSupabase()
      .from("users")
      .select("session_version")
      .eq("id", userId)
      .maybeSingle();
    const v = (data as { session_version?: number } | null)?.session_version;
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
}

// Best-effort check of the user's "must change password on next login" flag,
// stored on users.settings (jsonb). Fails OPEN (returns false) so a DB hiccup
// never traps someone on the change-password screen.
export async function mustChangePassword(userId: string): Promise<boolean> {
  try {
    const { data } = await getSupabase()
      .from("users")
      .select("settings")
      .eq("id", userId)
      .maybeSingle();
    const settings = (data as { settings?: { must_change_password?: boolean } } | null)?.settings;
    return settings?.must_change_password === true;
  } catch {
    return false;
  }
}

const COOKIE_NAME = "vp_session";
const MAX_AGE = 60 * 60 * 12; // 12 hours

export interface SessionUser {
  id: string;
  full_name: string;
  email: string;
  /**
   * The role the app should behave as. For everyone this is their real role;
   * for the hidden dev account it is whichever role they have switched into, so
   * every capability check, nav item and scoped query downstream follows the
   * switch with no special-casing.
   */
  role: Role;
  /** What the database actually says. Differs from `role` only while switched. */
  realRole: Role;
  /** A hidden dev/support login — the only account allowed to switch roles. */
  isDev: boolean;
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET || "dev-insecure-secret-change-me";
  return new TextEncoder().encode(s);
}

export async function createSession(
  user: { id: string; full_name: string; email: string; role: Role },
  devRole?: Role | null,
): Promise<void> {
  // Stamp the token with the user's current session version so "Sign out
  // everywhere" (which bumps the version) invalidates it.
  const sv = (await currentSessionVersion(user.id)) ?? 0;
  // `role` in the token is always the REAL role; `dev_role` is the temporary
  // override, honoured on read only for a hidden dev account. Keeping both means
  // switching never mutates the database and cannot leak into anyone else's
  // session.
  const token = await new SignJWT({
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    dev_role: devRole ?? undefined,
    sv,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

// Wrapped in React's cache() so a single request render dedupes the cookie read,
// JWT verify and the session_version DB round-trip. Without this, every
// requireUser()/requireCapability() call (layout + each page + nested
// components — dozens per request) re-ran the remote auth query serially, which
// was the main source of slow page loads.
export const getSession = cache(
  async function getSession(): Promise<SessionUser | null> {
    const store = await cookies();
    const token = store.get(COOKIE_NAME)?.value;
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, secret());
      const email = payload.email as string;
      const realRole = payload.role as Role;
      // Only a hidden dev account may run under an overridden role, and only a
      // role that actually exists — a tampered token falls back to the real one.
      const isDev = isHiddenUser(email);
      const devRole = payload.dev_role as Role | undefined;
      const effective = isDev && devRole && ROLES.includes(devRole) ? devRole : realRole;
      const sessionUser: SessionUser = {
        id: payload.id as string,
        full_name: payload.full_name as string,
        email,
        role: effective,
        realRole,
        isDev,
      };
      // "Sign out everywhere" bumps the user's session_version; a token stamped
      // with an older version is rejected. Fail open (only reject on a definite
      // mismatch) so a missing column / DB hiccup never locks anyone out.
      const tokenSv = payload.sv as number | undefined;
      if (typeof tokenSv === "number") {
        const current = await currentSessionVersion(sessionUser.id);
        if (current !== null && current !== tokenSv) return null;
      }
      return sessionUser;
    } catch {
      return null;
    }
  },
);

/**
 * Re-issue the current session under a different role. Refused for anyone but a
 * hidden dev account — the guard is here rather than only in the calling action
 * so there is exactly one door into an overridden role.
 *
 * Passing `null` drops the override and restores the real role.
 */
export async function setDevRole(role: Role | null): Promise<boolean> {
  const user = await getSession();
  if (!user || !user.isDev) return false;
  if (role !== null && !ROLES.includes(role)) return false;
  await createSession(
    { id: user.id, full_name: user.full_name, email: user.email, role: user.realRole },
    role,
  );
  return true;
}

export const SESSION_COOKIE = COOKIE_NAME;
