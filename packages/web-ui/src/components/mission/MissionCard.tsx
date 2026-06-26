import { useState } from "react";
import type { MissionRow, MissionStatus } from "../../lib/protocol.ts";
import { ChevronIcon, SpinnerIcon } from "../icons.tsx";

const statusBadge: Record<MissionStatus, string> = {
	queued: "bg-subtle/15 text-muted",
	running: "bg-info/15 text-info",
	completed: "bg-accent/15 text-accent",
	failed: "bg-danger/15 text-danger",
	cancelled: "bg-warning/15 text-warning",
};

interface MissionCardProps {
	mission: MissionRow;
	onCancel: (id: string) => void;
}

export function MissionCard({ mission, onCancel }: MissionCardProps) {
	const [expanded, setExpanded] = useState(false);
	const canCancel = mission.status === "queued" || mission.status === "running";
	const output = mission.status === "failed" ? mission.error : mission.result?.text;

	return (
		<div className="card overflow-hidden">
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-surface-raised cursor-pointer"
			>
				<ChevronIcon className={`h-4 w-4 shrink-0 text-subtle transition-transform ${expanded ? "rotate-90" : ""}`} />
				<span className="min-w-0 flex-1 truncate text-sm text-content">{mission.prompt}</span>
				<span className={`badge ${statusBadge[mission.status]}`}>
					{mission.status === "running" && <SpinnerIcon className="h-3 w-3" />}
					{mission.status}
				</span>
			</button>
			{expanded && (
				<div className="space-y-3 border-t border-border px-4 py-3">
					<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
						{mission.model && <span className="font-mono">model: {mission.model}</span>}
						{mission.sessionId && <span className="font-mono">session: {mission.sessionId.slice(0, 8)}</span>}
						<span>created: {new Date(mission.createdAt).toLocaleString()}</span>
					</div>
					<div>
						<div className="mb-1 text-xs font-medium text-muted">Prompt</div>
						<pre className="whitespace-pre-wrap rounded-md bg-base/60 p-3 font-mono text-xs text-muted">
							{mission.prompt}
						</pre>
					</div>
					{output && (
						<div>
							<div className="mb-1 text-xs font-medium text-muted">{mission.status === "failed" ? "Error" : "Result"}</div>
							<pre
								className={`max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-base/60 p-3 font-mono text-xs ${
									mission.status === "failed" ? "text-danger" : "text-muted"
								}`}
							>
								{output}
							</pre>
						</div>
					)}
					{canCancel && (
						<button type="button" className="btn-danger py-1.5" onClick={() => onCancel(mission.id)}>
							Cancel mission
						</button>
					)}
				</div>
			)}
		</div>
	);
}
