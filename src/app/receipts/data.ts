import "server-only";
import { fmtDate, fmtDateTime, ageFrom, num, amountInWords } from "@/lib/format";
import { getSupabase } from "@/lib/supabase";
import type { Booking, Customer, Payment, Plot, Project } from "@/lib/types";
import type { ReceiptFields } from "@/lib/receipt-pdf";

// Builds the values that go onto `public/receipt.pdf` — the office's own printed
// stationery. Both receipt kinds are shaped here so a booking receipt and a
// payment receipt describe the same customer, plot and sales chain identically.
//
// Field NAMES here match the blanks the form prints; nothing is invented, and
// anything the form has no line for is deliberately left out rather than
// squeezed in somewhere it does not belong.

export function fmtDateOrBlank(v: string | null | undefined): string {
  if (!v) return "";
  const d = fmtDate(v);
  return d === "—" ? "" : d;
}

// The number the customer is handed. It comes from the database, which allocates
// it once when the record is created and never recalculates it — a booking keeps
// VPO3377 for life, and each payment under it prints VPO3377-1, VPO3377-2, so a
// bill says which deal the money belongs to and where it sits in the run.
//
// The fallbacks below derive a number from the record's UUID, the way every
// receipt was numbered before the register existed. They exist for one case: a
// record written before migration 0037 was applied, or against a database that
// has not had it applied yet. A receipt must print SOMETHING unique in the
// number box rather than a blank, so an old bill stays as traceable as it ever
// was; anything created since carries a register number.
export function bookingReceiptNo(booking: { id: string; receipt_no?: string | null }): string {
  return booking.receipt_no || `VPT${booking.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export function paymentReceiptNo(
  booking: { id: string; receipt_no?: string | null },
  payment: { id: string; receipt_no?: string | null },
): string {
  return (
    payment.receipt_no ||
    `${bookingReceiptNo(booking)}-${payment.id.replace(/-/g, "").slice(0, 4).toUpperCase()}`
  );
}

export const PAYMENT_KIND_LABEL: Record<string, string> = {
  blocking: "Blocking Amount",
  advance: "Advance",
  installment: "Installment",
  final: "Final Payment",
};

type FullBooking = Booking & { plots: Plot | null; customers: Customer | null; projects: Project | null };

// The blocks of the form that read the same on either receipt.
function commonFields(b: FullBooking): Omit<ReceiptFields, "receiptNo" | "date"> {
  const c = b.customers;
  const p = b.plots;
  const proj = b.projects;
  const join = (name: string | null, code: string | null) =>
    name ? (code ? `${name} (${code})` : name) : code ?? "";
  const sqft = b.plot_sqft ?? p?.sqft ?? null;

  return {
    name: c?.name ?? "",
    age: ageFrom(c?.dob),
    // Not captured anywhere yet — left blank so it prints as a line to write on,
    // exactly as the paper form does.
    fatherOrSpouse: "",
    email: c?.email ?? "",
    phone: c?.mobile ?? "",
    nominee: b.nominee_name ?? "",
    address: [c?.street, c?.area, c?.district, c?.state, c?.pincode, c?.country].filter(Boolean).join(", "),
    anniversary: fmtDateOrBlank(c?.anniversary_date),
    dob: fmtDateOrBlank(c?.dob),
    occupation: c?.occupation ?? "",
    project: proj?.name ?? "",
    location: [proj?.city, proj?.district].filter(Boolean).join(", "),
    plotNo: p?.plot_no ?? "",
    sector: p?.block ?? b.block ?? "",
    totalSqft: sqft != null ? num(sqft) : "",
    tentativeRegDate: fmtDateOrBlank(b.tentative_registration_date),
    directorNameId: join(b.director_name, b.director_code),
    partnerNameId: join(b.partner_name, b.partner_code),
  };
}

const BOOKING_SELECT = "*, plots(*), customers(*), projects(*)";

// ---------------------------------------------------------------------------
// The BOOKING / BLOCKING receipt — the deal as a whole.
// ---------------------------------------------------------------------------
export async function bookingReceiptFields(bookingId: string): Promise<ReceiptFields | null> {
  const sb = getSupabase();
  const { data } = await sb.from("bookings").select(BOOKING_SELECT).eq("id", bookingId).maybeSingle();
  if (!data) return null;
  const b = data as FullBooking;

  // `advance_paid` is the running total from the ledger (see recomputePayment),
  // so a fully-paid deal shows the whole amount against the form's "Advance
  // Amount" line — that line is what the stationery prints, and it is the sum
  // the customer has actually handed over either way.
  const paid = Number(b.advance_paid || 0) || Number(b.blocking_amount || 0);

  return {
    ...commonFields(b),
    receiptNo: bookingReceiptNo(b),
    date: fmtDate(b.booked_date ?? b.created_at),
    amount: paid ? num(paid) : "",
    mode: b.mode_of_payment ?? "",
    amountWords: paid ? amountInWords(paid) : "",
  };
}

// ---------------------------------------------------------------------------
// A receipt for ONE money entry — the blocking amount, the advance, an
// installment, the final payment. Printable at any time from the Payments table
// on the booking (and from the Payments list), so every rupee taken has its own
// bill on demand rather than only at the moment it was recorded.
// ---------------------------------------------------------------------------
export async function paymentReceiptFields(paymentId: string): Promise<ReceiptFields | null> {
  const sb = getSupabase();
  const { data } = await sb
    .from("payments")
    .select(`*, bookings(${BOOKING_SELECT})`)
    .eq("id", paymentId)
    .maybeSingle();
  if (!data) return null;
  const pay = data as Payment & { bookings: FullBooking | null };
  const b = pay.bookings;
  if (!b) return null;

  const amount = Number(pay.amount || 0);
  const kind = PAYMENT_KIND_LABEL[pay.kind] ?? pay.kind;

  return {
    ...commonFields(b),
    receiptNo: paymentReceiptNo(b, pay),
    date: fmtDateTime(pay.paid_at),
    amount: amount ? num(amount) : "",
    // The form prints one "Payment Mode" line and no line for what the money was
    // for, so the two travel together there rather than going unrecorded.
    mode: [pay.mode, kind ? `(${kind})` : ""].filter(Boolean).join(" "),
    amountWords: amount ? amountInWords(amount) : "",
  };
}
