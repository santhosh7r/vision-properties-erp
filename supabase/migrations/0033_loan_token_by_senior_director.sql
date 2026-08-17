-- ============================================================================
-- 0033 — loan_token_by: add 'senior_director'
--
-- The enum was created as ('customer', 'director') but the app has always sent
-- 'senior_director' (LOAN_TOKEN_BY_OPTIONS in src/lib/options.ts) — a loan on a
-- plot is either the customer's own or one their SENIOR DIRECTOR arranged, and
-- there is no plain "director" option anywhere in the UI.
--
-- Nothing has ever hit this: every bookings.loan_token_by is null, because the
-- field sat loose on the booking form where it was routinely left blank. Now
-- that it is asked properly — revealed by choosing the "Loan" payment mode, and
-- required once it appears — the very first loan booking would have failed with
--   invalid input value for enum loan_token_by: "senior_director"
-- so this has to land before that form is used.
--
-- 'director' is left in the enum: dropping an enum value is not supported, and
-- it costs nothing to leave an unused label in place.
-- ============================================================================

alter type loan_token_by add value if not exists 'senior_director';
