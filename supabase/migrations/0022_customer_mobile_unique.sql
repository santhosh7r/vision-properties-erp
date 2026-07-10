-- 
-- 0022 — One customer per mobile PER SALESPERSON (not globally)
--
-- A customer is identified by their mobile *within one salesperson's book*: the
-- same salesperson must never create two records for the same number. But two
-- DIFFERENT salespeople may each hold their own record for the same mobile —
-- e.g. SD1 and SD2 both work with Santhosh (9843965684). Their customer bases
-- stay separate: sales panels show only their own; admin sees everyone's.
--
-- This first merges same-owner duplicates (repointing their orders to the
-- earliest record for that owner+mobile), then enforces uniqueness on
-- (created_by, mobile) going forward. Cross-owner duplicates are LEFT ALONE.
--
-- NOTE: if the old GLOBAL unique(mobile) from a previous version of this file
-- was already applied, it is dropped below. Records it already merged across
-- owners cannot be automatically un-merged — check for collapsed customers by
-- hand if so.
--
-- Run in the Supabase SQL Editor.
-- ============================================================================
--
-- 0. Drop the old global constraint if a prior version of this migration ran.
alter table customers drop constraint if exists customers_mobile_key;
--
-- 1. Repoint every child row from a duplicate customer to the KEEPER for that
--    (owner, mobile) pair — the earliest-created record. Keeper is picked per
--    owner+mobile via a window function; non-keepers are same-owner duplicates.
--    Cross-owner records (different created_by) get different keep_ids and are
--    never touched.
update bookings b
set customer_id = m.keep_id
from (
  select id,
         first_value(id) over (partition by created_by, mobile order by created_at, id) as keep_id
  from customers
  where mobile is not null and btrim(mobile) <> '' and created_by is not null
) m
where b.customer_id = m.id and m.id <> m.keep_id;

update cab_requests r
set customer_id = m.keep_id
from (
  select id,
         first_value(id) over (partition by created_by, mobile order by created_at, id) as keep_id
  from customers
  where mobile is not null and btrim(mobile) <> '' and created_by is not null
) m
where r.customer_id = m.id and m.id <> m.keep_id;

update service_requests r
set customer_id = m.keep_id
from (
  select id,
         first_value(id) over (partition by created_by, mobile order by created_at, id) as keep_id
  from customers
  where mobile is not null and btrim(mobile) <> '' and created_by is not null
) m
where r.customer_id = m.id and m.id <> m.keep_id;

-- 2. Delete the now-orphaned same-owner duplicate customers.
delete from customers c
using (
  select id,
         first_value(id) over (partition by created_by, mobile order by created_at, id) as keep_id
  from customers
  where mobile is not null and btrim(mobile) <> '' and created_by is not null
) m
where c.id = m.id and m.id <> m.keep_id;

-- 3. Enforce it going forward — one salesperson can never hold the same mobile
--    twice, but different salespeople still can. Partial index so legacy rows
--    with a null mobile or null owner don't block each other.
create unique index if not exists customers_owner_mobile_key
  on customers (created_by, mobile)
  where mobile is not null and created_by is not null;
