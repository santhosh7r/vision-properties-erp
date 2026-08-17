-- ============================================================================
-- 0031 — Pooja Gurumurthy: corrected login email + both Trichy desks
--
-- Two changes to one existing account (seeded by `npm run db:seed:inhouse`):
--
--   1. The login email was wrong — poojagurumurthy@gmail.com is not her
--      address. Staff sign in with their EMAIL, so until this runs she cannot
--      log in at all. Correct it to poojagurumoorthyy@gmail.com.
--   2. She runs the Trichy branch's Pre-Sales desk as well as Post-Sales, so
--      her role becomes the combined pre_post_sales added in 0030.
--
-- Requires 0030 to have been applied in an EARLIER transaction — Postgres
-- refuses a new enum value used in the transaction that created it.
--
-- Password and district are deliberately untouched: this is the same person and
-- the same Trichy branch, only her address and her desk change.
-- ============================================================================

update users
   set email = 'poojagurumoorthyy@gmail.com',
       role  = 'pre_post_sales'
 where email = 'poojagurumurthy@gmail.com';

-- Re-runnable: if the email was already fixed by hand, still make sure the role
-- carries both desks.
update users
   set role = 'pre_post_sales'
 where email = 'poojagurumoorthyy@gmail.com'
   and role <> 'pre_post_sales';
