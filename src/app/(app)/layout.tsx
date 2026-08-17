import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { navForUser, pageLevel } from "@/lib/access";
import { pageKeyForPath } from "@/lib/pages";
import { needsRegistration } from "@/lib/partner-registration";
import { isHiddenUser } from "@/lib/hidden-users";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { logout } from "@/app/login/actions";
import ThemeToggle from "@/components/ThemeToggle";
import { SubmitButton } from "@/components/SubmitButton";
import SideNav from "./SideNav";
import DevRoleSwitcher from "./DevRoleSwitcher";
import DevBanner from "./DevBanner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // requireUser already holds a flagged account at /change-password (a
  // freshly-provisioned login with a temporary password) before anything renders.
  const user = await requireUser();
  // Then force the registration form. Sales accounts that predate the form (or
  // arrived by import) have no date of birth, address, nominee or signed
  // declaration on file, and may not use the app until they do. Keyed off the
  // REAL role so a dev switched into Business Partner is not asked to complete a
  // registration for an admin account.
  if (await needsRegistration(user.id, user.realRole)) redirect("/complete-profile");
  // PAGE CONFIG, enforced in ONE place for every route under (app). A layout is
  // not told which URL it is rendering, so middleware forwards it as a header.
  // Doing it here rather than page by page means a page an Admin has switched off
  // cannot be reached by typing its URL, and no future page can forget the check.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const pageKey = pageKeyForPath(pathname);
  if (pageKey && (await pageLevel(user.role as Role, pageKey)) === "none") {
    redirect("/dashboard");
  }
  // Nav follows the EFFECTIVE role, so a dev switched to Business Partner sees
  // exactly that role's menu, minus anything Page Config has hidden. Dev-only
  // items stay keyed off the account itself.
  const items = await navForUser(user, isHiddenUser(user.email));
  // True only for the dev account while it is running as someone else's role.
  const devSwitched = user.isDev && user.role !== user.realRole;
  const initials = user.full_name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden">
      <Suspense fallback={null}>
        <SideNav items={items} />
      </Suspense>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className="sticky top-0 z-20 flex h-16 items-center justify-between px-6"
          style={{
            background: "color-mix(in srgb, var(--background) 80%, transparent)",
            borderBottom: "1px solid var(--border)",
            backdropFilter: "saturate(140%) blur(8px)",
          }}
        >
          <div className="flex items-center gap-2 md:hidden">
            <img
              src="/logo-mark.png"
              alt="Vision Properties"
              className="h-8 w-8 shrink-0 object-contain"
            />
            <p className="text-sm font-semibold">
              <span style={{ color: "var(--brand-red)" }}>Vision</span>{" "}
              <span style={{ color: "var(--accent)" }}>Properties</span>
            </p>
          </div>
          <div className="flex flex-1 items-center justify-end gap-3">
            {user.isDev && <DevRoleSwitcher active={user.role} realRole={user.realRole} />}
            <ThemeToggle />
            <div className="flex items-center gap-3 pl-1">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium leading-tight">{user.full_name}</p>
                {/* While switched, name the effective role AND the real one, so
                    the header can never imply two different identities. */}
                <p
                  className="text-[11px]"
                  style={{ color: devSwitched ? "var(--brand-red)" : "var(--muted)" }}
                >
                  {ROLE_LABELS[user.role]}
                  {devSwitched && ` · really ${ROLE_LABELS[user.realRole]}`}
                </p>
              </div>
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                {initials}
              </div>
            </div>
            <form action={logout}>
              <SubmitButton className="btn-ghost" pendingLabel="Signing out…">
                Sign out
              </SubmitButton>
            </form>
          </div>
        </header>
        {devSwitched && (
          <DevBanner name={user.full_name} active={user.role} realRole={user.realRole} />
        )}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="w-full p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
