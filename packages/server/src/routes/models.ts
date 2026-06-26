import { Hono } from "hono";
import type { AppEnv } from "../types.ts";

export const modelRoutes = new Hono<AppEnv>();

modelRoutes.get("/models", (c) => {
	const models = c.get("agentService").listModels();
	return c.json({ models });
});
