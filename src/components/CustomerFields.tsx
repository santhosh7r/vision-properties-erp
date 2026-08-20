"use client";

import { useState } from "react";
import { DISTRICTS, OCCUPATIONS } from "@/lib/options";
import type { Customer } from "@/lib/types";

// Shared Customer Details fieldset. Reused by the standalone "Add Customer"
// page and inline in the booking form.
// District is a fixed dropdown from the app-wide master (DISTRICTS). Pincode is
// captured as a plain number — no external lookup / auto-fill.
export default function CustomerFields({
  c,
}: {
  c?: Partial<Customer>;
}) {
  const [pincode, setPincode] = useState(c?.pincode ?? "");

  function onPincodeChange(value: string) {
    setPincode(value.replace(/\D/g, "").slice(0, 6));
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label">1. Customer Name *</label>
        <input name="name" className="input" defaultValue={c?.name ?? ""} required />
      </div>
      <div>
        <label className="label">2. Customer Mobile *</label>
        <input name="mobile" className="input" defaultValue={c?.mobile ?? ""} required />
      </div>
      <div>
        <label className="label">3. Email *</label>
        <input name="email" type="email" className="input" defaultValue={c?.email ?? ""} placeholder="name@example.com" required />
      </div>
      <div>
        <label className="label">4. D.O.B *</label>
        <input name="dob" type="date" className="input" defaultValue={c?.dob ?? ""} required />
      </div>
      {/* The ONE optional field on this form. It prints on the customer receipt,
          which has always had an Anniversary line; married customers give it,
          everyone else leaves it blank rather than being blocked by it. */}
      <div>
        <label className="label">
          5. Anniversary <span className="font-normal text-[var(--muted)]">(optional)</span>
        </label>
        <input
          name="anniversary_date"
          type="date"
          className="input"
          defaultValue={c?.anniversary_date ?? ""}
        />
      </div>
      <div>
        <label className="label">6. Street *</label>
        <input name="street" className="input" defaultValue={c?.street ?? ""} required />
      </div>
      <div>
        <label className="label">7. Area *</label>
        <input name="area" className="input" defaultValue={c?.area ?? ""} required />
      </div>
      <div>
        <label className="label">8. Pincode *</label>
        <input
          name="pincode"
          className="input"
          inputMode="numeric"
          maxLength={6}
          value={pincode}
          onChange={(e) => onPincodeChange(e.target.value)}
          placeholder="6-digit PIN"
          required
        />
      </div>
      <div>
        <label className="label">9. State *</label>
        <input name="state" className="input" defaultValue={c?.state ?? ""} required />
      </div>
      <div>
        <label className="label">10. District *</label>
        <select name="district" className="select" defaultValue={c?.district ?? ""} required>
          <option value="" disabled>— Select district —</option>
          {/* preserve an existing saved value even if it's no longer in the master list */}
          {c?.district && !DISTRICTS.includes(c.district) && (
            <option value={c.district}>{c.district}</option>
          )}
          {DISTRICTS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">11. Country *</label>
        <input name="country" className="input" defaultValue={c?.country ?? "India"} required />
      </div>
      <div>
        <label className="label">12. Occupation *</label>
        <select name="occupation" className="select" defaultValue={c?.occupation ?? ""} required>
          <option value="" disabled>Select occupation</option>
          {OCCUPATIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">13. Occupation Remarks *</label>
        <input name="occupation_remarks" className="input" defaultValue={c?.occupation_remarks ?? ""} required />
      </div>
    </div>
  );
}
