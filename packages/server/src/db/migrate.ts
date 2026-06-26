import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Database } from "./client.ts";

/**
 * Apply pending Drizzle migrations at startup so a fresh database (e.g. a new
 * Docker volume) is provisioned automatically without a manual migrate step.
 *
 * Migrations live in `packages/server/drizzle/migrations`, shipped alongside
 * `dist/` via the package `files` field. This module compiles to
 * `dist/db/migrate.js`, so the folder resolves two levels up.
 */
export async function runMigrations(db: Database): Promise<void> {
	const migrationsFolder = fileURLToPath(new URL("../../drizzle/migrations", import.meta.url));
	await migrate(db, { migrationsFolder });
}
