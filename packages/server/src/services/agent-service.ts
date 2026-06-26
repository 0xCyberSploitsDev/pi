import {
	type AgentSession,
	type AgentSessionEvent,
	AuthStorage,
	type CreateAgentSessionOptions,
	createAgentSession,
	ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ServerConfig } from "../config.ts";
import type { ModelDescriptor, SessionStateSnapshot, WireThinkingLevel } from "../ws/protocol.ts";

interface ManagedSession {
	session: AgentSession;
	lastActivity: number;
	listeners: Set<(event: AgentSessionEvent) => void>;
	/** Unsubscribe from the underlying AgentSession event stream. */
	unsubscribe: () => void;
}

/**
 * Bridges the coding-agent SDK to the server. Owns the live `AgentSession`
 * instances (one Node process, many sessions), fans their streaming events out
 * to subscribers (WebSocket connections), and exposes model discovery.
 *
 * All SDK errors are captured and surfaced; nothing here throws into the event
 * loop unhandled.
 */
export class AgentService {
	private readonly config: ServerConfig;
	private readonly sessionsById = new Map<string, ManagedSession>();
	private readonly sharedRegistry: ModelRegistry;
	private idleTimer: ReturnType<typeof setInterval> | undefined;

	constructor(config: ServerConfig) {
		this.config = config;
		// A shared registry for `/models` listing. Per-session registries are
		// created by the SDK with the same default auth storage.
		this.sharedRegistry = ModelRegistry.create(AuthStorage.create());
		this.startIdleSweep();
	}

	/** Create a brand new agent session. Returns the in-memory session id. */
	async createSession(options: {
		model?: string;
		cwd?: string;
	}): Promise<{ sessionId: string; session: AgentSession }> {
		const createOptions: CreateAgentSessionOptions = {
			cwd: options.cwd ?? this.config.cwd,
		};

		const modelSpec = options.model ?? this.config.defaultModel;
		if (modelSpec) {
			const model = this.findModel(modelSpec);
			if (model) createOptions.model = model;
		}

		const { session } = await createAgentSession(createOptions);
		this.register(session);
		return { sessionId: session.sessionId, session };
	}

	private register(session: AgentSession): void {
		const listeners = new Set<(event: AgentSessionEvent) => void>();
		const unsubscribe = session.subscribe((event) => {
			const managed = this.sessionsById.get(session.sessionId);
			if (managed) managed.lastActivity = Date.now();
			for (const listener of listeners) {
				try {
					listener(event);
				} catch {
					// A misbehaving subscriber must not break event fan-out.
				}
			}
		});
		this.sessionsById.set(session.sessionId, {
			session,
			lastActivity: Date.now(),
			listeners,
			unsubscribe,
		});
	}

	getSession(sessionId: string): AgentSession | undefined {
		return this.sessionsById.get(sessionId)?.session;
	}

	hasSession(sessionId: string): boolean {
		return this.sessionsById.has(sessionId);
	}

	/** Subscribe to a session's event stream. Returns an unsubscribe function. */
	subscribe(sessionId: string, listener: (event: AgentSessionEvent) => void): (() => void) | undefined {
		const managed = this.sessionsById.get(sessionId);
		if (!managed) return undefined;
		managed.listeners.add(listener);
		return () => managed.listeners.delete(listener);
	}

	/** Dispose and remove a session from memory. */
	async destroySession(sessionId: string): Promise<boolean> {
		const managed = this.sessionsById.get(sessionId);
		if (!managed) return false;
		try {
			await managed.session.abort();
		} catch {
			// Ignore abort errors during teardown.
		}
		managed.unsubscribe();
		managed.session.dispose();
		this.sessionsById.delete(sessionId);
		return true;
	}

	async setModel(sessionId: string, modelSpec: string): Promise<void> {
		const session = this.requireSession(sessionId);
		const model = this.findModel(modelSpec);
		if (!model) throw new Error(`Unknown model: ${modelSpec}`);
		await session.setModel(model);
	}

	setThinkingLevel(sessionId: string, level: WireThinkingLevel): void {
		const session = this.requireSession(sessionId);
		session.setThinkingLevel(level);
	}

	snapshot(sessionId: string): SessionStateSnapshot {
		const session = this.requireSession(sessionId);
		const model = session.model;
		return {
			sessionId: session.sessionId,
			name: session.sessionName,
			model: model ? `${model.provider}/${model.id}` : undefined,
			thinkingLevel: session.thinkingLevel,
			isStreaming: session.isStreaming,
			availableThinkingLevels: session.getAvailableThinkingLevels(),
			supportsThinking: session.supportsThinking(),
		};
	}

	/** List models from the shared registry, marking which have configured auth. */
	listModels(): ModelDescriptor[] {
		this.sharedRegistry.refresh();
		const available = new Set(this.sharedRegistry.getAvailable().map((m) => `${m.provider}/${m.id}`));
		return this.sharedRegistry.getAll().map((m) => ({
			id: m.id,
			provider: m.provider,
			name: m.name,
			reasoning: m.reasoning,
			available: available.has(`${m.provider}/${m.id}`),
		}));
	}

	private findModel(spec: string) {
		// Accept "provider/modelId" or a bare modelId (first match wins).
		const slash = spec.indexOf("/");
		if (slash > 0) {
			const provider = spec.slice(0, slash);
			const modelId = spec.slice(slash + 1);
			const found = this.sharedRegistry.find(provider, modelId);
			if (found) return found;
		}
		return this.sharedRegistry.getAll().find((m) => m.id === spec);
	}

	private requireSession(sessionId: string): AgentSession {
		const managed = this.sessionsById.get(sessionId);
		if (!managed) throw new Error(`Session not found: ${sessionId}`);
		managed.lastActivity = Date.now();
		return managed.session;
	}

	private startIdleSweep(): void {
		const intervalMs = Math.min(this.config.sessionIdleTimeoutMs, 60_000);
		this.idleTimer = setInterval(() => {
			const now = Date.now();
			for (const [id, managed] of this.sessionsById) {
				if (managed.session.isStreaming) continue;
				if (now - managed.lastActivity > this.config.sessionIdleTimeoutMs) {
					void this.destroySession(id);
				}
			}
		}, intervalMs);
		// Do not keep the process alive solely for the sweep.
		this.idleTimer.unref?.();
	}

	async shutdown(): Promise<void> {
		if (this.idleTimer) clearInterval(this.idleTimer);
		const ids = [...this.sessionsById.keys()];
		await Promise.all(ids.map((id) => this.destroySession(id)));
	}
}
