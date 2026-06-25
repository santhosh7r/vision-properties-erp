-- ============================================================================
-- Vision Properties — Plot Booking & Inventory Management Platform
-- v0.1 MVP — PostgreSQL / Supabase schema
--
-- Run this in the Supabase SQL Editor (or `supabase db push`) to create the
-- schema. Then run `npm run db:seed` to load demo roles, users and inventory.
-- ============================================================================

-- Extensions ----------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum (
    'admin',
    'senior_director',
    'director',
    'business_manager',
    'business_partner',
    'finance',
    'legal'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_type as enum ('dtcp_rera', 'dtcp_only');
exception when duplicate_object then null; end $$;

do $$ begin
  create type project_type as enum ('affordable', 'luxury');
exception when duplicate_object then null; end $$;

do $$ begin
  create type project_status as enum ('draft', 'active', 'on_hold', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Plot lifecycle aligned with the v0.1 board: available -> blocked -> booked -> registered/sold
  create type plot_status as enum (
    'available',
    'blocked',
    'booked',
    'registered',
    'sold',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type book_mode as enum ('blocking', 'booking');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking_status as enum ('pending', 'confirmed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_kind as enum ('blocking', 'advance', 'installment', 'final');
exception when duplicate_object then null; end $$;

do $$ begin
  create type loan_token_by as enum ('customer', 'director');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- USERS & HIERARCHY  (Admin / Sales tiers / Finance / Legal)
-- ---------------------------------------------------------------------------
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  full_name     text        not null,
  email         text        not null unique,
  password_hash text        not null,
  mobile        text,
  role          user_role   not null,
  partner_code  text,                    -- sales ID: SD#/D#/BM#/BP# (auto-assigned; NULL for admin/finance/legal)
  manager_id    uuid        references users(id) on delete set null,
  city          text,                    -- home city: sales panels show this city's inventory first
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists idx_users_role       on users(role);
create index if not exists idx_users_manager     on users(manager_id);
create unique index if not exists uniq_users_partner_code on users(partner_code) where partner_code is not null;

-- Human-readable sales ID per role (NULL for non-sales roles), auto-assigned on
-- insert by a trigger so every insert path produces a consistent, unique code.
-- Code = VP + role code + 2 random digits (VPSD##/VPD##/VPBM##/VPBP##), retried
-- on collision and widened automatically if a role's space gets crowded.
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
    if attempts >= 20 then
      digits := digits + 1;
      attempts := 0;
    end if;
  end loop;
  return candidate;
end;
$$;

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
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('partner_code:' || pfx));
  new.partner_code := next_partner_code(pfx);
  return new;
end;
$$;

drop trigger if exists trg_assign_partner_code on users;
create trigger trg_assign_partner_code
  before insert on users
  for each row execute function assign_partner_code();

-- ---------------------------------------------------------------------------
-- PROJECT CATEGORIES  (board: "group of same projects will be categorised")
-- ---------------------------------------------------------------------------
create table if not exists project_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- PROJECTS  (board: project creation form, 8 fields + reservation config)
-- ---------------------------------------------------------------------------
create table if not exists projects (
  id             uuid primary key default gen_random_uuid(),
  name           text          not null,                       -- 1. Project Name*
  district       text          not null,                       -- 2. District*
  city           text          not null,                       -- 3. City*
  remarks        text,                                         -- 4. Remarks (legacy/optional)
  area           text          not null,                       -- 5. Extent / Area*
  land_type      text,                                         -- 6. Land Type (legacy/optional)
  approval_type  approval_type not null,                       -- 7. Approval Type*
  project_type   project_type  not null,                       -- 8. Project Type* (affordable/luxury)
  category_id    uuid          references project_categories(id) on delete set null,
  status         project_status not null default 'draft',
  -- Office Details (Admin panel · New Project Form) -------------------------------
  branch                      text,                            -- branch / office
  guideline_value             numeric(14,2) not null default 0, -- ₹ per sq.ft guideline value
  director_gold_coupon        numeric(12,2) not null default 0, -- ₹ per sq.ft
  director_digital_coupon     numeric(12,2) not null default 0, -- ₹ per sq.ft
  senior_director_gold_coupon numeric(12,2) not null default 0, -- ₹ per sq.ft
  -- Reservation / booking configuration (editable per project, per the board) ----
  blocking_amount        numeric(14,2) not null default 10000, -- §1 initial block amount (e.g. 10k)
  blocking_window_hours  integer       not null default 48,    -- §1 block -> must book within N hours
  advance_percent        numeric(5,2)  not null default 5,     -- §2 booking advance = N% of plot value
  advance_min_amount     numeric(14,2) not null default 50000, -- §2 advance floor: max(N%, this)
  booking_window_days    integer       not null default 15,    -- booking -> full payment / else back to company
  -- §3 Cancellation & refund ------------------------------------------------------
  cancel_full_refund_days integer      not null default 3,     -- 100% refund if cancelled within N days
  cancellation_charge    numeric(14,2) not null default 5000,  -- admin charge per plot after that window
  refund_processing_days integer       not null default 5,     -- payout SLA (working days) after approval
  -- §7 Plot transfer / change ------------------------------------------------------
  transfer_charge        numeric(14,2) not null default 5000,  -- downgrade/transfer charge per plot
  created_by     uuid          references users(id) on delete set null,
  created_at     timestamptz   not null default now()
);
create index if not exists idx_projects_category on projects(category_id);
create index if not exists idx_projects_status   on projects(status);

-- ---------------------------------------------------------------------------
-- PLOT CATEGORIES  (plot groups within a project — e.g. Phase 1, Premium)
-- ---------------------------------------------------------------------------
create table if not exists plot_categories (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  unique (project_id, name)
);
create index if not exists idx_plot_categories_project on plot_categories(project_id);

-- ---------------------------------------------------------------------------
-- PLOTS  (board: plot creation form)
-- ---------------------------------------------------------------------------
create table if not exists plots (
  id             uuid        primary key default gen_random_uuid(),
  project_id     uuid        not null references projects(id) on delete cascade,
  plot_category_id uuid      references plot_categories(id) on delete set null, -- group within the project
  block          text        not null,                          -- 2. block
  plot_no        text        not null,                          -- 3. plot no
  sqft           numeric(12,2) not null,                        -- 4. plot sq.ft
  price_per_sqft numeric(12,2) not null default 0,              -- drives total plot value / 5% advance
  description    text,                                           -- 5. desc
  status         plot_status not null default 'available',       -- 6. current status
  created_at     timestamptz not null default now(),
  unique (project_id, block, plot_no)
);
create index if not exists idx_plots_project  on plots(project_id);
create index if not exists idx_plots_category on plots(plot_category_id);
create index if not exists idx_plots_status   on plots(status);

-- ---------------------------------------------------------------------------
-- CUSTOMERS  (board: Customer Details section of the booking form)
-- ---------------------------------------------------------------------------
create table if not exists customers (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,                  -- 1. Customer Name*
  mobile             text not null,                  -- 2. Customer Mobile*
  email              text,                           -- 3. Email
  dob                date,                           -- 4. D.O.B
  anniversary_date   date,                           -- (deprecated, kept for legacy data)
  street             text,                           -- 5. Street
  area               text,                           -- 6. Area
  pincode            text,                           -- 7. Pincode (auto-fills state/district/country)
  state              text,                           -- 8. State
  district           text,                           -- 9. District
  country            text,                           -- 10. Country
  occupation         text,                           -- 11. Occupation
  occupation_remarks text,                           -- 12. Occupation Remarks
  created_by         uuid references users(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists idx_customers_mobile on customers(mobile);

-- ---------------------------------------------------------------------------
-- BOOKINGS  (board: the full blocking / booking record)
-- ---------------------------------------------------------------------------
create table if not exists bookings (
  id                       uuid primary key default gen_random_uuid(),
  plot_id                  uuid not null references plots(id) on delete restrict,
  customer_id              uuid not null references customers(id) on delete restrict,
  project_id               uuid not null references projects(id) on delete restrict,
  -- snapshots (board: Project Details section) -----------------------------------
  block                    text,
  plot_sqft                numeric(12,2),
  total_plot_value         numeric(16,2) not null default 0,
  -- Nominee Details --------------------------------------------------------------
  nominee_name             text,
  nominee_mobile           text,
  nominee_relationship     text,
  -- Partner Details --------------------------------------------------------------
  partner_id               uuid references users(id) on delete set null,
  partner_code             text,                                       -- snapshot of the partner's sales ID
  partner_name             text,
  senior_director_id       uuid references users(id) on delete set null,
  senior_director_code     text,                                       -- snapshot of the senior director's sales ID
  senior_director_name     text,
  director_id              uuid references users(id) on delete set null,
  director_code            text,                                       -- snapshot of the director's sales ID
  director_name            text,
  -- Payment Details --------------------------------------------------------------
  tentative_registration_date date,
  mode_of_payment          text,
  loan_token_by            loan_token_by,
  booked_date              date,
  remarks                  text,
  book_mode                book_mode      not null,            -- blocking | booking
  -- amounts & windows ------------------------------------------------------------
  blocking_amount          numeric(14,2) not null default 0,
  advance_required         numeric(16,2) not null default 0,   -- §2 max(advance_percent%, advance_min_amount)
  advance_paid             numeric(16,2) not null default 0,
  status                   booking_status not null default 'pending',
  payment_status           payment_status not null default 'pending',
  expires_at               timestamptz,                        -- block/booking window deadline
  released_at              timestamptz,                        -- when reverted to company
  -- §3 Cancellation & refund -----------------------------------------------------
  cancellation_reason      text,
  cancellation_charge      numeric(14,2),
  refund_amount            numeric(16,2),
  refund_status            text not null default 'none',       -- none | pending_approval | approved | paid
  refund_approved_by       uuid references users(id) on delete set null,
  refund_approved_at       timestamptz,
  refund_due_date          date,
  refund_paid_at           timestamptz,
  created_by               uuid references users(id) on delete set null,
  created_at               timestamptz not null default now()
);
create index if not exists idx_bookings_plot     on bookings(plot_id);
create index if not exists idx_bookings_customer on bookings(customer_id);
create index if not exists idx_bookings_status   on bookings(status);
create index if not exists idx_bookings_creator  on bookings(created_by);

-- Only one ACTIVE (pending/confirmed) booking per plot at a time — prevents
-- double-booking at the database level.
create unique index if not exists uniq_active_booking_per_plot
  on bookings(plot_id)
  where status in ('pending', 'confirmed');

-- ---------------------------------------------------------------------------
-- PAYMENTS  (board: plot payment, advance / blocking / installments)
-- ---------------------------------------------------------------------------
create table if not exists payments (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings(id) on delete cascade,
  amount      numeric(16,2) not null,
  kind        payment_kind  not null,
  mode        text,
  status      payment_status not null default 'completed',
  paid_at     timestamptz   not null default now(),
  recorded_by uuid references users(id) on delete set null,
  created_at  timestamptz   not null default now()
);
create index if not exists idx_payments_booking on payments(booking_id);

-- ---------------------------------------------------------------------------
-- REGISTRATIONS  (board: Registration Details / plot registering)
-- ---------------------------------------------------------------------------
create table if not exists registrations (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid references bookings(id) on delete set null,
  plot_id            uuid not null references plots(id) on delete restrict,
  project_id         uuid not null references projects(id) on delete restrict,
  block              text,                       -- 2. Block*
  plot_sqft          numeric(12,2),              -- 3. Plot No. - Sq.ft*
  register_date      date not null,              -- 4. Register Date*
  register_number    text not null,              -- 5. Register Number*
  name_of_registrant text not null,              -- 6. Name of Registrant*
  mobile             text,                       -- 7. Mobile*
  remarks            text,                       -- 8. Remarks*
  created_by         uuid references users(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists idx_registrations_plot on registrations(plot_id);

-- ---------------------------------------------------------------------------
-- PLOT TRANSFERS  (SOP §7: plot change / upgrade / downgrade)
-- ---------------------------------------------------------------------------
create table if not exists plot_transfers (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references bookings(id) on delete cascade,
  from_plot_id  uuid not null references plots(id) on delete restrict,
  to_plot_id    uuid not null references plots(id) on delete restrict,
  from_value    numeric(16,2) not null default 0,
  to_value      numeric(16,2) not null default 0,
  kind          text not null,                 -- upgrade | lateral | downgrade
  charge        numeric(14,2) not null default 0,
  remarks       text,
  approved_by   uuid references users(id) on delete set null,
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_transfers_booking on plot_transfers(booking_id);

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS  (board: SMS "Booking Confirmed..." + Voice — logged here)
-- ---------------------------------------------------------------------------
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid references bookings(id) on delete cascade,
  channel     text not null,        -- sms | voice | panel
  recipient   text,
  message     text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- AUDIT LOG  (who did what — every state/money change)
-- ---------------------------------------------------------------------------
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references users(id) on delete set null,
  actor_name  text,
  entity      text not null,        -- plot | booking | project | payment | registration | user
  entity_id   uuid,
  action      text not null,        -- e.g. block / book / confirm / cancel / register / create
  details     text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_entity on audit_log(entity, entity_id);
create index if not exists idx_audit_created on audit_log(created_at desc);

-- ---------------------------------------------------------------------------
-- CAB REQUESTS  (legacy — superseded by service_requests in migration 0009.
-- Kept for historical data; the app no longer writes here.)
-- ---------------------------------------------------------------------------
do $$ begin
  create type cab_request_status as enum ('pending', 'approved', 'declined');
exception
  when duplicate_object then null;
end $$;

create table if not exists cab_requests (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references customers(id) on delete cascade,
  requested_by   uuid references users(id) on delete set null,
  cab_date       date not null,
  pickup         text,
  notes          text,
  status         cab_request_status not null default 'pending',
  decline_reason text,
  decided_by     uuid references users(id) on delete set null,
  decided_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists idx_cab_requests_requested_by on cab_requests(requested_by);
create index if not exists idx_cab_requests_status       on cab_requests(status);
create index if not exists idx_cab_requests_customer     on cab_requests(customer_id);

-- ---------------------------------------------------------------------------
-- SERVICE REQUESTS  (unified request workflow — see migration 0009)
-- Five types, each with its own approval chain advanced one `stage` at a time:
--   site_visit    senior -> presales(admin)
--   legal_query   legal
--   draft         senior -> legal
--   registration  legal
--   cancellation  senior -> accounts(finance)
-- The chain itself lives in the app (src/lib/requests.ts).
-- ---------------------------------------------------------------------------
do $$ begin
  create type service_request_type as enum (
    'site_visit', 'legal_query', 'draft', 'registration', 'cancellation'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type service_request_status as enum ('pending', 'approved', 'declined');
exception when duplicate_object then null; end $$;

do $$ begin
  create type request_stage as enum ('senior', 'presales', 'legal', 'accounts', 'done');
exception when duplicate_object then null; end $$;

create table if not exists service_requests (
  id              uuid primary key default gen_random_uuid(),
  type            service_request_type   not null,
  status          service_request_status not null default 'pending',
  stage           request_stage          not null default 'senior',
  customer_id     uuid references customers(id) on delete set null,
  booking_id      uuid references bookings(id)  on delete set null,
  project_id      uuid references projects(id)  on delete set null,
  subject         text,
  details         text,
  response        text,
  visit_date      date,
  pickup          text,
  requested_by    uuid references users(id) on delete set null,
  senior_decided_by uuid references users(id) on delete set null,
  senior_decided_at timestamptz,
  final_decided_by  uuid references users(id) on delete set null,
  final_decided_at  timestamptz,
  decline_reason  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_service_requests_type        on service_requests(type);
create index if not exists idx_service_requests_status      on service_requests(status);
create index if not exists idx_service_requests_stage       on service_requests(stage);
create index if not exists idx_service_requests_requested_by on service_requests(requested_by);
create index if not exists idx_service_requests_customer    on service_requests(customer_id);
create index if not exists idx_service_requests_booking     on service_requests(booking_id);

-- ---------------------------------------------------------------------------
-- COUPONS / TOKENS  (see migration 0011) — coupons/tokens issued to a
-- salesperson. Admin can issue extra (e.g. a Cab Token to a Director).
-- Balance per type = sum of the person's rows.
-- ---------------------------------------------------------------------------
create table if not exists coupons (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  type        text not null,                  -- cab | tools | digital | gold
  quantity    integer not null default 0,
  value       numeric(14,2) not null default 0,
  source      text not null default 'admin',  -- admin | auto
  note        text,
  issued_by   uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_coupons_user on coupons(user_id);
create index if not exists idx_coupons_type on coupons(type);
