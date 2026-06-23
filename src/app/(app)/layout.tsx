import { requireUser } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { ROLE_LABELS } from "@/lib/roles";
import { logout } from "@/app/login/actions";
import ThemeToggle from "@/components/ThemeToggle";
import { SubmitButton } from "@/components/SubmitButton";
import SideNav from "./SideNav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const items = navFor(user.role);
  const initials = user.full_name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen">
      <SideNav items={items} />

      <div className="flex min-w-0 flex-1 flex-col">
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
            <ThemeToggle />
            <div className="flex items-center gap-3 pl-1">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium leading-tight">{user.full_name}</p>
                <p className="text-[11px] text-[var(--muted)]">{ROLE_LABELS[user.role]}</p>
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
        <main className="mx-auto w-full max-w-[1400px] flex-1 overflow-x-hidden p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
