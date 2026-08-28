"use client";

import { useState } from "react";
import PaymentModeFields from "../../bookings/PaymentModeFields";

// Amount collected at registration + how it was paid. These two live together
// in one client component because the amount drives the Mode select: above the
// cash ceiling "Cash" is not offered (see lib/options). The registration page
// itself is a server component, so the pair is lifted out to here.
// Renders as a fragment — the caller's grid lays both cells out.
export default function RegistrationPaymentFields({ balance }: { balance: number }) {
  // A string, so leaving the box blank (plot already fully paid) stays blank.
  const [amount, setAmount] = useState(balance > 0 ? String(balance) : "");

  return (
    <>
      <div>
        <label className="label">Amount (₹)</label>
        <input
          name="amount"
          type="number"
          min={0}
          step="0.01"
          className="input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {balance > 0 && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            Outstanding balance: ₹{balance.toLocaleString("en-IN")}
          </p>
        )}
      </div>
      <PaymentModeFields modeName="mode" label="Payment Mode" loanTokenBy amount={Number(amount)} />
    </>
  );
}
