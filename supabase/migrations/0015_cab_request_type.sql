-- ============================================================================
-- 0015 — Cab as a service-request type
--
-- Adds 'cab' to the service_request_type enum so Senior Directors and Directors
-- can raise cab requests through the unified Requests workflow:
--
--   cab   director -> their Senior Director approves -> Admin final approval
--         (a Director spends one cab token on final approval; SD is unlimited)
--
-- The approval chain + token gating live in the app (lib/requests.ts and the
-- requests server actions). No new columns are needed — a cab request reuses
-- project_id, visit_date (cab date) and pickup on service_requests.
-- ============================================================================

alter type service_request_type add value if not exists 'cab';
