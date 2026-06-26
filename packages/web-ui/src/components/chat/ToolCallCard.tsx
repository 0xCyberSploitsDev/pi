import { useState } from "react";
import type { TextContent, ToolResultMessage } from "../../lib/protocol.ts";
import type { ToolItem } from "../../lib/transcript.ts";
import { ChevronIcon, FileIcon, PencilIcon, SpinnerIcon, TerminalIcon } from "../icons.tsx";

type ToolStatus = "running" | "completed" | "error";

function resultText(result: ToolResultMessage | undefined): string {
	if (!result) return "";
	return result.content
		.filter((c): c is TextContent => c.type === "text")
		.map((c) => c.text)
		.join("");
}

function statusOf(item: ToolItem): ToolStatus {
	if (!item.result) return "running";
	return item.result.isError ? "error" : "completed";
}

const statusStyles: Record<ToolStatus, string> = {
	running: "text-info",
	completed: "text-accent",
	error: "text-danger",
};

function ToolIcon({ name }: { name: string }) {
	const n = name.toLowerCase();
	if (n.includes("bash") || n.includes("shell")) return <TerminalIcon className="h-4 w-4" />;
	if (n.includes("write") || n.includes("edit")) return <PencilIcon className="h-4 w-4" />;
	return <FileIcon className="h-4 w-4" />;
}

/** Render a write/edit diff with green/red line coloring. */
function DiffView({ text }: { text: string }) {
	const lines = text.split("\n");
	return (
		<pre className="overflow-x-auto rounded-md bg-base/80 p-3 font-mono text-xs leading-relaxed">
			{lines.map((line, i) => {
				let cls = "text-muted";
				if (line.startsWith("+") && !line.startsWith("+++")) cls = "bg-accent/10 text-accent";
				else if (line.startsWith("-") && !line.startsWith("---")) cls = "bg-danger/10 text-danger";
				else if (line.startsWith("@@")) cls = "text-info";
				return (
					// biome-ignore lint: diff lines have no stable id
					<div key={i} className={`whitespace-pre ${cls}`}>
						{line || " "}
					</div>
				);
			})}
		</pre>
	);
}

function MonoView({ text }: { text: string }) {
	return (
		<pre className="max-h-80 overflow-auto rounded-md bg-base/80 p-3 font-mono text-xs leading-relaxed text-muted">
			{text || "(no output)"}
		</pre>
	);
}

export function ToolCallCard({ item }: { item: ToolItem }) {
	const status = statusOf(item);
	const isDiff = /write|edit/i.test(item.call.name);
	// Diffs are most useful expanded; long read/bash output collapses by default.
	const [expanded, setExpanded] = useState(isDiff || status === "error");

	const text = resultText(item.result);
	const command = typeof item.call.arguments.command === "string" ? item.call.arguments.command : undefined;
	const filePath =
		typeof item.call.arguments.path === "string"
			? item.call.arguments.path
			: typeof item.call.arguments.file_path === "string"
				? item.call.arguments.file_path
				: undefined;
	const subtitle = command ?? filePath;

	return (
		<div className="card overflow-hidden">
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-surface-raised cursor-pointer"
			>
				<ChevronIcon className={`h-4 w-4 text-subtle transition-transform ${expanded ? "rotate-90" : ""}`} />
				<span className={statusStyles[status]}>
					<ToolIcon name={item.call.name} />
				</span>
				<span className="font-mono font-medium text-content">{item.call.name}</span>
				{subtitle && <span className="truncate font-mono text-xs text-subtle">{subtitle}</span>}
				<span className={`ml-auto flex items-center gap-1 text-xs ${statusStyles[status]}`}>
					{status === "running" && <SpinnerIcon className="h-3.5 w-3.5" />}
					{status}
				</span>
			</button>
			{expanded && (
				<div className="border-t border-border px-3 py-3">
					{command && (
						<div className="mb-2 font-mono text-xs text-info">
							<span className="select-none text-subtle">$ </span>
							{command}
						</div>
					)}
					{isDiff ? <DiffView text={text} /> : <MonoView text={text} />}
				</div>
			)}
		</div>
	);
}
