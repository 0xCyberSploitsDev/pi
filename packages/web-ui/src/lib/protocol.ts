// Wire protocol shared with @earendil-works/pi-server. Kept as a self-contained
// mirror so the frontend bundle does not depend on server build artifacts.

export interface TextContent {
	type: "text";
	text: string;
}

export interface ThinkingContent {
	type: "thinking";
	thinking: string;
	redacted?: boolean;
}

export interface ImageContent {
	type: "image";
	data: string;
	mimeType: string;
}

export interface ToolCall {
	type: "toolCall";
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

export type AssistantContent = TextContent | ThinkingContent | ToolCall;

export interface UserMessage {
	role: "user";
	content: string | (TextContent | ImageContent)[];
	timestamp: number;
}

export interface AssistantMessage {
	role: "assistant";
	content: AssistantContent[];
	model: string;
	provider: string;
	stopReason: string;
	errorMessage?: string;
	timestamp: number;
}

export interface ToolResultMessage {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: (TextContent | ImageContent)[];
	details?: unknown;
	isError: boolean;
	timestamp: number;
}

export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage;

/**
 * Streaming agent events. Only the variants the UI renders are typed precisely;
 * everything else is captured by the fallback to keep forward-compatibility.
 */
export type AgentSessionEvent =
	| { type: "agent_start" }
	| { type: "agent_end"; messages: AgentMessage[]; willRetry: boolean }
	| { type: "turn_start" }
	| { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
	| { type: "message_start"; message: AgentMessage }
	| { type: "message_update"; message: AgentMessage }
	| { type: "message_end"; message: AgentMessage }
	| { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
	| { type: "tool_execution_update"; toolCallId: string; toolName: string; args: unknown; partialResult: unknown }
	| { type: "tool_execution_end"; toolCallId: string; toolName: string; result: unknown; isError: boolean }
	| { type: "thinking_level_changed"; level: string }
	| { type: "session_info_changed"; name: string | undefined }
	| { type: string; [key: string]: unknown };

export type WireThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type WsClientMessage =
	| { type: "prompt"; text: string }
	| { type: "abort" }
	| { type: "set_model"; model: string }
	| { type: "set_thinking"; level: WireThinkingLevel }
	| { type: "fork" };

export interface SessionStateSnapshot {
	sessionId: string;
	name: string | undefined;
	model: string | undefined;
	thinkingLevel: string;
	isStreaming: boolean;
	availableThinkingLevels: string[];
	supportsThinking: boolean;
}

export type WsServerMessage =
	| { type: "event"; event: AgentSessionEvent }
	| { type: "error"; message: string }
	| { type: "state"; state: SessionStateSnapshot }
	| { type: "forked"; sessionId: string };

export interface ModelDescriptor {
	id: string;
	provider: string;
	name: string;
	reasoning: boolean;
	available: boolean;
}

export interface SessionRow {
	id: string;
	name: string | null;
	model: string | null;
	provider: string | null;
	sessionFile: string | null;
	sdkSessionId: string | null;
	cwd: string | null;
	createdAt: string;
	updatedAt: string;
}

export type MissionStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface MissionRow {
	id: string;
	sessionId: string | null;
	prompt: string;
	model: string | null;
	status: MissionStatus;
	result: { text?: string; sessionId?: string } | null;
	error: string | null;
	createdAt: string;
	startedAt: string | null;
	completedAt: string | null;
}
