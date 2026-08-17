"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge } from "@/components/ui";
import type { PageLevel } from "@/lib/pages";
import { saveRoleAccess, resetRoleAccess } from "./actions";

export interface PageRow {
  key: string;
  label: string;
  group: string;
  level: PageLevel;
  defaultLevel: PageLevel;
}

export interface RoleCard {
  role: string;
  label: string;
  canLogin: boolean;
  customised: boolean;
  pages: PageRow[];
}

// One card per role, each its own form so a save touches only that role.
export default function RoleAccessEditor({ roles }: { roles: RoleCard[] }) {
  return (
    <div className="space-y-4">
      {roles.map((r) => (
        <RoleCardForm key={r.role} card={r} />
      ))}
    </div>
  );
}

function RoleCardForm({ card }: { card: RoleCard }) {
  // Two plain checkboxes per page beat a three-way control: "can they open it"
  // and "can they change it" are the two questions being asked, so each gets its
  // own tick. The stored level is derived from the pair on submit.
  const [allowed, setAllowed] = useState<Record<string, boolean>>(
    Object.fromEntries(card.pages.map((p) => [p.key, p.level !== "none"])),
  );
  const [editable, setEditable] = useState<Record<string, boolean>>(
    Object.fromEntries(card.pages.map((p) => [p.key, p.level === "edit"])),
  );
  const [canLogin, setCanLogin] = useState(card.canLogin);
  const [open, setOpen] = useState(false);

  const grantedCount = card.pages.filter((p) => allowed[p.key]).length;
  const editCount = card.pages.filter((p) => allowed[p.key] && editable[p.key]).length;
  const allOn = grantedCount === card.pages.length;

  const toggleAll = () => {
    const next = !allOn;
    setAllowed(Object.fromEntries(card.pages.map((p) => [p.key, next])));
    if (!next) setEditable(Object.fromEntries(card.pages.map((p) => [p.key, false])));
  };

  const levelOf = (key: string): PageLevel =>
    !allowed[key] ? "none" : editable[key] ? "edit" : "view";

  return (
    <form action={saveRoleAccess} className="card">
      <input type="hidden" name="role" value={card.role} />
      {/* The pair of ticks above is what the Admin sets; this is what gets stored. */}
      {card.pages.map((p) => (
        <input key={p.key} type="hidden" name={`level:${p.key}`} value={levelOf(p.key)} />
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-left"
          aria-expanded={open}
        >
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="shrink-0 text-[var(--muted)] transition-transform"
            style={{ transform: open ? "rotate(90deg)" : "none" }}
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          <span className="text-sm font-semibold">{card.label}</span>
          <span className="text-xs text-[var(--muted)]">
            {grantedCount} of {card.pages.length} pages · {editCount} editable
          </span>
          {card.customised ? <Badge tone="blue">Customised</Badge> : <Badge tone="gray">Defaults</Badge>}
          {!canLogin && <Badge tone="red">Login off</Badge>}
        </button>

        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="can_login"
              checked={canLogin}
              onChange={(e) => setCanLogin(e.target.checked)}
            />
            Can log in
          </label>
          <SubmitButton className="btn-primary" style={{ padding: "6px 14px", fontSize: 13 }} pendingLabel="Saving…">
            Save
          </SubmitButton>
        </div>
      </div>

      {open && (
        <>
          <div
            className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4"
            style={{ borderColor: "var(--border)" }}
          >
            <p className="text-xs text-[var(--muted)]">
              Tick a page to let this role open it. Tick <b>Edit</b> as well to let them change things on it —
              untick Edit and the page opens read-only, with its buttons hidden.
            </p>
            <div className="flex items-center gap-3 text-xs">
              <button type="button" onClick={toggleAll} className="font-medium text-[var(--accent)]">
                {allOn ? "Clear all" : "Select all"}
              </button>
              <button
                type="submit"
                formAction={resetRoleAccess}
                className="font-medium text-[var(--brand-red)]"
              >
                Back to defaults
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {card.pages.map((p) => {
              const on = allowed[p.key];
              const changed = levelOf(p.key) !== p.defaultLevel;
              return (
                <div
                  key={p.key}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                  style={{ background: on ? "var(--surface-2)" : "transparent" }}
                >
                  <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        setAllowed((prev) => ({ ...prev, [p.key]: e.target.checked }));
                        // Losing access loses edit with it — "edit but cannot
                        // open" is not a state worth being able to save.
                        if (!e.target.checked) setEditable((prev) => ({ ...prev, [p.key]: false }));
                      }}
                    />
                    <span className="truncate" title={p.label}>
                      {p.label}
                    </span>
                    {changed && <span className="text-[var(--accent)]">•</span>}
                  </label>

                  <label
                    className="flex shrink-0 items-center gap-1.5 text-xs"
                    style={{ opacity: on ? 1 : 0.35, cursor: on ? "pointer" : "not-allowed" }}
                  >
                    <input
                      type="checkbox"
                      checked={on && editable[p.key]}
                      disabled={!on}
                      onChange={(e) => setEditable((prev) => ({ ...prev, [p.key]: e.target.checked }))}
                    />
                    Edit
                  </label>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-[11px] text-[var(--muted)]">
            <span className="text-[var(--accent)]">•</span> marks a page set differently from its built-in default.
          </p>
        </>
      )}
    </form>
  );
}
