"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  ROLE_LABELS,
  SALES_HIERARCHY,
  BUSINESS_OPERATORS,
  IN_HOUSE_ROLES,
  isDistrictScoped,
  managerRoleOf,
  canManageRole,
  requiresRegistration,
  type Role,
} from "@/lib/roles";
import { createUser, type CreateUserState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import PartnerRegistrationFields, {
  NewPartnerCredentials,
} from "@/components/PartnerRegistrationFields";
import { DISTRICTS } from "@/lib/options";

export interface ManagerOption {
  id: string;
  full_name: string;
  role: Role;
  code: string | null;
}

// Highlighted role tag shown on the RIGHT of a manager option / chip.
function RoleTag({ role }: { role: Role }) {
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

// Name (+ partner code) on the left.
function ManagerName({ m }: { m: ManagerOption }) {
  return (
    <span className="truncate">
      {m.full_name}
      {m.code && <span className="ml-1.5 font-mono text-xs text-[var(--muted)]">{m.code}</span>}
    </span>
  );
}

// Only render this many matches in the picker at once — keeps the dropdown fast
// when there are thousands of potential managers. The user narrows with search.
const MAX_RESULTS = 50;

// A member sits directly under a parent whose role is exactly one level above
// them (managerRoleOf):
//   Senior Director / Finance / Legal -> the company (Admin), auto-attached
//   Director        -> a Senior Director   (searchable, required)
//   Business Manager-> a Director           (searchable, required)
//   Business Partner-> typed Reference ID   (partner code, see below)
//   Admin           -> none (top of the org)
//
// Business Partner is the one role onboarded through the full VISION PROPERTIES
// registration form (personal / professional / nominee / reference +
// declaration). Its parent is entered as a typed Reference ID rather than picked
// from a dropdown — the list stops being usable once there are thousands of
// partners — and its login password is generated server-side and shown once.
export default function AddUserForm({
  managers,
  creatableRoles = null,
}: {
  managers: ManagerOption[];
  /**
   * Roles this actor may create. `null` = Admin, who gets the full picker
   * (sales tiers + business operators + admin). A sales manager gets only the
   * roles strictly beneath their own — a Senior Director sees Director /
   * Business Manager / Business Partner, a Business Manager sees only Business
   * Partner. Enforced again server-side in createUser.
   */
  creatableRoles?: Role[] | null;
}) {
  const [state, formAction] = useActionState<CreateUserState | undefined, FormData>(
    createUser,
    undefined,
  );
  // With exactly one creatable role (a Business Manager can only ever add a
  // Business Partner) there is nothing to choose — preselect it so the form
  // opens straight on the registration fields.
  const soleRole: Role | "" = creatableRoles?.length === 1 ? creatableRoles[0] : "";
  const [role, setRole] = useState<Role | "">(soleRole);
  const [managerId, setManagerId] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // Remount key — bumped after a successful create so every uncontrolled input
  // in the form starts blank again for the next partner.
  const [formKey, setFormKey] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Every sales tier now fills in the full registration form. Only a Business
  // Partner is PLACED by typed Reference ID; the upper three keep the searchable
  // "Reports To" picker, so the two ideas are tracked separately.
  const isPartner = role === "business_partner";
  const needsForm = !!role && requiresRegistration(role as Role);
  // A Pre-Sales / Post-Sales desk is defined BY its district — without one the
  // account can see nothing at all, so the field stops being optional.
  const districtRequired = !!role && isDistrictScoped(role as Role);
  const created = state?.created && !dismissed ? state.created : null;

  useEffect(() => {
    if (state?.created) setDismissed(false);
  }, [state]);

  const need = role ? managerRoleOf(role as Role) : null;
  const admins = useMemo(() => managers.filter((m) => m.role === "admin"), [managers]);

  // sd / finance / legal attach to the company (Admin); director/manager need a
  // specific searchable parent; partner types a Reference ID; admin has no parent.
  const adminParent = need === "admin";
  const needsPicker = !!need && need !== "admin" && !isPartner;

  const validManagers = useMemo(() => {
    if (!need) return [];
    if (adminParent) return admins;
    // Director / Manager may report to Admin OR any sales role above them — a
    // higher role can place someone several rungs below directly.
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

  const label = (m: ManagerOption) =>
    `${m.full_name} · ${ROLE_LABELS[m.role]}${m.code ? ` · ${m.code}` : ""}`;

  function addAnother() {
    setDismissed(true);
    setRole(soleRole);
    setManagerId("");
    setQuery("");
    setFormKey((k) => k + 1);
  }

  // ---- Success panel: the generated password is shown ONCE, right here. ----
  if (created) {
    return (
      <div className="space-y-4">
        <NewPartnerCredentials
          name={created.name}
          email={created.email}
          code={created.code}
          roleLabel={ROLE_LABELS[created.role]}
          password={created.password}
        />
        <button type="button" className="btn-primary w-full" onClick={addAnother}>
          Add Another Partner
        </button>
      </div>
    );
  }

  // Built once here rather than inline, because it is now shared by two branches
  // of the form: staff accounts, and the sales tiers above Business Partner that
  // fill in the registration form but are still placed with the picker.
  const reportsTo = (
    <div>
      <label className="label">Reports To (Manager)</label>

      {/* No role yet */}
      {!role && <div className="input flex items-center text-[var(--muted)]">Pick a role first</div>}

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
            <div className="input flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <ManagerName m={selected} />
                <RoleTag role={selected.role} />
              </span>
              <button
                type="button"
                className="shrink-0 text-xs text-[var(--accent)]"
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
                      <div className="px-3 py-2 text-xs text-[var(--muted)]">No manager found.</div>
                    ) : (
                      filtered.map((m) => (
                        <button
                          type="button"
                          key={m.id}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
                          onClick={() => {
                            setManagerId(m.id);
                            setOpen(false);
                          }}
                        >
                          <ManagerName m={m} />
                          <RoleTag role={m.role} />
                        </button>
                      ))
                    )}
                    {validManagers.length > filtered.length && (
                      <div className="px-3 py-1 text-[11px] text-[var(--muted)]">
                        Showing {filtered.length} of {validManagers.length} — keep typing to narrow.
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
  );

  return (
    <form key={formKey} action={formAction} className="space-y-5">
      <input type="hidden" name="manager_id" value={isPartner ? "" : managerId} />

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
          {creatableRoles ? (
            // Sales manager: only the levels beneath them, flat (no operators/admin).
            creatableRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))
          ) : (
            <>
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
              {/* In-house desks — staff, not partners: they sit outside the
                  sales tree and report straight to the company. */}
              <optgroup label="In-House Team">
                {IN_HOUSE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </optgroup>
              <option value="admin">{ROLE_LABELS.admin}</option>
            </>
          )}
        </select>
      </div>

      {/* ============ REGISTRATION FORM — every sales tier ============ */}
      {needsForm ? (
        <>
          {/* Reference ID places a Business Partner; the tiers above are placed
              with the picker below, so the field is hidden for them. */}
          <PartnerRegistrationFields showReference={isPartner} />
          {!isPartner && reportsTo}
        </>
      ) : (
        /* ============ STAFF ACCOUNTS (Admin / Finance / Legal) — short form ============ */
        <>
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
            <label className="label">District {districtRequired && "*"}</label>
            <select name="district" className="select" defaultValue="" required={districtRequired}>
              <option value="">— Select district —</option>
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {districtRequired
                ? `A ${ROLE_LABELS[role as Role]} desk works ONE branch — it sees only this district's projects, deals, payments and customers.`
                : "Sales panels show this district's inventory first."}
            </p>
          </div>

          {reportsTo}
        </>
      )}

      {state?.error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {state.error}
        </p>
      )}

      <SubmitButton className="btn-primary w-full" pendingLabel="Creating…">
        {needsForm ? "Create Partner" : "Create User"}
      </SubmitButton>
    </form>
  );
}
