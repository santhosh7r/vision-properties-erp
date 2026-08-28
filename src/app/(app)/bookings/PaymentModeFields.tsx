"use client";

import { useEffect, useState } from "react";
import {
  CASH_LIMIT_NOTE,
  LOAN_TOKEN_BY_OPTIONS,
  cashAllowed,
  paymentModeFields,
  paymentModesFor,
} from "@/lib/options";

// A payment Mode <select> plus the instrument-detail inputs that apply to the
// chosen mode (cheque no / bank / UPI txn id …). Self-contained: tracks the
// selected mode locally and shows/hides the relevant fields. Drop into any form
// that records a payment — the detail inputs post as reference / bank_name /
// instrument_date, matching the payments columns (migration 0020).
// Pass `amount` (the ₹ being collected) to apply the cash ceiling: above
// CASH_LIMIT the Cash option is not offered at all. See lib/options.
export default function PaymentModeFields({
  modeName = "mode",
  label = "Mode",
  required = false,
  defaultMode = "",
  // When true, a "Loan Taken By" select appears once "Loan" is chosen so we
  // capture whether the customer or their Senior Director arranged it. This is
  // the ONLY place that question is asked — it is meaningless for cash or UPI.
  loanTokenBy = false,
  loanTokenByName = "loan_token_by",
  defaultLoanTokenBy = "",
  // The instrument inputs (cheque no / UTR / lender …) describe ONE payment, so
  // forms that only record the booking's mode of payment turn them off and keep
  // just the select and its conditional "Loan Taken By".
  instrumentFields = true,
  // The ₹ amount this mode is being chosen for. Above CASH_LIMIT the Cash
  // option disappears. Leave it undefined where no amount is known — every mode
  // then stays on offer.
  amount,
}: {
  modeName?: string;
  label?: string;
  required?: boolean;
  defaultMode?: string;
  loanTokenBy?: boolean;
  loanTokenByName?: string;
  defaultLoanTokenBy?: string;
  instrumentFields?: boolean;
  amount?: number | null;
}) {
  const [mode, setMode] = useState(defaultMode);
  const modes = paymentModesFor(amount);
  const cashBlocked = !cashAllowed(amount);
  // Cash picked while the amount was small must not survive the amount being
  // raised past the ceiling — the selection is cleared, so the (required) select
  // falls back to "Select mode" and has to be answered again. Without this the
  // form would happily post Cash for a sum that may not be paid in cash.
  useEffect(() => {
    if (cashBlocked && mode === "Cash") setMode("");
  }, [cashBlocked, mode]);
  const fields = instrumentFields ? paymentModeFields(mode) : [];
  // "Home Loan" is the pre-rename value — still recognised so editing an older
  // record keeps its loan fields.
  const isLoan = mode === "Loan" || mode === "Home Loan";

  return (
    <>
      <div>
        <label className="label">
          {label}
          {required && <span className="text-red-400"> *</span>}
        </label>
        <select
          name={modeName}
          className="select"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          required={required}
        >
          <option value="" disabled={required}>
            Select mode
          </option>
          {modes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {cashBlocked && <p className="mt-1 text-xs text-[var(--muted)]">{CASH_LIMIT_NOTE}</p>}
      </div>

      {fields.map((f) => (
        <div key={f.name}>
          <label className="label">
            {f.label}
            {f.required && <span className="text-red-400"> *</span>}
          </label>
          <input
            name={f.name}
            type={f.type}
            className="input"
            placeholder={f.placeholder}
            required={f.required}
          />
        </div>
      ))}

      {loanTokenBy && isLoan && (
        <div>
          <label className="label">
            Loan Taken By<span className="text-red-400"> *</span>
          </label>
          <select name={loanTokenByName} className="select" defaultValue={defaultLoanTokenBy} required>
            <option value="" disabled>
              Select
            </option>
            {LOAN_TOKEN_BY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
