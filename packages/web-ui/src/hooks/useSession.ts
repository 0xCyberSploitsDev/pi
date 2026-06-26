import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentMessage, SessionStateSnapshot, WireThinkingLevel, WsServerMessage } from "../lib/protocol.ts";
import { SessionSocket, type WsStatus } from "../lib/ws.ts";

export interface UseSessionResult {
	status: WsStatus;
	state: SessionStateSnapshot | undefined;
	messages: AgentMessage[];
	/** The assistant message currently streaming, if any. */
	streaming: AgentMessage | undefined;
	error: string | undefined;
	sendPrompt: (text: string) => void;
	abort: () => void;
	setModel: (model: string) => void;
	setThinking: (level: WireThinkingLevel) => void;
}

/**
 * Owns a live WebSocket connection to one session and derives a renderable
 * transcript from the streaming agent events.
 *
 * Strategy: `agent_end` / `turn_end` carry authoritative message lists, so we
 * treat those as the source of truth for completed messages. Between them, the
 * in-flight assistant message is tracked separately via `message_*` events so
 * the UI streams token-by-token.
 */
export function useSession(sessionId: string | undefined): UseSessionResult {
	const socketRef = useRef<SessionSocket | undefined>(undefined);
	const [status, setStatus] = useState<WsStatus>("closed");
	const [state, setState] = useState<SessionStateSnapshot | undefined>(undefined);
	const [messages, setMessages] = useState<AgentMessage[]>([]);
	const [streaming, setStreaming] = useState<AgentMessage | undefined>(undefined);
	const [error, setError] = useState<string | undefined>(undefined);

	const handleMessage = useCallback((message: WsServerMessage) => {
		switch (message.type) {
			case "state":
				setState(message.state);
				break;
			case "error":
				setError(message.message);
				break;
			case "event": {
				const event = message.event as { type: string } & Record<string, unknown>;
				switch (event.type) {
					case "agent_start":
						setError(undefined);
						setState((s) => (s ? { ...s, isStreaming: true } : s));
						break;
					case "message_start":
					case "message_update": {
						const msg = event.message as AgentMessage | undefined;
						if (msg && msg.role === "assistant") setStreaming(msg);
						break;
					}
					case "message_end":
						setStreaming(undefined);
						break;
					case "turn_end": {
						const msg = event.message as AgentMessage | undefined;
						const toolResults = (event.toolResults as AgentMessage[] | undefined) ?? [];
						if (msg) setMessages((prev) => [...prev, msg, ...toolResults]);
						setStreaming(undefined);
						break;
					}
					case "agent_end": {
						const msgs = event.messages as AgentMessage[] | undefined;
						if (Array.isArray(msgs)) setMessages(msgs);
						setStreaming(undefined);
						setState((s) => (s ? { ...s, isStreaming: false } : s));
						break;
					}
				}
				break;
			}
		}
	}, []);

	useEffect(() => {
		if (!sessionId) return;
		setMessages([]);
		setStreaming(undefined);
		setError(undefined);
		const socket = new SessionSocket(sessionId, {
			onMessage: handleMessage,
			onStatusChange: setStatus,
		});
		socketRef.current = socket;
		socket.connect();
		return () => {
			socket.close();
			socketRef.current = undefined;
		};
	}, [sessionId, handleMessage]);

	const sendPrompt = useCallback((text: string) => {
		setError(undefined);
		socketRef.current?.send({ type: "prompt", text });
	}, []);
	const abort = useCallback(() => socketRef.current?.send({ type: "abort" }), []);
	const setModel = useCallback((model: string) => socketRef.current?.send({ type: "set_model", model }), []);
	const setThinking = useCallback(
		(level: WireThinkingLevel) => socketRef.current?.send({ type: "set_thinking", level }),
		[],
	);

	return { status, state, messages, streaming, error, sendPrompt, abort, setModel, setThinking };
}
