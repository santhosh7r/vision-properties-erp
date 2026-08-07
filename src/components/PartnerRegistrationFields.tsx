"use client";

import { useState } from "react";
import { DISTRICTS } from "@/lib/options";

// The declaration the partner signs — verbatim from the VISION PROPERTIES
// Business Partner Registration Form.
export const DECLARATION =
  "I hereby declare that all the information provided above is true and correct to the best of my knowledge. I agree to abide by the policies, rules, commission structure, and terms and conditions of Vision Properties. I understand that Vision Properties reserves the right to approve, suspend, or terminate my partner registration at any time.";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Pre-fills used when an existing account completes its own registration. */
export interface RegistrationDefaults {
  full_name?: string | null;
  mobile?: string | null;
  whatsapp?: string | null;
  date_of_birth?: string | null;
  address?: string | null;
  district?: string | null;
  occupation?: string | null;
  rera_number?: string | null;
  nominee_name?: string | null;
  nominee_mobile?: string | null;
}

/**
 * The Partner Registration Form body — every field of the paper form, in its
 * original order and grouping. Rendered inside whatever <form> owns it, so the
 * "Add New Partner" page, the team tree's "Add member" modal and the
 * /complete-profile screen all show exactly the same fields; the matching
 * server-side validation lives in lib/partner-registration.ts.
 *
 * `showReference` is off when the parent is already fixed by the surrounding UI
 * (the tree modal adds beneath a specific node, and a Director / Manager picks a
 * manager from a list instead, so there is nothing to look up).
 *
 * `showEmail` is off on /complete-profile: the person filling it in is already
 * signed in, and their email IS their login — letting them retype it there would
 * be an unaudited way to change the credential they are authenticated by.
 */
export default function PartnerRegistrationFields({
  showReference = true,
  showEmail = true,
  defaults,
}: {
  showReference?: boolean;
  showEmail?: boolean;
  defaults?: RegistrationDefaults;
}) {
  // WhatsApp usually equals the mobile, so mirror it unless told otherwise.
  const [mobile, setMobile] = useState(defaults?.mobile ?? "");
  const [whatsapp, setWhatsapp] = useState(defaults?.whatsapp ?? "");
  // An account that already has a DIFFERENT WhatsApp number on file must not
  // have it silently overwritten by the mirror on first render.
  const [sameWhatsapp, setSameWhatsapp] = useState(
    !defaults?.whatsapp || defaults.whatsapp === defaults.mobile,
  );

  return (
    <>
      <Section title="Personal Details">
        <div>
          <label className="label">Full Name *</label>
          <input name="full_name" className="input" required defaultValue={defaults?.full_name ?? ""} />
        </div>
        <div>
          <label className="label">Date of Birth *</label>
          <input
            name="date_of_birth"
            type="date"
            className="input"
            required
            defaultValue={defaults?.date_of_birth ?? ""}
          />
        </div>
        <div>
          <label className="label">Mobile Number *</label>
          <input
            name="mobile"
            type="tel"
            inputMode="tel"
            className="input"
            required
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
          />
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <label className="label">WhatsApp Number *</label>
            <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={sameWhatsapp}
                onChange={(e) => setSameWhatsapp(e.target.checked)}
              />
              Same as mobile
            </label>
          </div>
          <input
            name="whatsapp"
            type="tel"
            inputMode="tel"
            className="input"
            required
            readOnly={sameWhatsapp}
            value={sameWhatsapp ? mobile : whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
          />
        </div>
        {showEmail && (
          <div>
            <label className="label">Email ID *</label>
            <input name="email" type="email" className="input" required />
            <p className="mt-1 text-xs text-[var(--muted)]">
              This is their sign-in ID. A temporary password is generated and shown once after you
              create the account.
            </p>
          </div>
        )}
        <div>
          <label className="label">Residential Address *</label>
          <textarea
            name="address"
            className="textarea"
            rows={3}
            required
            defaultValue={defaults?.address ?? ""}
          />
        </div>
        <div>
          <label className="label">District</label>
          <select name="district" className="select" defaultValue={defaults?.district ?? ""}>
            <option value="">— Select district —</option>
            {DISTRICTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Their sales panel shows this district&apos;s inventory first.
          </p>
        </div>
      </Section>

      <Section title="Professional Details">
        <div>
          <label className="label">Occupation</label>
          <input name="occupation" className="input" defaultValue={defaults?.occupation ?? ""} />
        </div>
        <div>
          <label className="label">RERA Registration Number</label>
          <input name="rera_number" className="input" defaultValue={defaults?.rera_number ?? ""} />
          <p className="mt-1 text-xs text-[var(--muted)]">Optional.</p>
        </div>
      </Section>

      <Section title="Nominee Details">
        <div>
          <label className="label">Nominee Name *</label>
          <input
            name="nominee_name"
            className="input"
            required
            defaultValue={defaults?.nominee_name ?? ""}
          />
        </div>
        <div>
          <label className="label">Nominee Mobile Number *</label>
          <input
            name="nominee_mobile"
            type="tel"
            inputMode="tel"
            className="input"
            required
            defaultValue={defaults?.nominee_mobile ?? ""}
          />
        </div>
      </Section>

      {showReference && (
        <Section title="Reference Details">
          <div>
            <label className="label">Reference ID</label>
            <input
              name="reference_code"
              className="input font-mono uppercase"
              placeholder="VPBM12"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="mt-1 text-xs text-[var(--muted)]">
              The partner ID of whoever referred them — this becomes the manager they report to.
              Leave blank to place them under you.
            </p>
          </div>
        </Section>
      )}

      <Section title="Declaration">
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border bg-[var(--surface-2)] p-3 text-xs leading-relaxed">
          <input type="checkbox" name="declaration" required className="mt-0.5 shrink-0" />
          <span>{DECLARATION}</span>
        </label>
      </Section>
    </>
  );
}

/**
 * Shown once after a partner is created — the generated password can never be
 * retrieved again, so this is the only chance to hand it over.
 */
export function NewPartnerCredentials({
  name,
  email,
  code,
  roleLabel,
  password,
}: {
  name: string;
  email: string;
  code: string | null;
  roleLabel: string;
  password?: string;
}) {
  return (
    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
      <h3 className="text-sm font-semibold">{name} created</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {roleLabel}
        {code && (
          <>
            {" · "}
            <span className="font-mono">{code}</span>
          </>
        )}
      </p>
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-xs text-[var(--muted)]">Email</dt>
          <dd className="font-mono">{email}</dd>
        </div>
        {password && (
          <div>
            <dt className="text-xs text-[var(--muted)]">Temporary password</dt>
            <dd className="font-mono text-base font-semibold">{password}</dd>
          </div>
        )}
      </dl>
      {password && (
        <p className="mt-3 text-xs text-[var(--muted)]">
          Share this with {name} now — it is generated once and cannot be shown again. Ask them to
          change it after their first sign-in.
        </p>
      )}
    </div>
  );
}
