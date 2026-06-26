import type { Context, Next } from "hono";
import type { ServerConfig } from "../config.ts";

/**
 * API key authentication. Accepts the key via `Authorization: Bearer <key>`,
 * the `x-api-key` header, or an `apiKey` query parameter (used by WebSocket
 * clients that cannot set headers).
 *
 * When no API key is configured, auth is disabled — intended for local
 * development only. A warning is logged once at startup by the caller.
 */
export function createAuthMiddleware(config: ServerConfig) {
	return async (c: Context, next: Next) => {
		if (!config.apiKey) {
			await next();
			return;
		}

		const provided = extractApiKey(c);
		if (provided !== config.apiKey) {
			return c.json({ error: "Unauthorized" }, 401);
		}
		await next();
	};
}

export function extractApiKey(c: Context): string | undefined {
	const auth = c.req.header("authorization");
	if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
	const headerKey = c.req.header("x-api-key");
	if (headerKey) return headerKey;
	const queryKey = c.req.query("apiKey");
	if (queryKey) return queryKey;
	return undefined;
}

/** Validate an API key value directly (used by the WebSocket upgrade path). */
export function isAuthorized(config: ServerConfig, providedKey: string | undefined): boolean {
	if (!config.apiKey) return true;
	return providedKey === config.apiKey;
}
