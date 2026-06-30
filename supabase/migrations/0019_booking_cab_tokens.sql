-- ============================================================================
-- 0019 — Cab-token auto-issuance marker on bookings
--
-- SOP: auto-issue 3 Cab Tokens to the Director on a booking/blocking's sales
-- chain once the hold has been held > 48h (director limited; senior director
-- unlimited so they need none). The lazy lifecycle sweep (`sweepCabTokens`)
-- issues the tokens and flips this flag so they are granted exactly once per
-- booking row — surviving convert-to-booking and plot transfers (same row).
-- ============================================================================

alter table bookings
  add column if not exists cab_tokens_issued boolean not null default false;
