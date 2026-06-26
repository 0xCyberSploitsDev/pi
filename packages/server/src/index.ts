import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createDb } from "./db/client.ts";
import { runMigrations } from "./db/migrate.ts";
import { AgentService } from "./services/agent-service.ts";
import { MissionQueue } from "./services/mission-queue.ts";
import { SessionStore } from "./services/session-store.ts";
import type { AppEnv } from "./types.ts";

async function main(): Promise<void> {
	const config = loadConfig();

	if (!config.apiKey) {
		console.warn("[server] PI_API_KEY is not set — authentication is DISABLED. Do not expose this server publicly.");
	}

	const { db, client } = createDb(config.databaseUrl);

	console.log("[server] applying database migrations...");
	await runMigrations(db);

	const store = new SessionStore(db);
	const agentService = new AgentService(config);
	const missionQueue = new MissionQueue(store, agentService, config);

	// createNodeWebSocket needs an app reference up front; we attach a placeholder
	// app, then mount the real routes onto it.
	const baseApp = new Hono<AppEnv>();
	const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app: baseApp });

	// In production, serve the built web UI with SPA fallback to index.html.
	const staticHandler = config.webRoot
		? serveStatic({
				root: config.webRoot,
				rewriteRequestPath: (path) => (path.includes(".") ? path : "/index.html"),
			})
		: undefined;

	const app = createApp({ config, store, agentService, missionQueue, upgradeWebSocket, staticHandler });
	baseApp.route("/", app);

	await missionQueue.start();

	const server = serve({ fetch: baseApp.fetch, port: config.port, hostname: config.host }, (info) => {
		console.log(`[server] listening on http://${config.host}:${info.port}`);
	});
	injectWebSocket(server);

	const shutdown = async () => {
		console.log("[server] shutting down...");
		missionQueue.stop();
		await agentService.shutdown();
		await client.end({ timeout: 5 }).catch(() => {});
		server.close();
		process.exit(0);
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

main().catch((err) => {
	console.error("[server] fatal startup error:", err);
	process.exit(1);
});
