# Vision Properties ERP — Application Logic

A complete reference to how the platform works: roles, the plot lifecycle, money
rules, and every major flow. Written to match the code — file/line references are
included so any rule can be traced to its source.

> Stack: Next.js 15 (App Router, server actions) · Supabase (Postgres) · JWT
> session cookie (`jose`). All DB writes go through the service-role key on the
> server; there is no client-side DB access.

---

## Table of contents
1. [Roles & capabilities](#1-roles--capabilities)
2. [Authentication & sessions](#2-authentication--sessions)
3. [The plot lifecycle](#3-the-plot-lifecycle)
4. [Blocking → Booking → Registration (the core flow)](#4-blocking--booking--registration-the-core-flow)
5. [Money: advance, payments, receipts](#5-money-advance-payments-receipts)
6. [Expiry & admin extend](#6-expiry--admin-extend)
7. [Cancellation & refund](#7-cancellation--refund)
8. [Transfers](#8-transfers)
9. [Coupons & tokens](#9-coupons--tokens)
10. [Requests & approvals](#10-requests--approvals)
11. [Bulk Excel import (dev-only)](#11-bulk-excel-import-dev-only)
12. [Dashboard & reports](#12-dashboard--reports)
13. [Project configuration reference](#13-project-configuration-reference)
14. [Cross-cutting: audit, notifications, the sweep](#14-cross-cutting)

---

## 1. Roles & capabilities

Seven roles (`src/lib/roles.ts`):

| Role | Sales code | In sales hierarchy | Notes |
|---|---|---|---|
| `admin` | — | no | Full control. The only role that can **book**, **cancel**, **approve refunds**, **issue/redeem coupons**, **manage users**. |
| `senior_director` | VPSD## | yes (top) | "Network head" — sees aggregated team data. |
| `director` | VPD## | yes | Personal view only. Earns auto coupons + cab tokens. |
| `business_manager` | VPBM## | yes | Like director but cannot raise requests. |
| `business_partner` | VPBP## | yes (bottom) | Can only block & manage own customers. |
| `finance` | — | no | Records payments, marks refunds paid, view reports. |
| `legal` | — | no | Manages registrations, view reports. |

**Sales hierarchy** (top→bottom): senior_director → director → business_manager → business_partner. Each user has a `manager_id` forming a tree; `getDownlineIds()` (`src/lib/hierarchy.ts`) walks it to roll a member's records up to their managers.

**Key capability rules** (`CAPABILITIES` map, `roles.ts:140`):
- **Only admin can BOOK** (`create_booking`) and **cancel** (`cancel_booking`). Sales roles can only **block** (`create_blocking`) and **request** a cancellation.
- **Only admin approves refunds** (`approve_refund`) and **issues/redeems coupons** (`manage_users`).
- **finance**: `record_payment`, `view_finance`. **legal**: `manage_registration`, `view_legal`.
- `can(role, cap)` gates every server action via `requireCapability(cap)` (`src/lib/auth.ts`).

**Sales codes** are auto-assigned by a DB trigger on insert (`VP` + role prefix + 2 digits, e.g. `VPSD47`); sales users can log in with **either** email or code.

---

## 2. Authentication & sessions

- **Login** (`src/app/login/actions.ts`): look up by email (if the identifier has `@`) or by `partner_code`; reject inactive; `bcrypt.compare` the password; on success `createSession()`.
- **Session** (`src/lib/session.ts`): a signed JWT in the `vp_session` cookie (HS256, `AUTH_SECRET`, 12h). Payload = `{ id, full_name, email, role, sv }`.
- **`sv` (session_version)**: every token carries the user's `session_version`. "Sign out everywhere" bumps this column so all old tokens are rejected. Fails **open** on DB error (never locks anyone out).
- **Gating**: `src/middleware.ts` only checks cookie *presence*; the real check is `requireUser()` in `src/app/(app)/layout.tsx`, which verifies the JWT + session_version.

**Force password change** (this session's feature): a `must_change_password` flag stored in `users.settings` (jsonb, no migration). The app layout redirects any flagged user to `/change-password` and blocks every other page until they set a new password (`mustChangePassword()` in `session.ts`; `requireUser` → redirect). Cleared by `forceChangePassword` (`src/app/change-password/actions.ts`).

**Hidden / dev accounts** (`src/lib/hidden-users.ts`): emails in `HIDDEN_USER_EMAILS` (currently `dev@visionproperties.co`) are filtered out of **every** user-listing panel (Users page, activity dropdown, dashboard count) but can still log in. `isHiddenUser()` also gates **dev-only tooling** (the Excel import) via `requireDevUser()` (`auth.ts`) — even other admins can't see or reach it.

---

## 3. The plot lifecycle

Plot status enum: `available → blocked → booked → registered → sold`, plus `cancelled`.

```
                    block                convert / book              register
   available ─────────────► blocked ───────────────► booked ─────────────────► registered
       ▲                        │                        │
       │  expiry sweep (unpaid) │  expiry sweep (unpaid) │
       │◄───────────────────────┴────────────────────────┘   (plot → available)
       │
       │  admin releases              cancel (admin)
   cancelled ◄──────────────────────────────┘   (plot parked as 'cancelled'
       │                                          until admin releases it)
       └──────────► available   (Plot Release page)
```

- A plot's **value** = `sqft × price_per_sqft` (`totalPlotValue`, `src/lib/format.ts`). If no price is set, value is ₹0. Price is captured on **Add Plots**, **Manage/Edit Plots**, and **Excel import**.
- Only one **active** (`pending`/`confirmed`) booking may exist per plot at a time — enforced by the DB unique index `uniq_active_booking_per_plot`. This is the double-booking guard (verified).

---

## 4. Blocking → Booking → Registration (the core flow)

All in `src/app/(app)/bookings/actions.ts` unless noted.

**1. Block or Book** — `createBooking`:
- Validates the plot is `available` and enough is paid to *lock* it:
  - **Blocking** requires the full `blocking_amount`.
  - **Booking** requires the full `advance_required` (see §5).
  - Underpaid → redirect `?err=underpaid`, nothing is created (plot stays available).
- Sets `expires_at`: blocking = `now + blocking_window_hours`; booking = `now + booking_window_days`.
- Inserts the booking (`status:'pending'`), moves the plot to `blocked`/`booked`, records the initial payment, links or creates the customer by mobile.

**2. Convert blocking → booking** — `convertToBooking`: sets `book_mode:'booking'`, a fresh `expires_at = now + booking_window_days`, plot → `booked`, records the advance.

**3. Confirm** — `confirmBooking`: booking → `confirmed`, plot → `booked`. **Keeps `expires_at` running** until registration.

**4. Register** — `createRegistration` (`src/app/(app)/registrations/actions.ts`, legal/admin):
- Refuses to register a `cancelled` booking.
- Writes a `registrations` row; plot → `registered`; booking → `confirmed` with **`expires_at = null`** (the hold clock stops).
- Optional final payment (`kind:'final'`), then recomputes `payment_status`.
- **Auto-issues value coupons** to the Director & Senior Director on the sale's chain (see §9).

---

## 5. Money: advance, payments, receipts

- **Advance required** (`computeAdvanceRequired`, `src/lib/sop.ts`): `max(round(plotValue × advance_percent%), advance_min_amount)`. So a booking's advance is the higher of the percentage or the floor. *(Verified: 20L@5% → ₹1,00,000; 5L@5% → ₹50,000 floor.)*
- **Recording payments** — `recordPayment` (finance/admin) inserts a `payments` row. Instrument fields (`reference`, `bank_name`, `instrument_date`) depend on the mode (Cash / Cheque / Bank Transfer / UPI / Home Loan / Other).
- **`recomputePayment`**: `advance_paid = Σ completed payments`; `payment_status = 'completed'` **only when the full plot value is paid**, else `pending`. Part-payments keep it `pending`.
- **Receipts / "fully paid"**: a deal is a receipt once `payment_status === 'completed'`.
- **Balance** per deal = `max(0, total_plot_value − advance_paid)`.

---

## 6. Expiry & admin extend

*(Feature built this session — `src/lib/lifecycle.ts`, `plots/actions.ts`, `inventory/release/`.)*

**Auto-expiry sweep** (`sweepExpiredBookings`): a lazy sweep that runs on list-page loads. Any **active hold** (blocking OR booking, `pending` OR `confirmed`) whose `expires_at` has passed **and which is not fully paid** is released:
- booking → `cancelled`, and `expired_at` + `pre_expiry_status` are stamped;
- plot → **`available`** immediately (anyone can grab it again).
- Fully-paid bookings are **never** auto-released (their deadline is only the registration target). Registered bookings are exempt (their `expires_at` is null).

**Extend** (Plot Release page → `extendHold`, admin only): an expired hold surfaces on **Plot Release** while its plot is still free. The admin can extend it back to the **original customer** for a **custom duration** — but **only while the plot is still `available`**. If anyone else has since blocked/booked it, extend is refused ("already taken"). Extending restores the booking's prior status and re-holds the plot.

---

## 7. Cancellation & refund

Refund lifecycle: `none → pending_approval → approved → paid`.

- **`cancelBooking`** (admin only): blocked if the plot is already registered. Computes the refund via `computeRefund` and sets booking → `cancelled`, plot → **`cancelled`** (parked for admin release, *not* straight to available). `refund_status = pending_approval` if a refund is owed.
- **`computeRefund`** (`sop.ts`): if `daysSinceBlocking ≤ cancel_full_refund_days` → **100% refund**, no charge. Otherwise `charge = min(amountPaid, cancellation_charge)` and `refund = amountPaid − charge`. *(Verified: day-2 → full refund; day-10 with ₹60k paid → ₹5k charge, ₹55k refund; charge never exceeds what was paid.)*
- **`requestCancellation`** (all sales): sets `cancel_requested_*` on the booking (no status change); an admin actions it from Payments & Cancellation.
- **`approveRefund`** (admin): `pending_approval → approved`, and sets `refund_due_date = addWorkingDays(now, refund_processing_days)` (skips weekends).
- **`markRefundPaid`** (finance): `approved → paid`.
- A completed **cancellation request** (via the requests flow) cancels the booking and marks the refund `paid` in one step.

---

## 8. Transfers

`transferBooking` (admin + sales except business_partner):
- Moves a booking to another **available plot in the same project**.
- `kind` = upgrade / downgrade / lateral by comparing new vs old value.
- **Charge**: only **downgrades** are charged (`transfer_charge`); upgrades and laterals are free.
- Old plot → `available`; new plot inherits `blocked`/`booked`. Booking's `total_plot_value` and `advance_required` are recomputed; a `plot_transfers` row records the move.

---

## 9. Coupons & tokens

Four types (`src/lib/options.ts`): `gold`, `digital`, `tools` (value coupons — tracked in ₹), and `cab` (tokens — counted). Balance = sum of ledger rows per type.

- **Manual issuance** (`issueCoupon`, admin only).
- **Auto on registration**: value coupons are issued to the **Director** (gold + digital + tools) and **Senior Director** (gold + tools) on the sale's chain — never BM/BP. Amount = `project_rate_per_sqft × plot_sqft`.
- **Cab tokens (auto, 48h)** — `sweepCabTokens`: any active hold older than 48h with a Director on its chain grants that **Director 3 cab tokens**, once per booking (concurrency-safe). Senior Directors are unlimited.
- **Redemption** (`redeemCoupon`, admin only): value coupons redeem a ₹ amount, cab redeems whole tokens; never below zero. Sales users can view balances but not redeem.

---

## 10. Requests & approvals

`src/app/(app)/requests/` + `src/lib/requests.ts`. Types: `site_visit`, `legal_query`, `draft`, `registration`, `cancellation`, `cab`.

- Only `senior_director` and `director` can **raise** requests (not BM/BP; admin is barred from raising).
- Each type has an **approval chain**, e.g. `cancellation`: senior → accounts(finance); `site_visit`/`cab`: senior → presales(admin); `legal_query`/`registration`: legal. Admin is a backstop at every stage.
- **Cab gate**: a Director must hold ≥1 cab token to raise a cab request; SD is unlimited.
- On final approval: a **cab** request deducts 1 token from a Director requester; a **cancellation** request cancels the booking and settles the refund.

---

## 11. Bulk Excel import (dev-only)

*(Feature built this session — `src/app/(app)/inventory/import/`, `src/lib/import-spec.ts`, `src/lib/import-template.ts`.)*

- **Access**: the hidden **dev account only** — nav item hidden from other admins, and the page, template route, and import actions all call `requireDevUser()`.
- **Templates**: downloadable `.xlsx` generated from a single spec, with 3 sheets — **Template** (an example row for every dropdown option), **Dropdown Values** (exact value to type per option), **Instructions** (column, required, type, notes).
- **Import**: upload `.xlsx`/`.csv` → each row parsed to JSON → validated (required fields, enum normalization accepting code or label) → inserted. Returns per-row created/skipped/error counts.
  - **Projects**: match the Add Project form (name, district, city, area, approval_type, project_type + office coupon rates + all policy config). Duplicate names skipped.
  - **Plots**: `project` matched by name; `block` becomes a category (auto-created); `price_per_sqft` optional; duplicate `plot_no` per project skipped.

---

## 12. Dashboard & reports

`src/lib/queries.ts`. Everything scopes by the **downline** (`getDownlineIds`, includes self):

- **Admin dashboard** (`getDashboard`): company-wide — plot status breakdown, inventory value, booked value & collected, outstanding, 8-month trends, conversion rate, top projects. User counts exclude hidden accounts.
- **Sales dashboard** (`getSalesDashboard`): personal — deals split into "mine" vs "network" (downline), team size, available plots, monthly trend.
- **Reports** (`getReports`): company-wide for admin/finance/legal, else network — counts of site visits, bookings, blockings, registrations, cancellations, partners, customers.
- **Leaderboard** (`getSalesLeaderboard`): per-person blockings/bookings/deals/value/registrations/cancellations, sales roles only.
- **Senior overview** (`getSeniorOverview`): team activity feed shown to the **senior_director** (network head) only; director & below see just their own.
- **Admin insights** (`getAdminInsights`): registered value, value locked in cancelled plots, collection rate, refunds pending, cancellation/conversion rates, top performers, revenue by project type.

---

## 13. Project configuration reference

Every rule above reads from the project's editable policy (defaults in `supabase/schema.sql`), so nothing is hard-coded:

| Field | Default | Controls |
|---|---|---|
| `blocking_amount` | 10000 | Amount required to lock a plot into `blocked`. |
| `blocking_window_hours` | 48 | Blocking deadline (`expires_at`). |
| `advance_percent` | 5 | Booking advance = this % of plot value… |
| `advance_min_amount` | 50000 | …but never below this floor. |
| `booking_window_days` | 15 | Booking deadline. |
| `cancel_full_refund_days` | 3 | Cancel within this many days ⇒ 100% refund. |
| `cancellation_charge` | 5000 | Flat charge after the full-refund window (capped at amount paid). |
| `refund_processing_days` | 5 | Refund payout SLA (working days) → `refund_due_date`. |
| `transfer_charge` | 5000 | Charged only on downgrade transfers. |
| `guideline_value` | 0 | ₹/sq.ft reference value. |
| `director_gold_coupon` / `director_digital_coupon` / `director_tools_coupon` | 0 | ₹/sq.ft auto coupon rates for the Director on registration. |
| `senior_director_gold_coupon` / `senior_director_tools_coupon` | 0 | ₹/sq.ft auto coupon rates for the Senior Director on registration. |

---

## 14. Cross-cutting

- **Audit log** (`src/lib/audit.ts` `logAudit`): every significant action records actor, entity, action, details. Best-effort — never breaks a business action.
- **Notifications** (`notify`): SMS/voice/panel messages recorded to the `notifications` table (e.g. hold expiry, extend, booking confirmed).
- **The lazy sweep**: `sweepExpiredBookings` (expiry release) and `sweepCabTokens` (48h cab grant) run together on bookings/plots/dashboard list loads — there is **no cron**; a hold flips to released on the next page load after its deadline.

---

### Verification status (this session)
- `npm run build`: clean (all routes compile). Typecheck: clean.
- All 22 app pages render (HTTP 200) as admin.
- SOP financial formulas: 9/9 unit checks pass (advance, refund, working-day SLA).
- Double-booking guard: a second active booking on the same plot is rejected by the DB.
- Feature checks: force-password redirect, dev-only import gating, hidden-user filtering, expiry→extend round-trip, price-flow all verified.
