# supabase/migrations — historical

These 39 files built the database up to the point where **Prisma took over
schema management**. They are kept for history and for reading; they are *not*
how changes are made any more, and running them by hand will now conflict with
Prisma's migration history.

## Where schema changes live now

- The schema is `prisma/schema.prisma`.
- Migrations are `prisma/migrations/`.
- Everything in this folder is represented by the `0_init` baseline migration,
  which is recorded as already-applied and never runs against the live database.

## Making a change

```bash
# 1. edit prisma/schema.prisma
# 2. write the migration AND apply it to Supabase, in one step:
pnpm db:migrate
```

Other commands: `pnpm db:status` (what is applied), `pnpm db:deploy` (apply
pending migrations without generating — CI and production), `pnpm db:pull`
(re-introspect the live database into the schema).

## Things Prisma's schema language cannot express

CHECK constraints, row-level security, triggers and PL/pgSQL functions are
written as raw SQL inside the relevant migration file. See
`prisma/migrations/*_error_logs/migration.sql` for the pattern: Prisma's
generated `CREATE TABLE` first, then a clearly-marked hand-written block.

When you add one of those, use `pnpm exec prisma migrate dev --create-only`,
append the SQL to the generated file, then `pnpm db:migrate` to apply it.
