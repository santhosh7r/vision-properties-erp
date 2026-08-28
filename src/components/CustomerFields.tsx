"use client";

import { useEffect, useRef, useState } from "react";
import { OCCUPATIONS } from "@/lib/options";
import type { Customer } from "@/lib/types";

// Shared Customer Details fieldset. Reused by the standalone "Add Customer"
// page and inline in the booking form.
// The address here is the CUSTOMER'S OWN and can be anywhere in the country —
// people buy a Chennai or Trichy plot from wherever they live. So District and
// State are free text filled in from the pincode, NOT the app-wide DISTRICTS
// dropdown: that master is the company's own branch list (Chennai / Trichy) and
// still governs projects, users and profiles, which really are branch-bound.
//
// Typing six digits looks the PIN up through /api/pincode and fills District,
// State and Country. The lookup is a convenience, never a gate: all three stay
// editable, and if the service is unreachable the fields are simply typed in by
// hand — nothing about saving the form depends on it.
// Everything here is mandatory except the anniversary and the spouse pair —
// see the comments at those fields for why.
export default function CustomerFields({
  c,
}: {
  c?: Partial<Customer>;
}) {
  const [pincode, setPincode] = useState(c?.pincode ?? "");
  const [district, setDistrict] = useState(c?.district ?? "");
  const [state, setState] = useState(c?.state ?? "");
  const [country, setCountry] = useState(c?.country ?? "India");
  const [lookup, setLookup] = useState<"idle" | "loading" | "found" | "missing">("idle");
  // Bumped on every keystroke so a slow answer for an old PIN cannot land on top
  // of a newer one the user has since typed.
  const requestRef = useRef(0);

  function onPincodeChange(value: string) {
    setPincode(value.replace(/\D/g, "").slice(0, 6));
  }

  useEffect(() => {
    const seq = ++requestRef.current;
    if (pincode.length !== 6) {
      setLookup("idle");
      return;
    }
    // Editing an existing customer: their saved address is the record of truth,
    // so a PIN that is already filled in is not re-fetched over the top of it.
    if (pincode === (c?.pincode ?? "") && (c?.district || c?.state)) {
      setLookup("idle");
      return;
    }
    setLookup("loading");
    let live = true;
    fetch(`/api/pincode/${pincode}`)
      .then((r) => r.json())
      .then((d: { found: boolean; district: string; state: string; country: string }) => {
        if (!live || seq !== requestRef.current) return;
        if (!d.found) {
          setLookup("missing");
          return;
        }
        setLookup("found");
        // Only fills — never blanks a field the lookup has no answer for.
        if (d.district) setDistrict(d.district);
        if (d.state) setState(d.state);
        if (d.country) setCountry(d.country);
      })
      .catch(() => {
        if (live && seq === requestRef.current) setLookup("missing");
      });
    return () => {
      live = false;
    };
  }, [pincode, c?.pincode, c?.district, c?.state]);

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
      {/* Optional. It prints on the customer receipt, which has always had an
          Anniversary line; married customers give it, everyone else leaves it
          blank rather than being blocked by it. */}
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
      {/* Father's details — mandatory. Registration paperwork identifies the
          buyer as S/o or D/o, and the office needs a family contact number. */}
      <div>
        <label className="label">6. Father&apos;s Name *</label>
        <input name="father_name" className="input" defaultValue={c?.father_name ?? ""} required />
      </div>
      <div>
        <label className="label">7. Father&apos;s Mobile *</label>
        <input name="father_mobile" className="input" defaultValue={c?.father_mobile ?? ""} required />
      </div>
      {/* Spouse's details — optional, like the anniversary above: an unmarried
          customer is a complete record, not a half-filled one. */}
      <div>
        <label className="label">
          8. Spouse&apos;s Name <span className="font-normal text-[var(--muted)]">(optional)</span>
        </label>
        <input name="spouse_name" className="input" defaultValue={c?.spouse_name ?? ""} />
      </div>
      <div>
        <label className="label">
          9. Spouse&apos;s Mobile <span className="font-normal text-[var(--muted)]">(optional)</span>
        </label>
        <input name="spouse_mobile" className="input" defaultValue={c?.spouse_mobile ?? ""} />
      </div>
      <div>
        <label className="label">10. Street *</label>
        <input name="street" className="input" defaultValue={c?.street ?? ""} required />
      </div>
      <div>
        <label className="label">11. Area *</label>
        <input name="area" className="input" defaultValue={c?.area ?? ""} required />
      </div>
      <div>
        <label className="label">12. Pincode *</label>
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
        {lookup === "loading" && (
          <p className="mt-1 text-xs text-[var(--muted)]">Looking up district and state…</p>
        )}
        {lookup === "found" && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            District and State filled from this PIN — edit them if they are wrong.
          </p>
        )}
        {lookup === "missing" && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            Couldn&apos;t look that PIN up — type the district and state below.
          </p>
        )}
      </div>
      <div>
        <label className="label">13. State *</label>
        <input
          name="state"
          className="input"
          value={state}
          onChange={(e) => setState(e.target.value)}
          required
        />
      </div>
      {/* Free text, not the DISTRICTS dropdown — see the note at the top of this
          file. A customer may live in any district in the country. */}
      <div>
        <label className="label">14. District *</label>
        <input
          name="district"
          className="input"
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
          placeholder="fills from the pincode"
          required
        />
      </div>
      <div>
        <label className="label">15. Country *</label>
        <input
          name="country"
          className="input"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label">16. Occupation *</label>
        <select name="occupation" className="select" defaultValue={c?.occupation ?? ""} required>
          <option value="" disabled>Select occupation</option>
          {OCCUPATIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">17. Occupation Remarks *</label>
        <input name="occupation_remarks" className="input" defaultValue={c?.occupation_remarks ?? ""} required />
      </div>
    </div>
  );
}
