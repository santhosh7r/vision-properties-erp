-- 0024 · Full decimal precision for every money / rate column.
--
-- WHY: these columns were declared numeric(p,2), so Postgres silently rounded
-- every value to 2 decimal places on write — a Director Gold Coupon entered as
-- ₹4.167 per sq.ft was stored as 4.17, and 4.589363 as 4.59. Coupon and token
-- values are rate × sq.ft, so that rounding compounded into the amounts credited
-- to Directors and Senior Directors.
--
-- Switching to unconstrained `numeric` keeps whatever is entered, exactly: 4
-- stays 4, 4.589363 stays 4.589363. Postgres `numeric` with no (p,s) has no
-- scale limit, so nothing is rounded on the way in or out.
--
-- SAFE TO RE-RUN: widening a numeric's scale is a metadata-compatible change and
-- never loses data. Values ALREADY stored were rounded before this migration and
-- are NOT recoverable — re-enter any coupon rate that needs its lost decimals.

-- Projects · per-sq.ft coupon & token rates (the ones that drive Tokens/Coupons)
alter table projects alter column guideline_value              type numeric;
alter table projects alter column director_gold_coupon         type numeric;
alter table projects alter column director_digital_coupon      type numeric;
alter table projects alter column senior_director_gold_coupon  type numeric;
alter table projects alter column director_tools_coupon        type numeric;
alter table projects alter column senior_director_tools_coupon type numeric;

-- Projects · SOP policy amounts
alter table projects alter column blocking_amount     type numeric;
alter table projects alter column advance_percent     type numeric;
alter table projects alter column advance_min_amount  type numeric;
alter table projects alter column cancellation_charge type numeric;
alter table projects alter column transfer_charge     type numeric;

-- Plots · extent and rate feed total plot value
alter table plots alter column sqft           type numeric;
alter table plots alter column price_per_sqft type numeric;

-- Bookings · every ₹ figure captured at booking time
alter table bookings alter column plot_sqft           type numeric;
alter table bookings alter column total_plot_value    type numeric;
alter table bookings alter column blocking_amount     type numeric;
alter table bookings alter column advance_required    type numeric;
alter table bookings alter column advance_paid        type numeric;
alter table bookings alter column cancellation_charge type numeric;
alter table bookings alter column refund_amount       type numeric;

alter table payments      alter column amount    type numeric;
alter table registrations alter column plot_sqft type numeric;

alter table plot_transfers alter column from_value type numeric;
alter table plot_transfers alter column to_value   type numeric;
alter table plot_transfers alter column charge     type numeric;

-- Coupons / tokens · the issued ₹ value itself
alter table coupons alter column value type numeric;
