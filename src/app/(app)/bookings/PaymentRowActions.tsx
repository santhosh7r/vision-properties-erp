"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { inr, fmtDateTime } from "@/lib/format";
import PaymentModeFields from "./PaymentModeFields";
import { deletePayment, updatePayment } from "./actions";

// Edit / Delete on one row of a booking's Payments table.
//   • Edit corrects the DETAILS of a payment (kind, mode, cheque / UPI / bank
//     reference, dates). The amount is the transaction itself and is shown, never
//     editable — here or on the server (updatePayment never reads one).
//   • Delete removes an entry that should not exist (e.g. recorded twice), with
//     a mandatory reason. A wrong amount = delete it, then record the right one.
// The server re-checks every rule; the forms only guide.

export interface EditablePayment {
  id: string;
  receiptNo: string;
  paidAt: string;
  amount: number;
  kind: string;
  mode: string | null;
  reference: string | null;
  bank_name: string | null;
  instrument_date: string | null;
}

const KINDS = [
  { value: "blocking", label: "Blocking Amount" },
  { value: "advance", label: "Advance" },
  { value: "installment", label: "Installment" },
  { value: "final", label: "Final" },
];

export default function PaymentRowActions({
  payment,
  openInitially,
  error,
}: {
  payment: EditablePayment;
  // Re-open the dialog after a server-side refusal (?edit= / ?delete=), with
  // the reason shown inside it — the page banner sits behind the dialog.
  openInitially?: "edit" | "delete";
  error?: string;
}) {
  const [open, setOpen] = useState<"edit" | "delete" | null>(openInitially ?? null);
  const close = () => setOpen(null);

  return (
    <>
      <div className="flex items-center gap-1">
        <button type="button" className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setOpen("edit")}>
          Edit
        </button>
        <button
          type="button"
          className="btn-ghost text-[var(--brand-red)]"
          style={{ padding: "4px 10px", fontSize: 12 }}
          onClick={() => setOpen("delete")}
        >
          Delete
        </button>
      </div>

      {open === "edit" && (
        <Modal onClose={close} className="max-w-md">
          <EditForm payment={payment} onClose={close} error={error} />
        </Modal>
      )}
      {open === "delete" && (
        <Modal onClose={close} className="max-w-md">
          <DeleteForm payment={payment} onClose={close} error={error} />
        </Modal>
      )}
    </>
  );
}

function Header({ title, payment, error }: { title: string; payment: EditablePayment; error?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Receipt {payment.receiptNo} · recorded {fmtDateTime(payment.paidAt)}
      </p>
      {error && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}

function EditForm({ payment, onClose, error }: { payment: EditablePayment; onClose: () => void; error?: string }) {
  return (
    <div className="card">
      <Header title="Edit Payment Details" payment={payment} error={error} />
      <form action={updatePayment} className="space-y-3">
        <input type="hidden" name="payment_id" value={payment.id} />
        {/* Read-only by design: the amount is the transaction and can never be
            changed. It is not a form field at all, so nothing can post one. */}
        <div>
          <span className="label">Amount</span>
          <div
            className="rounded-lg px-3 py-2 text-sm font-semibold tabular-nums"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            {inr(payment.amount)}
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            The amount can&apos;t be edited. If it is wrong, delete this payment and record the correct one.
          </p>
        </div>
        <div>
          <label className="label">Kind</label>
          <select name="kind" className="select" defaultValue={payment.kind}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <PaymentModeFields
          modeName="mode"
          label="Mode"
          required
          defaultMode={payment.mode ?? ""}
          amount={payment.amount}
          detailDefaults={payment}
        />
        <div>
          <label className="label">
            Reason for the change <span className="font-normal text-[var(--muted)]">(optional)</span>
          </label>
          <input name="reason" className="input" placeholder="e.g. Wrong cheque number" />
        </div>
        <p className="text-xs text-[var(--muted)]">
          The receipt keeps its number {payment.receiptNo} and reprints with the corrected details. The change is recorded in
          the Activity Log.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <SubmitButton pendingLabel="Saving…">Save Changes</SubmitButton>
        </div>
      </form>
    </div>
  );
}

function DeleteForm({ payment, onClose, error }: { payment: EditablePayment; onClose: () => void; error?: string }) {
  return (
    <div className="card">
      <Header title="Delete Payment" payment={payment} error={error} />
      <div className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--surface-2)" }}>
        <div className="font-semibold">{inr(payment.amount)}</div>
        <div className="text-xs text-[var(--muted)]">
          {payment.kind} · {payment.mode ?? "no mode"}
          {[payment.reference, payment.bank_name].filter(Boolean).length > 0 &&
            ` · ${[payment.reference, payment.bank_name].filter(Boolean).join(" · ")}`}
        </div>
      </div>
      <form action={deletePayment} className="space-y-3">
        <input type="hidden" name="payment_id" value={payment.id} />
        <div>
          <label className="label">
            Reason for deleting<span className="text-red-400"> *</span>
          </label>
          <input name="reason" className="input" minLength={3} required placeholder="e.g. Entered twice by mistake" />
        </div>
        <p className="text-xs text-[var(--muted)]">
          The amount comes off the booking&apos;s paid total. Receipt {payment.receiptNo} stops being valid and its number is
          not reused. This is recorded in the Activity Log and cannot be undone — record the payment again if needed.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <SubmitButton className="btn-danger" pendingLabel="Deleting…">
            Delete Payment
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
