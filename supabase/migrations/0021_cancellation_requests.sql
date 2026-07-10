-- ============================================================================
-- 0021 — Cancellation requests
--
-- Only Admin may actually cancel a blocking/booking (release the plot + run the
-- refund). Every other sales role can instead REQUEST a cancellation with a
-- mandatory reason; the request surfaces in Payments & Cancellation for an Admin
-- to action (cancel) or dismiss.
--
-- A booking has a pending cancellation request while cancel_requested_at is set
-- and its status is not yet 'cancelled'. Cancelling or dismissing clears these.
-- ============================================================================

alter table bookings add column if not exists cancel_requested_by   uuid references users(id);
alter table bookings add column if not exists cancel_requested_at   timestamptz;
alter table bookings add column if not exists cancel_request_reason text;
