"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { SubmitButton } from "@/components/SubmitButton";
import { NewPartnerCredentials } from "@/components/PartnerRegistrationFields";
import { resetUserPassword, type ResetPasswordState } from "./actions";

// The minimum a reset needs to know about its target. Deliberately narrower than
// UsersTable's UserRow so the Settings panel can supply it without pulling in
// the table's shape — both callers pass something structurally compatible.
export interface ResetTarget {
  id: string;
  full_name: string;
  role: Role;
  code: string | null;
}

// ---------------------------------------------------------------------------
// Reset Password — Admin only (see resetUserPassword in ./actions).
//
// Two-state modal: the authorise form, then the one-time credentials panel. It
// deliberately does NOT close itself on success — the generated password exists
// only in that response, so the Admin has to see it and hand it over before
// dismissing. Backdrop-click and Esc are both disabled once a password is on
// screen, for the same reason.
// ---------------------------------------------------------------------------
export function ResetPasswordModal({
  row,
  onClose,
}: {
  row: ResetTarget;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<ResetPasswordState | undefined, FormData>(
    resetUserPassword,
    undefined,
  );
  const done = state?.done;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !done) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={done ? undefined : onClose}
    >
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="space-y-4">
            <NewPartnerCredentials
              name={done.name}
              email={done.email}
              code={done.code}
              roleLabel={ROLE_LABELS[done.role]}
              password={done.password}
            />
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--muted)]">
              They have been signed out everywhere, and will be asked to set their own password the
              next time they sign in. This temporary one stops working at that point.
            </div>
            <button type="button" onClick={onClose} className="btn-primary w-full">
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-sm font-semibold">Reset Password</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {row.full_name} · {ROLE_LABELS[row.role]}
              {row.code ? ` · ${row.code}` : ""}
            </p>

            <div className="mt-3 space-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-[var(--text-2)]">
              <p>
                <b>A new password is generated for you</b> — you do not choose it. It is shown once,
                here, and cannot be retrieved afterwards.
              </p>
              <p>
                {row.full_name.split(" ")[0]} will be <b>signed out on every device</b> and must set
                their own password at the next sign-in.
              </p>
            </div>

            <form action={formAction} className="mt-4 space-y-4">
              <input type="hidden" name="id" value={row.id} />
              <div>
                <label className="label">Your own password, to authorise this *</label>
                <input
                  name="actor_password"
                  type="password"
                  autoComplete="current-password"
                  className="input"
                  required
                  autoFocus
                />
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Confirms it is really you at the keyboard — an Admin session left open cannot be
                  used to reset accounts without it.
                </p>
              </div>

              {state?.error && (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                  {state.error}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="btn-ghost">
                  Cancel
                </button>
                <SubmitButton className="btn-danger" pendingLabel="Resetting…">
                  Reset Password
                </SubmitButton>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Settings-page version: pick anybody, then the same modal.
//
// The Partners table already has a row-level button, which is the right shape
// when you are looking AT the person. This one is for the other direction —
// "someone just rang up locked out" — so it leads with a search over the whole
// staff and partner list instead of making the Admin find the row first.
// ---------------------------------------------------------------------------
export function ResetPasswordPanel({ users }: { users: ResetTarget[] }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ResetTarget | null>(null);
  const [open, setOpen] = useState<ResetTarget | null>(null);

  // Only search once the Admin has typed something, and cap the list: this is a
  // "find the one person who called" control, not a directory to scroll.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return users
      .filter((u) =>
        `${u.full_name} ${u.code ?? ""} ${ROLE_LABELS[u.role]}`.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, users]);

  return (
    <>
      <div className="space-y-3">
        <div>
          <label className="label">Find the person</label>
          <input
            className="input"
            placeholder="Name, partner ID (VPBP07) or role…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
            }}
          />
        </div>

        {query.trim() && !picked && (
          <div className="overflow-hidden rounded-lg border border-[var(--border)]">
            {matches.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-[var(--muted)]">
                Nobody matches that. Admin accounts are not listed — an Admin changes their own
                password above.
              </p>
            ) : (
              matches.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    setPicked(u);
                    setQuery(u.full_name);
                  }}
                  className="flex w-full items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 text-left last:border-0 hover:bg-[var(--surface-2)]"
                >
                  <span className="text-sm font-medium">{u.full_name}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {ROLE_LABELS[u.role]}
                    {u.code ? ` · ${u.code}` : ""}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        <button
          type="button"
          className="btn-danger w-full"
          disabled={!picked}
          onClick={() => picked && setOpen(picked)}
        >
          {picked ? `Reset ${picked.full_name}'s Password` : "Pick someone first"}
        </button>

        <p className="text-xs text-[var(--muted)]">
          A new password is generated and shown once. They are signed out everywhere and must set
          their own at the next sign-in. You will be asked for your own password to authorise it.
        </p>
      </div>

      {open && <ResetPasswordModal row={open} onClose={() => setOpen(null)} />}
    </>
  );
}
