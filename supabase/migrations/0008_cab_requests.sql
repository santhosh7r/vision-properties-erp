-- ============================================================================
-- 0008 — Cab requests
--
-- Sales team members request a cab for one of THEIR OWN clients (customers they
-- created) for a specific date. Each request is raised by the salesperson and
-- surfaced to Admin, who can APPROVE or DECLINE it. The salesperson can
-- RESCHEDULE (change the date) — which re-submits the request as pending.
-- ============================================================================

do $$ begin
  create type cab_request_status as enum ('pending', 'approved', 'declined');
exception
  when duplicate_object then null;
end $$;

create table if not exists cab_requests (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references customers(id) on delete cascade,
  requested_by   uuid references users(id) on delete set null,
  cab_date       date not null,                       -- date the cab is needed
  pickup         text,                                -- pickup location (optional)
  notes          text,                                -- optional notes for admin
  status         cab_request_status not null default 'pending',
  decline_reason text,
  decided_by     uuid references users(id) on delete set null,
  decided_at     timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists idx_cab_requests_requested_by on cab_requests(requested_by);
create index if not exists idx_cab_requests_status       on cab_requests(status);
create index if not exists idx_cab_requests_customer     on cab_requests(customer_id);
