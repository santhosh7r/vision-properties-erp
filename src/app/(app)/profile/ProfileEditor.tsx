"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { updateMyProfile } from "./actions";

export interface ProfileData {
  full_name: string;
  email: string;
  mobile: string;
  district: string;
  role: Role;
  code: string | null;
  managerName: string | null;
  teamCount: number;
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

// Profile details: read-only until "Edit" is clicked, then a save form.
export default function ProfileEditor({ data, districts }: { data: ProfileData; districts: string[] }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="card flex flex-1 flex-col">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn-ghost"
            style={{ padding: "5px 12px", fontSize: 12 }}
          >
            Edit
          </button>
        </div>

        {/* Centered avatar + name */}
        <div className="flex flex-col items-center text-center">
          <span
            className="flex h-24 w-24 items-center justify-center rounded-full text-3xl font-semibold"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            {initials(data.full_name)}
          </span>
          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight">{data.full_name}</h1>
          <div className="mt-2"><Badge tone="blue">{ROLE_LABELS[data.role]}</Badge></div>
        </div>

        <div className="mt-8 space-y-4 text-[15px]">
          <Row label="Email">{data.email}</Row>
          <Row label="Mobile">{data.mobile || "—"}</Row>
          <Row label="District">{data.district || "—"}</Row>
          {data.code && <Row label="Partner ID"><span className="font-mono">{data.code}</span></Row>}
          {data.managerName && <Row label="Reports To">{data.managerName}</Row>}
        </div>

        {/* Team summary — fills the bottom of the tall card */}
        <div className="mt-auto grid grid-cols-2 gap-3 pt-8">
          <Stat label="Team Members" value={data.teamCount} />
          <Stat label="Reports To" value={data.managerName ?? "—"} small />
        </div>
      </div>
    );
  }

  return (
    <div className="card flex-1">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Edit Profile</h2>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="btn-ghost"
          style={{ padding: "5px 12px", fontSize: 12 }}
        >
          Cancel
        </button>
      </div>
      <form action={updateMyProfile} className="space-y-3">
        <div>
          <label className="label">Full Name *</label>
          <input name="full_name" className="input" required defaultValue={data.full_name} />
        </div>
        <div>
          <label className="label">Email *</label>
          <input name="email" type="email" className="input" required defaultValue={data.email} />
        </div>
        <div>
          <label className="label">Mobile</label>
          <input name="mobile" className="input" defaultValue={data.mobile} />
        </div>
        <div>
          <label className="label">District</label>
          <select name="district" className="select" defaultValue={data.district}>
            <option value="">— Select district —</option>
            {districts.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--muted)]">Your inventory shows this district first.</p>
        </div>
        <SubmitButton className="btn-primary w-full" pendingLabel="Saving…">Save Profile</SubmitButton>
      </form>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-[var(--muted)]">{label}</span>
      <span className="text-right text-[15px] font-medium">{children}</span>
    </div>
  );
}

function Stat({ label, value, small = false }: { label: string; value: React.ReactNode; small?: boolean }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div
        className={`mt-1 font-semibold tabular-nums text-[var(--accent)] ${small ? "truncate text-base" : "text-3xl"}`}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </div>
    </div>
  );
}
