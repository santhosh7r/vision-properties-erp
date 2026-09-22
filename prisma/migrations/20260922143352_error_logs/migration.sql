-- CreateTable
CREATE TABLE "error_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fingerprint" TEXT NOT NULL,
    "short_id" TEXT NOT NULL,
    "name" TEXT,
    "message" TEXT,
    "raw_message" TEXT,
    "code" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'unknown',
    "severity" TEXT NOT NULL DEFAULT 'error',
    "source" TEXT NOT NULL DEFAULT 'server',
    "module" TEXT,
    "route" TEXT,
    "api_endpoint" TEXT,
    "http_method" TEXT,
    "http_status" INTEGER,
    "stack" TEXT,
    "component_stack" TEXT,
    "db_details" JSONB,
    "context" JSONB,
    "request_id" TEXT,
    "user_id" UUID,
    "user_email" TEXT,
    "user_role" TEXT,
    "url" TEXT,
    "user_agent" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "device" TEXT,
    "runtime" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "release" TEXT,
    "occurrence_count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_event_id" TEXT,
    "recent" JSONB NOT NULL DEFAULT '[]',
    "affected_users" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'new',
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" UUID,
    "resolved_by_name" TEXT,
    "resolution_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "error_logs_fingerprint_key" ON "error_logs"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "idx_error_logs_short_id" ON "error_logs"("short_id");

-- CreateIndex
CREATE INDEX "idx_error_logs_last_seen" ON "error_logs"("last_seen_at" DESC);

-- CreateIndex
CREATE INDEX "idx_error_logs_status" ON "error_logs"("status", "last_seen_at" DESC);

-- CreateIndex
CREATE INDEX "idx_error_logs_severity" ON "error_logs"("severity", "last_seen_at" DESC);

-- CreateIndex
CREATE INDEX "idx_error_logs_module" ON "error_logs"("module");

-- CreateIndex
CREATE INDEX "idx_error_logs_source" ON "error_logs"("source");

-- CreateIndex
CREATE INDEX "idx_error_logs_env" ON "error_logs"("environment");

-- CreateIndex
CREATE INDEX "idx_error_logs_last_event" ON "error_logs"("last_event_id");

-- AddForeignKey
ALTER TABLE "error_logs" ADD CONSTRAINT "error_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "error_logs" ADD CONSTRAINT "error_logs_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- ============================================================================
-- Everything below is hand-written: Prisma's schema language cannot express
-- CHECK constraints, row-level security, or PL/pgSQL functions, so the parts of
-- the error monitoring system that make it CORRECT rather than merely present
-- live here.
--
--   • the two CHECK constraints that keep severity/status to their known sets
--   • RLS with no policies, so anon and authenticated cannot read stack traces
--   • record_error(), the atomic upsert-by-fingerprint that does the
--     deduplication — the only supported way to write to this table
--   • purge_error_logs(), retention
--
-- Keep this block with the migration. If the model above changes, this is
-- re-applied as a new migration, not edited in place.
-- ============================================================================

do $$ begin
  alter table error_logs
    add constraint error_logs_severity_chk
    check (severity in ('info', 'warning', 'error', 'critical'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table error_logs
    add constraint error_logs_status_chk
    check (status in ('new', 'investigating', 'in_progress', 'resolved', 'ignored'));
exception when duplicate_object then null; end $$;


-- RLS on with NO policies: anon and authenticated roles are denied outright.
-- The service-role key used by the server bypasses RLS, so the ONLY way in or
-- out of this table is the application's own server code. Deliberate — these
-- rows carry stack traces.
alter table error_logs enable row level security;

-- ---------------------------------------------------------------------------
-- HELPERS
-- ---------------------------------------------------------------------------

-- First `n` elements of a jsonb array, order preserved. Used to bound `recent`
-- and `affected_users` on every write.
create or replace function error_logs_head(arr jsonb, n integer)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
  from (
    select e, ord
    from jsonb_array_elements(coalesce(arr, '[]'::jsonb)) with ordinality as t(e, ord)
    order by ord
    limit n
  ) s;
$$;

-- Severity ordering, so a group that starts as a warning and later blows up as
-- a critical is promoted rather than flip-flopping with whichever occurrence
-- landed last.
create or replace function error_logs_severity_rank(s text)
returns integer
language sql
immutable
as $$
  select case s
    when 'critical' then 4
    when 'error'    then 3
    when 'warning'  then 2
    when 'info'     then 1
    else 0
  end;
$$;

-- ---------------------------------------------------------------------------
-- record_error(p jsonb) — the ONLY write path.
--
-- Upsert-by-fingerprint: inserts the group the first time, and from then on
-- increments the count, moves last_seen_at, refreshes the "latest occurrence"
-- fields and pushes onto the bounded history. Atomic (row lock + unique-
-- violation retry), so concurrent requests hitting the same bug cannot create
-- two rows or lose a count.
--
-- `occurrence_count` on the payload lets the server batch: when an error fires
-- in a tight loop the capture layer throttles writes and carries the skipped
-- count forward, so the total stays exact with a fraction of the round-trips.
--
-- Returns the group so the caller can hand the user a reference code.
-- ---------------------------------------------------------------------------
create or replace function record_error(p jsonb)
returns table (
  id uuid,
  short_id text,
  fingerprint text,
  occurrence_count integer,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fp        text := nullif(trim(p->>'fingerprint'), '');
  v_n         integer := greatest(1, coalesce((p->>'occurrence_count')::integer, 1));
  v_seen      timestamptz := coalesce((p->>'occurred_at')::timestamptz, now());
  v_sev       text := coalesce(nullif(p->>'severity', ''), 'error');
  v_short     text;
  v_event     jsonb;
  v_actor     jsonb;
  v_uid       uuid := nullif(p->>'user_id', '')::uuid;
  v_row       error_logs%rowtype;
begin
  if v_fp is null then
    v_fp := md5(coalesce(p->>'name', '') || '|' || coalesce(p->>'message', 'unknown'));
  end if;
  -- Mirrors shortIdFor() in src/lib/errors/fingerprint.ts — the same group must
  -- carry the same code whichever side computed it.
  v_short := 'ERR-' || upper(substr(v_fp, 1, 7));

  -- One occurrence, trimmed to what is useful when scrolling history.
  v_event := jsonb_strip_nulls(jsonb_build_object(
    'event_id',     p->>'event_id',
    'at',           to_char(v_seen at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'source',       p->>'source',
    'route',        p->>'route',
    'api_endpoint', p->>'api_endpoint',
    'http_status',  p->'http_status',
    'request_id',   p->>'request_id',
    'user_id',      p->>'user_id',
    'user_email',   p->>'user_email',
    'user_role',    p->>'user_role',
    'environment',  p->>'environment',
    'release',      p->>'release',
    'message',      p->>'message'
  ));

  v_actor := case
    when v_uid is null then null
    else jsonb_strip_nulls(jsonb_build_object(
      'id',    p->>'user_id',
      'email', p->>'user_email',
      'role',  p->>'user_role',
      'at',    to_char(v_seen at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ))
  end;

  -- Lock the group if it already exists, so a concurrent occurrence of the same
  -- bug queues behind us instead of racing the count.
  select * into v_row from error_logs e where e.fingerprint = v_fp for update;

  if not found then
    begin
      insert into error_logs (
        fingerprint, short_id, name, message, raw_message, code, kind, severity, source,
        module, route, api_endpoint, http_method, http_status,
        stack, component_stack, db_details, context,
        request_id, user_id, user_email, user_role, url, user_agent,
        browser, os, device, runtime, environment, release,
        occurrence_count, first_seen_at, last_seen_at, last_event_id,
        recent, affected_users
      ) values (
        v_fp, v_short,
        p->>'name', p->>'message', p->>'raw_message', p->>'code',
        coalesce(nullif(p->>'kind', ''), 'unknown'), v_sev,
        coalesce(nullif(p->>'source', ''), 'server'),
        p->>'module', p->>'route', p->>'api_endpoint', p->>'http_method',
        nullif(p->>'http_status', '')::integer,
        p->>'stack', p->>'component_stack',
        nullif(p->'db_details', 'null'::jsonb), nullif(p->'context', 'null'::jsonb),
        p->>'request_id', v_uid, p->>'user_email', p->>'user_role',
        p->>'url', p->>'user_agent', p->>'browser', p->>'os', p->>'device',
        p->>'runtime', coalesce(nullif(p->>'environment', ''), 'production'), p->>'release',
        v_n, v_seen, v_seen, p->>'event_id',
        jsonb_build_array(v_event),
        case when v_actor is null then '[]'::jsonb else jsonb_build_array(v_actor) end
      )
      returning * into v_row;

      -- Brand new group: the insert already carries this occurrence.
      return query select v_row.id, v_row.short_id, v_row.fingerprint,
                          v_row.occurrence_count, v_row.status;
      return;
    exception when unique_violation then
      -- Another request inserted the same group between our select and our
      -- insert. Re-read it under lock and fold this occurrence in below, rather
      -- than failing a capture over a race.
      select * into v_row from error_logs e where e.fingerprint = v_fp for update;
    end;
  end if;

  -- Existing group — fold this occurrence in.
  update error_logs e set
    occurrence_count = e.occurrence_count + v_n,
    last_seen_at     = greatest(e.last_seen_at, v_seen),
    first_seen_at    = least(e.first_seen_at, v_seen),
    last_event_id    = coalesce(p->>'event_id', e.last_event_id),
    -- Promote severity, never demote: a group that has once been critical stays
    -- visible as critical until a human closes it.
    severity         = case
                         when error_logs_severity_rank(v_sev) > error_logs_severity_rank(e.severity)
                         then v_sev else e.severity end,
    -- "Latest occurrence" fields follow the newest event only.
    name             = coalesce(p->>'name', e.name),
    message          = coalesce(p->>'message', e.message),
    raw_message      = coalesce(p->>'raw_message', e.raw_message),
    code             = coalesce(p->>'code', e.code),
    kind             = coalesce(nullif(p->>'kind', ''), e.kind),
    source           = coalesce(nullif(p->>'source', ''), e.source),
    module           = coalesce(p->>'module', e.module),
    route            = coalesce(p->>'route', e.route),
    api_endpoint     = coalesce(p->>'api_endpoint', e.api_endpoint),
    http_method      = coalesce(p->>'http_method', e.http_method),
    http_status      = coalesce(nullif(p->>'http_status', '')::integer, e.http_status),
    stack            = coalesce(p->>'stack', e.stack),
    component_stack  = coalesce(p->>'component_stack', e.component_stack),
    db_details       = coalesce(nullif(p->'db_details', 'null'::jsonb), e.db_details),
    context          = coalesce(nullif(p->'context', 'null'::jsonb), e.context),
    request_id       = coalesce(p->>'request_id', e.request_id),
    user_id          = coalesce(v_uid, e.user_id),
    user_email       = coalesce(p->>'user_email', e.user_email),
    user_role        = coalesce(p->>'user_role', e.user_role),
    url              = coalesce(p->>'url', e.url),
    user_agent       = coalesce(p->>'user_agent', e.user_agent),
    browser          = coalesce(p->>'browser', e.browser),
    os               = coalesce(p->>'os', e.os),
    device           = coalesce(p->>'device', e.device),
    runtime          = coalesce(p->>'runtime', e.runtime),
    environment      = coalesce(nullif(p->>'environment', ''), e.environment),
    release          = coalesce(p->>'release', e.release),
    recent           = error_logs_head(jsonb_build_array(v_event) || e.recent, 20),
    affected_users   = case
                         when v_actor is null then e.affected_users
                         else error_logs_head(
                           jsonb_build_array(v_actor) || coalesce(
                             (select jsonb_agg(x) from jsonb_array_elements(e.affected_users) x
                               where x->>'id' is distinct from (p->>'user_id')),
                             '[]'::jsonb),
                           20)
                       end,
    -- A bug that comes back after being closed re-opens itself. `ignored` is a
    -- deliberate, permanent human decision and is left alone.
    status           = case when e.status = 'resolved' then 'new' else e.status end,
    resolved_at      = case when e.status = 'resolved' then null else e.resolved_at end,
    updated_at       = now()
  where e.id = v_row.id
  returning * into v_row;

  return query select v_row.id, v_row.short_id, v_row.fingerprint, v_row.occurrence_count, v_row.status;
end;
$$;

-- Ingestion runs as the service role, which already bypasses RLS; the grants
-- below exist so the function is callable if the app is ever moved onto a
-- narrower role. anon/authenticated are NOT granted anything.
revoke all on function record_error(jsonb) from public;

-- ---------------------------------------------------------------------------
-- RETENTION — keeps the table small without a cron dependency. Called
-- opportunistically by the Error Logs page (see purgeOldErrors).
-- ---------------------------------------------------------------------------
create or replace function purge_error_logs(older_than_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from error_logs
  where status in ('resolved', 'ignored')
    and last_seen_at < now() - make_interval(days => greatest(1, older_than_days));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function purge_error_logs(integer) from public;
