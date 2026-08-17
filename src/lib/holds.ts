import type { BookingStatus, PlotStatus } from "./types";

// ---------------------------------------------------------------------------
// Expired holds — what the Admin sees vs. what everyone else sees.
//
// A hold that passes its deadline is NOT released any more (see
// sweepExpiredBookings): it stays live, keeps its plot, and waits on the Plot
// Release page for an Admin to either extend it or release the plot for real.
//
// That decision is the Admin's business alone. To every other role the deadline
// passing must look exactly like the old automatic release did — the deal is
// over and the land went back to the company — so their views run each row
// through the mask below instead of showing the true state. Nothing here writes
// anything; it only changes what is rendered.
// ---------------------------------------------------------------------------

// Stamped as the cancellation reason when an Admin releases a plot from Plot
// Release, which is what separates a release from a customer cancellation (that
// one carries a real reason and a refund) in the release history.
export const RELEASED_BY_ADMIN = "Released by admin";

export interface HoldLike {
  status: BookingStatus | string;
  expired_at?: string | null;
}

// A hold the sweep has flagged as past its deadline and which no one has
// actioned yet — still live underneath, and only an Admin may see that.
export function isFlaggedExpired(b: HoldLike): boolean {
  return Boolean(b.expired_at) && b.status !== "cancelled";
}

// True when this viewer must be shown the "it auto-released" story.
export function readsAsReleased(b: HoldLike, isAdmin: boolean): boolean {
  return !isAdmin && isFlaggedExpired(b);
}

// The booking status to RENDER. Admin gets the truth; everyone else gets
// 'cancelled', which is what the old sweep actually wrote — so every list,
// badge and action gate that already keys off 'cancelled' behaves as though the
// hold really had lapsed.
export function shownStatus(b: HoldLike, isAdmin: boolean): BookingStatus {
  return readsAsReleased(b, isAdmin) ? "cancelled" : (b.status as BookingStatus);
}

// The plot status to RENDER alongside a masked booking. 'cancelled' is the one
// value that means "still reserved, waiting on an admin release", so a masked
// row must never show it — the plot has to read as gone back to the company.
export function shownPlotStatus(
  b: HoldLike,
  plotStatus: PlotStatus | string | null,
  isAdmin: boolean,
): PlotStatus | string | null {
  return readsAsReleased(b, isAdmin) ? "available" : plotStatus;
}
