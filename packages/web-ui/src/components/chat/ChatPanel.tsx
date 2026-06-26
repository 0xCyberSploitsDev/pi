import { useEffect, useRef, useState } from "react";
import type { UseSessionResult } from "../../hooks/useSession.ts";
import { buildTranscript } from "../../lib/transcript.ts";
import { SendIcon, SpinnerIcon, StopIcon } from "../icons.tsx";
import { AssistantBubble, UserBubble } from "./MessageBubble.tsx";
import { ToolCallCard } from "./ToolCallCard.tsx";

export function ChatPanel({ session }: { session: UseSessionResult }) {
	const { messages, streaming, state, error, sendPrompt, abort } = session;
	const [input, setInput] = useState("");
	const scrollRef = useRef<HTMLDivElement>(null);
	const transcript = buildTranscript(messages, streaming);
	const isStreaming = state?.isStreaming ?? false;

	// Auto-scroll to the latest content as it streams in.
	useEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [transcript.length, streaming]);

	const submit = () => {
		const text = input.trim();
		if (!text || isStreaming) return;
		sendPrompt(text);
		setInput("");
	};

	const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			submit();
		}
	};

	return (
		<div className="flex h-full flex-col">
			<div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-6">
				{transcript.length === 0 && (
					<div className="flex h-full items-center justify-center text-center text-sm text-subtle">
						<div>
							<p className="font-mono text-content">Ready when you are.</p>
							<p className="mt-1">Send a prompt to start the session.</p>
						</div>
					</div>
				)}
				{transcript.map((item, i) => {
					if (item.kind === "user") return <UserBubble key={`u-${i}`} item={item} />;
					if (item.kind === "assistant") return <AssistantBubble key={`a-${i}`} item={item} />;
					return <ToolCallCard key={`t-${item.call.id}`} item={item} />;
				})}
				{isStreaming && !streaming && (
					<div className="flex items-center gap-2 text-sm text-info">
						<SpinnerIcon className="h-4 w-4" />
						<span className="animate-pulse">Thinking...</span>
					</div>
				)}
			</div>

			{error && (
				<div className="mx-6 mb-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
					{error}
				</div>
			)}

			<div className="border-t border-border bg-surface/40 px-6 py-4">
				<div className="flex items-end gap-3">
					<textarea
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={onKeyDown}
						rows={2}
						placeholder="Send a message... (Cmd+Enter to send)"
						className="input min-h-[2.75rem] resize-y font-sans"
					/>
					{isStreaming ? (
						<button type="button" className="btn-danger h-11 px-4" onClick={abort}>
							<StopIcon className="h-4 w-4" />
							Stop
						</button>
					) : (
						<button type="button" className="btn-primary h-11 px-4" onClick={submit} disabled={!input.trim()}>
							<SendIcon className="h-4 w-4" />
							Send
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
