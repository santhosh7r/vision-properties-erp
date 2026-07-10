-- ============================================================================
-- 0023 — Expiry release + admin extend
--
-- When a blocking/booking passes its deadline the lazy sweep now releases the
-- plot straight back to 'available' (anyone may block/book it again) AND records
-- the fact so the hold surfaces on Plot Release, where an Admin can EXTEND it
-- back to the original customer — but only while the plot is still free.
--
--   expired_at         when the hold auto-expired (marks it as an extendable
--                      "released hold" on the Plot Release page). Cleared when
--                      an Admin extends it.
--   pre_expiry_status  the status the booking held before expiry ('pending' or
--                      'confirmed'), so an extend restores it faithfully.
-- ============================================================================

alter table bookings add column if not exists expired_at        timestamptz;
alter table bookings add column if not exists pre_expiry_status booking_status;

-- Find expired-but-not-yet-extended holds quickly on the Plot Release page.
create index if not exists idx_bookings_expired_at on bookings(expired_at)
  where expired_at is not null;
