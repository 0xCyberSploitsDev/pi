import { getApiKey } from "./api.ts";
import type { WsClientMessage, WsServerMessage } from "./protocol.ts";

export type WsStatus = "connecting" | "open" | "closed";

export interface SessionSocketHandlers {
	onMessage: (message: WsServerMessage) => void;
	onStatusChange?: (status: WsStatus) => void;
}

/**
 * Persistent WebSocket connection to a single agent session. Auto-reconnects
 * with backoff while the consumer keeps it open.
 */
export class SessionSocket {
	private ws: WebSocket | undefined;
	private readonly sessionId: string;
	private readonly handlers: SessionSocketHandlers;
	private closedByUser = false;
	private reconnectDelay = 1000;
	private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(sessionId: string, handlers: SessionSocketHandlers) {
		this.sessionId = sessionId;
		this.handlers = handlers;
	}

	connect(): void {
		this.closedByUser = false;
		this.open();
	}

	private open(): void {
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const params = new URLSearchParams({ sessionId: this.sessionId });
		const apiKey = getApiKey();
		if (apiKey) params.set("apiKey", apiKey);
		const url = `${protocol}//${window.location.host}/ws?${params.toString()}`;

		this.handlers.onStatusChange?.("connecting");
		const ws = new WebSocket(url);
		this.ws = ws;

		ws.onopen = () => {
			this.reconnectDelay = 1000;
			this.handlers.onStatusChange?.("open");
		};
		ws.onmessage = (evt) => {
			try {
				const message = JSON.parse(evt.data) as WsServerMessage;
				this.handlers.onMessage(message);
			} catch {
				// Ignore malformed frames.
			}
		};
		ws.onclose = () => {
			this.handlers.onStatusChange?.("closed");
			if (!this.closedByUser) this.scheduleReconnect();
		};
		ws.onerror = () => {
			ws.close();
		};
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer) return;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = undefined;
			this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15000);
			this.open();
		}, this.reconnectDelay);
	}

	send(message: WsClientMessage): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
		}
	}

	close(): void {
		this.closedByUser = true;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = undefined;
		this.ws?.close();
		this.ws = undefined;
	}
}
