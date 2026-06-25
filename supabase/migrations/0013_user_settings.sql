-- ============================================================================
-- 0013 — Per-user settings + session versioning
--
--   settings        : JSON prefs (notifications, language, …)
--   session_version : bumped by "Sign out everywhere" to invalidate other
--                     sessions (the JWT carries the version it was issued at).
-- ============================================================================

alter table users add column if not exists settings jsonb not null default '{}'::jsonb;
alter table users add column if not exists session_version integer not null default 0;
