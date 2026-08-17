import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, mustChangePassword, type SessionUser } from "./session";
import { can, type Capability, type Role } from "./roles";
import { loadRoleAccess, resolveLevel } from "./access";
import { pageKeyForPath } from "./pages";
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
  await assertPageWritable(user.role as Role);
  return user;
}

// PAGE CONFIG · the "View only" half, enforced in ONE place.
//
// A server action posts to the URL the user is looking at and carries Next's
// `next-action` header, so an action can tell which page it was fired from —
// something the layout guard (which handles No access) cannot do, because it does
// not run for actions. Every action already funnels through requireCapability, so
// checking here covers the whole app rather than relying on ~40 call sites each
// remembering to.
//
// Page RENDERS reach requireCapability too, and must not be blocked: a View-only
// page has to open. That is why this only fires when the `next-action` header is
// present.
async function assertPageWritable(role: Role): Promise<void> {
  if (role === "admin") return; // Admin is locked to full access
  const h = await headers();
  if (!h.get("next-action")) return; // a page render, not a write
  const pageKey = pageKeyForPath(h.get("x-pathname") ?? "");
  if (!pageKey) return; // outside the registry — nothing configured to enforce
  const access = await loadRoleAccess();
  if (resolveLevel(access, role, pageKey) !== "edit") redirect("/dashboard");
}

// Open a page, and report back what the caller may do on it: `canEdit` false
// means View only, so the page must render without its action controls.
export async function requirePage(
  pageKey: string,
): Promise<{ user: SessionUser; canEdit: boolean }> {
  const user = await requireUser();
  const level = resolveLevel(await loadRoleAccess(), user.role as Role, pageKey);
  if (level === "none") redirect("/dashboard");
  return { user, canEdit: level === "edit" };
}

// Open a page that more than one capability can reach, typically because some
// roles get it read-only. The page decides what each of them may DO — check the
// individual capability with `can()` and hide the controls the caller lacks.
export async function requireAnyCapability(caps: Capability[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!caps.some((c) => can(user.role, c))) redirect("/dashboard");
  await assertPageWritable(user.role as Role);
  return user;
}

// Require the hidden dev/support account. Used by dev-only tooling (Excel import)
// so no other user — not even other admins — can see or reach it.
export async function requireDevUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isHiddenUser(user.email)) redirect("/dashboard");
  return user;
}
