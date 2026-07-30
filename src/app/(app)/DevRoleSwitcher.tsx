"use client";

import { useRef, useTransition } from "react";
import { usePathname } from "next/navigation";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/roles";
import { switchDevRole } from "./dev-actions";

/**
 * Role switcher for the hidden dev account — one login that can act as any role
 * without a second account. Rendered only when the session is a dev login; the
 * server action re-checks that independently.
 *
 * The <select> is UNCONTROLLED (`defaultValue` + a `key` that changes with the
 * role) rather than controlled. A controlled value fought the browser during the
 * submit-and-navigate transition and could end up displaying a different role
 * than the rest of the header — keying it to `active` means every server render
 * rebuilds it from the session and the two can never disagree.
 */
export default function DevRoleSwitcher({
  active,
  realRole,
}: {
  active: Role;
  realRole: Role;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const pathname = usePathname();
  const switched = active !== realRole;

  return (
    <form ref={formRef} action={switchDevRole} className="flex items-center gap-2">
      <input type="hidden" name="path" value={pathname} />
      <label
        className="hidden text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] sm:block"
        htmlFor="dev-role"
      >
        Acting as
      </label>
      <select
        id="dev-role"
        key={active}
        name="role"
        defaultValue={active}
        className="select"
        style={{
          minWidth: 165,
          height: 34,
          paddingTop: 0,
          paddingBottom: 0,
          borderColor: switched ? "var(--brand-red)" : undefined,
          color: switched ? "var(--brand-red)" : undefined,
          fontWeight: 600,
        }}
        disabled={pending}
        aria-label="Switch role"
        onChange={() => startTransition(() => formRef.current?.requestSubmit())}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
            {r === realRole ? " · real" : ""}
          </option>
        ))}
      </select>
    </form>
  );
}
