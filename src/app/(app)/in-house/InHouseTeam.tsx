"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { DISTRICTS } from "@/lib/options";
import { fmtDate } from "@/lib/format";
import type { Role } from "@/lib/roles";
import { toggleUserActive, updateUserDistrict } from "../users/actions";

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  mobile: string | null;
  role: Role;
  roleLabel: string;
  district: string | null;
  /** True for Pre-Sales / Post-Sales — the desks confined to one district. */
  scoped: boolean;
  active: boolean;
  joined: string;
}

export interface Branch {
  district: string;
  projects: number;
  members: StaffRow[];
}

// Role → the colour it wears across the page, so a branch's two desks read as
// two different jobs at a glance.
const ROLE_TONE: Record<string, "blue" | "purple" | "green" | "amber" | "gray"> = {
  pre_sales: "blue",
  post_sales: "purple",
  legal: "amber",
  finance: "green",
  digital: "gray",
};

export default function InHouseTeam({
  branches,
  unassigned,
  companyWide,
}: {
  branches: Branch[];
  unassigned: StaffRow[];
  companyWide: StaffRow[];
}) {
  return (
    <div className="space-y-8">
      {branches.map((b) => (
        <section key={b.district}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2.5 text-sm font-semibold">
              <span className="h-4 w-1 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
              {b.district} Branch
            </h2>
            <span className="text-xs text-[var(--muted)]">
              {b.members.length} {b.members.length === 1 ? "desk" : "desks"} · {b.projects}{" "}
              {b.projects === 1 ? "project" : "projects"}
            </span>
          </div>

          {/* A desk sees only its own district's projects — with none there, it
              signs in to empty screens. Say so where it can be acted on. */}
          {b.members.length > 0 && b.projects === 0 && (
            <p
              className="mb-3 rounded-lg px-3 py-2 text-xs"
              style={{
                border: "1px solid color-mix(in srgb, var(--brand-red) 30%, transparent)",
                background: "var(--brand-red-soft)",
                color: "var(--brand-red)",
              }}
            >
              No projects in {b.district} yet — these desks will see an empty inventory, no deals and
              no payments until a {b.district} project exists.
            </p>
          )}

          {b.members.length === 0 ? (
            <div className="card text-sm text-[var(--muted)]">
              No desk covers {b.district} yet.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {b.members.map((m) => (
                <MemberCard key={m.id} m={m} />
              ))}
            </div>
          )}
        </section>
      ))}

      {unassigned.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2.5">
            <span className="h-4 w-1 shrink-0 rounded-full" style={{ background: "var(--brand-red)" }} />
            <h2 className="text-sm font-semibold">Needs a district</h2>
          </div>
          <p className="mb-3 text-xs text-[var(--muted)]">
            These desks are scoped to a district but none is set, so they can currently see nothing at
            all. Assign a branch to activate them.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {unassigned.map((m) => (
              <MemberCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}

      {companyWide.length > 0 && (
        <section>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2.5 text-sm font-semibold">
              <span className="h-4 w-1 shrink-0 rounded-full" style={{ background: "var(--muted)" }} />
              Company-wide
            </h2>
            <span className="text-xs text-[var(--muted)]">Not tied to a branch</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {companyWide.map((m) => (
              <MemberCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MemberCard({ m }: { m: StaffRow }) {
  const [moving, setMoving] = useState(false);
  const initials = m.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="card" style={{ opacity: m.active ? 1 : 0.6 }}>
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{m.name}</span>
            <Badge tone={ROLE_TONE[m.role] ?? "blue"}>{m.roleLabel}</Badge>
            {!m.active && <Badge tone="gray">Blocked</Badge>}
          </div>
          {/* The email IS the login for staff — partners sign in with a code. */}
          <p className="mt-1 truncate text-xs text-[var(--muted)]">{m.email}</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {m.mobile || "No mobile"} · added {fmtDate(m.joined)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {m.scoped &&
          (moving ? (
            <form action={updateUserDistrict} className="flex items-center gap-2">
              <input type="hidden" name="id" value={m.id} />
              <select name="district" className="select" defaultValue={m.district ?? ""} required>
                <option value="" disabled>
                  — Select branch —
                </option>
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <SubmitButton pendingLabel="Moving…">Save</SubmitButton>
              <button type="button" className="btn-ghost" onClick={() => setMoving(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <button type="button" className="btn-ghost" onClick={() => setMoving(true)}>
              {m.district ? "Change branch" : "Assign branch"}
            </button>
          ))}

        {!moving && (
          <form action={toggleUserActive}>
            <input type="hidden" name="id" value={m.id} />
            <input type="hidden" name="next" value={String(!m.active)} />
            <SubmitButton
              className={m.active ? "btn-ghost text-[var(--brand-red)]" : "btn-ghost"}
              pendingLabel={m.active ? "Blocking…" : "Restoring…"}
            >
              {m.active ? "Block" : "Re-activate"}
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
