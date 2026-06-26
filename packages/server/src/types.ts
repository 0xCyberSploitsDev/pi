import type { ServerConfig } from "./config.ts";
import type { AgentService } from "./services/agent-service.ts";
import type { MissionQueue } from "./services/mission-queue.ts";
import type { SessionStore } from "./services/session-store.ts";

/** Shared services injected into the Hono context. */
export interface AppServices {
	config: ServerConfig;
	store: SessionStore;
	agentService: AgentService;
	missionQueue: MissionQueue;
}

/** Hono environment: services are exposed as context variables. */
export interface AppEnv {
	Variables: AppServices;
}
