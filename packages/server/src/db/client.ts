import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export type Database = ReturnType<typeof createDb>["db"];

/**
 * Create a postgres-js backed Drizzle client. Returns both the Drizzle instance
 * and the underlying connection so callers can close it on shutdown.
 */
export function createDb(databaseUrl: string) {
	const client = postgres(databaseUrl, { max: 10 });
	const db = drizzle(client, { schema });
	return { db, client };
}
