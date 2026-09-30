-- AlterTable
ALTER TABLE "coupons" ADD COLUMN     "booking_id" UUID,
ADD COLUMN     "plot_id" UUID,
ADD COLUMN     "project_id" UUID,
ADD COLUMN     "registration_id" UUID,
ADD COLUMN     "service_request_id" UUID;

-- CreateIndex
CREATE INDEX "idx_coupons_booking" ON "coupons"("booking_id");

-- CreateIndex
CREATE INDEX "idx_coupons_plot" ON "coupons"("plot_id");

-- CreateIndex
CREATE INDEX "idx_coupons_registration" ON "coupons"("registration_id");

-- CreateIndex
CREATE INDEX "idx_coupons_service_request" ON "coupons"("service_request_id");

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "plots"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- ============================================================================
-- Everything below is hand-written: a one-off backfill so the token history can
-- name the plot / registration / site visit behind rows written BEFORE these
-- columns existed. Each block only links a row when the match is unambiguous;
-- anything it cannot pin down is left NULL and the history shows it as
-- "not linked" rather than guessing a plot.
-- ============================================================================

-- 1. Registration auto-issues (Gold / Digital / Tools). createRegistration has
--    always ended the note with " · registration <register_number>", and the
--    holder must be the Director or Senior Director on that registration's
--    booking — which also disambiguates a register number reused across projects.
update coupons c
set registration_id = r.id,
    booking_id      = r.booking_id,
    plot_id         = r.plot_id,
    project_id      = r.project_id
from registrations r
join bookings b on b.id = r.booking_id
where c.source = 'auto'
  and c.registration_id is null
  and right(c.note, length(' · registration ' || r.register_number)) = ' · registration ' || r.register_number
  and c.user_id in (b.director_id, b.senior_director_id);

-- 2. Cab-request debits ("Cab request approved", −1 cab). The row is written in
--    the same action that stamps the request's final approval, so it is the
--    approved cab request by that requester, approved by that same person,
--    within two minutes of the row. Closest one wins.
with m as (
  select distinct on (c.id)
         c.id as coupon_id, sr.id as request_id, sr.booking_id, sr.project_id
  from coupons c
  join service_requests sr
    on sr.type = 'cab'
   and sr.status = 'approved'
   and sr.requested_by = c.user_id
   and sr.final_decided_by is not distinct from c.issued_by
   and abs(extract(epoch from (c.created_at - sr.final_decided_at))) < 120
  where c.source = 'auto'
    and c.type = 'cab'
    and c.quantity < 0
    and c.service_request_id is null
  order by c.id, abs(extract(epoch from (c.created_at - sr.final_decided_at)))
)
update coupons c
set service_request_id = m.request_id,
    booking_id         = m.booking_id,
    project_id         = coalesce(m.project_id, b.project_id),
    plot_id            = b.plot_id
from m
left join bookings b on b.id = m.booking_id
where c.id = m.coupon_id;

-- 3. Cab grants ("Cab tokens · <mode> held > 48h", +3 cab). The note never named
--    the booking, but the sweep grants each Director once per booking, in the
--    order their bookings were created. So the Nth grant pairs with the Nth
--    granted booking — linked only for a Director where that is provably safe:
--      • grant and booking counts match,
--      • no two grants landed in the same sweep (< 10 min apart — the order
--        within one sweep is arbitrary), and
--      • every pair's booking was already 48h old when its grant was written.
with g0 as (
  select c.id, c.user_id, c.created_at,
         c.created_at - lag(c.created_at) over (partition by c.user_id order by c.created_at) as gap
  from coupons c
  where c.source = 'auto'
    and c.type = 'cab'
    and c.quantity > 0
    and c.note like 'Cab tokens · %'
    and c.booking_id is null
),
g as (
  select id, user_id, created_at,
         row_number() over (partition by user_id order by created_at, id) as rn,
         count(*)     over (partition by user_id) as n,
         coalesce(bool_or(gap < interval '10 minutes') over (partition by user_id), false) as clustered
  from g0
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
  where not g.clustered
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
where c.id = m.coupon_id;
