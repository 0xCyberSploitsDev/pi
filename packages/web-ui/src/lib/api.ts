import type { MissionRow, MissionStatus, ModelDescriptor, SessionRow } from "./protocol.ts";

const API_KEY_STORAGE = "pi-api-key";

/**
 * Base path for REST calls. In dev, Vite proxies `/api/*` to the backend; in
 * production the server hosts both the static UI and the API at the root, so
 * the same `/api` prefix works if the server mounts the API there. We default
 * to `/api` and let the server rewrite as needed.
 */
const API_BASE = "/api";

export function getApiKey(): string {
	return localStorage.getItem(API_KEY_STORAGE) ?? "";
}

export function setApiKey(key: string): void {
	if (key) localStorage.setItem(API_KEY_STORAGE, key);
	else localStorage.removeItem(API_KEY_STORAGE);
}

export class ApiError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const headers = new Headers(init?.headers);
	headers.set("Content-Type", "application/json");
	const apiKey = getApiKey();
	if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`);

	const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
	if (res.status === 204) return undefined as T;

	const text = await res.text();
	const data = text ? JSON.parse(text) : undefined;
	if (!res.ok) {
		const message = data?.error ?? res.statusText;
		throw new ApiError(res.status, message);
	}
	return data as T;
}

export const api = {
	health: () => request<{ status: string }>("/health"),

	listModels: () => request<{ models: ModelDescriptor[] }>("/models").then((r) => r.models),

	listSessions: () => request<{ sessions: SessionRow[] }>("/sessions").then((r) => r.sessions),

	getSession: (id: string) => request<{ session: SessionRow; live: boolean }>(`/sessions/${id}`),

	createSession: (body: { model?: string; cwd?: string; name?: string }) =>
		request<{ id: string; sessionId: string; wsUrl: string }>("/sessions", {
			method: "POST",
			body: JSON.stringify(body),
		}),

	deleteSession: (id: string) => request<void>(`/sessions/${id}`, { method: "DELETE" }),

	forkSession: (id: string) =>
		request<{ id: string; sessionId: string; wsUrl: string }>(`/sessions/${id}/fork`, { method: "POST" }),

	listMissions: (status?: MissionStatus) =>
		request<{ missions: MissionRow[] }>(`/missions${status ? `?status=${status}` : ""}`).then((r) => r.missions),

	getMission: (id: string) => request<{ mission: MissionRow }>(`/missions/${id}`).then((r) => r.mission),

	createMission: (body: { prompt: string; sessionId?: string; model?: string }) =>
		request<{ mission: MissionRow }>("/missions", { method: "POST", body: JSON.stringify(body) }).then(
			(r) => r.mission,
		),

	cancelMission: (id: string) =>
		request<{ mission: MissionRow }>(`/missions/${id}`, { method: "DELETE" }).then((r) => r.mission),
};
