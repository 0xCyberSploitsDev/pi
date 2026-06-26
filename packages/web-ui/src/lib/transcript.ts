import type { AgentMessage, TextContent, ToolCall, ToolResultMessage } from "./protocol.ts";

export interface UserItem {
	kind: "user";
	text: string;
	timestamp: number;
}

export interface AssistantItem {
	kind: "assistant";
	text: string;
	thinking: string;
	model: string;
	errorMessage?: string;
	timestamp: number;
	streaming: boolean;
}

export interface ToolItem {
	kind: "tool";
	call: ToolCall;
	result: ToolResultMessage | undefined;
	timestamp: number;
}

export type TranscriptItem = UserItem | AssistantItem | ToolItem;

function textOf(content: string | (TextContent | { type: string })[]): string {
	if (typeof content === "string") return content;
	return content
		.filter((c): c is TextContent => c.type === "text")
		.map((c) => c.text)
		.join("");
}

/**
 * Flatten an agent message list into ordered renderable items, pairing each
 * tool call with its matching tool result.
 */
export function buildTranscript(messages: AgentMessage[], streaming?: AgentMessage): TranscriptItem[] {
	const items: TranscriptItem[] = [];
	const resultsByCallId = new Map<string, ToolResultMessage>();

	for (const msg of messages) {
		if (msg.role === "toolResult") resultsByCallId.set(msg.toolCallId, msg);
	}

	for (const msg of messages) {
		if (msg.role === "user") {
			items.push({ kind: "user", text: textOf(msg.content), timestamp: msg.timestamp });
		} else if (msg.role === "assistant") {
			const text = msg.content
				.filter((c): c is TextContent => c.type === "text")
				.map((c) => c.text)
				.join("");
			const thinking = msg.content
				.filter((c): c is { type: "thinking"; thinking: string } => c.type === "thinking")
				.map((c) => c.thinking)
				.join("");
			if (text || thinking || msg.errorMessage) {
				items.push({
					kind: "assistant",
					text,
					thinking,
					model: msg.model,
					errorMessage: msg.errorMessage,
					timestamp: msg.timestamp,
					streaming: false,
				});
			}
			for (const c of msg.content) {
				if (c.type === "toolCall") {
					items.push({
						kind: "tool",
						call: c,
						result: resultsByCallId.get(c.id),
						timestamp: msg.timestamp,
					});
				}
			}
		}
	}

	if (streaming && streaming.role === "assistant") {
		const text = streaming.content
			.filter((c): c is TextContent => c.type === "text")
			.map((c) => c.text)
			.join("");
		const thinking = streaming.content
			.filter((c): c is { type: "thinking"; thinking: string } => c.type === "thinking")
			.map((c) => c.thinking)
			.join("");
		items.push({
			kind: "assistant",
			text,
			thinking,
			model: streaming.model,
			timestamp: streaming.timestamp,
			streaming: true,
		});
	}

	return items;
}
