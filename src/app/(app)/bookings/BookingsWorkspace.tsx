"use client";

import { useState } from "react";
import BookingsTable, { type BookingRow } from "./BookingsTable";
import StartBookingFlow, { type FlowProject } from "./StartBookingFlow";
import { Plus } from "@/components/icons";

interface MiniCustomer { id: string; name: string; mobile: string }

export interface FlowData {
  projects: FlowProject[];
  customers: MiniCustomer[];
}

// One page: the bookings list with a prominent "Block / Book Plot" button that
// opens the guided flow inline.
export default function BookingsWorkspace({
  rows,
  canConfirm,
  canCancel,
  canCreate,
  showSalesperson = false,
  flow,
}: {
  rows: BookingRow[];
  canConfirm: boolean;
  canCancel: boolean;
  canCreate: boolean;
  showSalesperson?: boolean;
  flow: FlowData | null;
}) {
  const [creating, setCreating] = useState(false);

  // No create permission → just the list.
  if (!canCreate || !flow) {
    return (
      <BookingsTable
        rows={rows}
        canConfirm={canConfirm}
        canCancel={canCancel}
        showSalesperson={showSalesperson}
      />
    );
  }

  if (creating) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setCreating(false)} className="btn-ghost">
          ← Back to all bookings
        </button>
        {flow.projects.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed p-12 text-center text-sm text-[var(--muted)]"
            style={{ borderColor: "var(--border-strong)" }}
          >
            No available plots to block or book. Add plots to an active project first
            (<a className="text-[var(--accent)]" href="/projects">go to Projects</a>).
          </div>
        ) : (
          <StartBookingFlow
            projects={flow.projects}
            customers={flow.customers}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">{rows.length} blocking / booking records</p>
        <button type="button" onClick={() => setCreating(true)} className="btn-primary">
          <Plus size={16} /> Block / Book Plot
        </button>
      </div>
      <BookingsTable
        rows={rows}
        canConfirm={canConfirm}
        canCancel={canCancel}
        showSalesperson={showSalesperson}
      />
    </div>
  );
}
