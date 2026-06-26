import { Hono } from "hono";
import { z } from "zod";
import type { MissionStatus } from "../db/schema.ts";
import type { AppEnv } from "../types.ts";

export const missionRoutes = new Hono<AppEnv>();

const createMissionSchema = z.object({
	prompt: z.string().min(1),
	sessionId: z.string().uuid().optional(),
	model: z.string().min(1).optional(),
});

const statusValues = ["queued", "running", "completed", "failed", "cancelled"] as const;

missionRoutes.post("/missions", async (c) => {
	const body = createMissionSchema.parse(await c.req.json().catch(() => ({})));
	const store = c.get("store");

	// If a session id is supplied, ensure it exists.
	if (body.sessionId) {
		const session = await store.getSession(body.sessionId);
		if (!session) return c.json({ error: "Session not found" }, 404);
	}

	const mission = await store.createMission({
		prompt: body.prompt,
		sessionId: body.sessionId ?? null,
		model: body.model ?? null,
		status: "queued",
	});
	c.get("missionQueue").wake();
	return c.json({ mission }, 201);
});

missionRoutes.get("/missions", async (c) => {
	const statusParam = c.req.query("status");
	const status = statusValues.includes(statusParam as MissionStatus) ? (statusParam as MissionStatus) : undefined;
	const missions = await c.get("store").listMissions(status);
	return c.json({ missions });
});

missionRoutes.get("/missions/:id", async (c) => {
	const mission = await c.get("store").getMission(c.req.param("id"));
	if (!mission) return c.json({ error: "Mission not found" }, 404);
	return c.json({ mission });
});

missionRoutes.delete("/missions/:id", async (c) => {
	const store = c.get("store");
	const mission = await store.getMission(c.req.param("id"));
	if (!mission) return c.json({ error: "Mission not found" }, 404);
	if (mission.status === "completed" || mission.status === "failed") {
		return c.json({ error: `Cannot cancel a ${mission.status} mission` }, 409);
	}
	const updated = await store.updateMission(mission.id, { status: "cancelled", completedAt: new Date() });
	return c.json({ mission: updated });
});
