import { useState } from "react";
import { ChevronIcon, SpinnerIcon } from "../icons.tsx";

type SubAgentStatus = "pending" | "running" | "completed" | "error" | "aborted";

interface SubAgentEntry {
	id: string;
	name: string;
	status: SubAgentStatus;
	text: string;
	turns: number;
	errorMessage?: string;
}

interface SubAgentDetails {
	agents: SubAgentEntry[];
}

/** Type guard for the `spawn_agents` tool details payload. */
export function isSubAgentDetails(value: unknown): value is SubAgentDetails {
	if (!value || typeof value !== "object" || !("agents" in value)) return false;
	const agents = (value as { agents: unknown }).agents;
	return Array.isArray(agents) && agents.every((a) => a && typeof a === "object" && "name" in a && "status" in a);
}

const statusStyles: Record<SubAgentStatus, string> = {
	pending: "text-subtle",
	running: "text-info",
	completed: "text-accent",
	error: "text-danger",
	aborted: "text-warning",
};

function SubAgentRow({ agent }: { agent: SubAgentEntry }) {
	const [expanded, setExpanded] = useState(agent.status === "error");
	const body = agent.status === "error" ? (agent.errorMessage ?? "error") : agent.text;
	return (
		<div className="overflow-hidden rounded-md border border-border bg-base/40">
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-raised cursor-pointer"
			>
				<ChevronIcon className={`h-3.5 w-3.5 text-subtle transition-transform ${expanded ? "rotate-90" : ""}`} />
				<span className="font-mono font-medium text-content">{agent.name}</span>
				<span className={`ml-auto flex items-center gap-1 text-xs ${statusStyles[agent.status]}`}>
					{agent.status === "running" && <SpinnerIcon className="h-3.5 w-3.5" />}
					{agent.status}
					<span className="text-subtle">· {agent.turns} turns</span>
				</span>
			</button>
			{expanded && (
				<pre className="max-h-72 overflow-auto border-t border-border px-3 py-2 font-mono text-xs leading-relaxed text-muted">
					{body || "(no output yet)"}
				</pre>
			)}
		</div>
	);
}

/**
 * Render the parallel sub-agents spawned by a `spawn_agents` tool call, with
 * live status as each one works and its final report when done.
 */
export function SubAgentsCard({ details }: { details: SubAgentDetails }) {
	const running = details.agents.filter((a) => a.status === "running" || a.status === "pending").length;
	return (
		<div className="card overflow-hidden">
			<div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
				<span className="font-mono font-medium text-content">spawn_agents</span>
				<span className="text-xs text-subtle">{details.agents.length} sub-agents</span>
				{running > 0 && (
					<span className="ml-auto flex items-center gap-1 text-xs text-info">
						<SpinnerIcon className="h-3.5 w-3.5" />
						{running} running
					</span>
				)}
			</div>
			<div className="space-y-2 p-3">
				{details.agents.map((agent) => (
					<SubAgentRow key={agent.id} agent={agent} />
				))}
			</div>
		</div>
	);
}
