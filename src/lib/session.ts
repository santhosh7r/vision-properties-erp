import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "./roles";
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
  role: Role;
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET || "dev-insecure-secret-change-me";
  return new TextEncoder().encode(s);
}

export async function createSession(user: SessionUser): Promise<void> {
  // Stamp the token with the user's current session version so "Sign out
  // everywhere" (which bumps the version) invalidates it.
  const sv = (await currentSessionVersion(user.id)) ?? 0;
  const token = await new SignJWT({ ...user, sv })
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
      const sessionUser: SessionUser = {
        id: payload.id as string,
        full_name: payload.full_name as string,
        email: payload.email as string,
        role: payload.role as Role,
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

export const SESSION_COOKIE = COOKIE_NAME;
