"use client";

import { SubmitButton } from "@/components/SubmitButton";
import PaymentModeFields from "./PaymentModeFields";
import { recordPayment } from "./actions";

// Record Payment card on the booking detail page. The Mode select drives which
// instrument-detail fields appear (cheque no / UPI txn id / UTR …) so Finance
// captures the supporting reference for every non-cash collection.
export default function RecordPaymentForm({
  bookingId,
  balance,
}: {
  bookingId: string;
  balance: number;
}) {
  return (
    <form action={recordPayment} className="space-y-3">
      <input type="hidden" name="booking_id" value={bookingId} />
      <div>
        <label className="label">Amount (₹)</label>
        <input
          name="amount"
          type="number"
          min={1}
          step="0.01"
          max={balance > 0 ? balance : undefined}
          className="input"
          required
        />
      </div>
      <div>
        <label className="label">Kind</label>
        <select name="kind" className="select" defaultValue="installment">
          <option value="advance">Advance</option>
          <option value="installment">Installment</option>
          <option value="final">Final</option>
        </select>
      </div>

      <PaymentModeFields modeName="mode" label="Mode" required loanTokenBy />

      <SubmitButton className="btn-primary w-full" pendingLabel="Adding…">
        Add Payment
      </SubmitButton>
      <p className="text-xs text-[var(--muted)]">
        Payment stays Pending until the full plot value is received.
      </p>
    </form>
  );
}
