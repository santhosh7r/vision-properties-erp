-- ============================================================================
-- 0017 — Project "Tools Coupon" rates (Admin panel · New Project Form · Office Details)
--
-- Adds per-sq.ft Tools Coupon rates to projects, configured separately for the
-- Director and the Senior Director (like the Gold Coupon). On each registration a
-- Tools Coupon is auto-issued BY VALUE to each: rate × plot sq.ft (e.g. ₹3000 on a
-- 1200 sq.ft plot at ₹2.50/sq.ft), redeemable in any denomination. Admins can also
-- issue extra Tools Coupons manually on the Issue Token page.
-- ============================================================================

-- Drop the earlier single-rate column if it was ever created (no project data yet).
alter table projects drop column if exists tools_coupon;

alter table projects add column if not exists director_tools_coupon        numeric(12,2) not null default 0;  -- ₹ per sq.ft
alter table projects add column if not exists senior_director_tools_coupon numeric(12,2) not null default 0;  -- ₹ per sq.ft
