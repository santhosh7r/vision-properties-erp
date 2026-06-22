-- ============================================================================
-- 0006 — New sales-ID format: VP + role code + 2 random digits
--
--   Senior Director  -> VPSD##   (e.g. VPSD47)
--   Director         -> VPD##
--   Business Manager -> VPBM##
--   Business Partner -> VPBP##
--
-- Replaces the old sequential SD1/D1/BM1/BP1 scheme. Two random digits are
-- generated and retried on collision; if a role's 2-digit space gets crowded
-- the generator automatically widens (3+ digits) so codes stay unique even with
-- thousands of members. This migration also regenerates EXISTING codes.
-- ============================================================================

-- 1. Prefix per role ---------------------------------------------------------
create or replace function sales_code_prefix(r user_role)
returns text language sql immutable as $$
  select case r
    when 'senior_director'  then 'VPSD'
    when 'director'         then 'VPD'
    when 'business_manager' then 'VPBM'
    when 'business_partner' then 'VPBP'
    else null
  end;
$$;

-- 2. Generate the next free code for a prefix (random, widening on collision) -
create or replace function next_partner_code(pfx text)
returns text language plpgsql as $$
declare
  candidate text;
  digits    int := 2;
  attempts  int := 0;
begin
  loop
    candidate := pfx || lpad((floor(random() * power(10, digits)))::bigint::text, digits, '0');
    exit when not exists (select 1 from users where partner_code = candidate);
    attempts := attempts + 1;
    -- Widen the random space once the current width gets crowded.
    if attempts >= 20 then
      digits := digits + 1;
      attempts := 0;
    end if;
  end loop;
  return candidate;
end;
$$;

-- 3. Trigger: assign a code on insert ----------------------------------------
create or replace function assign_partner_code()
returns trigger language plpgsql as $$
declare
  pfx text;
begin
  pfx := sales_code_prefix(new.role);
  if pfx is null then
    new.partner_code := null;
    return new;
  end if;
  if new.partner_code is not null and new.partner_code <> '' then
    return new;  -- respect an explicit code (e.g. data import)
  end if;
  -- Serialize per-prefix so concurrent inserts can't pick the same code.
  perform pg_advisory_xact_lock(hashtext('partner_code:' || pfx));
  new.partner_code := next_partner_code(pfx);
  return new;
end;
$$;

-- (trigger trg_assign_partner_code already exists from 0005)

-- 4. Regenerate existing sales codes into the new format ---------------------
do $$
declare
  rec record;
begin
  -- Clear sales codes first so old SD1/D1/… values don't block new ones.
  update users set partner_code = null where sales_code_prefix(role) is not null;

  for rec in
    select id, role from users
    where sales_code_prefix(role) is not null
    order by created_at, id
  loop
    update users
      set partner_code = next_partner_code(sales_code_prefix(rec.role))
      where id = rec.id;
  end loop;
end $$;
