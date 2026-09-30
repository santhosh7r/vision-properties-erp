import { isSalesRole, type Role } from "./roles";

// ---------------------------------------------------------------------------
// BILL VERIFICATION — no bill (booking or payment receipt) is printed for a
// deal raised by a sales role until Admin, or a desk acting for Admin
// (`confirm_booking`), has verified its customer and plot details.
//
//   • Raised by staff (Admin / GM / a desk) → verified at creation: staff enter
//     and check the details themselves.
//   • Raised by a sales role → unverified. The blocking amount is still
//     collected and recorded; only the bill waits.
//   • Verified by Confirming the booking, or by "Verify details".
//   • If a sales role later changes what was verified (customer or booking
//     details, or the plot by transfer), verification is withdrawn and has to
//     be given again — a bill never prints details nobody checked.
// Enforced server-side on every receipt page and PDF (app/receipts/data.ts);
// the buttons are only hidden to match.
// ---------------------------------------------------------------------------

export const BILL_PENDING_NOTE = "Bill available once Admin verifies the customer and plot details.";

/** Can a bill be printed for this booking? */
export function billReady(b: { bill_verified_at?: string | null }): boolean {
  return !!b.bill_verified_at;
}

/** Does a booking raised (or changed) by this role need Admin verification? */
export function needsBillVerification(role: Role): boolean {
  return isSalesRole(role);
}
