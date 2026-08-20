-- 0036 · Anniversary is a live customer field again.
--
-- WHY: the receipt has always printed an "Anniversary" line (see
-- ReceiptDoc.tsx), but no form captured it, so it printed blank on every
-- receipt. The column was already in the schema, marked deprecated. It is now
-- asked for on the Add Customer, Edit Customer and booking forms.
--
-- It is the ONE optional field: every other captured field is mandatory and
-- enforced both in the browser and in the server actions. So this column stays
-- nullable — a customer with no anniversary is a complete record, not a
-- half-filled one.
--
-- SAFE TO RE-RUN: `add column if not exists` is a no-op once applied. Databases
-- created from schema.sql already have the column and are unaffected.
alter table customers add column if not exists anniversary_date date;

comment on column customers.anniversary_date is
  'Wedding anniversary. Optional — the only customer field that may be null.';
