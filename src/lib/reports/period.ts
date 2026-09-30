// A reporting month, in India time.
//
// The business runs on IST (UTC+5:30, no DST) but the server may run in UTC, so
// month edges are computed explicitly: a payment at 00:30 IST on 1 October is an
// October payment even though it is 30 September in UTC. Two kinds of column:
//   • timestamptz (created_at, paid_at, released_at…) → compared against the
//     UTC instants of IST midnight, `startIso` ≤ t < `endIso`;
//   • date (register_date, visit_date, booked_date) → already a calendar day,
//     compared as strings, `startDate` ≤ d < `endDate`.

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface ReportPeriod {
  key: string; // "2026-09"
  label: string; // "September 2026"
  startIso: string;
  endIso: string;
  startDate: string; // "2026-09-01"
  endDate: string; // "2026-10-01" (exclusive)
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The current month in IST, as "YYYY-MM". */
export function currentMonthKey(now = Date.now()): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 7);
}

/** Today in IST, as "YYYY-MM-DD". */
export function istToday(now = Date.now()): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Parse "YYYY-MM" into a period. Null for anything malformed or in the future —
 * a future month can only ever be empty, and saying so is clearer than an empty
 * file.
 */
export function parseMonth(key: string | null | undefined, now = Date.now()): ReportPeriod | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key ?? "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (y < 2000 || mo < 1 || mo > 12) return null;
  if (key! > currentMonthKey(now)) return null;

  const ny = mo === 12 ? y + 1 : y;
  const nmo = mo === 12 ? 1 : mo + 1;
  return {
    key: key!,
    label: `${MONTH_NAMES[mo - 1]} ${y}`,
    startIso: new Date(Date.UTC(y, mo - 1, 1) - IST_OFFSET_MS).toISOString(),
    endIso: new Date(Date.UTC(ny, nmo - 1, 1) - IST_OFFSET_MS).toISOString(),
    startDate: `${y}-${pad(mo)}-01`,
    endDate: `${ny}-${pad(nmo)}-01`,
  };
}

/** Is this timestamptz inside the period? */
export function tsInPeriod(iso: string | null | undefined, p: ReportPeriod): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= new Date(p.startIso).getTime() && t < new Date(p.endIso).getTime();
}

/** Is this date column (YYYY-MM-DD) inside the period? */
export function dateInPeriod(d: string | null | undefined, p: ReportPeriod): boolean {
  if (!d) return false;
  const day = d.slice(0, 10);
  return day >= p.startDate && day < p.endDate;
}
