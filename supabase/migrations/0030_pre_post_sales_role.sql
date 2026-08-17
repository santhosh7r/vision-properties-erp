-- ============================================================================
-- 0030 — Combined desk role: Pre & Post-Sales
--
-- A branch can be small enough that ONE person runs the deal end to end: blocks
-- and books the plot for the walk-in customer, then collects, cancels, releases
-- and registers it. That is still one account with one district and one login,
-- so it is one role holding both desks' powers (the union of the two capability
-- sets in src/lib/roles.ts) rather than two rows for the same person.
--
-- Trichy's Pooja Gurumurthy is the first: post_sales -> pre_post_sales, applied
-- in 0031.
--
-- NOTE: Postgres cannot USE a new enum value in the same transaction that adds
-- it — that is why the user row is patched in 0031 and not here. Run this one
-- first, on its own.
-- ============================================================================

alter type user_role add value if not exists 'pre_post_sales';
