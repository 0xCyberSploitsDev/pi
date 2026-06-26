import { Hono } from "hono";
import type { AppEnv } from "../types.ts";

export const healthRoutes = new Hono<AppEnv>();

healthRoutes.get("/health", (c) => c.json({ status: "ok" }));
