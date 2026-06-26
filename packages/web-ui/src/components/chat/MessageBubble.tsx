import { useState } from "react";
import type { AssistantItem, UserItem } from "../../lib/transcript.ts";
import { ChevronIcon } from "../icons.tsx";

export function UserBubble({ item }: { item: UserItem }) {
	return (
		<div className="flex justify-end">
			<div className="max-w-2xl rounded-lg rounded-br-sm border border-border-strong bg-surface-raised px-4 py-2.5 text-sm leading-relaxed text-content whitespace-pre-wrap">
				{item.text}
			</div>
		</div>
	);
}

function ThinkingBlock({ text }: { text: string }) {
	const [open, setOpen] = useState(false);
	return (
		<div className="mb-2">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex items-center gap-1.5 text-xs text-subtle hover:text-muted transition-colors cursor-pointer"
			>
				<ChevronIcon className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
				Thinking
			</button>
			{open && (
				<pre className="mt-1 whitespace-pre-wrap rounded-md bg-base/60 p-3 font-mono text-xs leading-relaxed text-subtle">
					{text}
				</pre>
			)}
		</div>
	);
}

export function AssistantBubble({ item }: { item: AssistantItem }) {
	return (
		<div className="flex justify-start">
			<div className="max-w-2xl text-sm leading-relaxed text-content">
				{item.thinking && <ThinkingBlock text={item.thinking} />}
				{item.errorMessage ? (
					<div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2.5 text-danger">
						{item.errorMessage}
					</div>
				) : (
					<div className="whitespace-pre-wrap">
						{item.text}
						{item.streaming && (
							<span className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 animate-blink bg-accent" aria-hidden="true" />
						)}
					</div>
				)}
			</div>
		</div>
	);
}
