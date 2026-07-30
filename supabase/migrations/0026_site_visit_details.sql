-- 0026 · Site Visit request — walk-in customer details, visit time and travel.
--
-- WHY: a site visit is arranged for a WALK-IN, before there is any booking or
-- customer record — the salesperson has a name and a phone number and nothing
-- else. Forcing them to pick from the customers dropdown meant they had to
-- create a customer first, so the name and phone are now typed straight onto the
-- request. `customer_id` stays on the table (and is still required by every
-- other request type, which hang off a real booking).
--
-- The visit also needs a TIME, not just a date — a visit must be booked at least
-- one hour ahead (book at 6:30 → earliest visit 7:30), enforced in
-- lib/requests.ts and re-checked server-side in requests/actions.ts.
--
-- SAFE TO RE-RUN.

alter table service_requests add column if not exists customer_name  text; -- walk-in name (site_visit)
alter table service_requests add column if not exists customer_phone text; -- walk-in mobile (site_visit)

-- Wall-clock IST time of the visit, paired with the existing `visit_date`.
alter table service_requests add column if not exists visit_time time;

-- How the customer travels: 'own' | 'company' | 'red_taxi'.
alter table service_requests add column if not exists travel_mode text;

-- Vehicle size booked: '4_seater' | '7_seater' | 'van'.
alter table service_requests add column if not exists cab_type text;
