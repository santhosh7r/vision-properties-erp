-- ============================================================================
-- 0005 — Sales-partner IDs (human-readable codes for the sales hierarchy)
--
-- Every sales member gets a unique, readable ID by role:
--   Senior Director  -> SD1, SD2, …
--   Director         -> D1,  D2,  …
--   Business Manager -> BM1, BM2, …
--   Business Partner -> BP1, BP2, …
-- Admin / Finance / Legal get no code (NULL).
--
-- The code is assigned by a BEFORE INSERT trigger so EVERY insert path (sales
-- tree, Users admin, seed script) gets a consistent, gap-tolerant code without
-- the application having to compute it. Bookings also snapshot the partner /
-- director codes so a booking record is self-describing.
-- ============================================================================

-- 1. Columns -----------------------------------------------------------------
alter table users    add column if not exists partner_code  text;
alter table bookings add column if not exists partner_code  text;
alter table bookings add column if not exists director_code text;

-- 2. Prefix for a role (NULL for non-sales roles) ----------------------------
create or replace function sales_code_prefix(r user_role)
returns text language sql immutable as $$
  select case r
    when 'senior_director'  then 'SD'
    when 'director'         then 'D'
    when 'business_manager' then 'BM'
    when 'business_partner' then 'BP'
    else null
  end;
$$;

-- 3. Trigger: assign the next code for the row's role on insert ---------------
create or replace function assign_partner_code()
returns trigger language plpgsql as $$
declare
  pfx     text;
  nextnum int;
begin
  pfx := sales_code_prefix(new.role);

  -- Non-sales role: never carries a code.
  if pfx is null then
    new.partner_code := null;
    return new;
  end if;

  -- Respect an explicitly supplied code (e.g. data import).
  if new.partner_code is not null and new.partner_code <> '' then
    return new;
  end if;

  -- Serialize per-prefix so concurrent inserts can't pick the same number.
  perform pg_advisory_xact_lock(hashtext('partner_code:' || pfx));

  select coalesce(max((regexp_replace(partner_code, '^[A-Z]+', ''))::int), 0) + 1
    into nextnum
    from users
    where partner_code ~ ('^' || pfx || '[0-9]+$');

  new.partner_code := pfx || nextnum;
  return new;
end;
$$;

-- 4. Backfill existing sales members (ordered by creation) -------------------
do $$
declare
  pfx text;
  rec record;
  cnt int;
begin
  foreach pfx in array array['SD', 'D', 'BM', 'BP'] loop
    select coalesce(max((regexp_replace(partner_code, '^[A-Z]+', ''))::int), 0)
      into cnt
      from users
      where partner_code ~ ('^' || pfx || '[0-9]+$');

    for rec in
      select id from users
      where sales_code_prefix(role) = pfx
        and (partner_code is null or partner_code = '')
      order by created_at, id
    loop
      cnt := cnt + 1;
      update users set partner_code = pfx || cnt where id = rec.id;
    end loop;
  end loop;
end $$;

-- 5. Uniqueness + trigger ----------------------------------------------------
create unique index if not exists uniq_users_partner_code
  on users(partner_code)
  where partner_code is not null;

drop trigger if exists trg_assign_partner_code on users;
create trigger trg_assign_partner_code
  before insert on users
  for each row execute function assign_partner_code();
