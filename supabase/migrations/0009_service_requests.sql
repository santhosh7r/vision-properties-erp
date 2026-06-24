-- ============================================================================
-- 0009 — Service requests (unified request workflow)
--
-- Replaces the single-purpose cab_requests with one table that drives the five
-- request types on the Senior Director panel, each with its own approval chain:
--
--   site_visit    director -> senior approves -> pre-sales (admin) final approval
--   legal_query   director -> legal team responds (revert in the same request)
--   draft         director -> senior approves   -> legal team final approval
--   registration  director -> legal team (direct)
--   cancellation  director -> senior approves   -> accounts (finance) refund,
--                            plot freed for the next customer on completion
--
-- The chain is data-driven in the app (lib/requests.ts). A request advances one
-- `stage` at a time; reaching the end sets status='approved'. Any approver in
-- the chain can decline. Existing cab_requests rows are migrated as site_visits.
-- ============================================================================

do $$ begin
  create type service_request_type as enum (
    'site_visit',
    'legal_query',
    'draft',
    'registration',
    'cancellation'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type service_request_status as enum ('pending', 'approved', 'declined');
exception when duplicate_object then null; end $$;

-- Who the request currently sits with. 'done' = chain complete.
do $$ begin
  create type request_stage as enum ('senior', 'presales', 'legal', 'accounts', 'done');
exception when duplicate_object then null; end $$;

create table if not exists service_requests (
  id              uuid primary key default gen_random_uuid(),
  type            service_request_type   not null,
  status          service_request_status not null default 'pending',
  stage           request_stage          not null default 'senior',
  -- relations (all optional — depends on the type) ------------------------------
  customer_id     uuid references customers(id) on delete set null,
  booking_id      uuid references bookings(id)  on delete set null,
  project_id      uuid references projects(id)  on delete set null,
  -- generic content -------------------------------------------------------------
  subject         text,                  -- short title / legal query subject
  details         text,                  -- form body / notes / cancellation reason
  response        text,                  -- legal team revert / accounts note
  visit_date      date,                  -- site_visit: requested date
  pickup          text,                  -- site_visit: pickup location
  -- people & decisions ----------------------------------------------------------
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
-- Migrate existing cab_requests -> service_requests (type = site_visit).
-- A previously approved cab request is treated as fully approved (stage=done);
-- pending ones land on the first chain stage ('senior'); declined stay declined.
-- ---------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from information_schema.tables where table_name = 'cab_requests') then
    insert into service_requests
      (id, type, status, stage, customer_id, details, visit_date, pickup,
       requested_by, final_decided_by, final_decided_at, decline_reason, created_at, updated_at)
    select
      cr.id,
      'site_visit'::service_request_type,
      cr.status::text::service_request_status,
      case cr.status when 'pending' then 'senior' else 'done' end::request_stage,
      cr.customer_id,
      cr.notes,
      cr.cab_date,
      cr.pickup,
      cr.requested_by,
      cr.decided_by,
      cr.decided_at,
      cr.decline_reason,
      cr.created_at,
      coalesce(cr.decided_at, cr.created_at)
    from cab_requests cr
    on conflict (id) do nothing;
  end if;
end $$;
