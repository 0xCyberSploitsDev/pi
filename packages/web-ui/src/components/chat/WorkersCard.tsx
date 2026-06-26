import { useState } from "react";
import { ChevronIcon, SpinnerIcon } from "../icons.tsx";

type WorkerStatus = "pending" | "running" | "completed" | "error" | "aborted";

interface WorkerEntry {
	id: string;
	name: string;
	status: WorkerStatus;
	text: string;
	turns: number;
	model?: string;
	branch?: string;
	diff?: string;
	changedFiles?: string[];
	errorMessage?: string;
}

interface WorkersDetails {
	workers: WorkerEntry[];
	review?: string;
}

/** Type guard for the `spawn_workers` tool details payload. */
export function isWorkersDetails(value: unknown): value is WorkersDetails {
	if (!value || typeof value !== "object" || !("workers" in value)) return false;
	const workers = (value as { workers: unknown }).workers;
	return Array.isArray(workers) && workers.every((w) => w && typeof w === "object" && "name" in w && "status" in w);
}

const statusStyles: Record<WorkerStatus, string> = {
	pending: "text-subtle",
	running: "text-info",
	completed: "text-accent",
	error: "text-danger",
	aborted: "text-warning",
};

function WorkerRow({ worker }: { worker: WorkerEntry }) {
	const [expanded, setExpanded] = useState(worker.status === "error");
	return (
		<div className="overflow-hidden rounded-md border border-border bg-base/40">
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-raised cursor-pointer"
			>
				<ChevronIcon className={`h-3.5 w-3.5 text-subtle transition-transform ${expanded ? "rotate-90" : ""}`} />
				<span className="font-mono font-medium text-content">{worker.name}</span>
				{worker.branch && <span className="text-xs text-subtle">· {worker.branch}</span>}
				<span className={`ml-auto flex items-center gap-1 text-xs ${statusStyles[worker.status]}`}>
					{worker.status === "running" && <SpinnerIcon className="h-3.5 w-3.5" />}
					{worker.status}
					<span className="text-subtle">· {worker.turns} turns</span>
				</span>
			</button>
			{expanded && (
				<div className="border-t border-border">
					{worker.status === "error" ? (
						<pre className="max-h-72 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed text-danger">
							{worker.errorMessage ?? "error"}
						</pre>
					) : (
						<>
							{worker.changedFiles && worker.changedFiles.length > 0 && (
								<div className="px-3 py-2 text-xs text-subtle">Files: {worker.changedFiles.join(", ")}</div>
							)}
							{worker.text && (
								<pre className="max-h-48 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed text-muted">
									{worker.text}
								</pre>
							)}
							{worker.diff && (
								<pre className="max-h-96 overflow-auto border-t border-border px-3 py-2 font-mono text-xs leading-relaxed text-muted">
									{worker.diff}
								</pre>
							)}
						</>
					)}
				</div>
			)}
		</div>
	);
}

/**
 * Render writable workers spawned by a `spawn_workers` tool call: each runs in
 * an isolated git worktree, with live status, its diff, and the cross-validation
 * review when present.
 */
export function WorkersCard({ details }: { details: WorkersDetails }) {
	const running = details.workers.filter((w) => w.status === "running" || w.status === "pending").length;
	return (
		<div className="card overflow-hidden">
			<div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
				<span className="font-mono font-medium text-content">spawn_workers</span>
				<span className="text-xs text-subtle">{details.workers.length} workers</span>
				{running > 0 && (
					<span className="ml-auto flex items-center gap-1 text-xs text-info">
						<SpinnerIcon className="h-3.5 w-3.5" />
						{running} running
					</span>
				)}
			</div>
			<div className="space-y-2 p-3">
				{details.workers.map((worker) => (
					<WorkerRow key={worker.id} worker={worker} />
				))}
				{details.review && (
					<div className="overflow-hidden rounded-md border border-info/40 bg-base/40">
						<div className="border-b border-border px-3 py-2 text-xs font-medium text-info">
							Cross-validation review
						</div>
						<pre className="max-h-72 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed text-muted">
							{details.review}
						</pre>
					</div>
				)}
			</div>
		</div>
	);
}
