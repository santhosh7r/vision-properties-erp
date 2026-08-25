-- 0037 · Receipt numbers become a real running register, starting at VPO3377.
--
-- WHY: the number printed on every receipt was derived from the record's UUID
-- ("VPT6605A7"). It was unique and stable, but it was not a SERIES — two
-- receipts issued back to back looked unrelated, nothing said which came first,
-- and there was no way to tell from a stack of printed bills whether one was
-- missing. An office register needs consecutive numbers.
--
-- The series continues the office's existing paper books, which is why it starts
-- at 3377 rather than 1 — the first receipt this system issues follows the last
-- one written by hand.
--
-- The number is STORED, not computed. A receipt reprinted a year from now must
-- carry the number the customer was handed, so it is allocated once, when the
-- record is created, and never recalculated.
--
-- SAFE TO RE-RUN: every statement is guarded, and the backfill only touches rows
-- that have no number yet.

-- ---------------------------------------------------------------------------
-- The register itself.
-- ---------------------------------------------------------------------------
-- `start with` only applies when the sequence is created, so re-running this
-- migration can never rewind the series and re-issue a number already printed.
--
-- Numbers run consecutively but are not guaranteed gap-free: a sequence does not
-- roll back, so a booking insert that fails (a plot taken a moment earlier, a
-- validation error) leaves its number unused. That is the right trade — a gap in
-- the register is a question the office can answer, two customers holding the
-- same receipt number is not.
create sequence if not exists booking_receipt_seq start with 3377 minvalue 3377;

comment on sequence booking_receipt_seq is
  'Running receipt register. Starts at 3377, continuing the office''s paper books.';

-- ---------------------------------------------------------------------------
-- Booking receipts — VPO3377, VPO3378, …
-- ---------------------------------------------------------------------------
alter table bookings add column if not exists receipt_no text;

-- Existing bookings are numbered oldest first, so the register reads in the
-- order the deals were actually made.
do $$
declare b record;
begin
  for b in select id from bookings where receipt_no is null order by created_at, id loop
    update bookings set receipt_no = 'VPO' || nextval('booking_receipt_seq') where id = b.id;
  end loop;
end $$;

-- From here on the database allocates the number itself, so a booking cannot be
-- created without one and two bookings cannot be given the same one.
alter table bookings alter column receipt_no set default 'VPO' || nextval('booking_receipt_seq');
create unique index if not exists uniq_bookings_receipt_no on bookings(receipt_no);

comment on column bookings.receipt_no is
  'Receipt number printed on the booking receipt (VPO3377…). Allocated once, never reused.';

-- ---------------------------------------------------------------------------
-- Payment receipts — VPO3377-1, VPO3377-2, …
-- ---------------------------------------------------------------------------
-- Each payment gets its own printable number, suffixed onto its booking's rather
-- than drawn from the register: the suffix says at a glance which deal the money
-- belongs to and how many instalments preceded it, which a bare register number
-- cannot.
alter table payments add column if not exists receipt_no text;

-- The suffix is claimed from a counter that only ever goes up, kept on the
-- booking. It is NOT derived from how many payments exist, nor from the highest
-- suffix still present: either of those would re-issue the number of a payment
-- that was deleted or reversed, and a number already printed and handed to a
-- customer must never appear on a second receipt.
alter table bookings add column if not exists payment_receipt_seq integer not null default 0;

comment on column bookings.payment_receipt_seq is
  'Highest payment-receipt suffix ever issued under this booking. Only ever increases.';

do $$
declare p record;
begin
  for p in
    select pay.id,
           b.receipt_no || '-' || row_number() over (
             partition by pay.booking_id order by pay.paid_at, pay.created_at, pay.id
           ) as receipt_no
    from payments pay
    join bookings b on b.id = pay.booking_id
    where pay.receipt_no is null
  loop
    update payments set receipt_no = p.receipt_no where id = p.id;
  end loop;
end $$;

-- Start each counter past the numbers the backfill just handed out.
update bookings b
   set payment_receipt_seq = greatest(
     b.payment_receipt_seq,
     (select count(*) from payments p where p.booking_id = b.id)
   );

create or replace function assign_payment_receipt_no() returns trigger
language plpgsql as $$
declare
  booking_no text;
  suffix     integer;
begin
  if new.receipt_no is not null then return new; end if;

  -- Advancing the counter takes a row lock on the booking, so two payments
  -- recorded against the same deal at the same moment queue behind each other
  -- instead of both reading the same number. Payments on any other booking are
  -- unaffected.
  update bookings
     set payment_receipt_seq = payment_receipt_seq + 1
   where id = new.booking_id
  returning receipt_no, payment_receipt_seq into booking_no, suffix;

  -- No booking, or a booking from before the register existed: leave the number
  -- unset rather than inventing one. The receipt falls back to its UUID-derived
  -- number, exactly as it did before this migration.
  if booking_no is null then return new; end if;

  new.receipt_no := booking_no || '-' || suffix;
  return new;
end $$;

drop trigger if exists trg_assign_payment_receipt_no on payments;
create trigger trg_assign_payment_receipt_no
  before insert on payments
  for each row execute function assign_payment_receipt_no();

create unique index if not exists uniq_payments_receipt_no on payments(receipt_no);

comment on column payments.receipt_no is
  'Receipt number printed on this payment''s receipt (VPO3377-2). Allocated once, never reused.';
