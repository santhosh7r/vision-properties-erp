-- ============================================================================
-- 0034 — Page Config: admin-editable page access per role
--
-- Until now "which role sees which page" lived in code (src/lib/nav.ts) and
-- "what a role may do" in src/lib/roles.ts, so every access change needed a
-- developer. These two tables move the page half into the database, editable by
-- an Admin on Administration › Page Config.
--
--   role_page_access   one row per (role, page) an Admin has CHANGED. Absent
--                      rows fall back to the code defaults (defaultLevel() in
--                      src/lib/pages.ts, derived from the menu), so the app
--                      behaves exactly as before until somebody edits the grid —
--                      and keeps working if this migration has not been applied.
--   role_settings      per-role flags. `can_login` switches a whole role's
--                      logins off without touching individual accounts.
--
-- `role` is deliberately TEXT, not the user_role enum: a role the app knows
-- about but whose enum value has not been added yet (0030's pre_post_sales is
-- exactly that today) must not make these tables unwritable. `page_key` matches
-- PAGES[].key in src/lib/pages.ts — never rename one of those keys, or the
-- configuration saved against it is orphaned.
--
-- Admin is NOT stored here. Full access for Admin is hard-coded so the account
-- that configures permissions can never lock itself out of the app.
-- ============================================================================

create table if not exists role_page_access (
  role       text        not null,
  page_key   text        not null,
  level      text        not null check (level in ('none', 'view', 'edit')),
  updated_by uuid        references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (role, page_key)
);

create index if not exists idx_role_page_access_role on role_page_access(role);

create table if not exists role_settings (
  role       text        primary key,
  can_login  boolean     not null default true,
  updated_by uuid        references users(id) on delete set null,
  updated_at timestamptz not null default now()
);
