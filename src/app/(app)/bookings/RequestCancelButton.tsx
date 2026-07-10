"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { requestCancellation } from "./actions";

// Non-admin sales action: raise a cancellation request with a mandatory reason.
// Opens a popup (reason is required) and posts to requestCancellation, which
// surfaces it to Admin under Payments & Cancellation.
export default function RequestCancelButton({
  bookingId,
  className = "btn-danger",
  style,
  label = "Request Cancellation",
}: {
  bookingId: string;
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
            <h2 className="mb-1 text-sm font-semibold">Request Cancellation</h2>
            <p className="mb-4 text-xs text-[var(--muted)]">
              Only an Admin can cancel. Your request and reason will be sent to Admin for review under
              Payments &amp; Cancellation.
            </p>
            <form action={requestCancellation} className="space-y-3">
              <input type="hidden" name="id" value={bookingId} />
              <div>
                <label className="label">
                  Reason<span className="text-red-400"> *</span>
                </label>
                <textarea
                  name="reason"
                  className="textarea"
                  rows={3}
                  required
                  placeholder="Why should this be cancelled?"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <SubmitButton className="btn-danger" pendingLabel="Sending…">
                  Send Request
                </SubmitButton>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
