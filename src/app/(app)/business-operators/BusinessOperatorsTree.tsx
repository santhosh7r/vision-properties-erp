"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import {
  ROLE_LABELS,
  SALES_HIERARCHY,
  creatableRolesUnder,
  type Role,
} from "@/lib/roles";
import { createTeamMember, toggleMemberActive, type CreateMemberState } from "./actions";

export interface TreeUser {
  id: string;
  name: string;
  email: string;
  mobile: string | null;
  role: Role;
  code: string | null;
  managerId: string | null;
  active: boolean;
}

const ROLE_TONE: Record<string, "purple" | "blue" | "green" | "gray" | "amber"> = {
  admin: "purple",
  senior_director: "blue",
  director: "blue",
  business_manager: "green",
  business_partner: "gray",
  finance: "amber",
  legal: "amber",
};

const AVATAR_CLASS: Record<string, string> = {
  admin: "bg-purple-500/15 text-purple-300",
  senior_director: "bg-blue-500/15 text-blue-300",
  director: "bg-blue-500/15 text-blue-300",
  business_manager: "bg-emerald-500/15 text-emerald-300",
  business_partner: "bg-slate-500/15 text-slate-300",
};

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

function roleRank(r: Role): number {
  if (r === "admin") return -1;
  const i = SALES_HIERARCHY.indexOf(r);
  return i === -1 ? 99 : i;
}

// How many direct children to render per branch before a "Show more" button.
// Keeps the DOM bounded even when one manager has thousands of reports.
const CHILD_PAGE = 30;

export default function BusinessOperatorsTree({ nodes, selfId }: { nodes: TreeUser[]; selfId?: string }) {
  // ---- Derived structures (built once per data change) --------------------
  const { byId, childrenOf, roots, subtreeCount } = useMemo(() => {
    const byId = new Map<string, TreeUser>(nodes.map((n) => [n.id, n]));
    const childrenOf = new Map<string, TreeUser[]>();
    const roots: TreeUser[] = [];

    for (const n of nodes) {
      const parent = n.managerId && byId.has(n.managerId) ? n.managerId : null;
      if (parent) {
        const arr = childrenOf.get(parent) ?? [];
        arr.push(n);
        childrenOf.set(parent, arr);
      } else {
        roots.push(n);
      }
    }

    const sortFn = (a: TreeUser, b: TreeUser) =>
      roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name);
    roots.sort(sortFn);
    for (const arr of childrenOf.values()) arr.sort(sortFn);

    const subtreeCount = new Map<string, number>();
    const count = (id: string): number => {
      if (subtreeCount.has(id)) return subtreeCount.get(id)!;
      const kids = childrenOf.get(id) ?? [];
      let total = kids.length;
      for (const k of kids) total += count(k.id);
      subtreeCount.set(id, total);
      return total;
    };
    for (const n of nodes) count(n.id);

    return { byId, childrenOf, roots, subtreeCount };
  }, [nodes]);

  // ---- Expansion state: only the roots open by default --------------------
  // At scale (thousands of members) we keep the first paint tiny — the user
  // drills into the branches they care about. Collapsed branches are never in
  // the DOM, and open branches are windowed (see CHILD_PAGE), so the tree stays
  // responsive no matter how large or wide the org is.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(roots.map((r) => r.id)));

  const expandableIds = useMemo(
    () => nodes.filter((n) => (childrenOf.get(n.id)?.length ?? 0) > 0).map((n) => n.id),
    [nodes, childrenOf],
  );

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ---- Search: show matches + their ancestors, force those open -----------
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;

  const visibleIds = useMemo(() => {
    if (!searching) return null;
    const q = query.trim().toLowerCase();
    const matches = nodes.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.email.toLowerCase().includes(q) ||
        (n.mobile ?? "").toLowerCase().includes(q) ||
        (n.code ?? "").toLowerCase().includes(q) ||
        ROLE_LABELS[n.role].toLowerCase().includes(q),
    );
    const vis = new Set<string>();
    for (const m of matches) {
      let cur: TreeUser | undefined = m;
      while (cur) {
        vis.add(cur.id);
        cur = cur.managerId ? byId.get(cur.managerId) : undefined;
      }
    }
    return vis;
  }, [searching, query, nodes, byId]);

  // ---- Add-member modal ---------------------------------------------------
  const [addParent, setAddParent] = useState<TreeUser | null>(null);

  const visibleRoots = searching ? roots.filter((r) => visibleIds!.has(r.id)) : roots;
  const totalShown = searching ? visibleIds!.size : nodes.length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1" style={{ maxWidth: 380 }}>
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, mobile, role…"
            className="input"
            style={{ paddingLeft: 36 }}
          />
        </div>
        <button type="button" className="btn-ghost" onClick={() => setExpanded(new Set(expandableIds))}>
          Expand all
        </button>
        <button type="button" className="btn-ghost" onClick={() => setExpanded(new Set())}>
          Collapse all
        </button>
        <span className="ml-auto text-xs text-[var(--muted)]">
          {searching ? `${totalShown} matching` : `${nodes.length} members`}
        </span>
      </div>

      {/* Tree */}
      <div className="card" style={{ padding: "10px 12px" }}>
        {visibleRoots.length === 0 ? (
          <p className="px-2 py-12 text-center text-sm text-[var(--muted)]">
            {searching ? "No members match your search." : "No sales members yet."}
          </p>
        ) : (
          <div>
            {visibleRoots.map((r) => (
              <TreeNode
                key={r.id}
                node={r}
                depth={0}
                childrenOf={childrenOf}
                subtreeCount={subtreeCount}
                expanded={expanded}
                searching={searching}
                visibleIds={visibleIds}
                selfId={selfId}
                onToggle={toggle}
                onAdd={setAddParent}
              />
            ))}
          </div>
        )}
      </div>

      {addParent && (
        <AddMemberModal parent={addParent} onClose={() => setAddParent(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One node + (when open) its children. Children of collapsed nodes are never
// rendered, keeping the DOM small no matter how large the org is.
// ---------------------------------------------------------------------------
function TreeNode({
  node,
  depth,
  childrenOf,
  subtreeCount,
  expanded,
  searching,
  visibleIds,
  selfId,
  onToggle,
  onAdd,
}: {
  node: TreeUser;
  depth: number;
  childrenOf: Map<string, TreeUser[]>;
  subtreeCount: Map<string, number>;
  expanded: Set<string>;
  searching: boolean;
  visibleIds: Set<string> | null;
  selfId?: string;
  onToggle: (id: string) => void;
  onAdd: (n: TreeUser) => void;
}) {
  const kids = childrenOf.get(node.id) ?? [];
  const visibleKids = searching && visibleIds ? kids.filter((k) => visibleIds.has(k.id)) : kids;
  const hasKids = kids.length > 0;

  // Render children in pages so a manager with thousands of reports never floods
  // the DOM. Search shows every match (matches are few and need their ancestors).
  const [limit, setLimit] = useState(CHILD_PAGE);
  const shownKids = searching ? visibleKids : visibleKids.slice(0, limit);
  const remaining = visibleKids.length - shownKids.length;
  const isOpen = searching ? true : expanded.has(node.id);
  const direct = kids.length;
  const total = subtreeCount.get(node.id) ?? 0;
  const isSelf = selfId === node.id;
  const canAdd = node.active && creatableRolesUnder(node.role).length > 0;

  return (
    <div className="relative">
      {/* Elbow connector tying this node back to its manager's vertical rail. */}
      {depth > 0 && (
        <span
          aria-hidden
          className="absolute"
          style={{ left: -12, top: 23, width: 13, height: 2, borderRadius: 2, background: "var(--border-strong)" }}
        />
      )}
      <div
        className="group flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-[var(--surface-2)]"
        style={{ opacity: node.active ? 1 : 0.55 }}
      >
        {/* Chevron / spacer */}
        {hasKids ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-label={isOpen ? "Collapse" : "Expand"}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
            disabled={searching}
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }}
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        ) : (
          <span className="grid h-6 w-6 shrink-0 place-items-center text-[var(--border-strong)]">
            <span className="h-1 w-1 rounded-full bg-current" />
          </span>
        )}

        {/* Avatar */}
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${
            AVATAR_CLASS[node.role] ?? "bg-slate-500/15 text-slate-300"
          }`}
        >
          {initials(node.name)}
        </div>

        {/* Identity */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {node.code && (
              <span className="shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[11px] text-[var(--muted)]">
                {node.code}
              </span>
            )}
            <span className="truncate text-sm font-medium text-[var(--text)]">{node.name}</span>
            {isSelf && <Badge tone="green">You</Badge>}
            <Badge tone={ROLE_TONE[node.role] ?? "gray"}>{ROLE_LABELS[node.role]}</Badge>
            {!node.active && <Badge tone="gray">Inactive</Badge>}
          </div>
          <div className="truncate text-xs text-[var(--muted)]">
            {node.email}
            {node.mobile ? ` · ${node.mobile}` : ""}
          </div>
        </div>

        {/* Counts */}
        {hasKids && (
          <span className="hidden shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-[var(--muted)] sm:inline-block">
            {direct} direct{total > direct ? ` · ${total} total` : ""}
          </span>
        )}

        {/* Actions (reveal on hover/focus) */}
        <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {canAdd && (
            <button
              type="button"
              onClick={() => onAdd(node)}
              className="btn-ghost"
              style={{ padding: "4px 10px", fontSize: 12 }}
            >
              + Add
            </button>
          )}
          {!isSelf && (
            <form action={toggleMemberActive}>
              <input type="hidden" name="id" value={node.id} />
              <input type="hidden" name="next" value={String(!node.active)} />
              <SubmitButton className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} pendingLabel="…">
                {node.active ? "Deactivate" : "Activate"}
              </SubmitButton>
            </form>
          )}
        </div>
      </div>

      {/* Children */}
      {hasKids && isOpen && visibleKids.length > 0 && (
        <div
          className="ml-[18px] border-l pl-3"
          style={{ borderColor: "var(--border-strong)" }}
        >
          {shownKids.map((k) => (
            <TreeNode
              key={k.id}
              node={k}
              depth={depth + 1}
              childrenOf={childrenOf}
              subtreeCount={subtreeCount}
              expanded={expanded}
              searching={searching}
              visibleIds={visibleIds}
              selfId={selfId}
              onToggle={onToggle}
              onAdd={onAdd}
            />
          ))}

          {/* Pager — only when a branch has more direct reports than one page. */}
          {remaining > 0 && (
            <div className="flex items-center gap-2 py-1.5 pl-8 text-xs">
              <button
                type="button"
                onClick={() => setLimit((l) => l + CHILD_PAGE)}
                className="rounded-md border px-2 py-1 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              >
                Show {Math.min(CHILD_PAGE, remaining)} more
              </button>
              <button
                type="button"
                onClick={() => setLimit(visibleKids.length)}
                className="text-[var(--muted)] hover:text-[var(--text)]"
              >
                Show all {visibleKids.length}
              </button>
              <span className="text-[var(--border-strong)]">·</span>
              <span className="text-[var(--muted)]">{remaining} hidden</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-member modal — role choices are constrained to the levels below `parent`.
// ---------------------------------------------------------------------------
function AddMemberModal({ parent, onClose }: { parent: TreeUser; onClose: () => void }) {
  const [state, formAction] = useActionState<CreateMemberState | undefined, FormData>(
    createTeamMember,
    undefined,
  );
  const allowed = creatableRolesUnder(parent.role);

  // Close once the server confirms the member was created.
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  // Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Add member</h2>
          <button type="button" onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)]" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="mb-4 text-xs text-[var(--muted)]">
          Reporting to <span className="text-[var(--text)]">{parent.name}</span> ·{" "}
          {ROLE_LABELS[parent.role]}
        </p>

        <form action={formAction} className="space-y-3">
          <input type="hidden" name="manager_id" value={parent.id} />

          <div>
            <label className="label">Role *</label>
            <select name="role" className="select" required defaultValue="">
              <option value="" disabled>
                Select role
              </option>
              {allowed.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
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

          {state?.error && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {state.error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <SubmitButton pendingLabel="Creating…">Create Member</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
