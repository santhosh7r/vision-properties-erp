"use client";

import { useState } from "react";
import { lookupSalesPerson } from "./actions";

export interface PartnerInitial {
  partnerId?: string | null;
  partnerCode?: string | null;
  partnerName?: string | null;
  seniorDirectorId?: string | null;
  seniorDirectorCode?: string | null;
  seniorDirectorName?: string | null;
  directorId?: string | null;
  directorCode?: string | null;
  directorName?: string | null;
}

// Image-1 layout: enter a Partner ID (VPSD##/VPD##/VPBM##/VPBP##) and the partner name,
// director ID and director name are fetched automatically. Director fields are
// read-only — they are derived from the partner's position in the sales tree.
export default function PartnerDetailsFields({ initial }: { initial?: PartnerInitial }) {
  const [code, setCode] = useState(initial?.partnerCode ?? "");
  const [partnerId, setPartnerId] = useState(initial?.partnerId ?? "");
  const [partnerName, setPartnerName] = useState(initial?.partnerName ?? "");
  const [sdId, setSdId] = useState(initial?.seniorDirectorId ?? "");
  const [sdCode, setSdCode] = useState(initial?.seniorDirectorCode ?? "");
  const [sdName, setSdName] = useState(initial?.seniorDirectorName ?? "");
  const [directorId, setDirectorId] = useState(initial?.directorId ?? "");
  const [directorCode, setDirectorCode] = useState(initial?.directorCode ?? "");
  const [directorName, setDirectorName] = useState(initial?.directorName ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">(
    initial?.partnerName ? "ok" : "idle",
  );
  const [error, setError] = useState("");

  function reset() {
    setPartnerId("");
    setPartnerName("");
    setSdId("");
    setSdCode("");
    setSdName("");
    setDirectorId("");
    setDirectorCode("");
    setDirectorName("");
  }

  async function resolve(raw: string) {
    const c = raw.trim();
    if (!c) {
      reset();
      setStatus("idle");
      setError("");
      return;
    }
    setStatus("loading");
    setError("");
    const res = await lookupSalesPerson(c);
    if (!res.ok || !res.partner) {
      reset();
      setStatus("error");
      setError(res.error ?? "Partner ID not found.");
      return;
    }
    setCode(res.partner.code ?? c);
    setPartnerId(res.partner.id);
    setPartnerName(res.partner.name);
    setSdId(res.seniorDirector?.id ?? "");
    setSdCode(res.seniorDirector?.code ?? "");
    setSdName(res.seniorDirector?.name ?? "");
    setDirectorId(res.director?.id ?? "");
    setDirectorCode(res.director?.code ?? "");
    setDirectorName(res.director?.name ?? "");
    setStatus("ok");
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Hidden fields submitted with the form */}
      <input type="hidden" name="partner_id" value={partnerId} />
      <input type="hidden" name="partner_code" value={partnerName ? code : ""} />
      <input type="hidden" name="partner_name" value={partnerName} />
      <input type="hidden" name="senior_director_id" value={sdId} />
      <input type="hidden" name="senior_director_code" value={sdCode} />
      <input type="hidden" name="senior_director_name" value={sdName} />
      <input type="hidden" name="director_id" value={directorId} />
      <input type="hidden" name="director_code" value={directorCode} />
      <input type="hidden" name="director_name" value={directorName} />

      <div>
        <label className="label">Partner ID *</label>
        <input
          className="input"
          value={code}
          placeholder="e.g. VPBP47"
          autoComplete="off"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onBlur={(e) => resolve(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              resolve((e.target as HTMLInputElement).value);
            }
          }}
        />
        {status === "loading" && (
          <p className="mt-1 text-xs text-[var(--muted)]">Looking up…</p>
        )}
        {status === "error" && (
          <p className="mt-1 text-xs text-red-500">{error}</p>
        )}
      </div>

      <div>
        <label className="label">Partner Name</label>
        <input
          className="input cursor-not-allowed bg-[var(--surface-2)] text-[var(--muted)]"
          value={partnerName}
          readOnly
          tabIndex={-1}
          aria-readonly
          placeholder="Auto-filled from Partner ID"
        />
      </div>

      <div>
        <label className="label">Senior Director ID</label>
        <input
          className="input cursor-not-allowed bg-[var(--surface-2)] text-[var(--muted)]"
          value={sdCode}
          readOnly
          tabIndex={-1}
          aria-readonly
          placeholder="Auto-filled"
        />
      </div>

      <div>
        <label className="label">Senior Director Name</label>
        <input
          className="input cursor-not-allowed bg-[var(--surface-2)] text-[var(--muted)]"
          value={sdName}
          readOnly
          tabIndex={-1}
          aria-readonly
          placeholder="Auto-filled"
        />
      </div>

      <div>
        <label className="label">Director ID</label>
        <input
          className="input cursor-not-allowed bg-[var(--surface-2)] text-[var(--muted)]"
          value={directorCode}
          readOnly
          tabIndex={-1}
          aria-readonly
          placeholder="Auto-filled"
        />
      </div>

      <div>
        <label className="label">Director Name</label>
        <input
          className="input cursor-not-allowed bg-[var(--surface-2)] text-[var(--muted)]"
          value={directorName}
          readOnly
          tabIndex={-1}
          aria-readonly
          placeholder="Auto-filled"
        />
      </div>
    </div>
  );
}
