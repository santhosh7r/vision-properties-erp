-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "bill_verified_at" TIMESTAMPTZ(6),
ADD COLUMN     "bill_verified_by" UUID;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_bill_verified_by_fkey" FOREIGN KEY ("bill_verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;


-- ============================================================================
-- Hand-written backfill. From now on a booking raised by a sales role (Senior
-- Director, Director, Business Manager, Business Partner) prints no bill until
-- Admin — or a desk acting for Admin — verifies its customer and plot details.
-- Existing bookings:
--   • raised by staff, confirmed, or cancelled → verified as of when they were
--     raised, so every bill that could be printed yesterday still prints;
--   • still PENDING and raised by a sales role → left unverified: exactly the
--     records the new rule is for. They print once Admin confirms or verifies.
-- bill_verified_by stays NULL on back-filled rows: nobody is on record for them.
-- ============================================================================
update bookings b
set bill_verified_at = b.created_at
where b.bill_verified_at is null
  and not (
    b.status = 'pending'
    and exists (
      select 1 from users u
      where u.id = b.created_by
        and u.role in ('senior_director', 'director', 'business_manager', 'business_partner')
    )
  );
