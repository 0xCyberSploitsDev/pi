import { desc, eq } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import {
	type MissionRow,
	type MissionStatus,
	missions,
	type NewMissionRow,
	type NewSessionRow,
	type SessionRow,
	sessions,
} from "../db/schema.ts";

/**
 * Persistence layer for sessions and missions backed by PostgreSQL via Drizzle.
 *
 * Session conversation content is stored on disk by the SDK's SessionManager;
 * this store only tracks metadata so sessions survive a server restart and can
 * be listed in the UI.
 */
export class SessionStore {
	readonly db: Database;

	constructor(db: Database) {
		this.db = db;
	}

	// --- Sessions ---

	async createSession(input: NewSessionRow): Promise<SessionRow> {
		const [row] = await this.db.insert(sessions).values(input).returning();
		return row;
	}

	async listSessions(): Promise<SessionRow[]> {
		return this.db.select().from(sessions).orderBy(desc(sessions.updatedAt));
	}

	async getSession(id: string): Promise<SessionRow | undefined> {
		const [row] = await this.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
		return row;
	}

	async updateSession(id: string, patch: Partial<NewSessionRow>): Promise<SessionRow | undefined> {
		const [row] = await this.db
			.update(sessions)
			.set({ ...patch, updatedAt: new Date() })
			.where(eq(sessions.id, id))
			.returning();
		return row;
	}

	async deleteSession(id: string): Promise<boolean> {
		const rows = await this.db.delete(sessions).where(eq(sessions.id, id)).returning({ id: sessions.id });
		return rows.length > 0;
	}

	// --- Missions ---

	async createMission(input: NewMissionRow): Promise<MissionRow> {
		const [row] = await this.db.insert(missions).values(input).returning();
		return row;
	}

	async listMissions(status?: MissionStatus): Promise<MissionRow[]> {
		if (status) {
			return this.db.select().from(missions).where(eq(missions.status, status)).orderBy(desc(missions.createdAt));
		}
		return this.db.select().from(missions).orderBy(desc(missions.createdAt));
	}

	async getMission(id: string): Promise<MissionRow | undefined> {
		const [row] = await this.db.select().from(missions).where(eq(missions.id, id)).limit(1);
		return row;
	}

	async updateMission(id: string, patch: Partial<NewMissionRow>): Promise<MissionRow | undefined> {
		const [row] = await this.db.update(missions).set(patch).where(eq(missions.id, id)).returning();
		return row;
	}

	/**
	 * Atomically claim the oldest queued mission, transitioning it to `running`.
	 * Uses `SELECT ... FOR UPDATE SKIP LOCKED` semantics via a transaction so
	 * concurrent workers never pick the same mission.
	 */
	async claimNextQueuedMission(): Promise<MissionRow | undefined> {
		return this.db.transaction(async (tx) => {
			const [candidate] = await tx
				.select({ id: missions.id })
				.from(missions)
				.where(eq(missions.status, "queued"))
				.orderBy(missions.createdAt)
				.limit(1)
				.for("update", { skipLocked: true });
			if (!candidate) return undefined;
			const [row] = await tx
				.update(missions)
				.set({ status: "running", startedAt: new Date() })
				.where(eq(missions.id, candidate.id))
				.returning();
			return row;
		});
	}

	/** Reset any missions stuck in `running` back to `queued` (used on startup after a crash). */
	async requeueRunningMissions(): Promise<number> {
		const rows = await this.db
			.update(missions)
			.set({ status: "queued", startedAt: null })
			.where(eq(missions.status, "running"))
			.returning({ id: missions.id });
		return rows.length;
	}
}
