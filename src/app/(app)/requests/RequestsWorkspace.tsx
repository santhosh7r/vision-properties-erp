"use client";

import { useMemo, useState } from "react";
import { Badge, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { fmtDate } from "@/lib/format";
import type { CabRequestStatus } from "@/lib/types";
import {
  createCabRequest,
  approveCabRequest,
  declineCabRequest,
  rescheduleCabRequest,
} from "./actions";

export interface RequestRow {
  id: string;
  customer: string;
  mobile: string;
  requestedBy: string;
  cab_date: string;
  pickup: string | null;
  notes: string | null;
  status: CabRequestStatus;
  decline_reason: string | null;
  created_at: string;
}

interface MiniCustomer {
  id: string;
  name: string;
  mobile: string;
}

const STATUS_TONE: Record<CabRequestStatus, "amber" | "green" | "red"> = {
  pending: "amber",
  approved: "green",
  declined: "red",
};

// Cap how many client matches render at once — keeps the picker fast with
// thousands of customers. The user narrows the list by typing.
const MAX_CLIENT_RESULTS = 50;

export default function RequestsWorkspace({
  rows,
  customers,
  canRequest,
  canApprove,
  isAdmin,
  migrationMissing,
}: {
  rows: RequestRow[];
  customers: MiniCustomer[];
  canRequest: boolean;
  canApprove: boolean;
  isAdmin: boolean;
  migrationMissing: boolean;
}) {
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [declineId, setDeclineId] = useState<string | null>(null);

  // Searchable client picker (handles thousands of customers — search by name
  // or mobile, only a capped slice is rendered).
  const [clientId, setClientId] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [clientOpen, setClientOpen] = useState(false);

  const selectedClient = useMemo(
    () => customers.find((c) => c.id === clientId) ?? null,
    [customers, clientId],
  );
  const filteredClients = useMemo(() => {
    const t = clientQuery.trim().toLowerCase();
    const list = t
      ? customers.filter(
          (c) => c.name.toLowerCase().includes(t) || c.mobile.toLowerCase().includes(t),
        )
      : customers;
    return list.slice(0, MAX_CLIENT_RESULTS);
  }, [customers, clientQuery]);

  if (migrationMissing) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
        The cab requests table isn’t set up yet. Apply migration{" "}
        <code className="font-mono">0008_cab_requests.sql</code> to your database, then reload this page.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* New request form */}
      {canRequest && (
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold">New Cab Request</h2>
          <form
            action={createCabRequest}
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={() => {
              // Reset the picker after a successful submit.
              setClientId("");
              setClientQuery("");
            }}
          >
            <div>
              <label className="label">Client *</label>
              <input type="hidden" name="customer_id" value={clientId} />
              {selectedClient ? (
                <div className="input flex items-center justify-between">
                  <span>{selectedClient.name} · {selectedClient.mobile}</span>
                  <button
                    type="button"
                    className="text-xs text-[var(--accent)]"
                    onClick={() => {
                      setClientId("");
                      setClientQuery("");
                      setClientOpen(true);
                    }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    className="input"
                    placeholder="Search client by name or mobile…"
                    value={clientQuery}
                    autoComplete="off"
                    onChange={(e) => {
                      setClientQuery(e.target.value);
                      setClientOpen(true);
                    }}
                    onFocus={() => setClientOpen(true)}
                  />
                  {clientOpen && (
                    <>
                      <button
                        type="button"
                        aria-hidden
                        className="fixed inset-0 z-10 cursor-default"
                        onClick={() => setClientOpen(false)}
                      />
                      <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-[var(--surface)] shadow-lg">
                        {filteredClients.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-[var(--muted)]">
                            {customers.length === 0 ? "You have no clients yet — add a customer first." : "No client matches your search."}
                          </div>
                        ) : (
                          filteredClients.map((c) => (
                            <button
                              type="button"
                              key={c.id}
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
                              onClick={() => {
                                setClientId(c.id);
                                setClientOpen(false);
                              }}
                            >
                              {c.name} <span className="text-[var(--muted)]">· {c.mobile}</span>
                            </button>
                          ))
                        )}
                        {clientQuery.trim() === "" && customers.length > filteredClients.length && (
                          <div className="px-3 py-1 text-[11px] text-[var(--muted)]">
                            Showing {filteredClients.length} of {customers.length} — type to narrow.
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="label">Cab Date *</label>
              <input type="date" name="cab_date" className="input" required />
            </div>
            <div>
              <label className="label">Pickup Location</label>
              <input name="pickup" className="input" placeholder="Where to pick up the client" />
            </div>
            <div>
              <label className="label">Notes</label>
              <input name="notes" className="input" placeholder="Anything admin should know" />
            </div>
            <div className="flex justify-end sm:col-span-2">
              <SubmitButton pendingLabel="Requesting…" disabled={!clientId}>Request Cab</SubmitButton>
            </div>
          </form>
        </div>
      )}

      {/* Requests list */}
      <div className="card" style={{ padding: 0 }}>
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-sm font-semibold">Requests ({rows.length})</h2>
        </div>
        <div style={{ borderTop: "1px solid var(--border)" }} />
        {rows.length === 0 ? (
          <div className="px-5 py-8">
            <EmptyState
              message="No cab requests yet."
              hint={canRequest ? "Raise one using the form above." : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Client</th>
                  <th className="th">Mobile</th>
                  {isAdmin && <th className="th">Requested By</th>}
                  <th className="th">Cab Date</th>
                  <th className="th">Pickup</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="td font-medium">{r.customer}</td>
                    <td className="td">{r.mobile}</td>
                    {isAdmin && <td className="td text-[var(--muted)]">{r.requestedBy}</td>}
                    <td className="td whitespace-nowrap">{fmtDate(r.cab_date)}</td>
                    <td className="td text-[var(--muted)]">{r.pickup ?? "—"}</td>
                    <td className="td">
                      <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                      {r.status === "declined" && r.decline_reason && (
                        <div className="mt-0.5 text-[10px] text-[var(--muted)]">{r.decline_reason}</div>
                      )}
                    </td>
                    <td className="td">
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {/* Admin: approve / decline */}
                          {canApprove && r.status !== "approved" && (
                            <form action={approveCabRequest}>
                              <input type="hidden" name="id" value={r.id} />
                              <SubmitButton className="btn-success" style={{ padding: "5px 10px", fontSize: 12 }} pendingLabel="…">
                                Approve
                              </SubmitButton>
                            </form>
                          )}
                          {canApprove && r.status !== "declined" && (
                            <button
                              type="button"
                              className="btn-danger"
                              style={{ padding: "5px 10px", fontSize: 12 }}
                              onClick={() => setDeclineId(declineId === r.id ? null : r.id)}
                            >
                              Decline
                            </button>
                          )}
                          {/* Sales: reschedule */}
                          {canRequest && (
                            <button
                              type="button"
                              className="btn-ghost"
                              style={{ padding: "5px 10px", fontSize: 12 }}
                              onClick={() => setRescheduleId(rescheduleId === r.id ? null : r.id)}
                            >
                              Reschedule
                            </button>
                          )}
                        </div>

                        {/* Inline decline reason (admin) */}
                        {declineId === r.id && (
                          <form
                            action={declineCabRequest}
                            className="flex items-center gap-1.5"
                            onSubmit={() => setDeclineId(null)}
                          >
                            <input type="hidden" name="id" value={r.id} />
                            <input name="reason" className="input" style={{ height: 30, fontSize: 12 }} placeholder="Reason (optional)" />
                            <SubmitButton className="btn-danger" style={{ padding: "5px 10px", fontSize: 12 }} pendingLabel="…">
                              Confirm Decline
                            </SubmitButton>
                          </form>
                        )}

                        {/* Inline reschedule (sales) */}
                        {rescheduleId === r.id && (
                          <form
                            action={rescheduleCabRequest}
                            className="flex items-center gap-1.5"
                            onSubmit={() => setRescheduleId(null)}
                          >
                            <input type="hidden" name="id" value={r.id} />
                            <input type="date" name="cab_date" defaultValue={r.cab_date} className="input" style={{ height: 30, fontSize: 12 }} required />
                            <SubmitButton className="btn-primary" style={{ padding: "5px 10px", fontSize: 12 }} pendingLabel="…">
                              Save Date
                            </SubmitButton>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
