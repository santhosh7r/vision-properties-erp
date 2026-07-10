-- ============================================================================
-- 0020 — Payment instrument details (mode-specific capture)
--
-- Every recorded payment carries a Mode (Cash / Cheque / Bank Transfer / UPI /
-- Home Loan / Other). For non-cash modes we now capture the supporting
-- instrument details so Finance can reconcile each collection:
--   Cheque        → reference = cheque no,  bank_name = drawee bank, instrument_date = cheque date
--   Bank Transfer → reference = UTR / txn ref, bank_name = bank
--   UPI           → reference = UPI txn id
--   Home Loan     → bank_name = lender, reference = sanction / ref no
--   Cash / Other  → optional free-text reference
--
-- Three reusable columns cover every mode; the UI shows only the relevant
-- fields per selected mode (see PAYMENT_MODE_FIELDS in src/lib/options.ts).
-- ============================================================================

alter table payments add column if not exists reference       text;
alter table payments add column if not exists bank_name       text;
alter table payments add column if not exists instrument_date date;
