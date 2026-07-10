"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import PaymentModeFields from "./PaymentModeFields";
import { convertToBooking } from "./actions";

// "Convert to Booking" opens a payment popup: the advance amount and how it was
// paid (cash / cheque / UPI / home loan …). On submit the hold is promoted to a
// booking AND the payment is recorded to the ledger. If the mode is a home loan,
// PaymentModeFields also asks who arranged it (customer / senior director).
export default function ConvertToBookingButton({
  bookingId,
  advanceRequired = 0,
  className = "btn-primary",
  style,
  label = "Convert to Booking",
}: {
  bookingId: string;
  advanceRequired?: number;
  className?: string;
  style?: React.CSSProperties;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} style={style} onClick={() => setOpen(true)}>
        {label}
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)} className="max-w-lg">
          <div className="card">
            <h2 className="mb-1 text-sm font-semibold">Convert to Booking</h2>
            <p className="mb-4 text-xs text-[var(--muted)]">
              Record the advance payment to convert this hold into a booking.
            </p>
            <form action={convertToBooking} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="id" value={bookingId} />
              <div>
                <label className="label">
                  Amount (₹)<span className="text-red-400"> *</span>
                </label>
                <input
                  name="amount"
                  type="number"
                  min={1}
                  step="0.01"
                  className="input"
                  defaultValue={advanceRequired > 0 ? advanceRequired : undefined}
                  required
                />
                {advanceRequired > 0 && (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Advance required: ₹{advanceRequired.toLocaleString("en-IN")}
                  </p>
                )}
              </div>
              <PaymentModeFields modeName="mode" label="Payment Mode" required loanTokenBy />
              <div className="sm:col-span-2 mt-1 flex justify-end gap-2">
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <SubmitButton className="btn-primary" pendingLabel="Converting…">
                  Convert &amp; Record Payment
                </SubmitButton>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
