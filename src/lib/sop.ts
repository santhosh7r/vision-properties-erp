// ============================================================================
// SOP policy math (Vision Properties SOP v1.0).
//
// IMPORTANT: nothing here is hard-coded to the SOP's printed numbers. Every
// threshold/amount is read from the project's editable policy config, so the
// same functions work no matter how an admin tunes a project (e.g. Chennai vs
// Trichy). The SOP defaults live in the DB column defaults, not in code.
// ============================================================================

import { exact } from "@/lib/format";

const MS_PER_DAY = 86_400_000;

/** Whole days between two dates (date-only, ignores time-of-day). */
export function daysBetween(from: string | Date, to: string | Date): number {
  const a = new Date(from);
  const b = new Date(to);
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / MS_PER_DAY);
}

// ---------------------------------------------------------------------------
// §2 Booking advance = max(advance_percent % of plot value, advance_min_amount)
// ---------------------------------------------------------------------------
export function computeAdvanceRequired(
  plotValue: number,
  advancePercent: number,
  advanceMinAmount: number,
): number {
  // exact(): 0.15% of 504840 is 757.2600000000001 in float — the advance a
  // customer is quoted (and the DB row) must read ₹757.26.
  const pct = exact((Number(plotValue) || 0) * (Number(advancePercent) || 0) / 100);
  return Math.max(pct, Number(advanceMinAmount) || 0);
}

// ---------------------------------------------------------------------------
// §3 Cancellation & refund.
//   - Within `cancel_full_refund_days` of blocking: 100% refund.
//   - After: `cancellation_charge` per plot deducted as admin charge.
// `amountPaid` is what the customer has actually paid so far (the refundable pool).
// ---------------------------------------------------------------------------
export interface RefundPolicy {
  cancel_full_refund_days: number;
  cancellation_charge: number;
  refund_processing_days: number;
}

export interface RefundResult {
  daysSinceBlocking: number;
  withinFullRefundWindow: boolean;
  charge: number;
  refund: number;
}

export function computeRefund(
  policy: RefundPolicy,
  blockingDate: string | Date,
  cancelDate: string | Date,
  amountPaid: number,
): RefundResult {
  const days = daysBetween(blockingDate, cancelDate);
  const within = days <= (Number(policy.cancel_full_refund_days) || 0);
  const paid = Number(amountPaid) || 0;
  const charge = within ? 0 : Math.min(paid, Number(policy.cancellation_charge) || 0);
  return {
    daysSinceBlocking: days,
    withinFullRefundWindow: within,
    charge,
    refund: exact(Math.max(0, paid - charge)),
  };
}

/** Add N working days (skips Sat/Sun) to a date — used for the refund payout SLA. */
export function addWorkingDays(from: string | Date, workingDays: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < workingDays) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}
