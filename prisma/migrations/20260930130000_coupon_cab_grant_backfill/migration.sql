-- Hand-written backfill, follow-up to 20260930120000_coupon_source_links.
--
-- That migration linked a Director's old cab grants ("Cab tokens · <mode> held
-- > 48h") to their bookings only when no two grants shared a sweep, which left
-- most of them unlinked. Grants from ONE sweep are indistinguishable rows —
-- same holder, +3 cab, same instant — so pairing the Nth grant with the Nth
-- granted booking still gives every row a plot that really earned a grant,
-- each plot exactly once; only the order within a sweep is arbitrary.
--
-- Still linked only per Director where it holds for every pair: grant and
-- booking counts match, and each booking was 48h old when its grant landed.
with g as (
  select c.id, c.user_id, c.created_at,
         row_number() over (partition by c.user_id order by c.created_at, c.id) as rn,
         count(*)     over (partition by c.user_id) as n
  from coupons c
  where c.source = 'auto'
    and c.type = 'cab'
    and c.quantity > 0
    and c.note like 'Cab tokens · %'
),
bk as (
  select b.id, b.director_id, b.plot_id, b.project_id, b.created_at,
         row_number() over (partition by b.director_id order by b.created_at, b.id) as rn,
         count(*)     over (partition by b.director_id) as n
  from bookings b
  where b.cab_tokens_issued
    and b.director_id is not null
),
pairs as (
  select g.id as coupon_id, g.user_id, bk.id as booking_id, bk.plot_id, bk.project_id,
         bk.created_at <= g.created_at - interval '48 hours' as ok
  from g
  join bk on bk.director_id = g.user_id and bk.rn = g.rn and bk.n = g.n
),
m as (
  select * from (
    select p.*, bool_and(p.ok) over (partition by p.user_id) as all_ok from pairs p
  ) x
  where x.all_ok
)
update coupons c
set booking_id = m.booking_id,
    plot_id    = m.plot_id,
    project_id = m.project_id
from m
where c.id = m.coupon_id
  and c.booking_id is null;
