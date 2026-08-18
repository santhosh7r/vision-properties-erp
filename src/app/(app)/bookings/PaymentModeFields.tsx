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
}: {
  modeName?: string;
  label?: string;
  required?: boolean;
  defaultMode?: string;
  loanTokenBy?: boolean;
  loanTokenByName?: string;
  defaultLoanTokenBy?: string;
  instrumentFields?: boolean;
}) {
  const [mode, setMode] = useState(defaultMode);
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
