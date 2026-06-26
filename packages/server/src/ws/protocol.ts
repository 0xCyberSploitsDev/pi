import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

/** Thinking level values accepted over the wire (mirrors the SDK's ThinkingLevel). */
export type WireThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

/** Messages sent from a WebSocket client to the server. */
export type WsClientMessage =
	| { type: "prompt"; text: string }
	| { type: "abort" }
	| { type: "set_model"; model: string }
	| { type: "set_thinking"; level: WireThinkingLevel }
	| { type: "fork" };

/** A serializable snapshot of the current session state pushed to clients. */
export interface SessionStateSnapshot {
	sessionId: string;
	name: string | undefined;
	model: string | undefined;
	thinkingLevel: string;
	isStreaming: boolean;
	availableThinkingLevels: string[];
	supportsThinking: boolean;
}

/** Messages sent from the server to a WebSocket client. */
export type WsServerMessage =
	| { type: "event"; event: AgentSessionEvent }
	| { type: "error"; message: string }
	| { type: "state"; state: SessionStateSnapshot }
	| { type: "forked"; sessionId: string };

/** Descriptor for a single available model returned by `/models`. */
export interface ModelDescriptor {
	id: string;
	provider: string;
	name: string;
	reasoning: boolean;
	available: boolean;
}
