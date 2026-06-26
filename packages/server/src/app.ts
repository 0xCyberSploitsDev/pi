import { Hono } from "hono";
import { cors } from "hono/cors";
import type { UpgradeWebSocket } from "hono/ws";
import type { ServerConfig } from "./config.ts";
import { createAuthMiddleware } from "./middleware/auth.ts";
import { errorHandler } from "./middleware/error-handler.ts";
import { healthRoutes } from "./routes/health.ts";
import { missionRoutes } from "./routes/missions.ts";
import { modelRoutes } from "./routes/models.ts";
import { sessionRoutes } from "./routes/sessions.ts";
import type { AgentService } from "./services/agent-service.ts";
import type { MissionQueue } from "./services/mission-queue.ts";
import type { SessionStore } from "./services/session-store.ts";
import type { AppEnv } from "./types.ts";
import { createWsHandler } from "./ws/handler.ts";

export interface CreateAppOptions {
	config: ServerConfig;
	store: SessionStore;
	agentService: AgentService;
	missionQueue: MissionQueue;
	upgradeWebSocket: UpgradeWebSocket;
	/** Optional middleware that serves the built web UI (production). */
	staticHandler?: Parameters<Hono<AppEnv>["use"]>[1];
}

/** Build the Hono application with all routes, middleware, and the WS endpoint. */
export function createApp(options: CreateAppOptions): Hono<AppEnv> {
	const { config, store, agentService, missionQueue, upgradeWebSocket, staticHandler } = options;
	const app = new Hono<AppEnv>();

	app.use("*", cors());

	// Inject shared services into the request context.
	app.use("*", async (c, next) => {
		c.set("config", config);
		c.set("store", store);
		c.set("agentService", agentService);
		c.set("missionQueue", missionQueue);
		await next();
	});

	// WebSocket endpoint (auth enforced inside the handler via query apiKey).
	app.get("/ws", createWsHandler(upgradeWebSocket, agentService, config));

	// REST API is mounted under /api so the same prefix works in dev (Vite proxy)
	// and production (static UI served from the same origin).
	const apiApp = new Hono<AppEnv>();

	// Health is public; everything else requires the API key.
	apiApp.route("/", healthRoutes);

	const auth = createAuthMiddleware(config);
	apiApp.use("/models", auth);
	apiApp.use("/sessions/*", auth);
	apiApp.use("/sessions", auth);
	apiApp.use("/missions/*", auth);
	apiApp.use("/missions", auth);

	apiApp.route("/", modelRoutes);
	apiApp.route("/", sessionRoutes);
	apiApp.route("/", missionRoutes);

	app.route("/api", apiApp);

	// Serve the built web UI in production (after the API so /api wins).
	if (staticHandler) {
		app.use("/*", staticHandler);
	}

	app.onError(errorHandler);
	app.notFound((c) => c.json({ error: "Not Found" }, 404));

	return app;
}
