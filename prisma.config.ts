import { config as loadEnv } from "dotenv";

// This project keeps its secrets in .env.local (see .env.local.example), and
// Prisma 7 no longer loads dotenv files by itself. Loading it here — before
// defineConfig reads process.env — is what makes every `pnpm db:*` script work
// without exporting the connection string by hand.
loadEnv({ path: ".env.local" });

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // MIGRATIONS MUST USE THE DIRECT CONNECTION (port 5432), not the pooler.
    // Supabase's transaction pooler on 6543 cannot run the DDL, advisory locks
    // and prepared statements the migration engine relies on, and fails in ways
    // that look like random timeouts.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    // Prisma builds a throwaway copy of the schema to work out what a migration
    // should contain. Supabase's hosted database will not let it create one, so
    // this points at a local Postgres instead. See .env.local.example.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
