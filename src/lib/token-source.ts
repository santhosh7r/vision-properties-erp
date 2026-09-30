import { fmtDate } from "./format";

// Where a coupon / token ledger row came from, and which plot it was for.
//
// Every row in `coupons` is stamped with what caused it (booking_id, plot_id,
// project_id, registration_id, service_request_id — see the
// coupon_source_links migration). plot_id / project_id are the plot AT ISSUE
// TIME, so a later plot transfer never rewrites history. Rows written before
// those columns existed were back-filled where the match was unambiguous; the
// rest still get their Source from the note, with no plot.

// Columns + embeds to add to a `coupons` select. Each FK is the only path from
// coupons to that table, so the embeds are unambiguous.
export const COUPON_SOURCE_SELECT =
  "booking_id, plot_id, registration_id, service_request_id, " +
  "plots(plot_no, block), projects(name), " +
  "bookings(receipt_no, customers(name)), " +
  "registrations(register_number), " +
  "service_requests(customer_name, visit_date)";

export interface CouponSourceFields {
  type: string;
  quantity: number;
  source: string;
  note: string | null;
  booking_id: string | null;
  plot_id: string | null;
  registration_id: string | null;
  service_request_id: string | null;
  plots: { plot_no: string; block: string | null } | null;
  projects: { name: string } | null;
  bookings: { receipt_no: string | null; customers: { name: string } | null } | null;
  registrations: { register_number: string } | null;
  service_requests: { customer_name: string | null; visit_date: string | null } | null;
}

export type TokenOrigin = "registration" | "booking_hold" | "site_visit" | "desk_issue" | "desk_redeem";

export const TOKEN_ORIGIN_LABELS: Record<TokenOrigin, string> = {
  registration: "Plot Registration",
  booking_hold: "Booking held > 48h",
  site_visit: "Site Visit (Cab)",
  desk_issue: "Issued by Desk",
  desk_redeem: "Redeemed by Desk",
};

export interface TokenSource {
  origin: TokenOrigin;
  originLabel: string;
  // The document behind it: register no., booking receipt, or visit date.
  reference: string;
  // "Project · Block A · Plot 12", or "" when no plot is linked.
  plot: string;
  customer: string;
  bookingId: string | null;
  registrationId: string | null;
}

const REG_NOTE = / · registration (.+)$/;

function originOf(c: CouponSourceFields): TokenOrigin {
  if (c.registration_id) return "registration";
  if (c.service_request_id) return "site_visit";
  if (c.source === "redeem") return "desk_redeem";
  if (c.source === "auto") {
    // Un-linked legacy rows: the note is all there is to go on.
    if (c.note && REG_NOTE.test(c.note)) return "registration";
    if (c.type === "cab" && Number(c.quantity) < 0) return "site_visit";
    return c.type === "cab" ? "booking_hold" : "registration";
  }
  return "desk_issue";
}

export function describeTokenSource(c: CouponSourceFields): TokenSource {
  const origin = originOf(c);

  let reference = "";
  if (origin === "registration") {
    const no = c.registrations?.register_number ?? c.note?.match(REG_NOTE)?.[1] ?? "";
    reference = no ? `Reg. ${no}` : "";
  } else if (origin === "site_visit" && c.service_requests?.visit_date) {
    reference = `Visit ${fmtDate(c.service_requests.visit_date)}`;
  }
  // A booking receipt is the most useful handle whenever there is one.
  const receipt = c.bookings?.receipt_no;
  if (receipt) reference = reference ? `${reference} · ${receipt}` : receipt;

  const plot = c.plots
    ? [c.projects?.name, c.plots.block ? `Block ${c.plots.block}` : null, `Plot ${c.plots.plot_no}`]
        .filter(Boolean)
        .join(" · ")
    : (c.projects?.name ?? "");

  return {
    origin,
    originLabel: TOKEN_ORIGIN_LABELS[origin],
    reference,
    plot,
    customer: c.bookings?.customers?.name ?? c.service_requests?.customer_name ?? "",
    bookingId: c.booking_id,
    registrationId: c.registration_id,
  };
}
