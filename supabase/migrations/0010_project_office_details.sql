-- ============================================================================
-- 0010 — Project "Office Details" (Admin panel · New Project Form)
--
-- Adds the Office Details block to projects: branch, guideline value, and the
-- per-sq.ft coupon rates configured on the project itself (used later by the
-- Tokens/Coupons subsystem). Also relaxes land_type / remarks to optional since
-- the restructured Admin project form no longer collects them.
-- ============================================================================

alter table projects alter column land_type drop not null;

alter table projects add column if not exists branch                      text;
alter table projects add column if not exists guideline_value             numeric(14,2) not null default 0;  -- ₹ per sq.ft guideline
alter table projects add column if not exists director_gold_coupon        numeric(12,2) not null default 0;  -- ₹ per sq.ft
alter table projects add column if not exists director_digital_coupon     numeric(12,2) not null default 0;  -- ₹ per sq.ft
alter table projects add column if not exists senior_director_gold_coupon numeric(12,2) not null default 0;  -- ₹ per sq.ft
