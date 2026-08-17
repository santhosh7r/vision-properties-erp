import "server-only";
import { fmtDate } from "@/lib/format";
import type { Booking, Customer, Plot, Project } from "@/lib/types";

// Shared field-building for both receipt routes, so a booking receipt and a
// payment receipt describe the same customer, plot and sales chain identically.

export function fmtDateOrBlank(v: string | null | undefined): string {
  if (!v) return "";
  const d = fmtDate(v);
  return d === "—" ? "" : d;
}

// Deterministic, human-quotable receipt numbers. A booking keeps one number for
// its life; each payment gets its own, suffixed so the two can never collide.
export function bookingReceiptNo(bookingId: string): string {
  return `VPT${bookingId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}
export function paymentReceiptNo(bookingId: string, paymentId: string): string {
  return `${bookingReceiptNo(bookingId)}-${paymentId.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

export function customerBlock(c: Customer | null | undefined) {
  return {
    name: c?.name ?? "",
    // Not captured anywhere yet — left blank so it prints as a line to write on,
    // exactly as the paper form does.
    fatherOrSpouse: "",
    email: c?.email ?? "",
    phone: c?.mobile ?? "",
    address: [c?.street, c?.area, c?.district, c?.state, c?.pincode, c?.country].filter(Boolean).join(", "),
    anniversary: "",
    dob: fmtDateOrBlank(c?.dob),
    occupation: c?.occupation ?? "",
  };
}

export function plotBlock(b: Booking & { plots?: Plot | null; projects?: Project | null }) {
  const p = b.plots;
  const proj = b.projects;
  return {
    project: proj?.name ?? "",
    location: [proj?.city, proj?.district].filter(Boolean).join(", "),
    plotNo: p?.plot_no ?? "",
    sector: p?.block ?? b.block ?? "",
    totalSqft: b.plot_sqft ?? p?.sqft ?? null,
  };
}

// "Name (CODE)" for the two people printed on the receipt, blank when unknown.
export function salesChain(b: Booking) {
  const join = (name: string | null, code: string | null) =>
    name ? (code ? `${name} (${code})` : name) : code ?? "";
  return {
    director: join(b.director_name, b.director_code),
    partner: join(b.partner_name, b.partner_code),
  };
}

export const PAYMENT_KIND_LABEL: Record<string, string> = {
  blocking: "Blocking Amount",
  advance: "Advance",
  installment: "Installment",
  final: "Final Payment",
};
