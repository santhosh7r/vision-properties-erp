-- 0035 · Strip IEEE-754 float noise from stored money.
--
-- WHY: every ₹ figure is computed in JavaScript before it is written, and
-- doubles cannot hold most decimal fractions exactly. 709.3 × 700 evaluates to
-- 496509.99999999994 and 721.2 × 700 to 504840.00000000006, so plots stored
-- total values like ₹4,96,509.9999999999 / ₹5,04,840.0000000001. Since 0024
-- these columns are unconstrained `numeric`, which faithfully keeps that noise.
--
-- The app now sanitises on write and on display (see `exact()` in
-- src/lib/format.ts), so no NEW row carries noise. This cleans the rows written
-- before that — which matters beyond looks: bookings.payment_status is decided
-- by `advance_paid >= total_plot_value`, and a total stored 0.00000000006 above
-- the true price leaves a fully-paid booking reading 'pending' forever.
--
-- HOW: round to 12 significant digits — the same rule the app uses. Float noise
-- lives in the 16th–17th significant digit, so this only ever removes noise;
-- 12 digits keeps a ₹9-crore figure to 4 decimals and a ₹4.589363/sq.ft rate
-- (or any rate × sq.ft product of it) intact.
--
-- SAFE TO RE-RUN: rounding an already-rounded value is a no-op.
--
-- SAFE ON ANY SCHEMA VERSION: each (table, column) is applied only if it really
-- exists in this database. Earlier migrations added money columns over time
-- (e.g. projects.guideline_value arrived in 0010, the tools coupons later), so
-- a database that skipped one must not fail the whole cleanup — it just has
-- nothing to clean there. Columns are also skipped unless they are numeric:
-- rounding is meaningless on anything else.

create or replace function public.exact_num(v numeric) returns numeric as $$
  select case
    when v is null or v = 0 then v
    -- digits before the point = floor(log10(|v|)) + 1; negative for |v| < 1,
    -- which correctly allows MORE decimals on small per-sq.ft rates.
    else trim_scale(round(v, greatest(0, 12 - (floor(log(abs(v)))::int + 1))))
  end;
$$ language sql immutable;

-- Preflight. Skipping is safe, but skipping EVERYTHING almost always means this
-- was run against the wrong database — so say so loudly rather than reporting a
-- clean no-op run.
do $$
declare
  expected text[] := array[
    'projects', 'plots', 'bookings', 'payments',
    'registrations', 'plot_transfers', 'coupons'
  ];
  missing text[] := '{}';
  t text;
begin
  foreach t in array expected loop
    if to_regclass('public.' || t) is null then
      missing := missing || t;
    end if;
  end loop;

  if array_length(missing, 1) = array_length(expected, 1) then
    raise exception
      'None of the expected tables (%) exist here — this is not the Vision Properties database.',
      array_to_string(expected, ', ');
  elsif array_length(missing, 1) > 0 then
    raise warning
      'Missing table(s): % — those are skipped. If you did not expect this, check you are on the right project.',
      array_to_string(missing, ', ');
  end if;
end $$;

do $$
declare
  -- Every ₹ / extent / rate column in the schema. Extra names are harmless;
  -- missing ones are skipped.
  targets text[][] := array[
    -- projects · per-sq.ft coupon & token rates and SOP policy amounts
    ['projects', 'guideline_value'],
    ['projects', 'director_gold_coupon'],
    ['projects', 'director_digital_coupon'],
    ['projects', 'director_tools_coupon'],
    ['projects', 'senior_director_gold_coupon'],
    ['projects', 'senior_director_tools_coupon'],
    ['projects', 'blocking_amount'],
    ['projects', 'advance_percent'],
    ['projects', 'advance_min_amount'],
    ['projects', 'cancellation_charge'],
    ['projects', 'transfer_charge'],
    -- plots · extent and rate feed total plot value
    ['plots', 'sqft'],
    ['plots', 'price_per_sqft'],
    -- bookings · every ₹ figure captured at booking time
    ['bookings', 'plot_sqft'],
    ['bookings', 'total_plot_value'],
    ['bookings', 'blocking_amount'],
    ['bookings', 'advance_required'],
    ['bookings', 'advance_paid'],
    ['bookings', 'cancellation_charge'],
    ['bookings', 'refund_amount'],
    ['payments', 'amount'],
    ['registrations', 'plot_sqft'],
    ['plot_transfers', 'from_value'],
    ['plot_transfers', 'to_value'],
    ['plot_transfers', 'charge'],
    ['coupons', 'value']
  ];
  t text;
  c text;
  i int;
  touched int;
begin
  for i in 1 .. array_length(targets, 1) loop
    t := targets[i][1];
    c := targets[i][2];

    if not exists (
      select 1
        from information_schema.columns
       where table_schema = 'public'
         and table_name   = t
         and column_name  = c
         and data_type    = 'numeric'
    ) then
      raise notice 'skip %.% (absent or not numeric)', t, c;
      continue;
    end if;

    -- Only rewrite rows the rounding actually changes, so re-runs touch nothing
    -- and the tables are not needlessly bloated with dead tuples.
    execute format(
      'update %I set %I = public.exact_num(%I) where %I is distinct from public.exact_num(%I)',
      t, c, c, c, c
    );
    get diagnostics touched = row_count;
    if touched > 0 then
      raise notice 'cleaned % row(s) in %.%', touched, t, c;
    end if;
  end loop;
end $$;

-- A booking whose total was stored a hair HIGH could never reach 'completed',
-- however much was paid. Now that the totals are clean, promote exactly those
-- rows. Deliberately one-directional: nothing is demoted out of 'completed'.
--
-- Guarded like the loop above: a database without `bookings` (or without these
-- columns) has no stuck rows to rescue, so it skips rather than failing.
do $$
declare
  touched int;
begin
  if to_regclass('public.bookings') is null then
    raise notice 'skip payment_status rescue (no bookings table)';
    return;
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'bookings'
       and column_name in ('payment_status', 'total_plot_value', 'advance_paid')
    group by table_name
    having count(*) = 3
  ) then
    raise notice 'skip payment_status rescue (bookings lacks the needed columns)';
    return;
  end if;

  update bookings
     set payment_status = 'completed'
   where payment_status <> 'completed'
     and total_plot_value > 0
     and advance_paid >= total_plot_value;

  get diagnostics touched = row_count;
  raise notice 'payment_status: promoted % stuck booking(s) to completed', touched;
end $$;
