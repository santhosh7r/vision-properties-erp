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

// The plot's category IS its type (COMMERCIAL / ELITE / PREMIUM / SIGNATURE …),
// which is what the form's "Sector" box prints — see the note at `sector` below.
type PlotWithType = Plot & { plot_categories: { name: string } | null };

type FullBooking = Booking & {
  plots: PlotWithType | null;
  customers: Customer | null;
  projects: Project | null;
};

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
    // The stationery's "Sector" box is the plot's TYPE — its category on the
    // project (COMMERCIAL / ELITE / PREMIUM / SIGNATURE …).
    //
    // It used to print `block`, which is why the box came out empty on every
    // bill: migration 0004 removed Block from plot identity and stopped
    // collecting it, so no plot created since has one. `block` is still read as
    // a fallback for the legacy rows that do.
    sector: p?.plot_categories?.name ?? p?.block ?? b.block ?? "",
    totalSqft: sqft != null ? num(sqft) : "",
    tentativeRegDate: fmtDateOrBlank(b.tentative_registration_date),
    directorNameId: join(b.director_name, b.director_code),
    partnerNameId: join(b.partner_name, b.partner_code),
  };
}

// plot_categories is embedded through plots.plot_category_id — the plot's type,
// printed in the form's "Sector" box.
const BOOKING_SELECT = "*, plots(*, plot_categories(name)), customers(*), projects(*)";

// ---------------------------------------------------------------------------
// The BOOKING / BLOCKING receipt — the deal as a whole.
// ---------------------------------------------------------------------------
export async function bookingReceiptFields(bookingId: string): Promise<ReceiptFields | null> {
  const sb = getSupabase();
  const { data } = await sb.from("bookings").select(BOOKING_SELECT).eq("id", bookingId).maybeSingle();
  if (!data) return null;
  const b = data as FullBooking;

  // A bill is a receipt for ONE collection — the money handed over at the moment
  // it is issued — so this one prints the payment taken when the deal was struck
  // (the blocking amount, or the advance), and nothing else. Every later
  // installment has its own receipt under the Payments table.
  //
  // It used to print `advance_paid`, the running LEDGER TOTAL kept by
  // recomputePayment. That made the booking bill grow with every later payment:
  // a deal that took ₹10,000 to block and ₹2,08,385 afterwards reprinted as a
  // ₹2,18,385 receipt, claiming to acknowledge money this bill never took.
  const { data: firstPayment } = await sb
    .from("payments")
    .select("amount, mode")
    .eq("booking_id", bookingId)
    .eq("status", "completed")
    .order("paid_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const first = firstPayment as { amount: number; mode: string | null } | null;

  // No ledger row at all (a record written before payments were tracked): fall
  // back to what the deal says it took, as this receipt always did.
  const paid = Number(first?.amount || 0) || Number(b.blocking_amount || 0) || Number(b.advance_paid || 0);

  return {
    ...commonFields(b),
    receiptNo: bookingReceiptNo(b),
    date: fmtDate(b.booked_date ?? b.created_at),
    amount: paid ? num(paid) : "",
    // The mode of THAT collection. `mode_of_payment` on the booking is
    // overwritten by every later payment (see recordPayment), so using it here
    // would label this bill with a mode belonging to a different collection.
    mode: first?.mode ?? b.mode_of_payment ?? "",
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
