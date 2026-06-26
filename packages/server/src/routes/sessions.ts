import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types.ts";

export const sessionRoutes = new Hono<AppEnv>();

const createSessionSchema = z.object({
	model: z.string().min(1).optional(),
	cwd: z.string().min(1).optional(),
	name: z.string().min(1).optional(),
});

function wsUrlFor(requestUrl: string, sessionId: string): string {
	const url = new URL(requestUrl);
	const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
	return `${wsProtocol}//${url.host}/ws?sessionId=${encodeURIComponent(sessionId)}`;
}

sessionRoutes.post("/sessions", async (c) => {
	const body = createSessionSchema.parse(await c.req.json().catch(() => ({})));
	const agentService = c.get("agentService");
	const store = c.get("store");

	const { session } = await agentService.createSession({ model: body.model, cwd: body.cwd });
	if (body.name) session.setSessionName(body.name);

	const model = session.model;
	const row = await store.createSession({
		name: body.name ?? session.sessionName ?? null,
		model: model?.id ?? null,
		provider: model?.provider ?? null,
		sessionFile: session.sessionFile ?? null,
		sdkSessionId: session.sessionId,
		cwd: body.cwd ?? c.get("config").cwd,
	});

	return c.json({ id: row.id, sessionId: session.sessionId, wsUrl: wsUrlFor(c.req.url, session.sessionId) }, 201);
});

sessionRoutes.get("/sessions", async (c) => {
	const rows = await c.get("store").listSessions();
	return c.json({ sessions: rows });
});

sessionRoutes.get("/sessions/:id", async (c) => {
	const row = await c.get("store").getSession(c.req.param("id"));
	if (!row) return c.json({ error: "Session not found" }, 404);
	const live = row.sdkSessionId ? c.get("agentService").hasSession(row.sdkSessionId) : false;
	return c.json({ session: row, live });
});

sessionRoutes.delete("/sessions/:id", async (c) => {
	const store = c.get("store");
	const row = await store.getSession(c.req.param("id"));
	if (!row) return c.json({ error: "Session not found" }, 404);
	if (row.sdkSessionId) await c.get("agentService").destroySession(row.sdkSessionId);
	await store.deleteSession(row.id);
	return c.body(null, 204);
});

sessionRoutes.post("/sessions/:id/fork", async (c) => {
	const store = c.get("store");
	const agentService = c.get("agentService");
	const row = await store.getSession(c.req.param("id"));
	if (!row) return c.json({ error: "Session not found" }, 404);

	// Fork by creating a new session seeded with the same model/cwd. Full tree
	// forking from disk is handled by AgentSessionRuntime; this MVP creates a
	// fresh sibling session and records it.
	const { session } = await agentService.createSession({
		model: row.model ? `${row.provider}/${row.model}` : undefined,
		cwd: row.cwd ?? undefined,
	});
	const model = session.model;
	const forkRow = await store.createSession({
		name: row.name ? `${row.name} (fork)` : null,
		model: model?.id ?? null,
		provider: model?.provider ?? null,
		sessionFile: session.sessionFile ?? null,
		sdkSessionId: session.sessionId,
		cwd: row.cwd ?? null,
	});
	return c.json({ id: forkRow.id, sessionId: session.sessionId, wsUrl: wsUrlFor(c.req.url, session.sessionId) }, 201);
});
