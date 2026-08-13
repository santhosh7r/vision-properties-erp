import "server-only";
import { redirect } from "next/navigation";
import { getSession, mustChangePassword, type SessionUser } from "./session";
import { can, type Capability } from "./roles";
import { isHiddenUser } from "./hidden-users";

// Require an authenticated user; redirect to /login otherwise.
//
// A freshly-provisioned account (admin-set or seeded temporary password) is also
// held at /change-password until it sets its own. The check lives HERE rather
// than only in the app layout so it covers every authenticated surface — pages
// outside the layout (e.g. a printed receipt) and every server action too, not
// just the ones that happen to render inside the sidebar shell.
//
// /change-password itself reads the session directly and never calls this, so
// there is no redirect loop.
export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  if (await mustChangePassword(user.id)) redirect("/change-password");
  return user;
}

// Require a specific capability; redirect to dashboard if missing.
export async function requireCapability(cap: Capability): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, cap)) redirect("/dashboard");
  return user;
}

// Require the hidden dev/support account. Used by dev-only tooling (Excel import)
// so no other user — not even other admins — can see or reach it.
export async function requireDevUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isHiddenUser(user.email)) redirect("/dashboard");
  return user;
}
