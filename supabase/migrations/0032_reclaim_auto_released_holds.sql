-- ============================================================================
-- 0032 — Take back the holds the old sweep auto-released
--
-- Nothing may return to inventory without an Admin. The previous lazy sweep did
-- exactly that: on passing its deadline a hold was CANCELLED and its plot pushed
-- straight back to 'available', with no decision from anyone. The sweep no
-- longer does this (it only stamps `expired_at`), but the rows it already
-- released are still sitting cancelled with their plots back on the market.
--
-- This migration undoes those automatic releases:
--   · the booking goes back to the status it held before expiry
--     (`pre_expiry_status`, or 'pending' for older rows that never recorded one)
--   · `released_at` is cleared — it was never really released
--   · `expired_at` is KEPT, so the hold stays on the Plot Release queue, where
--     the Admin now has both moves: Extend it, or Release the plot for real
--   · the plot leaves inventory again, as blocked/booked to match `book_mode`
--
-- WHAT IT DELIBERATELY DOES NOT TOUCH ---------------------------------------
--   · Admin releases and cancellations. Only the sweep's own fingerprint is
--     matched: cancelled + expired, no cancellation_reason, and released_at
--     equal to expired_at (the sweep wrote both from the same timestamp).
--     `releasePlot` stamps a reason ("Released by admin"), `cancelBooking`
--     stamps a reason and a refund — neither matches.
--   · Any plot somebody has claimed since. A plot with a live pending/confirmed
--     booking is skipped outright (restoring would collide with
--     uniq_active_booking_per_plot anyway), as is any plot that is no longer
--     'available' — registered, sold or cancelled plots keep their state.
--   · Second and later holds on the same plot: only the most recently expired
--     one per plot is taken back, since only one may be active at a time.
--
-- Written as ONE statement on purpose. The Supabase SQL editor does not carry a
-- temporary table across statements, so the plot update and the booking update
-- are chained as data-modifying CTEs instead — both read the same `reclaim`
-- snapshot, and Postgres runs every data-modifying CTE exactly once whether or
-- not the outer query reads its output.
--
-- Re-runnable: once a row is restored it is no longer 'cancelled', so a second
-- run matches nothing.
-- ============================================================================

with reclaim as (
  select distinct on (b.plot_id)
         b.id,
         b.plot_id,
         b.book_mode,
         coalesce(b.pre_expiry_status, 'pending'::booking_status) as restore_status
    from bookings b
    join plots p on p.id = b.plot_id
   where b.status = 'cancelled'
     and b.expired_at is not null
     -- the sweep's fingerprint: released with no human reason attached
     and b.cancellation_reason is null
     and b.released_at = b.expired_at
     -- only a plot that is genuinely still free may be taken back
     and p.status = 'available'
     and not exists (
       select 1
         from bookings o
        where o.plot_id = b.plot_id
          and o.status in ('pending', 'confirmed')
     )
   order by b.plot_id, b.expired_at desc
),
-- The plot comes off the market again, matching what the hold was.
plot_taken_back as (
  update plots p
     set status = case when r.book_mode = 'blocking'
                       then 'blocked'::plot_status
                       else 'booked'::plot_status
                  end
    from reclaim r
   where p.id = r.plot_id
  returning p.id
)
-- The hold goes live again, still flagged as expired so it stays on the queue.
update bookings b
   set status      = r.restore_status,
       released_at = null
  from reclaim r
 where b.id = r.id;
