-- ============================================================================
-- 0012 — Salesperson home city
--
-- Each user can have a home city. The sales panels surface that city's projects
-- and plots FIRST so a Chennai partner sees Chennai inventory before others.
-- ============================================================================

alter table users add column if not exists city text;
