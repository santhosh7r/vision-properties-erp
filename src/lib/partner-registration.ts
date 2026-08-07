// ============================================================================
// Partner Registration Form — shared server-side pieces.
//
// Every sales role — Senior Director, Director, Business Manager and Business
// Partner (see REGISTRATION_ROLES) — is onboarded through the full VISION
// PROPERTIES paper form (personal / professional / nominee / declaration), NOT
// the short name-email-password row staff accounts use. Three screens now feed
// it — the "Add New Partner" page, the "Add member" modal on the team tree, and
// /complete-profile where an existing account fills in its own missing details —
// so the field list, the validation and the password rule live here once
// instead of drifting apart across three action files.
//
// SERVER ONLY: imports node:crypto. Never import this from a client component —
// the matching form UI is <PartnerRegistrationFields>.
// ============================================================================

import { randomInt } from "node:crypto";
import { getSupabase } from "./supabase";
import { requiresRegistration, type Role } from "./roles";

// Columns added by migration 0025. NULL for every non-sales role.
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

// ── Completing an account created before the form existed ───────────────────

/**
 * The details an account MUST hold before it may use the app, paired with the
 * label shown when one is missing. Occupation and RERA number are absent on
 * purpose — the form marks them optional, and the gate must demand exactly what
 * the form demands or a user could be locked out with nothing left to fill in.
 */
const REQUIRED_FOR_ENTRY = [
  ["mobile", "Mobile number"],
  ["date_of_birth", "Date of birth"],
  ["whatsapp", "WhatsApp number"],
  ["address", "Residential address"],
  ["nominee_name", "Nominee name"],
  ["nominee_mobile", "Nominee mobile number"],
  ["declared_at", "Signed declaration"],
] as const;

export type RegistrationRow = Partial<Record<(typeof REQUIRED_FOR_ENTRY)[number][0], unknown>>;

/** Which required details this row is still missing, as human-readable labels. */
export function registrationGaps(row: RegistrationRow | null): string[] {
  if (!row) return REQUIRED_FOR_ENTRY.map(([, label]) => label);
  return REQUIRED_FOR_ENTRY.filter(([key]) => {
    const v = row[key];
    return v === null || v === undefined || String(v).trim() === "";
  }).map(([, label]) => label);
}

/**
 * Gate for the app layout: a sales account with an incomplete registration is
 * sent to /complete-profile and cannot reach anything else.
 *
 * Fails OPEN on a database error. A transient outage locking every partner out
 * of the app would be a worse failure than briefly admitting one whose details
 * are incomplete — and the completion form is still reachable either way.
 */
export async function needsRegistration(userId: string, role: Role): Promise<boolean> {
  if (!requiresRegistration(role)) return false;
  try {
    const { data, error } = await getSupabase()
      .from("users")
      .select("mobile, date_of_birth, whatsapp, address, nominee_name, nominee_mobile, declared_at")
      .eq("id", userId)
      .maybeSingle();
    if (error) return false;
    return registrationGaps(data as RegistrationRow | null).length > 0;
  } catch {
    return false;
  }
}
