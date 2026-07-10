"use client";

import { useState } from "react";
import { LOAN_TOKEN_BY_OPTIONS, PAYMENT_MODES, paymentModeFields } from "@/lib/options";

// A payment Mode <select> plus the instrument-detail inputs that apply to the
// chosen mode (cheque no / bank / UPI txn id …). Self-contained: tracks the
// selected mode locally and shows/hides the relevant fields. Drop into any form
// that records a payment — the detail inputs post as reference / bank_name /
// instrument_date, matching the payments columns (migration 0020).
export default function PaymentModeFields({
  modeName = "mode",
  label = "Mode",
  required = false,
  defaultMode = "",
  // When true, a "Loan Taken By" select appears once "Home Loan" is chosen so we
  // capture whether the customer or their Senior Director arranged the loan.
  loanTokenBy = false,
  loanTokenByName = "loan_token_by",
  defaultLoanTokenBy = "",
}: {
  modeName?: string;
  label?: string;
  required?: boolean;
  defaultMode?: string;
  loanTokenBy?: boolean;
  loanTokenByName?: string;
  defaultLoanTokenBy?: string;
}) {
  const [mode, setMode] = useState(defaultMode);
  const fields = paymentModeFields(mode);
  const isLoan = mode === "Home Loan";

  return (
    <>
      <div>
        <label className="label">{label}</label>
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
          {PAYMENT_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
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
