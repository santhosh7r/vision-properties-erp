-- ============================================================================
-- 0029 — Chennai & Trichy only
--
-- The company runs two branches. Migration 0014 pre-loaded all 38 Tamil Nadu
-- districts into the `districts` master "so an admin can edit the list later";
-- in practice the app never reads that table — every District dropdown is fed by
-- the DISTRICTS constant in src/lib/options.ts, which is already ['Chennai',
-- 'Trichy'] — so those 36 extra rows are dead data that only invite someone to
-- re-introduce a third district by hand.
--
-- Trim the table to the two real branches so the database says the same thing
-- the app does. Add a row here AND to lib/options.ts if a branch ever opens.
--
-- The project rows themselves were normalised separately (Kancheepuram →
-- Chennai, Pudhukottai → Trichy) by `npm run db:fix-districts`, which prints a
-- before/after of everything it changes.
-- ============================================================================

delete from districts where name not in ('Chennai', 'Trichy');

insert into districts (name) values ('Chennai'), ('Trichy')
on conflict (name) do nothing;
