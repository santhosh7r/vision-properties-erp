-- 0039 · Father's and Spouse's details on the customer record.
--
-- WHY: property registration paperwork identifies a buyer as S/o, D/o or W/o
-- someone, and the office regularly needs a family contact number. Neither was
-- captured anywhere, so it was being kept outside the system.
--
-- Father's name + mobile are mandatory, enforced in the browser and in the
-- server actions alongside every other captured customer field. Spouse's name +
-- mobile are optional: an unmarried customer is a complete record, not a
-- half-filled one — the same reasoning that keeps anniversary_date nullable
-- (see 0036). All four columns stay nullable so existing rows, written before
-- these fields existed, remain readable and editable.
--
-- SAFE TO RE-RUN: `add column if not exists` is a no-op once applied. Databases
-- created from schema.sql already have the columns and are unaffected.
alter table customers
  add column if not exists father_name   text,
  add column if not exists father_mobile text,
  add column if not exists spouse_name   text,
  add column if not exists spouse_mobile text;

comment on column customers.father_name is
  'Father''s name. Mandatory on the customer form (S/o, D/o on registration papers).';
comment on column customers.father_mobile is
  'Father''s contact number. Mandatory on the customer form.';
comment on column customers.spouse_name is
  'Spouse''s name. Optional — blank for an unmarried customer.';
comment on column customers.spouse_mobile is
  'Spouse''s contact number. Optional — blank for an unmarried customer.';
