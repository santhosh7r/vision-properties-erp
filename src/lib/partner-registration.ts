// ============================================================================
// Business Partner Registration Form — shared server-side pieces.
//
// A Business Partner is onboarded through the full VISION PROPERTIES paper form
// (personal / professional / nominee / declaration), NOT the short
// name-email-password row every other role uses. Two screens create partners —
// the "Add New Partner" page and the "Add member" modal on the team tree — so
// the field list, the validation and the password rule live here once instead
// of drifting apart in two action files.
//
// SERVER ONLY: imports node:crypto. Never import this from a client component —
// the matching form UI is <PartnerRegistrationFields>.
// ============================================================================

import { randomInt } from "node:crypto";

// Columns added by migration 0025. NULL for every non-partner role.
export interface PartnerFields {
  date_of_birth: string | null;
  whatsapp: string | null;
  address: string | null;
  occupation: string | null;
  rera_number: string | null;
  nominee_name: string | null;
  nominee_mobile: string | null;
  declared_at: string | null;
}

export const EMPTY_PARTNER_FIELDS: PartnerFields = {
  date_of_birth: null,
  whatsapp: null,
  address: null,
  occupation: null,
  rera_number: null,
  nominee_name: null,
  nominee_mobile: null,
  declared_at: null,
};

// Unambiguous alphabet — no 0/O/1/l/I, because the admin reads this password out
// loud or copies it into a message for the new partner.
const PW_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A partner never types their own password — it is generated and shown once. */
export function generatePassword(len = 10): string {
  let out = "";
  for (let i = 0; i < len; i++) out += PW_ALPHABET[randomInt(PW_ALPHABET.length)];
  return out;
}

function s(v: FormDataEntryValue | null): string {
  return String(v || "").trim();
}

/**
 * Pull + validate the registration fields off a submitted form.
 * Returns `{ error }` with a human-readable message, or `{ fields }` ready to
 * spread into the users insert. `mobile` is validated here too because the
 * WhatsApp number defaults to it on the form.
 */
export function readPartnerFields(
  formData: FormData,
  mobile: string | null,
): { error: string } | { fields: PartnerFields } {
  const date_of_birth = s(formData.get("date_of_birth"));
  const whatsapp = s(formData.get("whatsapp"));
  const address = s(formData.get("address"));
  const nominee_name = s(formData.get("nominee_name"));
  const nominee_mobile = s(formData.get("nominee_mobile"));

  if (!mobile) return { error: "Mobile number is required." };
  if (!date_of_birth) return { error: "Date of birth is required." };
  if (!whatsapp) return { error: "WhatsApp number is required." };
  if (!address) return { error: "Residential address is required." };
  if (!nominee_name || !nominee_mobile) {
    return { error: "Nominee name and nominee mobile number are required." };
  }
  // The declaration is a signature — never create the partner without it.
  if (s(formData.get("declaration")) !== "on") {
    return { error: "The declaration must be accepted before creating the partner." };
  }

  return {
    fields: {
      date_of_birth,
      whatsapp,
      address,
      occupation: s(formData.get("occupation")) || null,
      rera_number: s(formData.get("rera_number")) || null,
      nominee_name,
      nominee_mobile,
      declared_at: new Date().toISOString(),
    },
  };
}
