"use client";

import { useState } from "react";
import { OCCUPATIONS } from "@/lib/options";
import type { Customer } from "@/lib/types";

// Shared Customer Details fieldset. Reused by the standalone "Add Customer"
// page and inline in the booking form.
// Pincode auto-fills State / District / Country via the free India Post API;
// the fields stay editable so any value can be corrected.
export default function CustomerFields({
  c,
  districts = [],
}: {
  c?: Partial<Customer>;
  districts?: string[];
}) {
  const [pincode, setPincode] = useState(c?.pincode ?? "");
  const [state, setState] = useState(c?.state ?? "");
  const [district, setDistrict] = useState(c?.district ?? "");
  const [country, setCountry] = useState(c?.country ?? "");
  const [lookup, setLookup] = useState<"idle" | "loading" | "error">("idle");

  async function onPincodeChange(value: string) {
    const pin = value.replace(/\D/g, "").slice(0, 6);
    setPincode(pin);
    if (pin.length !== 6) {
      setLookup("idle");
      return;
    }
    setLookup("loading");
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
      const data = await res.json();
      const office = data?.[0]?.Status === "Success" ? data[0].PostOffice?.[0] : null;
      if (office) {
        setState(office.State ?? "");
        setDistrict(office.District ?? "");
        setCountry(office.Country ?? "India");
        setLookup("idle");
      } else {
        setLookup("error");
      }
    } catch {
      setLookup("error");
    }
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
        <label className="label">3. Email</label>
        <input name="email" type="email" className="input" defaultValue={c?.email ?? ""} placeholder="name@example.com" />
      </div>
      <div>
        <label className="label">4. D.O.B</label>
        <input name="dob" type="date" className="input" defaultValue={c?.dob ?? ""} />
      </div>
      <div>
        <label className="label">5. Street</label>
        <input name="street" className="input" defaultValue={c?.street ?? ""} />
      </div>
      <div>
        <label className="label">6. Area</label>
        <input name="area" className="input" defaultValue={c?.area ?? ""} />
      </div>
      <div>
        <label className="label">7. Pincode</label>
        <input
          name="pincode"
          className="input"
          inputMode="numeric"
          maxLength={6}
          value={pincode}
          onChange={(e) => onPincodeChange(e.target.value)}
          placeholder="6-digit PIN"
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          {lookup === "loading"
            ? "Looking up location…"
            : lookup === "error"
              ? "Couldn’t find that PIN — enter location manually."
              : "State, district & country auto-fill from PIN."}
        </p>
      </div>
      <div>
        <label className="label">8. State</label>
        <input name="state" className="input" value={state} onChange={(e) => setState(e.target.value)} />
      </div>
      <div>
        <label className="label">9. District</label>
        <select
          name="district"
          className="select"
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
        >
          <option value="">— Select district —</option>
          {/* keep a pincode-filled value selectable even if not in the master list */}
          {district && !districts.includes(district) && <option value={district}>{district}</option>}
          {districts.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">10. Country</label>
        <input name="country" className="input" value={country} onChange={(e) => setCountry(e.target.value)} />
      </div>
      <div>
        <label className="label">11. Occupation</label>
        <select name="occupation" className="select" defaultValue={c?.occupation ?? ""}>
          <option value="">Select occupation</option>
          {OCCUPATIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">12. Occupation Remarks</label>
        <input name="occupation_remarks" className="input" defaultValue={c?.occupation_remarks ?? ""} />
      </div>
    </div>
  );
}
