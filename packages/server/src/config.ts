import { z } from "zod";

/**
 * Server configuration resolved from environment variables.
 *
 * All values have sensible defaults except the database URL, which is required.
 * The API key is optional; when unset, auth is disabled (development only) and a
 * warning is emitted at startup.
 */
export interface ServerConfig {
	port: number;
	host: string;
	databaseUrl: string;
	apiKey: string | undefined;
	/** Default working directory for new sessions (workspace root). */
	cwd: string;
	/** Default model id in `provider/modelId` form, applied to new sessions when unspecified. */
	defaultModel: string | undefined;
	/** Per-mission execution timeout in milliseconds. */
	missionTimeoutMs: number;
	/** Maximum number of in-memory active sessions before idle eviction kicks in. */
	maxActiveSessions: number;
	/** Idle timeout in milliseconds after which an inactive session is evicted from memory. */
	sessionIdleTimeoutMs: number;
	/** Filesystem path to the built web UI (served statically in production). */
	webRoot: string | undefined;
}

const envSchema = z.object({
	PI_PORT: z.coerce.number().int().positive().default(3000),
	PI_HOST: z.string().default("0.0.0.0"),
	PI_DATABASE_URL: z.string().min(1, "PI_DATABASE_URL is required"),
	PI_API_KEY: z.string().min(1).optional(),
	PI_CWD: z.string().default(process.cwd()),
	PI_MODEL: z.string().min(1).optional(),
	PI_MISSION_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
	PI_MAX_ACTIVE_SESSIONS: z.coerce.number().int().positive().default(50),
	PI_SESSION_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(1_800_000),
	PI_WEB_ROOT: z.string().min(1).optional(),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
	// DATABASE_URL is a common alias; accept it as a fallback for PI_DATABASE_URL.
	const parsed = envSchema.parse({
		...env,
		PI_DATABASE_URL: env.PI_DATABASE_URL ?? env.DATABASE_URL,
	});

	return {
		port: parsed.PI_PORT,
		host: parsed.PI_HOST,
		databaseUrl: parsed.PI_DATABASE_URL,
		apiKey: parsed.PI_API_KEY,
		cwd: parsed.PI_CWD,
		defaultModel: parsed.PI_MODEL,
		missionTimeoutMs: parsed.PI_MISSION_TIMEOUT_MS,
		maxActiveSessions: parsed.PI_MAX_ACTIVE_SESSIONS,
		sessionIdleTimeoutMs: parsed.PI_SESSION_IDLE_TIMEOUT_MS,
		webRoot: parsed.PI_WEB_ROOT,
	};
}
