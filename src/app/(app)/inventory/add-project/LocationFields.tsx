"use client";

import { useState } from "react";

const ADD = "__add_new__";

// An editable dropdown: pick an existing value, or choose "+ Add new…" to type a
// brand-new one inline (which is then reused on future projects). The active
// control (select or text input) carries `name`, so the form submits one value.
function ComboSelect({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [adding, setAdding] = useState(false);

  // A non-empty value that isn't in the base list (e.g. pincode pre-filled a
  // district we've never seen) is shown as a selectable option so it stays
  // selected without forcing "add" mode.
  const merged = value && !options.includes(value) ? [value, ...options] : options;

  if (adding) {
    return (
      <div>
        <label className="label">{label} *</label>
        <input
          name={name}
          className="input"
          required
          autoFocus
          placeholder={`Type a new ${label.toLowerCase()}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="mt-1 text-xs text-[var(--accent)] hover:underline"
          onClick={() => {
            setAdding(false);
            onChange("");
          }}
        >
          ← Choose from list
        </button>
      </div>
    );
  }

  return (
    <div>
      <label className="label">{label} *</label>
      <select
        name={name}
        className="select"
        required
        value={value}
        onChange={(e) => {
          if (e.target.value === ADD) {
            setAdding(true);
            onChange("");
          } else {
            onChange(e.target.value);
          }
        }}
      >
        <option value="" disabled>
          Select {label.toLowerCase()}
        </option>
        {merged.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={ADD}>+ Add new {label.toLowerCase()}…</option>
      </select>
    </div>
  );
}

// Pincode → District / City for the Add Project form. District & City are
// editable dropdowns sourced from values already used across projects; admin can
// add a new one inline. India Post's public PIN lookup pre-fills both (no key,
// CORS-enabled). Pincode itself is a helper only and is not submitted.
export default function LocationFields({
  districtOptions,
  cityOptions,
}: {
  districtOptions: string[];
  cityOptions: string[];
}) {
  const [pincode, setPincode] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "done">("idle");

  async function lookup(pin: string) {
    setStatus("loading");
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
      const json = await res.json();
      const entry = Array.isArray(json) ? json[0] : null;
      const offices = entry?.PostOffice;
      if (entry?.Status === "Success" && offices?.length) {
        const po = offices[0];
        const dist = po.District ?? "";
        setDistrict(dist);
        setCity(po.Block && po.Block !== "NA" ? po.Block : dist);
        setStatus("done");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <div>
        <label className="label">Pincode</label>
        <input
          className="input"
          inputMode="numeric"
          maxLength={6}
          placeholder="6-digit PIN auto-fills district & city"
          value={pincode}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
            setPincode(v);
            if (v.length === 6) lookup(v);
            else setStatus("idle");
          }}
        />
        {status === "loading" && (
          <p className="mt-1 text-xs text-[var(--muted)]">Looking up pincode…</p>
        )}
        {status === "error" && (
          <p className="mt-1 text-xs text-[var(--brand-red)]">
            Couldn’t find that pincode — pick or add district &amp; city manually.
          </p>
        )}
      </div>
      <ComboSelect
        name="district"
        label="District"
        options={districtOptions}
        value={district}
        onChange={setDistrict}
      />
      <ComboSelect
        name="city"
        label="City"
        options={cityOptions}
        value={city}
        onChange={setCity}
      />
    </>
  );
}
