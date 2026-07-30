"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  raisableTypes,
  earliestVisitParts,
  visitLeadTimeOk,
  travelModeLabel,
  cabTypeLabel,
  needsCabType,
  requiresSubject,
  usesPoints,
  toPoints,
  POINT_BULLET,
  TRAVEL_MODES,
  CAB_TYPES,
  type ServiceRequestType,
  type ServiceRequestStatus,
  type RequestStage,
} from "@/lib/requests";
import {
  createServiceRequest,
  advanceServiceRequest,
  declineServiceRequest,
  saveDraftRequest,
  submitDraftRequest,
  deleteDraftRequest,
} from "./actions";

export interface RequestRow {
  id: string;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  stage: RequestStage;
  customer: string | null;
  mobile: string | null;
  booking: string | null;
  project: string | null;
  // Raw relation ids (used to pre-fill the form when editing a draft).
  customerId: string | null;
  projectId: string | null;
  bookingId: string | null;
  // Whether a draft has all required fields and can be submitted as-is.
  draftReady: boolean;
  requestedBy: string;
  subject: string | null;
  details: string | null;
  response: string | null;
  visit_date: string | null;
  pickup: string | null;
  // Site visit only — typed walk-in details + travel arrangement (0026).
  customer_name: string | null;
  customer_phone: string | null;
  visit_time: string | null;
  travel_mode: string | null;
  cab_type: string | null;
  decline_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface MiniBooking {
  id: string;
  label: string;
}
export interface MiniProject {
  id: string; // booking/blocking record id (unique row key)
  projectId: string; // project id — the value submitted with the form
  name: string; // project name
  customerId: string; // the customer this record belongs to (filters the picker)
  plot: string; // plot number on the record
  mode: string; // 'blocking' | 'booking'
}
interface MiniCustomer {
  id: string;
  name: string;
  mobile: string;
}
// Every active project — the Site Visit picker, which is not tied to a booking.
export interface SimpleProject {
  id: string;
  name: string;
  city: string | null;
}

const STATUS_TONE: Record<ServiceRequestStatus, "amber" | "green" | "red" | "gray"> = {
  pending: "amber",
  approved: "green",
  declined: "red",
  draft: "gray",
};

const MAX_CLIENT_RESULTS = 50;

// Per-type date field with a customised label — these types ask for a (required)
// date; types not listed here don't collect one. Reused for the card display.
const DATE_FIELD: Partial<Record<ServiceRequestType, string>> = {
  registration: "Registration date",
  cab: "Visit date",
};
// Types that also collect a pickup location.
const PICKUP_TYPES: ServiceRequestType[] = ["cab"];

export default function RequestsWorkspace({
  rows,
  customers,
  bookings,
  projects,
  allProjects,
  userRole,
  canCreate,
  migrationMissing,
}: {
  rows: RequestRow[];
  customers: MiniCustomer[];
  bookings: MiniBooking[];
  projects: MiniProject[];
  allProjects: SimpleProject[];
  userRole: Role;
  canCreate: boolean;
  migrationMissing: boolean;
}) {
  const [filter, setFilter] = useState<ServiceRequestType | "all">("all");
  const [formType, setFormType] = useState<ServiceRequestType | null>(null);
  const [editing, setEditing] = useState<RequestRow | null>(null);
  const [declineId, setDeclineId] = useState<string | null>(null);

  function closeForm() {
    setFormType(null);
    setEditing(null);
  }
  function openNew(type: ServiceRequestType | null) {
    setEditing(null);
    setFormType(type);
  }
  function openEdit(row: RequestRow) {
    setEditing(row);
    setFormType(row.type);
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const t of REQUEST_TYPES) c[t.key] = rows.filter((r) => r.type === t.key).length;
    return c;
  }, [rows]);

  const visible = filter === "all" ? rows : rows.filter((r) => r.type === filter);

  // Types THIS role may raise. Only Legal Query is raisable today, and only by
  // Senior Director / Director — the menu is hidden entirely when the list is
  // empty rather than offering a dropdown that leads nowhere.
  const canRaise = useMemo(() => raisableTypes(userRole), [userRole]);

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
        {canCreate && canRaise.length > 0 && (
          <div className="ml-auto">
            {canRaise.length === 1 ? (
              // A single raisable type needs no menu — one button says it plainly.
              <button
                type="button"
                className="btn-primary"
                onClick={() => openNew(canRaise[0].key)}
              >
                + New {canRaise[0].label} Request
              </button>
            ) : (
              <select
                value={editing ? "" : formType ?? ""}
                onChange={(e) => openNew((e.target.value || null) as ServiceRequestType | null)}
                className="input"
                style={{ minWidth: 190 }}
              >
                <option value="">+ New request…</option>
                {canRaise.map((t) => (
                  <option key={t.key} value={t.key}>
                    New {t.label} Request
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Create / edit form — opens in a popup so the list below stays put. */}
      {canCreate && formType && (
        <Modal onClose={closeForm}>
          <CreateForm
            key={editing?.id ?? `new-${formType}`}
            type={formType}
            customers={customers}
            bookings={bookings}
            projects={projects}
            allProjects={allProjects}
            editing={editing}
            onClose={closeForm}
          />
        </Modal>
      )}

      {/* List */}
      {visible.length === 0 ? (
        <EmptyState
          message="No requests here yet."
          hint={
            canCreate && canRaise.length > 0
              ? `Use “New ${canRaise[0].label} Request” to raise one.`
              : undefined
          }
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
              onEdit={() => openEdit(r)}
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
// Modal — a centered popup over a dimmed backdrop. Used so the create form opens
// on top of the page without pushing the requests list around. Closes on the
// backdrop click or Escape; the panel itself scrolls if it's tall.
// ---------------------------------------------------------------------------
function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={onClose}
    >
      <div className="my-4 w-full max-w-2xl" onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SearchableSelect — one field that is both a search box and a dropdown. Type to
// filter, click a result to pick it. Writes the chosen id to a hidden input so
// it posts with the form like a native <select>.
// ---------------------------------------------------------------------------
interface ComboOption {
  id: string; // value posted with the form
  label: string;
  hint?: string;
  key?: string; // unique React key when several options share an id
}
function SearchableSelect({
  name,
  options,
  placeholder,
  required,
  onChange,
  initialId,
}: {
  name: string;
  options: ComboOption[];
  placeholder: string;
  required?: boolean;
  onChange?: (id: string | null) => void;
  initialId?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // Pre-select from a restored draft (matched against the current options).
  const [selected, setSelected] = useState<ComboOption | null>(
    () => (initialId ? options.find((o) => o.id === initialId) ?? null : null),
  );
  const boxRef = useRef<HTMLDivElement>(null);

  // Close the dropdown when clicking outside the field.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? options.filter(
          (o) => o.label.toLowerCase().includes(q) || (o.hint ?? "").toLowerCase().includes(q),
        )
      : options;
    return list.slice(0, MAX_CLIENT_RESULTS);
  }, [query, options]);

  function pick(opt: ComboOption) {
    setSelected(opt);
    setQuery("");
    setOpen(false);
    onChange?.(opt.id);
  }

  return (
    <div className="relative" ref={boxRef}>
      <input type="hidden" name={name} value={selected?.id ?? ""} required={required} />
      <input
        type="text"
        className="input"
        placeholder={selected ? selected.label : placeholder}
        value={open ? query : selected ? selected.label : query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (selected) {
            setSelected(null);
            onChange?.(null);
          }
        }}
        autoComplete="off"
      />
      {open && (
        <div
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-[var(--surface)] py-1 shadow-lg"
          style={{ borderColor: "var(--border-strong)" }}
        >
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--muted)]">No matches.</div>
          ) : (
            matches.map((o) => (
              <button
                key={o.key ?? o.id}
                type="button"
                onClick={() => pick(o)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--accent-soft)] ${
                  selected?.id === o.id ? "text-[var(--accent)]" : "text-[var(--text)]"
                }`}
              >
                <span className="truncate">{o.label}</span>
                {o.hint && <span className="shrink-0 text-xs text-[var(--muted)]">{o.hint}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create form — fields shown depend on the request type.
// ---------------------------------------------------------------------------
function CreateForm({
  type,
  customers,
  bookings,
  projects,
  allProjects,
  editing,
  onClose,
}: {
  type: ServiceRequestType;
  customers: MiniCustomer[];
  bookings: MiniBooking[];
  projects: MiniProject[];
  allProjects: SimpleProject[];
  editing: RequestRow | null;
  onClose: () => void;
}) {
  const meta = requestTypeMeta(type);
  // A cab / site visit is arranged for a WALK-IN: no customer record, no
  // booking, so the name/phone are typed and the project picker lists every
  // active project.
  const isCab = type === "cab";
  // A legal query hangs off a booked plot: the booking identifies the customer
  // and project, so only Plot booked / Title / Query details are asked for.
  const isLegalQuery = type === "legal_query";

  // When editing a saved draft, pre-fill every field from it; a fresh form
  // starts blank. The values are tracked locally so the comboboxes (customer →
  // project) stay in sync and the draft id rides along on submit / save.
  const [draft, setDraft] = useState<Record<string, string>>(() => ({
    customer_id: editing?.customerId ?? "",
    project_id: editing?.projectId ?? "",
    booking_id: editing?.bookingId ?? "",
    subject: editing?.subject ?? "",
    details: editing?.details ?? "",
    visit_date: editing?.visit_date ?? "",
    pickup: editing?.pickup ?? "",
    customer_name: editing?.customer_name ?? "",
    customer_phone: editing?.customer_phone ?? "",
    // A time column comes back as HH:MM:SS; the <input type="time"> wants HH:MM.
    visit_time: (editing?.visit_time ?? "").slice(0, 5),
    travel_mode: editing?.travel_mode ?? "",
    cab_type: editing?.cab_type ?? "",
  }));
  function setField(name: string, value: string) {
    setDraft((d) => ({ ...d, [name]: value }));
  }

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(draft.customer_id || null);

  const customerOptions: ComboOption[] = useMemo(
    () => customers.map((c) => ({ id: c.id, label: c.name, hint: c.mobile })),
    [customers],
  );

  // The project list is the user's own active blocking/booking records, filtered
  // by the chosen customer. For types with a customer field we show NOTHING until
  // a customer is picked (no "all projects" dump); types without a customer (cab,
  // cancellation) fall back to the user's own records.
  const visibleProjects = useMemo(() => {
    if (selectedCustomerId) return projects.filter((p) => p.customerId === selectedCustomerId);
    return meta.needsCustomer ? [] : projects;
  }, [projects, selectedCustomerId, meta.needsCustomer]);

  const projectOptions: ComboOption[] = useMemo(
    () =>
      isCab
        ? allProjects.map((p) => ({ id: p.id, label: p.name, hint: p.city ?? undefined, key: p.id }))
        : visibleProjects.map((p, i) => ({
            id: p.projectId,
            label: p.plot ? `${p.name} · Plot ${p.plot}` : p.name,
            hint: p.mode ? (p.mode === "blocking" ? "Blocking" : "Booking") : undefined,
            key: `${p.id}-${i}`,
          })),
    [isCab, allProjects, visibleProjects],
  );

  // Earliest bookable slot: a visit must be at least an hour from now (book at
  // 6:30 → 7:30 is the first available time). Recomputed on mount so a form left
  // open overnight doesn't offer a stale minimum; the server re-checks anyway.
  const earliest = useMemo(() => earliestVisitParts(), []);
  const visitTooSoon =
    isCab &&
    !!draft.visit_date &&
    !!draft.visit_time &&
    !visitLeadTimeOk(draft.visit_date, draft.visit_time);

  // A project is required for every type except a general legal query.
  const projectRequired = type !== "legal_query";
  const projectPlaceholder = isCab
    ? "Search all active projects…"
    : meta.needsCustomer && !selectedCustomerId
      ? "Choose a customer first…"
      : "Search your blocked / booked projects…";

  return (
    <form action={(fd) => createServiceRequest(fd).then(onClose)} className="card space-y-4">
      <input type="hidden" name="type" value={type} />
      {editing && <input type="hidden" name="draft_id" value={editing.id} />}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">
            {editing ? "Edit" : "New"} {meta.label} Request
          </h3>
          <p className="mt-1 text-xs text-[var(--muted)]">{meta.description}</p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-[var(--muted)] hover:text-[var(--text)]">
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Site visit: the customer is a walk-in with no record yet, so the name
            and number are typed rather than looked up. */}
        {isCab && (
          <>
            <div>
              <label className="label">Customer name *</label>
              <input
                type="text"
                name="customer_name"
                required
                className="input"
                placeholder="Customer name"
                value={draft.customer_name ?? ""}
                onChange={(e) => setField("customer_name", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Customer phone number *</label>
              <input
                type="tel"
                inputMode="tel"
                name="customer_phone"
                required
                className="input"
                placeholder="Mobile number"
                value={draft.customer_phone ?? ""}
                onChange={(e) => setField("customer_phone", e.target.value)}
              />
            </div>
          </>
        )}

        {meta.needsCustomer && (
          <div className="sm:col-span-2">
            <label className="label">Customer *</label>
            <SearchableSelect
              name="customer_id"
              options={customerOptions}
              placeholder="Search your customers by name or mobile…"
              required
              initialId={draft.customer_id}
              onChange={(id) => {
                setSelectedCustomerId(id);
                setField("customer_id", id ?? "");
                // A new customer invalidates the previously chosen project.
                setField("project_id", "");
              }}
            />
          </div>
        )}

        {/* A legal query takes no Project — it is derived from the booked plot. */}
        {!isLegalQuery && (
          <div className="sm:col-span-2">
            <label className="label">Project{projectRequired ? " *" : ""}</label>
            <SearchableSelect
              key={selectedCustomerId ?? "none"}
              name="project_id"
              options={projectOptions}
              placeholder={projectPlaceholder}
              required={projectRequired}
              initialId={draft.project_id}
              onChange={(id) => setField("project_id", id ?? "")}
            />
          </div>
        )}

        {meta.needsBooking && (
          <div className="sm:col-span-2">
            <label className="label">{isLegalQuery ? "Plot booked *" : "Booking *"}</label>
            <select
              name="booking_id"
              required
              className="input"
              value={draft.booking_id ?? ""}
              onChange={(e) => setField("booking_id", e.target.value)}
            >
              <option value="">{isLegalQuery ? "Select the booked plot…" : "Select booking…"}</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {DATE_FIELD[type] && (
          <div>
            <label className="label">{DATE_FIELD[type]} *</label>
            <input
              type="date"
              name="visit_date"
              required
              className="input"
              min={isCab ? earliest.date : undefined}
              value={draft.visit_date ?? ""}
              onChange={(e) => setField("visit_date", e.target.value)}
            />
          </div>
        )}

        {isCab && (
          <div>
            <label className="label">Visit time *</label>
            <input
              type="time"
              name="visit_time"
              required
              className="input"
              // Only a same-day booking is bounded by the clock; a later date is
              // free to use any time.
              min={draft.visit_date === earliest.date ? earliest.time : undefined}
              value={draft.visit_time ?? ""}
              onChange={(e) => setField("visit_time", e.target.value)}
            />
            <p className="mt-1 text-xs text-[var(--muted)]">
              Book at least 1 hour ahead — earliest right now is{" "}
              {fmtDate(earliest.date)} at {earliest.time}.
            </p>
          </div>
        )}

        {PICKUP_TYPES.includes(type) && (
          <div>
            <label className="label">Pickup location</label>
            <input
              type="text"
              name="pickup"
              placeholder="Pickup point"
              className="input"
              value={draft.pickup ?? ""}
              onChange={(e) => setField("pickup", e.target.value)}
            />
          </div>
        )}

        {isCab && (
          <>
            <div>
              <label className="label">Travel *</label>
              <select
                name="travel_mode"
                required
                className="input"
                value={draft.travel_mode ?? ""}
                onChange={(e) => {
                  setField("travel_mode", e.target.value);
                  // No cab is booked for "Own" — drop any size already picked so
                  // it cannot be submitted from a now-hidden field.
                  if (!needsCabType(e.target.value)) setField("cab_type", "");
                }}
              >
                <option value="">Select…</option>
                {TRAVEL_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            {/* Cab type is only asked when a cab is actually being arranged. */}
            {needsCabType(draft.travel_mode) && (
              <div>
                <label className="label">Cab type *</label>
                <select
                  name="cab_type"
                  required
                  className="input"
                  value={draft.cab_type ?? ""}
                  onChange={(e) => setField("cab_type", e.target.value)}
                >
                  <option value="">Select…</option>
                  {CAB_TYPES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        {isLegalQuery && (
          <div className="sm:col-span-2">
            <label className="label">
              {isLegalQuery ? "Title *" : "Subject"}
            </label>
            <input
              type="text"
              name="subject"
              required={requiresSubject(type)}
              placeholder={isLegalQuery ? "Title of the query" : "Short subject"}
              className="input"
              value={draft.subject ?? ""}
              onChange={(e) => setField("subject", e.target.value)}
            />
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="label">
            {isLegalQuery
              ? "Query details *"
              : type === "cancellation"
                ? "Cancellation reason *"
                : isCab
                  ? "Remarks"
                  : "Notes"}
          </label>
          {isLegalQuery ? (
            <>
              <PointsTextarea
                name="details"
                required
                placeholder={`${POINT_BULLET}One point per line…`}
                value={draft.details ?? ""}
                onChange={(v) => setField("details", v)}
              />
              <p className="mt-1 text-xs text-[var(--muted)]">
                Enter starts a new point. Shift+Enter breaks a line within the same point.
              </p>
            </>
          ) : (
            <textarea
              name="details"
              rows={3}
              required={type === "cancellation"}
              placeholder={
                type === "cancellation"
                  ? "Why is this being cancelled?"
                  : isCab
                    ? "Optional remarks for the approver"
                    : "Optional notes for the approver"
              }
              className="input"
              value={draft.details ?? ""}
              onChange={(e) => setField("details", e.target.value)}
            />
          )}
        </div>
      </div>

      {visitTooSoon && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          A visit must be booked at least 1 hour ahead. The earliest slot right now is{" "}
          {fmtDate(earliest.date)} at {earliest.time}.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Save draft bypasses validation (formNoValidate) so a half-filled
            request can be parked; Submit runs the normal required-field checks. */}
        <button
          type="submit"
          formAction={(fd) => saveDraftRequest(fd).then(onClose)}
          formNoValidate
          className="btn-ghost"
        >
          {editing ? "Save changes" : "Save draft"}
        </button>
        <SubmitButton disabled={visitTooSoon}>Submit request</SubmitButton>
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
  onEdit,
}: {
  row: RequestRow;
  userRole: Role;
  declineOpen: boolean;
  onToggleDecline: () => void;
  onEdit: () => void;
}) {
  const meta = requestTypeMeta(row.type);
  const isDraft = row.status === "draft";
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
            {isDraft ? "Draft" : `Raised by ${row.requestedBy}`} · {timeAgo(row.created_at)}
          </p>
        </div>
        {!isDraft && <ChainProgress type={row.type} stage={row.stage} status={row.status} />}
      </div>

      {/* Details grid */}
      <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {row.subject && <Field label="Subject" value={row.subject} />}
        {row.project && <Field label="Project" value={row.project} />}
        {row.customer && <Field label="Customer" value={`${row.customer}${row.mobile ? ` · ${row.mobile}` : ""}`} />}
        {row.booking && <Field label="Booking" value={row.booking} />}
        {row.visit_date && (
          <Field
            label={DATE_FIELD[row.type] ?? "Date"}
            value={
              // A site visit carries a time too — show them as one line so the
              // approver sees the actual slot, not just the day.
              row.visit_time
                ? `${fmtDate(row.visit_date)} · ${row.visit_time.slice(0, 5)}`
                : fmtDate(row.visit_date)
            }
          />
        )}
        {row.pickup && <Field label="Pickup" value={row.pickup} />}
        {row.travel_mode && (
          <Field
            label="Travel"
            value={`${travelModeLabel(row.travel_mode)}${
              row.cab_type ? ` · ${cabTypeLabel(row.cab_type)}` : ""
            }`}
          />
        )}
        {row.details &&
          (usesPoints(row.type) ? (
            <PointsField label="Query details" value={row.details} />
          ) : (
            <Field
              label={
                row.type === "cancellation"
                  ? "Reason"
                  : row.type === "cab"
                    ? "Remarks"
                    : "Notes"
              }
              value={row.details}
              span
            />
          ))}
        {row.response && <Field label="Legal response" value={row.response} span />}
        {row.decline_reason && <Field label="Decline reason" value={row.decline_reason} span />}
      </div>

      {/* Draft actions — edit, submit (only when complete), or discard. */}
      {isDraft && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <button type="button" onClick={onEdit} className="btn-ghost">
            Edit
          </button>
          <form action={submitDraftRequest}>
            <input type="hidden" name="id" value={row.id} />
            <SubmitButton disabled={!row.draftReady}>Submit request</SubmitButton>
          </form>
          {!row.draftReady && (
            <span className="text-xs text-[var(--muted)]">Fill all required fields to submit.</span>
          )}
          <form action={deleteDraftRequest} className="ml-auto">
            <input type="hidden" name="id" value={row.id} />
            <SubmitButton className="btn-ghost text-[var(--brand-red)]">Delete</SubmitButton>
          </form>
        </div>
      )}

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

// A point-form body rendered as an actual bulleted list. Falls back to a plain
// Field when the text has no discernible points.
function PointsField({ label, value }: { label: string; value: string }) {
  const points = toPoints(value);
  if (points.length === 0) return <Field label={label} value={value} span />;
  return (
    <div className="sm:col-span-2">
      <span className="text-[var(--muted)]">{label}:</span>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[var(--text-2)]">
        {points.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Textarea that keeps every line a bullet point: Enter starts a new "• " line,
 * and the first character typed opens the first point. Shift+Enter still gives a
 * plain line break for a point that needs to wrap deliberately.
 *
 * The caret is repositioned by hand after each insertion — React restores it to
 * the old index, which would otherwise leave the cursor sitting inside the "• "
 * we just added.
 */
function PointsTextarea({
  name,
  value,
  onChange,
  required,
  placeholder,
  rows = 4,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function setCaret(pos: number) {
    requestAnimationFrame(() => ref.current?.setSelectionRange(pos, pos));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    onChange(`${value.slice(0, start)}\n${POINT_BULLET}${value.slice(end)}`);
    setCaret(start + 1 + POINT_BULLET.length);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const raw = e.target.value;
    // Opening the first point (or restoring a bullet the user backspaced over).
    if (raw && !raw.startsWith(POINT_BULLET)) {
      const caret = e.target.selectionStart ?? raw.length;
      onChange(POINT_BULLET + raw);
      setCaret(caret + POINT_BULLET.length);
      return;
    }
    onChange(raw);
  }

  return (
    <textarea
      ref={ref}
      name={name}
      rows={rows}
      required={required}
      placeholder={placeholder}
      className="input"
      value={value}
      onKeyDown={handleKeyDown}
      onChange={handleChange}
    />
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
