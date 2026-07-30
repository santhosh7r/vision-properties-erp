-- 0025 · Business Partner Registration Form fields.
--
-- WHY: adding a Business Partner now captures the full paper registration form
-- (personal, professional, nominee, reference + declaration) instead of just
-- name/email/mobile. These columns are only populated for role
-- 'business_partner'; every other role leaves them NULL, so they stay nullable
-- here and are enforced in the form + server action instead of by the DB.
--
-- Reference ID is NOT a new column: the typed partner code (VPBM##/VPD##/…) is
-- resolved server-side to that user's id and stored in the existing
-- users.manager_id, so the reference IS the reporting parent.
--
-- SAFE TO RE-RUN.

alter table users add column if not exists date_of_birth  date;   -- Personal · Date of Birth
alter table users add column if not exists whatsapp       text;   -- Personal · WhatsApp Number
alter table users add column if not exists address        text;   -- Personal · Residential Address
alter table users add column if not exists occupation     text;   -- Professional · Occupation
alter table users add column if not exists rera_number    text;   -- Professional · RERA Registration Number (optional)
alter table users add column if not exists nominee_name   text;   -- Nominee · Name
alter table users add column if not exists nominee_mobile text;   -- Nominee · Mobile Number

-- Timestamp of the signed declaration ("I hereby declare that all the
-- information provided above is true and correct…"). NULL = never accepted,
-- which is the case for every non-partner account and every partner created
-- before this migration.
alter table users add column if not exists declared_at timestamptz;
