import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

/** Global error handler converting thrown errors into JSON responses. */
export function errorHandler(err: Error, c: Context): Response {
	if (err instanceof HTTPException) {
		return c.json({ error: err.message }, err.status);
	}
	console.error("[server] unhandled error:", err);
	const message = err instanceof Error ? err.message : "Internal Server Error";
	return c.json({ error: message }, 500);
}
