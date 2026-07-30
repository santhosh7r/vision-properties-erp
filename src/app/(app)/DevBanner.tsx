"use client";

import { usePathname } from "next/navigation";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { switchDevRole } from "./dev-actions";

/**
 * Full-width strip shown whenever the dev account is running as a role other
 * than its own. The header select alone was too easy to miss — after a few
 * minutes of testing it is genuinely hard to remember whose permissions you are
 * looking through, and every screen looks legitimate either way.
 *
 * Stays put until the role is changed by hand: nothing in the app resets it.
 */
export default function DevBanner({
  name,
  active,
  realRole,
}: {
  name: string;
  active: Role;
  realRole: Role;
}) {
  const pathname = usePathname();

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 px-6 py-2 text-xs"
      style={{
        background: "var(--brand-red-soft)",
        borderBottom: "1px solid var(--brand-red)",
        color: "var(--text)",
      }}
    >
      <span
        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
        style={{ background: "var(--brand-red)", color: "var(--brand-red-contrast)" }}
      >
        Dev mode
      </span>
      <span>
        You are <b>{name}</b> — signed in as{" "}
        <b>{ROLE_LABELS[realRole]}</b>, but the app is behaving as{" "}
        <b style={{ color: "var(--brand-red)" }}>{ROLE_LABELS[active]}</b>. Menus, permissions and
        every page follow that role.
      </span>
      <form action={switchDevRole} className="ml-auto">
        <input type="hidden" name="path" value={pathname} />
        <input type="hidden" name="role" value={realRole} />
        <button
          type="submit"
          className="rounded-lg px-2.5 py-1 text-[11px] font-semibold underline underline-offset-2"
          style={{ color: "var(--brand-red)" }}
        >
          Back to {ROLE_LABELS[realRole]}
        </button>
      </form>
    </div>
  );
}
