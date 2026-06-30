import "server-only";
import { getSupabase } from "./supabase";
import { notify } from "./audit";

// ---------------------------------------------------------------------------
// Lazy expiry sweep (board flow):
//   - Blocking not converted within window  -> "land will be return"
//   - Booking advance/full not paid in time -> "land is back to company"
// Any pending booking whose `expires_at` has passed and which is NOT fully
// paid is released: the plot goes back to 'available' and the booking is
// cancelled. Runs cheaply on bookings/plots list loads.
// ---------------------------------------------------------------------------
export async function sweepExpiredBookings(): Promise<number> {
  const sb = getSupabase();
  const nowIso = new Date().toISOString();

  // Piggy-back the cab-token grant on the same lazy sweep so it runs on every
  // bookings/plots list load (this function has early returns below, so issuing
  // here guarantees coverage regardless of whether anything is expiring).
  await sweepCabTokens();

  const { data: expired } = await sb
    .from("bookings")
    .select("id, plot_id, payment_status, total_plot_value, advance_paid, customer_id")
    .eq("status", "pending")
    .not("expires_at", "is", null)
    .lt("expires_at", nowIso);

  if (!expired || expired.length === 0) return 0;

  // Fully paid bookings are never auto-released even if a window passed.
  const toRelease = expired.filter((b) => b.payment_status !== "completed");
  if (toRelease.length === 0) return 0;

  // Release in parallel — this sweep is awaited before several list pages
  // render, so a serial loop would add one round-trip per expired booking to
  // every page load.
  await Promise.all(
    toRelease.map(async (b) => {
      await sb
        .from("bookings")
        .update({ status: "cancelled", released_at: nowIso })
        .eq("id", b.id);

      await sb
        .from("plots")
        .update({ status: "available" })
        .eq("id", b.plot_id);

      await notify(
        b.id,
        "sms",
        null,
        "Your hold has expired and the plot has been released back to Vision Properties.",
      );
    }),
  );
  return toRelease.length;
}

// ---------------------------------------------------------------------------
// Cab-token auto-issuance sweep (SOP §Cab Tokens):
//   "auto-issue 3 tokens per booking/blocking held > 48h"
// Any active blocking/booking that has survived 48h and carries a Director on
// its sales chain grants that Director 3 cab tokens — exactly once per booking
// (guarded by `cab_tokens_issued`). Senior Directors are unlimited, so the
// chain's Director is the only beneficiary. Runs lazily alongside the expiry
// sweep on bookings/plots list loads.
// ---------------------------------------------------------------------------
export async function sweepCabTokens(): Promise<number> {
  const sb = getSupabase();
  const cutoff = new Date(Date.now() - 48 * 3_600_000).toISOString();

  const { data: due } = await sb
    .from("bookings")
    .select("id, director_id, book_mode")
    .in("status", ["pending", "confirmed"])
    .eq("cab_tokens_issued", false)
    .not("director_id", "is", null)
    .lt("created_at", cutoff);

  if (!due || due.length === 0) return 0;

  let issued = 0;
  await Promise.all(
    due.map(async (b) => {
      // Claim the booking first (and only if still unissued) so two concurrent
      // sweeps on parallel page loads can never double-grant the tokens.
      const { data: claimed } = await sb
        .from("bookings")
        .update({ cab_tokens_issued: true })
        .eq("id", b.id)
        .eq("cab_tokens_issued", false)
        .select("id")
        .maybeSingle();
      if (!claimed) return;

      await sb.from("coupons").insert({
        user_id: b.director_id,
        type: "cab",
        quantity: 3,
        value: 0,
        source: "auto",
        note: `Cab tokens · ${b.book_mode} held > 48h`,
        issued_by: null,
      });
      issued += 1;
    }),
  );
  return issued;
}
