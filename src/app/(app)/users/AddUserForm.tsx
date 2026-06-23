"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ROLE_LABELS,
  SALES_HIERARCHY,
  BUSINESS_OPERATORS,
  managerRoleOf,
  canManageRole,
  type Role,
} from "@/lib/roles";
import { createUser } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";

export interface ManagerOption {
  id: string;
  full_name: string;
  role: Role;
  code: string | null;
}

// Only render this many matches in the picker at once — keeps the dropdown fast
// when there are thousands of potential managers. The user narrows with search.
const MAX_RESULTS = 50;

// A member sits directly under a parent whose role is exactly one level above
// them (managerRoleOf):
//   Senior Director / Finance / Legal -> the company (Admin), auto-attached
//   Director        -> a Senior Director   (searchable, required)
//   Business Manager-> a Director           (searchable, required)
//   Business Partner-> a Business Manager   (searchable, required)
//   Admin           -> none (top of the org)
export default function AddUserForm({ managers }: { managers: ManagerOption[] }) {
  const [role, setRole] = useState<Role | "">("");
  const [managerId, setManagerId] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const need = role ? managerRoleOf(role as Role) : null;
  const admins = useMemo(() => managers.filter((m) => m.role === "admin"), [managers]);

  // sd / finance / legal attach to the company (Admin); director/manager/partner
  // need a specific searchable parent; admin has no parent.
  const adminParent = need === "admin";
  const needsPicker = !!need && need !== "admin";

  const validManagers = useMemo(() => {
    if (!need) return [];
    if (adminParent) return admins;
    // Director / Manager / Partner may report to Admin OR any sales role above
    // them — a higher role can place someone several rungs below directly.
    return managers.filter((m) => canManageRole(m.role, role as Role));
  }, [need, adminParent, admins, managers, role]);

  // When the role changes: reset search, and auto-pick the company Admin for the
  // operator/SD roles that always report to Admin.
  useEffect(() => {
    setQuery("");
    setOpen(false);
    setManagerId(adminParent ? admins[0]?.id ?? "" : "");
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    if (!needsPicker) return [];
    const t = query.trim().toLowerCase();
    const list = t
      ? validManagers.filter(
          (m) =>
            m.full_name.toLowerCase().includes(t) || (m.code ?? "").toLowerCase().includes(t),
        )
      : validManagers;
    return list.slice(0, MAX_RESULTS);
  }, [needsPicker, query, validManagers]);

  const selected = managerId ? managers.find((m) => m.id === managerId) ?? null : null;
  // The manager is optional for sales sub-roles: when left blank the new user
  // reports to the creating Admin (handled server-side).
  const canSubmit = true;

  const label = (m: ManagerOption) => `${m.code ? `${m.code} · ` : ""}${m.full_name}`;

  return (
    <form action={createUser} className="space-y-3">
      <input type="hidden" name="manager_id" value={managerId} />

      <div>
        <label className="label">Full Name *</label>
        <input name="full_name" className="input" required />
      </div>
      <div>
        <label className="label">Email *</label>
        <input name="email" type="email" className="input" required />
      </div>
      <div>
        <label className="label">Temporary Password *</label>
        <input name="password" className="input" required minLength={6} />
      </div>
      <div>
        <label className="label">Mobile</label>
        <input name="mobile" className="input" />
      </div>

      <div>
        <label className="label">Role *</label>
        <select
          name="role"
          className="select"
          required
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          <option value="" disabled>
            Select role
          </option>
          <optgroup label="Sales Hierarchy">
            {SALES_HIERARCHY.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </optgroup>
          <optgroup label="Business Operators">
            {BUSINESS_OPERATORS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </optgroup>
          <option value="admin">{ROLE_LABELS.admin}</option>
        </select>
      </div>

      <div>
        <label className="label">Reports To (Manager)</label>

        {/* No role yet */}
        {!role && (
          <div className="input flex items-center text-[var(--muted)]">Pick a role first</div>
        )}

        {/* Admin-parent roles: fixed to the company Admin */}
        {role && adminParent && (
          <div className="input flex items-center text-[var(--muted)]">
            {admins[0] ? `${label(admins[0])} (company)` : "Company (no Admin found)"}
          </div>
        )}

        {/* Admin role: no manager */}
        {role && !need && (
          <div className="input flex items-center text-[var(--muted)]">— None (top of org) —</div>
        )}

        {/* Sales-parent roles: searchable picker */}
        {role && needsPicker && (
          <div className="relative">
            {selected ? (
              <div className="input flex items-center justify-between">
                <span>{label(selected)}</span>
                <button
                  type="button"
                  className="text-xs text-[var(--accent)]"
                  onClick={() => {
                    setManagerId("");
                    setQuery("");
                    setOpen(true);
                  }}
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  className="input"
                  placeholder="Search a manager by name or ID… (optional)"
                  value={query}
                  autoComplete="off"
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(true);
                  }}
                  onFocus={() => setOpen(true)}
                />
                {open && (
                  <>
                    {/* click-away backdrop */}
                    <button
                      type="button"
                      aria-hidden
                      className="fixed inset-0 z-10 cursor-default"
                      onClick={() => setOpen(false)}
                    />
                    <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-[var(--surface)] shadow-lg">
                      {filtered.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-[var(--muted)]">
                          No manager found.
                        </div>
                      ) : (
                        filtered.map((m) => (
                          <button
                            type="button"
                            key={m.id}
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
                            onClick={() => {
                              setManagerId(m.id);
                              setOpen(false);
                            }}
                          >
                            {label(m)}
                          </button>
                        ))
                      )}
                      {validManagers.length > filtered.length && (
                        <div className="px-3 py-1 text-[11px] text-[var(--muted)]">
                          Showing {filtered.length} of {validManagers.length} — keep typing to
                          narrow.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        <p className="mt-1 text-xs text-[var(--muted)]">
          {!role
            ? "Pick a role to see who they can report to."
            : adminParent
              ? "Reports directly to the company (Admin)."
              : needsPicker
                ? `Optionally pick the manager this ${ROLE_LABELS[role as Role]} reports to — any Admin or higher sales role. Leave blank to report to you.`
                : "Admins sit at the top of the org — no manager."}
        </p>
      </div>

      <SubmitButton className="btn-primary w-full" disabled={!canSubmit} pendingLabel="Creating…">
        Create User
      </SubmitButton>
    </form>
  );
}
