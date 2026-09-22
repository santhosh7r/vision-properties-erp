-- ============================================================================
-- 0_init — BASELINE.
--
-- This is the state the database was ALREADY in when Prisma took over: the
-- result of the 39 hand-written migrations in supabase/migrations/. It was
-- marked as applied with `prisma migrate resolve`, so it never runs against
-- production — it exists so Prisma can rebuild the schema from scratch in a
-- shadow database when working out what each NEW migration should contain.
--
-- The sequence, functions and triggers below are not expressible in
-- schema.prisma and are therefore not produced by introspection. They are
-- included by hand because the table definitions depend on them (a column
-- default calls nextval on the sequence), and without them the shadow replay
-- fails and no further migration can be created.
-- ============================================================================

-- Sequences ------------------------------------------------------------------
-- Must come first: bookings.receipt_no defaults to nextval() on this.
CREATE SEQUENCE IF NOT EXISTS public.booking_receipt_seq;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "approval_type" AS ENUM ('dtcp_rera', 'dtcp_only');

-- CreateEnum
CREATE TYPE "book_mode" AS ENUM ('blocking', 'booking');

-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('pending', 'confirmed', 'cancelled');

-- CreateEnum
CREATE TYPE "cab_request_status" AS ENUM ('pending', 'approved', 'declined');

-- CreateEnum
CREATE TYPE "loan_token_by" AS ENUM ('customer', 'director', 'senior_director');

-- CreateEnum
CREATE TYPE "payment_kind" AS ENUM ('blocking', 'advance', 'installment', 'final');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('pending', 'completed');

-- CreateEnum
CREATE TYPE "plot_status" AS ENUM ('available', 'blocked', 'booked', 'registered', 'sold', 'cancelled');

-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('draft', 'active', 'on_hold', 'closed');

-- CreateEnum
CREATE TYPE "project_type" AS ENUM ('affordable', 'luxury');

-- CreateEnum
CREATE TYPE "request_stage" AS ENUM ('senior', 'presales', 'legal', 'accounts', 'done');

-- CreateEnum
CREATE TYPE "service_request_status" AS ENUM ('pending', 'approved', 'declined', 'draft');

-- CreateEnum
CREATE TYPE "service_request_type" AS ENUM ('site_visit', 'legal_query', 'draft', 'registration', 'cancellation', 'cab');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('admin', 'senior_director', 'director', 'business_manager', 'business_partner', 'finance', 'legal', 'pre_sales', 'post_sales', 'digital', 'general_manager', 'pre_post_sales');

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "actor_name" TEXT,
    "entity" TEXT NOT NULL,
    "entity_id" UUID,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plot_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "block" TEXT,
    "plot_sqft" DECIMAL,
    "total_plot_value" DECIMAL NOT NULL DEFAULT 0,
    "nominee_name" TEXT,
    "nominee_mobile" TEXT,
    "nominee_relationship" TEXT,
    "partner_id" UUID,
    "partner_name" TEXT,
    "director_id" UUID,
    "director_name" TEXT,
    "tentative_registration_date" DATE,
    "mode_of_payment" TEXT,
    "loan_token_by" "loan_token_by",
    "booked_date" DATE,
    "remarks" TEXT,
    "book_mode" "book_mode" NOT NULL,
    "blocking_amount" DECIMAL NOT NULL DEFAULT 0,
    "advance_required" DECIMAL NOT NULL DEFAULT 0,
    "advance_paid" DECIMAL NOT NULL DEFAULT 0,
    "status" "booking_status" NOT NULL DEFAULT 'pending',
    "payment_status" "payment_status" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ(6),
    "released_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancellation_reason" TEXT,
    "cancellation_charge" DECIMAL,
    "refund_amount" DECIMAL,
    "refund_status" TEXT NOT NULL DEFAULT 'none',
    "refund_approved_by" UUID,
    "refund_approved_at" TIMESTAMPTZ(6),
    "refund_due_date" DATE,
    "refund_paid_at" TIMESTAMPTZ(6),
    "partner_code" TEXT,
    "director_code" TEXT,
    "senior_director_id" UUID,
    "senior_director_code" TEXT,
    "senior_director_name" TEXT,
    "cab_tokens_issued" BOOLEAN NOT NULL DEFAULT false,
    "cancel_requested_by" UUID,
    "cancel_requested_at" TIMESTAMPTZ(6),
    "cancel_request_reason" TEXT,
    "expired_at" TIMESTAMPTZ(6),
    "pre_expiry_status" "booking_status",
    "receipt_no" TEXT DEFAULT ('VPO'::text || nextval('booking_receipt_seq'::regclass)),
    "payment_receipt_seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cab_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "requested_by" UUID,
    "cab_date" DATE NOT NULL,
    "pickup" TEXT,
    "notes" TEXT,
    "status" "cab_request_status" NOT NULL DEFAULT 'pending',
    "decline_reason" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cab_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "value" DECIMAL NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'admin',
    "note" TEXT,
    "issued_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "dob" DATE,
    "anniversary_date" DATE,
    "street" TEXT,
    "area" TEXT,
    "state" TEXT,
    "district" TEXT,
    "pincode" TEXT,
    "occupation" TEXT,
    "occupation_remarks" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT,
    "country" TEXT,
    "father_name" TEXT,
    "father_mobile" TEXT,
    "spouse_name" TEXT,
    "spouse_mobile" TEXT,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_forms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL DEFAULT 'Site Visit Feedback',
    "intro" TEXT,
    "thank_you" TEXT,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID,
    "form_id" UUID,
    "token" TEXT NOT NULL,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "scheduled_for" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "responded_at" TIMESTAMPTZ(6),
    "answers" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID,
    "channel" TEXT NOT NULL,
    "recipient" TEXT,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "amount" DECIMAL NOT NULL,
    "kind" "payment_kind" NOT NULL,
    "mode" TEXT,
    "status" "payment_status" NOT NULL DEFAULT 'completed',
    "paid_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "bank_name" TEXT,
    "instrument_date" DATE,
    "receipt_no" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plot_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plot_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plot_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "from_plot_id" UUID NOT NULL,
    "to_plot_id" UUID NOT NULL,
    "from_value" DECIMAL NOT NULL DEFAULT 0,
    "to_value" DECIMAL NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL,
    "charge" DECIMAL NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "approved_by" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plot_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "block" TEXT,
    "plot_no" TEXT NOT NULL,
    "sqft" DECIMAL NOT NULL,
    "price_per_sqft" DECIMAL NOT NULL DEFAULT 0,
    "description" TEXT,
    "status" "plot_status" NOT NULL DEFAULT 'available',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plot_category_id" UUID,

    CONSTRAINT "plots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "remarks" TEXT,
    "area" TEXT NOT NULL,
    "land_type" TEXT,
    "approval_type" "approval_type" NOT NULL,
    "project_type" "project_type" NOT NULL,
    "category_id" UUID,
    "status" "project_status" NOT NULL DEFAULT 'draft',
    "blocking_amount" DECIMAL NOT NULL DEFAULT 10000,
    "blocking_window_hours" INTEGER NOT NULL DEFAULT 48,
    "advance_percent" DECIMAL NOT NULL DEFAULT 5,
    "booking_window_days" INTEGER NOT NULL DEFAULT 15,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "advance_min_amount" DECIMAL NOT NULL DEFAULT 50000,
    "cancel_full_refund_days" INTEGER NOT NULL DEFAULT 3,
    "cancellation_charge" DECIMAL NOT NULL DEFAULT 5000,
    "refund_processing_days" INTEGER NOT NULL DEFAULT 5,
    "transfer_charge" DECIMAL NOT NULL DEFAULT 5000,
    "branch" TEXT,
    "guideline_value" DECIMAL NOT NULL DEFAULT 0,
    "director_gold_coupon" DECIMAL NOT NULL DEFAULT 0,
    "director_digital_coupon" DECIMAL NOT NULL DEFAULT 0,
    "senior_director_gold_coupon" DECIMAL NOT NULL DEFAULT 0,
    "director_tools_coupon" DECIMAL NOT NULL DEFAULT 0,
    "senior_director_tools_coupon" DECIMAL NOT NULL DEFAULT 0,
    "pincode" TEXT,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID,
    "plot_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "block" TEXT,
    "plot_sqft" DECIMAL,
    "register_date" DATE NOT NULL,
    "register_number" TEXT NOT NULL,
    "name_of_registrant" TEXT NOT NULL,
    "mobile" TEXT,
    "remarks" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_page_access" (
    "role" TEXT NOT NULL,
    "page_key" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_page_access_pkey" PRIMARY KEY ("role","page_key")
);

-- CreateTable
CREATE TABLE "role_settings" (
    "role" TEXT NOT NULL,
    "can_login" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_settings_pkey" PRIMARY KEY ("role")
);

-- CreateTable
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "service_request_type" NOT NULL,
    "status" "service_request_status" NOT NULL DEFAULT 'pending',
    "stage" "request_stage" NOT NULL DEFAULT 'senior',
    "customer_id" UUID,
    "booking_id" UUID,
    "project_id" UUID,
    "subject" TEXT,
    "details" TEXT,
    "response" TEXT,
    "visit_date" DATE,
    "pickup" TEXT,
    "requested_by" UUID,
    "senior_decided_by" UUID,
    "senior_decided_at" TIMESTAMPTZ(6),
    "final_decided_by" UUID,
    "final_decided_at" TIMESTAMPTZ(6),
    "decline_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "visit_time" TIME(6),
    "travel_mode" TEXT,
    "cab_type" TEXT,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "mobile" TEXT,
    "role" "user_role" NOT NULL,
    "manager_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partner_code" TEXT,
    "city" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "session_version" INTEGER NOT NULL DEFAULT 0,
    "district" TEXT,
    "date_of_birth" DATE,
    "whatsapp" TEXT,
    "address" TEXT,
    "occupation" TEXT,
    "rera_number" TEXT,
    "nominee_name" TEXT,
    "nominee_mobile" TEXT,
    "declared_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_audit_created" ON "audit_log"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_audit_entity" ON "audit_log"("entity", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_active_booking_per_plot" ON "bookings"("plot_id") WHERE (status = ANY (ARRAY['pending'::booking_status, 'confirmed'::booking_status]));

-- CreateIndex
CREATE UNIQUE INDEX "uniq_bookings_receipt_no" ON "bookings"("receipt_no");

-- CreateIndex
CREATE INDEX "idx_bookings_creator" ON "bookings"("created_by");

-- CreateIndex
CREATE INDEX "idx_bookings_customer" ON "bookings"("customer_id");

-- CreateIndex
CREATE INDEX "idx_bookings_expired_at" ON "bookings"("expired_at") WHERE (expired_at IS NOT NULL);

-- CreateIndex
CREATE INDEX "idx_bookings_plot" ON "bookings"("plot_id");

-- CreateIndex
CREATE INDEX "idx_bookings_status" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "idx_cab_requests_customer" ON "cab_requests"("customer_id");

-- CreateIndex
CREATE INDEX "idx_cab_requests_requested_by" ON "cab_requests"("requested_by");

-- CreateIndex
CREATE INDEX "idx_cab_requests_status" ON "cab_requests"("status");

-- CreateIndex
CREATE INDEX "idx_coupons_type" ON "coupons"("type");

-- CreateIndex
CREATE INDEX "idx_coupons_user" ON "coupons"("user_id");

-- CreateIndex
CREATE INDEX "idx_customers_mobile" ON "customers"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "customers_owner_mobile_key" ON "customers"("created_by", "mobile") WHERE ((mobile IS NOT NULL) AND (created_by IS NOT NULL));

-- CreateIndex
CREATE UNIQUE INDEX "districts_name_key" ON "districts"("name");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_feedback_forms_active" ON "feedback_forms"("is_active") WHERE (is_active);

-- CreateIndex
CREATE UNIQUE INDEX "uniq_feedback_requests_request" ON "feedback_requests"("request_id") WHERE (request_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "feedback_requests_token_key" ON "feedback_requests"("token");

-- CreateIndex
CREATE INDEX "idx_feedback_requests_request" ON "feedback_requests"("request_id");

-- CreateIndex
CREATE INDEX "idx_feedback_requests_responded" ON "feedback_requests"("responded_at");

-- CreateIndex
CREATE INDEX "idx_feedback_requests_scheduled" ON "feedback_requests"("scheduled_for") WHERE (sent_at IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "uniq_payments_receipt_no" ON "payments"("receipt_no");

-- CreateIndex
CREATE INDEX "idx_payments_booking" ON "payments"("booking_id");

-- CreateIndex
CREATE INDEX "idx_plot_categories_project" ON "plot_categories"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "plot_categories_project_id_name_key" ON "plot_categories"("project_id", "name");

-- CreateIndex
CREATE INDEX "idx_transfers_booking" ON "plot_transfers"("booking_id");

-- CreateIndex
CREATE INDEX "idx_plots_category" ON "plots"("plot_category_id");

-- CreateIndex
CREATE INDEX "idx_plots_project" ON "plots"("project_id");

-- CreateIndex
CREATE INDEX "idx_plots_status" ON "plots"("status");

-- CreateIndex
CREATE UNIQUE INDEX "plots_project_id_plot_no_key" ON "plots"("project_id", "plot_no");

-- CreateIndex
CREATE UNIQUE INDEX "project_categories_name_key" ON "project_categories"("name");

-- CreateIndex
CREATE INDEX "idx_projects_category" ON "projects"("category_id");

-- CreateIndex
CREATE INDEX "idx_projects_status" ON "projects"("status");

-- CreateIndex
CREATE INDEX "idx_registrations_plot" ON "registrations"("plot_id");

-- CreateIndex
CREATE INDEX "idx_role_page_access_role" ON "role_page_access"("role");

-- CreateIndex
CREATE INDEX "idx_service_requests_booking" ON "service_requests"("booking_id");

-- CreateIndex
CREATE INDEX "idx_service_requests_customer" ON "service_requests"("customer_id");

-- CreateIndex
CREATE INDEX "idx_service_requests_requested_by" ON "service_requests"("requested_by");

-- CreateIndex
CREATE INDEX "idx_service_requests_stage" ON "service_requests"("stage");

-- CreateIndex
CREATE INDEX "idx_service_requests_status" ON "service_requests"("status");

-- CreateIndex
CREATE INDEX "idx_service_requests_type" ON "service_requests"("type");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_users_partner_code" ON "users"("partner_code") WHERE (partner_code IS NOT NULL);

-- CreateIndex
CREATE INDEX "idx_users_manager" ON "users"("manager_id");

-- CreateIndex
CREATE INDEX "idx_users_role" ON "users"("role");

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancel_requested_by_fkey" FOREIGN KEY ("cancel_requested_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_director_id_fkey" FOREIGN KEY ("director_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "plots"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_refund_approved_by_fkey" FOREIGN KEY ("refund_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_senior_director_id_fkey" FOREIGN KEY ("senior_director_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cab_requests" ADD CONSTRAINT "cab_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cab_requests" ADD CONSTRAINT "cab_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cab_requests" ADD CONSTRAINT "cab_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "feedback_forms" ADD CONSTRAINT "feedback_forms_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "feedback_requests" ADD CONSTRAINT "feedback_requests_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "feedback_forms"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "feedback_requests" ADD CONSTRAINT "feedback_requests_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "plot_categories" ADD CONSTRAINT "plot_categories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "plot_transfers" ADD CONSTRAINT "plot_transfers_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "plot_transfers" ADD CONSTRAINT "plot_transfers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "plot_transfers" ADD CONSTRAINT "plot_transfers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "plot_transfers" ADD CONSTRAINT "plot_transfers_from_plot_id_fkey" FOREIGN KEY ("from_plot_id") REFERENCES "plots"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "plot_transfers" ADD CONSTRAINT "plot_transfers_to_plot_id_fkey" FOREIGN KEY ("to_plot_id") REFERENCES "plots"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "plots" ADD CONSTRAINT "plots_plot_category_id_fkey" FOREIGN KEY ("plot_category_id") REFERENCES "plot_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "plots" ADD CONSTRAINT "plots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "project_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "plots"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_page_access" ADD CONSTRAINT "role_page_access_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_settings" ADD CONSTRAINT "role_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_final_decided_by_fkey" FOREIGN KEY ("final_decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_senior_decided_by_fkey" FOREIGN KEY ("senior_decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;


-- ----------------------------------------------------------------------------
-- Functions and triggers carried over from supabase/migrations/.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_partner_code()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  pfx text;
begin
  pfx := sales_code_prefix(new.role);
  if pfx is null then
    new.partner_code := null;
    return new;
  end if;
  if new.partner_code is not null and new.partner_code <> '' then
    return new;  -- respect an explicit code (e.g. data import)
  end if;
  -- Serialize per-prefix so concurrent inserts can't pick the same code.
  perform pg_advisory_xact_lock(hashtext('partner_code:' || pfx));
  new.partner_code := next_partner_code(pfx);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.assign_payment_receipt_no()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.next_partner_code(pfx text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare
  candidate text;
  digits    int := 2;
  attempts  int := 0;
begin
  loop
    candidate := pfx || lpad((floor(random() * power(10, digits)))::bigint::text, digits, '0');
    exit when not exists (select 1 from users where partner_code = candidate);
    attempts := attempts + 1;
    -- Widen the random space once the current width gets crowded.
    if attempts >= 20 then
      digits := digits + 1;
      attempts := 0;
    end if;
  end loop;
  return candidate;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sales_code_prefix(r user_role)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case r
    when 'senior_director'  then 'VPSD'
    when 'director'         then 'VPD'
    when 'business_manager' then 'VPBM'
    when 'business_partner' then 'VPBP'
    else null
  end;
$function$
;

CREATE TRIGGER trg_assign_partner_code BEFORE INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION assign_partner_code();
CREATE TRIGGER trg_assign_payment_receipt_no BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION assign_payment_receipt_no();
