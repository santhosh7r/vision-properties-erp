"use client";

import { useState } from "react";
import DataTable, { type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { COUPON_TYPES, isValueCoupon } from "@/lib/options";
import { inr } from "@/lib/format";
import { issueCoupon, redeemCoupon } from "./actions";

export interface CouponRow {
  id: string;
  name: string;
  code: string | null;
  role: Role;
  balances: Record<string, number>; // type -> quantity
}

const ROLE_TONE: Record<string, "blue" | "green" | "gray"> = {
  senior_director: "blue",
  director: "blue",
  business_manager: "green",
  business_partner: "gray",
};

export default function CouponsTable({ rows }: { rows: CouponRow[] }) {
  const [issuing, setIssuing] = useState<CouponRow | null>(null);
  const [redeeming, setRedeeming] = useState<CouponRow | null>(null);

  const columns: Column<CouponRow>[] = [
    {
      id: "name",
      header: "Sales Person",
      sort: (r) => r.name.toLowerCase(),
      cell: (r) => (
        <div>
          <div className="font-medium text-[var(--text)]">{r.name}</div>
          {r.code && <div className="font-mono text-xs text-[var(--muted)]">{r.code}</div>}
        </div>
      ),
    },
    { id: "role", header: "Role", sort: (r) => r.role, cell: (r) => <Badge tone={ROLE_TONE[r.role] ?? "gray"}>{ROLE_LABELS[r.role]}</Badge> },
    ...COUPON_TYPES.map((t) => ({
      id: t.value,
      header: t.label,
      align: "right" as const,
      sort: (r: CouponRow) => r.balances[t.value] ?? 0,
      cell: (r: CouponRow) => <span className="tabular-nums">{isValueCoupon(t.value) ? inr(r.balances[t.value] ?? 0) : (r.balances[t.value] ?? 0)}</span>,
    })),
    {
      id: "action",
      header: "",
      align: "right" as const,
      cell: (r: CouponRow) => (
        <div className="flex items-center justify-end gap-1">
          <button type="button" onClick={() => setIssuing(r)} className="btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}>
            Issue
          </button>
          <button type="button" onClick={() => setRedeeming(r)} className="btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}>
            Redeem
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        search={(r) => `${r.name} ${r.code ?? ""} ${ROLE_LABELS[r.role]}`}
        searchPlaceholder="Search sales person, ID…"
        filters={[
          {
            id: "role",
            label: "Role",
            options: (["senior_director", "director", "business_manager", "business_partner"] as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] })),
            match: (r, v) => r.role === v,
          },
        ]}
        emptyMessage="No sales people yet."
      />
      {issuing && <IssueModal row={issuing} onClose={() => setIssuing(null)} />}
      {redeeming && <RedeemModal row={redeeming} onClose={() => setRedeeming(null)} />}
    </>
  );
}

function IssueModal({ row, onClose }: { row: CouponRow; onClose: () => void }) {
  const [type, setType] = useState(COUPON_TYPES[0]?.value ?? "cab");
  const valueBased = isValueCoupon(type);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold">Issue Coupon</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {row.name} {row.code ? `· ${row.code}` : ""} · {ROLE_LABELS[row.role]}
        </p>

        <form action={issueCoupon} className="mt-4 space-y-4" onSubmit={() => setTimeout(onClose, 0)}>
          <input type="hidden" name="user_id" value={row.id} />
          <div>
            <label className="label">Coupon Type</label>
            <select name="type" className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {COUPON_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          {valueBased ? (
            <div>
              <input type="hidden" name="quantity" value={0} />
              <label className="label">Value (₹)</label>
              <input name="value" type="number" min={0} step="0.01" className="input" defaultValue={0} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Quantity</label>
                <input name="quantity" type="number" min={0} className="input" defaultValue={1} />
              </div>
              <div>
                <label className="label">Value (₹, optional)</label>
                <input name="value" type="number" min={0} step="0.01" className="input" defaultValue={0} />
              </div>
            </div>
          )}
          <div>
            <label className="label">Note (optional)</label>
            <input name="note" className="input" placeholder="e.g. Performance reward" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <SubmitButton pendingLabel="Issuing…">Issue</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}

// Redeem (spend) tokens already held — admin only. The quantity is capped at the
// salesperson's current balance for the chosen type (also enforced server-side).
function RedeemModal({ row, onClose }: { row: CouponRow; onClose: () => void }) {
  const [type, setType] = useState(COUPON_TYPES[0]?.value ?? "cab");
  const available = row.balances[type] ?? 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold">Redeem Token</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {row.name} {row.code ? `· ${row.code}` : ""} · {ROLE_LABELS[row.role]}
        </p>

        <form action={redeemCoupon} className="mt-4 space-y-4" onSubmit={() => setTimeout(onClose, 0)}>
          <input type="hidden" name="user_id" value={row.id} />
          <div>
            <label className="label">Token Type</label>
            <select name="type" className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {COUPON_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label} (holds {row.balances[t.value] ?? 0})</option>
              ))}
            </select>
          </div>
          {isValueCoupon(type) ? (
            <div>
              <label className="label">Amount to redeem (₹)</label>
              <input name="amount" type="number" min={1} max={available} step="0.01" className="input" defaultValue={available > 0 ? 1 : 0} />
              <p className="mt-1 text-xs text-[var(--muted)]">Available: {inr(available)}</p>
            </div>
          ) : (
            <div>
              <label className="label">Quantity to redeem</label>
              <input name="quantity" type="number" min={1} max={available} className="input" defaultValue={1} />
              <p className="mt-1 text-xs text-[var(--muted)]">Available: {available}</p>
            </div>
          )}
          <div>
            <label className="label">Note (optional)</label>
            <input name="note" className="input" placeholder="e.g. Redeemed for cab ride" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <SubmitButton pendingLabel="Redeeming…" disabled={available <= 0}>Redeem</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
