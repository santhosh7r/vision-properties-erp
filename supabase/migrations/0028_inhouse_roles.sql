-- ============================================================================
-- 0028 — In-house desk roles: Pre-Sales, Post-Sales, Digital
--
-- Branch staff that are NOT part of the partner/sales tree. They report straight
-- to the company (Admin), carry no partner_code (sales_code_prefix already
-- returns NULL for anything outside the four sales tiers, so the auto-code
-- trigger skips them) and never appear in the hierarchy view.
--
-- Pre-Sales and Post-Sales are per-district desks — set users.district to
-- 'Chennai' or 'Trichy' on the account; the app confines every list and action
-- to that district's projects (see src/lib/scope.ts). Digital is company-wide.
--
-- NOTE: Postgres cannot use a new enum value in the same transaction that adds
-- it, so this migration ONLY adds the values. Insert/patch the actual user rows
-- afterwards (the Admin › Add New Partner form, or `npm run db:seed:inhouse`).
-- ============================================================================

alter type user_role add value if not exists 'pre_sales';
alter type user_role add value if not exists 'post_sales';
alter type user_role add value if not exists 'digital';
