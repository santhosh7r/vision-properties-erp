"use client";

import DataTable, { type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { toggleUserActive } from "./actions";

export interface UserRow {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  code: string | null;
  manager: string;
  is_active: boolean;
}

export default function UsersTable({ rows }: { rows: UserRow[] }) {
  const columns: Column<UserRow>[] = [
    { id: "name", header: "Name", sort: (r) => r.full_name.toLowerCase(), cell: (r) => (
      <div><div className="font-medium text-[var(--text)]">{r.full_name}</div><div className="text-xs text-[var(--muted)]">{r.email}</div></div>
    ) },
    { id: "code", header: "ID", sort: (r) => r.code ?? "", cell: (r) => r.code ? <span className="font-mono text-xs text-[var(--muted)]">{r.code}</span> : <span className="text-[var(--muted)]">—</span> },
    { id: "role", header: "Role", sort: (r) => r.role, cell: (r) => <Badge tone={r.role === "admin" ? "purple" : "blue"}>{ROLE_LABELS[r.role]}</Badge> },
    { id: "manager", header: "Reports To", hideBelow: "md", cell: (r) => <span className="text-[var(--muted)]">{r.manager || "—"}</span> },
    { id: "status", header: "Status", sort: (r) => String(r.is_active), cell: (r) => <Badge tone={r.is_active ? "green" : "gray"}>{r.is_active ? "Active" : "Inactive"}</Badge> },
    { id: "action", header: "", align: "right", cell: (r) => (
      <form action={toggleUserActive} onClick={(e) => e.stopPropagation()}>
        <input type="hidden" name="id" value={r.id} />
        <input type="hidden" name="next" value={String(!r.is_active)} />
        <button className="btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }} type="submit">
          {r.is_active ? "Deactivate" : "Activate"}
        </button>
      </form>
    ) },
  ];

  const roleOptions = (Object.keys(ROLE_LABELS) as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }));

  return (
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
  );
}
