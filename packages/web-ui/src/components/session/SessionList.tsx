import type { SessionRow } from "../../lib/protocol.ts";
import { SessionCard } from "./SessionCard.tsx";

interface SessionListProps {
	sessions: SessionRow[];
	loading: boolean;
	onDelete: (id: string) => void;
}

export function SessionList({ sessions, loading, onDelete }: SessionListProps) {
	if (loading) {
		return (
			<div className="space-y-3">
				{[0, 1, 2].map((i) => (
					<div key={i} className="card h-[4.5rem] animate-pulse bg-surface/40" />
				))}
			</div>
		);
	}

	if (sessions.length === 0) {
		return (
			<div className="card flex flex-col items-center justify-center gap-1 p-10 text-center">
				<p className="font-mono text-content">No sessions yet</p>
				<p className="text-sm text-subtle">Create a session to start chatting with the agent.</p>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{sessions.map((s) => (
				<SessionCard key={s.id} session={s} onDelete={onDelete} />
			))}
		</div>
	);
}
