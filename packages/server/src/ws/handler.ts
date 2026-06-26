import type { UpgradeWebSocket, WSContext } from "hono/ws";
import { z } from "zod";
import type { ServerConfig } from "../config.ts";
import { isAuthorized } from "../middleware/auth.ts";
import type { AgentService } from "../services/agent-service.ts";
import type { WsServerMessage } from "./protocol.ts";

const clientMessageSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("prompt"), text: z.string().min(1) }),
	z.object({ type: z.literal("abort") }),
	z.object({ type: z.literal("set_model"), model: z.string().min(1) }),
	z.object({ type: z.literal("set_thinking"), level: z.enum(["off", "minimal", "low", "medium", "high", "xhigh"]) }),
	z.object({ type: z.literal("fork") }),
]);

function send(ws: WSContext, message: WsServerMessage): void {
	ws.send(JSON.stringify(message));
}

/**
 * Build the WebSocket upgrade handler. Each connection is bound to one session
 * via `?sessionId=`. Streaming session events are forwarded as `event` frames;
 * client commands (prompt/abort/set_model/...) drive the underlying session.
 */
export function createWsHandler(upgradeWebSocket: UpgradeWebSocket, agentService: AgentService, config: ServerConfig) {
	return upgradeWebSocket((c) => {
		const sessionId = c.req.query("sessionId");
		const apiKey = c.req.query("apiKey");
		let unsubscribe: (() => void) | undefined;

		return {
			onOpen(_evt, ws) {
				if (!isAuthorized(config, apiKey)) {
					send(ws, { type: "error", message: "Unauthorized" });
					ws.close(1008, "Unauthorized");
					return;
				}
				if (!sessionId || !agentService.hasSession(sessionId)) {
					send(ws, { type: "error", message: "Unknown or missing sessionId" });
					ws.close(1008, "Unknown session");
					return;
				}
				unsubscribe = agentService.subscribe(sessionId, (event) => {
					send(ws, { type: "event", event });
				});
				send(ws, { type: "state", state: agentService.snapshot(sessionId) });
			},

			async onMessage(evt, ws) {
				if (!sessionId || !agentService.hasSession(sessionId)) {
					send(ws, { type: "error", message: "Session is no longer active" });
					return;
				}
				let parsed: z.infer<typeof clientMessageSchema>;
				try {
					const raw = typeof evt.data === "string" ? evt.data : evt.data.toString();
					parsed = clientMessageSchema.parse(JSON.parse(raw));
				} catch (err) {
					send(ws, {
						type: "error",
						message: `Invalid message: ${err instanceof Error ? err.message : String(err)}`,
					});
					return;
				}

				try {
					switch (parsed.type) {
						case "prompt":
							// Fire-and-forget: streaming events report progress and completion.
							void agentService
								.getSession(sessionId)
								?.prompt(parsed.text)
								.catch((err: unknown) => {
									send(ws, { type: "error", message: err instanceof Error ? err.message : String(err) });
								});
							break;
						case "abort":
							await agentService.getSession(sessionId)?.abort();
							break;
						case "set_model":
							await agentService.setModel(sessionId, parsed.model);
							send(ws, { type: "state", state: agentService.snapshot(sessionId) });
							break;
						case "set_thinking":
							agentService.setThinkingLevel(sessionId, parsed.level);
							send(ws, { type: "state", state: agentService.snapshot(sessionId) });
							break;
						case "fork": {
							const source = agentService.getSession(sessionId);
							const created = await agentService.createSession({
								model: source?.model ? `${source.model.provider}/${source.model.id}` : undefined,
							});
							send(ws, { type: "forked", sessionId: created.sessionId });
							break;
						}
					}
				} catch (err) {
					send(ws, { type: "error", message: err instanceof Error ? err.message : String(err) });
				}
			},

			onClose() {
				unsubscribe?.();
				unsubscribe = undefined;
			},

			onError() {
				unsubscribe?.();
				unsubscribe = undefined;
			},
		};
	});
}
