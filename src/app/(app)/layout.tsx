import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { mustChangePassword } from "@/lib/session";
import { isHiddenUser } from "@/lib/hidden-users";
import { navFor } from "@/lib/nav";
import { ROLE_LABELS } from "@/lib/roles";
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
  const user = await requireUser();
  // Force a password change before the app is usable when flagged (e.g. a
  // freshly-provisioned account with an admin-set temporary password).
  if (await mustChangePassword(user.id)) redirect("/change-password");
  // Nav follows the EFFECTIVE role, so a dev switched to Business Partner sees
  // exactly that role's menu. Dev-only items stay keyed off the account itself.
  const items = navFor(user.role, isHiddenUser(user.email));
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
