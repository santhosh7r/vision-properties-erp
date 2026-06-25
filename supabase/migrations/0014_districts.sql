-- ============================================================================
-- 0014 — Global districts master
--
-- A single admin-managed list of districts, used as the District dropdown
-- everywhere (projects, customers, salespeople) instead of free text. A
-- salesperson's district drives which projects surface first in their panel.
-- ============================================================================

create table if not exists districts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

alter table users add column if not exists district text;

-- Pre-configure all 38 Tamil Nadu districts (admin can edit this list later).
insert into districts (name) values
  ('Ariyalur'), ('Chengalpattu'), ('Chennai'), ('Coimbatore'), ('Cuddalore'),
  ('Dharmapuri'), ('Dindigul'), ('Erode'), ('Kallakurichi'), ('Kancheepuram'),
  ('Kanyakumari'), ('Karur'), ('Krishnagiri'), ('Madurai'), ('Mayiladuthurai'),
  ('Nagapattinam'), ('Namakkal'), ('Nilgiris'), ('Perambalur'), ('Pudukkottai'),
  ('Ramanathapuram'), ('Ranipet'), ('Salem'), ('Sivaganga'), ('Tenkasi'),
  ('Thanjavur'), ('Theni'), ('Thoothukudi'), ('Tiruchirappalli'), ('Tirunelveli'),
  ('Tirupathur'), ('Tiruppur'), ('Tiruvallur'), ('Tiruvannamalai'), ('Tiruvarur'),
  ('Vellore'), ('Viluppuram'), ('Virudhunagar')
on conflict (name) do nothing;
