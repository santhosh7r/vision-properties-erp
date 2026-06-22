-- ============================================================================
-- 0007 — Snapshot the Senior Director on a booking
--
-- The booking form now shows Partner -> Senior Director -> Director, all derived
-- from the Partner ID. These columns snapshot the senior director (the partner's
-- senior_director ancestor) alongside the existing partner/director snapshots so
-- a booking record is self-describing.
-- ============================================================================

alter table bookings add column if not exists senior_director_id   uuid references users(id) on delete set null;
alter table bookings add column if not exists senior_director_code text;
alter table bookings add column if not exists senior_director_name text;
