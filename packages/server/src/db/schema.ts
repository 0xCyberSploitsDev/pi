import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Persisted sessions. The agent's full conversation lives in JSONL session
 * files on disk (managed by the coding-agent SDK's SessionManager); this table
 * stores the metadata needed to list, resume, and locate those sessions.
 */
export const sessions = pgTable("sessions", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: text("name"),
	model: text("model"),
	provider: text("provider"),
	/** Absolute path to the on-disk JSONL session file, when persisted. */
	sessionFile: text("session_file"),
	/** SDK session id (the id embedded in the JSONL header). */
	sdkSessionId: text("sdk_session_id"),
	/** Optional snapshot blob for diagnostics / future restore strategies. */
	state: jsonb("state"),
	cwd: text("cwd"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Async mission queue. Missions are prompts executed in the background. */
export const missions = pgTable("missions", {
	id: uuid("id").defaultRandom().primaryKey(),
	sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
	prompt: text("prompt").notNull(),
	model: text("model"),
	/** queued | running | completed | failed | cancelled */
	status: text("status").notNull().default("queued"),
	result: jsonb("result"),
	error: text("error"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	startedAt: timestamp("started_at", { withTimezone: true }),
	completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
export type MissionRow = typeof missions.$inferSelect;
export type NewMissionRow = typeof missions.$inferInsert;

export type MissionStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
