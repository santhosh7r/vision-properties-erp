"use client";

import { useState } from "react";
import DataTable, { type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui";
import { ROLE_LABELS, ROLES, hasFullAccess, type Role } from "@/lib/roles";
import { SubmitButton } from "@/components/SubmitButton";
import type { ManagerOption } from "./AddUserForm";
import { ResetPasswordModal } from "./ResetPassword";
import { toggleUserActive, updateUserPlacement } from "./actions";

export interface UserRow {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  code: string | null;
  manager: string;
  manager_id: string | null;
  is_active: boolean;
}

// Which row actions the table exposes, driven by the Partners nav intent:
//   manage    — both (default)
//   view      — none (read-only list)
//   block     — Block / Unblock only
//   placement — Change Team / Level only
export type UsersTableMode = "manage" | "view" | "block" | "placement";

export default function UsersTable({
  rows,
  managers,
  mode = "manage",
  canResetPassword = false,
}: {
  rows: UserRow[];
  managers: ManagerOption[];
  mode?: UsersTableMode;
  /**
   * Show the Reset Password action. Driven by the `reset_password` capability,
   * which only the company Admin holds — a General Manager reaches this same
   * page (they have `manage_users`) and must NOT see the button. The server
   * action re-checks the capability, so this is presentation only.
   */
  canResetPassword?: boolean;
}) {
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const showPlacement = mode === "manage" || mode === "placement";
  const showBlock = mode === "manage" || mode === "block";
  const showReset = canResetPassword && (mode === "manage" || mode === "block");

  const columns: Column<UserRow>[] = [
    { id: "name", header: "Name", sort: (r) => r.full_name.toLowerCase(), cell: (r) => (
      <div><div className="font-medium text-[var(--text)]">{r.full_name}</div><div className="text-xs text-[var(--muted)]">{r.email}</div></div>
    ) },
    { id: "code", header: "ID", sort: (r) => r.code ?? "", cell: (r) => r.code ? <span className="font-mono text-xs text-[var(--muted)]">{r.code}</span> : <span className="text-[var(--muted)]">—</span> },
    { id: "role", header: "Role", sort: (r) => r.role, cell: (r) => <Badge tone={hasFullAccess(r.role) ? "purple" : "blue"}>{ROLE_LABELS[r.role]}</Badge> },
    { id: "manager", header: "Reports To", hideBelow: "md", cell: (r) => <span className="text-[var(--muted)]">{r.manager || "—"}</span> },
    { id: "status", header: "Status", sort: (r) => String(r.is_active), cell: (r) => <Badge tone={r.is_active ? "green" : "gray"}>{r.is_active ? "Active" : "Inactive"}</Badge> },
    ...(mode === "view"
      ? []
      : [{
          id: "action",
          header: "",
          align: "right" as const,
          cell: (r: UserRow) => (
            <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
              {showPlacement && (
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className="btn-ghost"
                  style={{ padding: "5px 12px", fontSize: 12 }}
                >
                  Change Team
                </button>
              )}
              {showReset && (
                <button
                  type="button"
                  onClick={() => setResetting(r)}
                  className="btn-ghost"
                  style={{ padding: "5px 12px", fontSize: 12 }}
                >
                  Reset Password
                </button>
              )}
              {showBlock && (
                <form action={toggleUserActive}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="next" value={String(!r.is_active)} />
                  <SubmitButton className="btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }} pendingLabel="…">
                    {r.is_active ? "Block" : "Unblock"}
                  </SubmitButton>
                </form>
              )}
            </div>
          ),
        }]),
  ];

  const roleOptions = (Object.keys(ROLE_LABELS) as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }));

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        search={(r) => `${r.full_name} ${r.email} ${r.code ?? ""} ${ROLE_LABELS[r.role]}`}
        searchPlaceholder="Search name, email, ID…"
        filters={[
          { id: "role", label: "Role", options: roleOptions, match: (r, v) => r.role === v },
          { id: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }], match: (r, v) => (v === "active" ? r.is_active : !r.is_active) },
        ]}
        emptyMessage="No users found."
      />

      {editing && <ChangeTeamModal row={editing} managers={managers} onClose={() => setEditing(null)} />}
      {resetting && <ResetPasswordModal row={resetting} onClose={() => setResetting(null)} />}
    </>
  );
}

// Change Team / Level — reassign a user's role and the manager they report to.
function ChangeTeamModal({
  row,
  managers,
  onClose,
}: {
  row: UserRow;
  managers: ManagerOption[];
  onClose: () => void;
}) {
  // Anyone may be a parent except the user themselves.
  const parents = managers.filter((m) => m.id !== row.id);
  const assignableRoles = ROLES.filter((r) => r !== "admin");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold">Change Team / Level</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {row.full_name} {row.code ? `· ${row.code}` : ""}
        </p>
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--muted)]">
          <b className="text-[var(--text-2)]">Their whole team moves with them.</b> Reassigning this
          person to a new manager carries everyone beneath them too — e.g. move a Director under a
          different Senior Director and that Director&apos;s entire downline moves along.
        </div>

        <form action={updateUserPlacement} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={row.id} />
          <div>
            <label className="label">Promote / Change Level (Role)</label>
            <select name="role" className="select" defaultValue={row.role}>
              {assignableRoles.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Reports To</label>
            <select name="manager_id" className="select" defaultValue={row.manager_id ?? ""}>
              <option value="">Company (Admin)</option>
              {parents.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} · {ROLE_LABELS[m.role]}{m.code ? ` · ${m.code}` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Must be a role that can manage the chosen level, or the company itself. Invalid choices are rejected.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
