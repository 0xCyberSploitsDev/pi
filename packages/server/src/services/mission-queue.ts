import type { ServerConfig } from "../config.ts";
import type { MissionRow } from "../db/schema.ts";
import type { AgentService } from "./agent-service.ts";
import type { SessionStore } from "./session-store.ts";

/** Notification emitted when a mission reaches a terminal state. */
export type MissionCompletionListener = (mission: MissionRow) => void;

/**
 * Background worker that drains the `missions` table. Picks queued missions one
 * at a time, runs each prompt through an AgentSession, and records the result.
 *
 * A single-flight loop keeps memory bounded; the timeout guards against a
 * mission that never completes.
 */
export class MissionQueue {
	private readonly store: SessionStore;
	private readonly agentService: AgentService;
	private readonly config: ServerConfig;
	private readonly listeners = new Set<MissionCompletionListener>();
	private running = false;
	private stopped = false;
	private pollTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(store: SessionStore, agentService: AgentService, config: ServerConfig) {
		this.store = store;
		this.agentService = agentService;
		this.config = config;
	}

	onCompletion(listener: MissionCompletionListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Begin draining the queue. Safe to call once. */
	async start(): Promise<void> {
		// Recover missions that were running when a previous process died.
		await this.store.requeueRunningMissions();
		this.stopped = false;
		this.scheduleTick(0);
	}

	stop(): void {
		this.stopped = true;
		if (this.pollTimer) clearTimeout(this.pollTimer);
	}

	/** Nudge the queue to check for work immediately (e.g. after enqueue). */
	wake(): void {
		if (!this.stopped && !this.running) this.scheduleTick(0);
	}

	private scheduleTick(delayMs: number): void {
		if (this.stopped) return;
		this.pollTimer = setTimeout(() => void this.tick(), delayMs);
		this.pollTimer.unref?.();
	}

	private async tick(): Promise<void> {
		if (this.running || this.stopped) return;
		this.running = true;
		try {
			const mission = await this.store.claimNextQueuedMission();
			if (!mission) {
				this.running = false;
				this.scheduleTick(2_000);
				return;
			}
			await this.runMission(mission);
		} catch (err) {
			// Swallow loop-level errors; individual mission failures are recorded
			// inside runMission. Anything here is a store/connection problem.
			console.error("[mission-queue] tick error:", err);
		} finally {
			this.running = false;
			// Immediately look for the next mission.
			this.scheduleTick(0);
		}
	}

	private async runMission(mission: MissionRow): Promise<void> {
		let createdSessionId: string | undefined;
		try {
			let sessionId = mission.sessionId ?? undefined;
			if (sessionId && !this.agentService.hasSession(sessionId)) {
				// The referenced session is not live in memory; fall back to a new one.
				sessionId = undefined;
			}
			if (!sessionId) {
				const created = await this.agentService.createSession({ model: mission.model ?? undefined });
				sessionId = created.sessionId;
				createdSessionId = created.sessionId;
			}

			const session = this.agentService.getSession(sessionId);
			if (!session) throw new Error("Failed to obtain agent session for mission");

			if (mission.model) {
				try {
					await this.agentService.setModel(sessionId, mission.model);
				} catch {
					// Keep the session's existing model if the requested one is unavailable.
				}
			}

			await this.withTimeout(session.prompt(mission.prompt), this.config.missionTimeoutMs);

			const resultText = session.getLastAssistantText();
			const completed = await this.store.updateMission(mission.id, {
				status: "completed",
				result: { text: resultText ?? "", sessionId },
				completedAt: new Date(),
			});
			if (completed) this.notify(completed);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const failed = await this.store.updateMission(mission.id, {
				status: "failed",
				error: message,
				completedAt: new Date(),
			});
			if (failed) this.notify(failed);
		} finally {
			// Clean up ephemeral sessions created solely for this mission.
			if (createdSessionId) await this.agentService.destroySession(createdSessionId);
		}
	}

	private notify(mission: MissionRow): void {
		for (const listener of this.listeners) {
			try {
				listener(mission);
			} catch {
				// Listener errors must not break the queue.
			}
		}
	}

	private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error(`Mission timed out after ${timeoutMs}ms`)), timeoutMs);
			timer.unref?.();
		});
		try {
			return await Promise.race([promise, timeout]);
		} finally {
			if (timer) clearTimeout(timer);
		}
	}
}
