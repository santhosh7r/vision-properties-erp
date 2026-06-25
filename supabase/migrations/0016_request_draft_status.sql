-- ============================================================================
-- 0016 — Draft status for service requests
--
-- Adds 'draft' to service_request_status so a Senior Director / Director can
-- SAVE a half-filled request as a draft (not yet in the approval chain), see it
-- listed, edit it later, and submit it when ready. A draft is only visible to
-- the person who created it; submitting it flips status to 'pending' and enters
-- the normal chain (and, for cab, spends the token at final approval as usual).
-- ============================================================================

alter type service_request_status add value if not exists 'draft';
