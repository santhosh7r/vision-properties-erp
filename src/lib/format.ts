// Formatting + small domain helpers shared across the UI.

// Short, human-readable reference derived from a record's unique id (UUID).
// Every blocking / booking / registration is a distinct record, so this makes
// each one visibly unique — even when the plot number, name or amounts match —
// without inventing a new identifier to manage. Booking → its registration
// share this Ref so one code traces the whole journey.
export function shortRef(id: string | null | undefined): string {
  if (!id) return "—";
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

// Money and rates are shown at FULL precision — never rounded to whole rupees.
// A per-sq.ft coupon rate of 4.589363 must read back as ₹4.589363, while a flat
// 4 still reads as ₹4 (no padded ".00"), so the fraction digits float between
// 0 and MAX_DECIMALS.
//
// MAX_DECIMALS is 10 rather than unlimited purely to absorb IEEE-754 noise:
// 4.589363 × 1200 evaluates to 5507.235599999999 in float, which would render
// as a broken-looking amount at full width but is exactly ₹5,507.2356 here.
// Ten digits is far beyond any figure entered in this system, so nothing a user
// types is ever truncated.
const MAX_DECIMALS = 10;

// IEEE-754 doubles cannot represent most decimal fractions exactly, so ordinary
// arithmetic leaks noise far below a paisa: 709.3 x 700 evaluates to
// 496509.99999999994 and 721.2 x 700 to 504840.00000000006. Printed at full
// width those read back as "₹4,96,509.9999999999" / "₹5,04,840.0000000001".
//
// That noise always lives in the 16th-17th significant digit, so rounding to
// SIGNIFICANT_DIGITS clears it while keeping every digit anyone actually enters:
// 4.589363 x 1200 stays exactly 5507.2356, and a ₹9-crore figure still has four
// decimals of headroom. MAX_DECIMALS then caps the printed width.
const SIGNIFICANT_DIGITS = 12;

// Strip float noise from a computed amount. Applied on BOTH sides: to values
// before they are written to the DB, and again at format time so rows already
// stored with noise (written before this existed) still read clean.
export function exact(value: number | null | undefined): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n === 0) return 0;
  return Number(n.toPrecision(SIGNIFICANT_DIGITS));
}

export function inr(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: MAX_DECIMALS,
  }).format(exact(value));
}

export function num(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: MAX_DECIMALS,
  }).format(exact(value));
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Time remaining until a deadline, human readable. Negative -> "Expired".
export function timeLeft(deadline: string | null | undefined): string {
  if (!deadline) return "—";
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d ${hours % 24}h left`;
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${mins}m left`;
}

export function isExpired(deadline: string | null | undefined): boolean {
  if (!deadline) return false;
  return new Date(deadline).getTime() <= Date.now();
}

export function totalPlotValue(sqft: number, pricePerSqft: number): number {
  return exact((sqft || 0) * (pricePerSqft || 0));
}

// Indian-style amount in words, e.g. 125000 -> "One Lakh Twenty Five Thousand
// Rupees Only". Used on the printable booking receipt.
export function amountInWords(value: number | null | undefined): string {
  // exact() first: 496509.99999999994 must read "Four Lakh Ninety Six Thousand
  // Five Hundred Ten", not floor down to ...Nine.
  let n = Math.floor(exact(value));
  if (!Number.isFinite(n) || n <= 0) return "Zero Rupees Only";

  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number): string =>
    x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ` ${ones[x % 10]}` : ""}`;
  const three = (x: number): string => {
    const h = Math.floor(x / 100);
    const r = x % 100;
    return `${h ? `${ones[h]} Hundred${r ? " " : ""}` : ""}${r ? two(r) : ""}`;
  };

  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${two(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  return `${parts.join(" ").trim()} Rupees Only`;
}

// Whole years between a date-of-birth and today.
export function ageFrom(dob: string | null | undefined): string {
  if (!dob) return "";
  const d = new Date(dob);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 150 ? String(age) : "";
}

// Compact INR for KPI tiles: ₹1.2Cr, ₹45.0L, ₹80.0K.
export function inrCompact(value: number | null | undefined): string {
  const n = exact(value);
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return inr(n);
}

// Compact area in square feet for KPI tiles / charts: 1.25M sqft, 45.0K sqft.
export function sqftCompact(value: number | null | undefined): string {
  const n = Math.round(exact(value));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M sqft`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K sqft`;
  return `${n} sqft`;
}

// Full area in square feet, e.g. "1,200 sqft" / "1,200.75 sqft". Used in table
// cells. Fractional extents are kept — they feed the ₹-per-sq.ft math.
export function sqft(value: number | null | undefined): string {
  return `${num(Number(value || 0))} sqft`;
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return "—";
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
