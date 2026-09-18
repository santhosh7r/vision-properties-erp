"use client";

import { useState } from "react";
import DataTable, { type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { fmtDateTime } from "@/lib/format";
import { ResetPasswordModal, type ResetTarget } from "../users/ResetPassword";

export interface ResetLogRow {
  /** audit_log row id — the list key. */
  id: string;
  /** The account that was reset. Null if the user row was since deleted. */
  userId: string | null;
  name: string;
  role: Role | null;
  code: string | null;
  resetAt: string;
  resetBy: string;
  /**
   * The temporary password has NOT been used yet — the account is still flagged
   * must_change_password, so nobody has signed in and set their own since.
   * This is the one thing the Admin actually needs from this screen: who is
   * still waiting to be told their password.
   */
  pending: boolean;
}

// ---------------------------------------------------------------------------
// Password Resets — the history of every admin-driven reset.
//
// WHAT THIS DOES NOT DO: it does not list the passwords themselves. They are
// not stored anywhere to list — only their bcrypt hash is kept, which cannot be
// turned back into the password. That is the entire reason a database leak does
// not hand over everyone's account, and keeping a readable copy beside the
// hashes would throw it away for a convenience this screen provides another way:
// if a password was lost before it reached the partner, press Reset again and a
// fresh one is generated on the spot. Nothing is recoverable, everything is
// re-issuable.
//
// So the useful question here is not "what was the password" but "who is still
// waiting for one" — which is what the Pending badge answers.
// ---------------------------------------------------------------------------
export default function PasswordResets({ rows }: { rows: ResetLogRow[] }) {
  const [resetting, setResetting] = useState<ResetTarget | null>(null);
  const pendingCount = rows.filter((r) => r.pending).length;

  const columns: Column<ResetLogRow>[] = [
    {
      id: "name",
      header: "Account",
      sort: (r) => r.name.toLowerCase(),
      cell: (r) => (
        <div>
          <div className="font-medium text-[var(--text)]">{r.name}</div>
          <div className="text-xs text-[var(--muted)]">
            {r.role ? ROLE_LABELS[r.role] : "—"}
            {r.code ? ` · ${r.code}` : ""}
          </div>
        </div>
      ),
    },
    {
      id: "when",
      header: "Reset At",
      sort: (r) => r.resetAt,
      cell: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.resetAt)}</span>,
    },
    { id: "by", header: "Reset By", hideBelow: "md", cell: (r) => r.resetBy },
    {
      id: "status",
      header: "Status",
      sort: (r) => String(r.pending),
      cell: (r) =>
        r.pending ? (
          <Badge tone="amber">Temporary password unused</Badge>
        ) : (
          <Badge tone="green">They&apos;ve set their own</Badge>
        ),
    },
    {
      id: "action",
      header: "",
      align: "right" as const,
      cell: (r) =>
        r.userId && r.role ? (
          <button
            type="button"
            onClick={() =>
              setResetting({ id: r.userId!, full_name: r.name, role: r.role!, code: r.code })
            }
            className="btn-ghost"
            style={{ padding: "5px 12px", fontSize: 12 }}
          >
            Reset again
          </button>
        ) : (
          <span className="text-xs text-[var(--muted)]">—</span>
        ),
    },
  ];

  return (
    <>
      <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-xs text-[var(--muted)]">
        <b className="text-[var(--text-2)]">Passwords are not listed here, and cannot be.</b> Only a
        one-way hash of each password is stored, which is what stops a database leak from handing
        over every account — so there is no readable copy for this page to show, by design. If a
        temporary password never reached someone, press <b>Reset again</b> and hand over the fresh
        one; it takes a moment and is safer than keeping the old one on file.
        {pendingCount > 0 && (
          <>
            {" "}
            <span className="text-amber-500">
              {pendingCount} {pendingCount === 1 ? "person has" : "people have"} not used their
              temporary password yet.
            </span>
          </>
        )}
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        search={(r) => `${r.name} ${r.code ?? ""} ${r.resetBy} ${r.role ? ROLE_LABELS[r.role] : ""}`}
        searchPlaceholder="Search name, partner ID, who reset it…"
        filters={[
          {
            id: "status",
            label: "Status",
            options: [
              { value: "pending", label: "Temporary password unused" },
              { value: "done", label: "They've set their own" },
            ],
            match: (r, v) => (v === "pending" ? r.pending : !r.pending),
          },
        ]}
        emptyMessage="No password has been reset yet."
      />

      {resetting && <ResetPasswordModal row={resetting} onClose={() => setResetting(null)} />}
    </>
  );
}
