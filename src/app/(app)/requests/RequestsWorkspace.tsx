"use client";

import { useMemo, useState } from "react";
import { Badge, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { fmtDate, timeAgo } from "@/lib/format";
import type { Role } from "@/lib/roles";
import {
  REQUEST_TYPES,
  REQUEST_CHAIN,
  STAGE_LABEL,
  requestTypeMeta,
  canActOnStage,
  actionLabel,
  type ServiceRequestType,
  type ServiceRequestStatus,
  type RequestStage,
} from "@/lib/requests";
import {
  createServiceRequest,
  advanceServiceRequest,
  declineServiceRequest,
} from "./actions";

export interface RequestRow {
  id: string;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  stage: RequestStage;
  customer: string | null;
  mobile: string | null;
  booking: string | null;
  requestedBy: string;
  subject: string | null;
  details: string | null;
  response: string | null;
  visit_date: string | null;
  pickup: string | null;
  decline_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface MiniBooking {
  id: string;
  label: string;
}
interface MiniCustomer {
  id: string;
  name: string;
  mobile: string;
}

const STATUS_TONE: Record<ServiceRequestStatus, "amber" | "green" | "red"> = {
  pending: "amber",
  approved: "green",
  declined: "red",
};

const MAX_CLIENT_RESULTS = 50;

export default function RequestsWorkspace({
  rows,
  customers,
  bookings,
  userRole,
  canCreate,
  migrationMissing,
}: {
  rows: RequestRow[];
  customers: MiniCustomer[];
  bookings: MiniBooking[];
  userRole: Role;
  canCreate: boolean;
  migrationMissing: boolean;
}) {
  const [filter, setFilter] = useState<ServiceRequestType | "all">("all");
  const [formType, setFormType] = useState<ServiceRequestType | null>(null);
  const [declineId, setDeclineId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const t of REQUEST_TYPES) c[t.key] = rows.filter((r) => r.type === t.key).length;
    return c;
  }, [rows]);

  const visible = filter === "all" ? rows : rows.filter((r) => r.type === filter);

  if (migrationMissing) {
    return (
      <EmptyState
        message="Requests aren't available yet."
        hint="Apply migration 0009_service_requests.sql to your database, then refresh."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Type filter + new request */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip label={`All (${counts.all})`} active={filter === "all"} onClick={() => setFilter("all")} />
        {REQUEST_TYPES.map((t) => (
          <FilterChip
            key={t.key}
            label={`${t.label} (${counts[t.key] ?? 0})`}
            active={filter === t.key}
            onClick={() => setFilter(t.key)}
          />
        ))}
        {canCreate && (
          <div className="ml-auto">
            <select
              value={formType ?? ""}
              onChange={(e) => setFormType((e.target.value || null) as ServiceRequestType | null)}
              className="input"
              style={{ minWidth: 190 }}
            >
              <option value="">+ New request…</option>
              {REQUEST_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  New {t.label} Request
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Create form */}
      {canCreate && formType && (
        <CreateForm
          type={formType}
          customers={customers}
          bookings={bookings}
          onClose={() => setFormType(null)}
        />
      )}

      {/* List */}
      {visible.length === 0 ? (
        <EmptyState
          message="No requests here yet."
          hint={canCreate ? "Pick a type from the “New request” menu to raise one." : undefined}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <RequestCard
              key={r.id}
              row={r}
              userRole={userRole}
              declineOpen={declineId === r.id}
              onToggleDecline={() => setDeclineId((id) => (id === r.id ? null : r.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
      style={{
        borderColor: active ? "var(--accent)" : "var(--border)",
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--muted)",
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Create form — fields shown depend on the request type.
// ---------------------------------------------------------------------------
function CreateForm({
  type,
  customers,
  bookings,
  onClose,
}: {
  type: ServiceRequestType;
  customers: MiniCustomer[];
  bookings: MiniBooking[];
  onClose: () => void;
}) {
  const meta = requestTypeMeta(type);
  const [custQuery, setCustQuery] = useState("");

  const custMatches = useMemo(() => {
    const q = custQuery.trim().toLowerCase();
    const list = q
      ? customers.filter((c) => c.name.toLowerCase().includes(q) || c.mobile.includes(q))
      : customers;
    return list.slice(0, MAX_CLIENT_RESULTS);
  }, [custQuery, customers]);

  return (
    <form action={createServiceRequest} className="card space-y-4">
      <input type="hidden" name="type" value={type} />
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">New {meta.label} Request</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">{meta.description}</p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-[var(--muted)] hover:text-[var(--text)]">
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {meta.needsCustomer && (
          <div className="sm:col-span-2">
            <label className="label">Customer *</label>
            <input
              type="text"
              placeholder="Search your customers by name or mobile…"
              value={custQuery}
              onChange={(e) => setCustQuery(e.target.value)}
              className="input mb-2"
            />
            <select name="customer_id" required className="input">
              <option value="">Select customer…</option>
              {custMatches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.mobile}
                </option>
              ))}
            </select>
          </div>
        )}

        {meta.needsBooking && (
          <div className="sm:col-span-2">
            <label className="label">Booking *</label>
            <select name="booking_id" required className="input">
              <option value="">Select booking…</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {type === "site_visit" && (
          <>
            <div>
              <label className="label">Visit date *</label>
              <input type="date" name="visit_date" required className="input" />
            </div>
            <div>
              <label className="label">Pickup location</label>
              <input type="text" name="pickup" placeholder="Pickup point" className="input" />
            </div>
          </>
        )}

        {(type === "legal_query" || type === "draft") && (
          <div className="sm:col-span-2">
            <label className="label">Subject</label>
            <input type="text" name="subject" placeholder="Short subject" className="input" />
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="label">
            {type === "legal_query"
              ? "Query details *"
              : type === "cancellation"
              ? "Cancellation reason *"
              : "Notes"}
          </label>
          <textarea
            name="details"
            rows={3}
            required={type === "legal_query" || type === "cancellation"}
            placeholder={
              type === "legal_query"
                ? "Describe the legal query…"
                : type === "cancellation"
                ? "Why is this being cancelled?"
                : "Optional notes for the approver"
            }
            className="input"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <SubmitButton>Submit request</SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Request card — content + approval-chain progress + approver actions.
// ---------------------------------------------------------------------------
function RequestCard({
  row,
  userRole,
  declineOpen,
  onToggleDecline,
}: {
  row: RequestRow;
  userRole: Role;
  declineOpen: boolean;
  onToggleDecline: () => void;
}) {
  const meta = requestTypeMeta(row.type);
  const canAct = row.status === "pending" && canActOnStage(userRole, row.stage);
  const needsResponse = row.type === "legal_query" && row.stage === "legal";

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{meta.label}</span>
            <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
            {row.status === "pending" && (
              <span className="text-xs text-[var(--muted)]">with {STAGE_LABEL[row.stage]}</span>
            )}
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Raised by {row.requestedBy} · {timeAgo(row.created_at)}
          </p>
        </div>
        <ChainProgress type={row.type} stage={row.stage} status={row.status} />
      </div>

      {/* Details grid */}
      <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {row.subject && <Field label="Subject" value={row.subject} />}
        {row.customer && <Field label="Customer" value={`${row.customer}${row.mobile ? ` · ${row.mobile}` : ""}`} />}
        {row.booking && <Field label="Booking" value={row.booking} />}
        {row.visit_date && <Field label="Visit date" value={fmtDate(row.visit_date)} />}
        {row.pickup && <Field label="Pickup" value={row.pickup} />}
        {row.details && <Field label={row.type === "cancellation" ? "Reason" : "Notes"} value={row.details} span />}
        {row.response && <Field label="Legal response" value={row.response} span />}
        {row.decline_reason && <Field label="Decline reason" value={row.decline_reason} span />}
      </div>

      {/* Approver actions */}
      {canAct && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          {!declineOpen ? (
            <div className="flex flex-wrap items-center gap-2">
              <form action={advanceServiceRequest} className="flex flex-1 flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={row.id} />
                {needsResponse && (
                  <div className="flex-1" style={{ minWidth: 220 }}>
                    <label className="label">Response to requester *</label>
                    <textarea name="response" rows={2} required className="input" placeholder="Legal team's revert…" />
                  </div>
                )}
                <SubmitButton>{actionLabel(row.type, row.stage)}</SubmitButton>
              </form>
              <button type="button" onClick={onToggleDecline} className="btn-ghost text-[var(--brand-red)]">
                Decline
              </button>
            </div>
          ) : (
            <form action={declineServiceRequest} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={row.id} />
              <div className="flex-1" style={{ minWidth: 220 }}>
                <label className="label">Reason for declining</label>
                <input type="text" name="reason" className="input" placeholder="Optional reason" />
              </div>
              <SubmitButton>Confirm decline</SubmitButton>
              <button type="button" onClick={onToggleDecline} className="btn-ghost">
                Cancel
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={span ? "sm:col-span-2" : ""}>
      <span className="text-[var(--muted)]">{label}: </span>
      <span className="text-[var(--text-2)]">{value}</span>
    </div>
  );
}

// Stage pills showing where the request sits in its chain.
function ChainProgress({
  type,
  stage,
  status,
}: {
  type: ServiceRequestType;
  stage: RequestStage;
  status: ServiceRequestStatus;
}) {
  const chain = REQUEST_CHAIN[type];
  const currentIdx = chain.indexOf(stage);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chain.map((st, i) => {
        const declined = status === "declined";
        const done = !declined && (status === "approved" || (currentIdx >= 0 && i < currentIdx));
        const current = status === "pending" && i === currentIdx;
        const color = declined ? "var(--muted)" : done ? "#10b981" : current ? "var(--accent)" : "var(--muted)";
        return (
          <span
            key={st}
            className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
            style={{
              borderColor: current ? "var(--accent)" : "var(--border)",
              background: current ? "var(--accent-soft)" : done ? "#10b9811f" : "transparent",
              color,
            }}
          >
            {STAGE_LABEL[st]}
          </span>
        );
      })}
    </div>
  );
}
