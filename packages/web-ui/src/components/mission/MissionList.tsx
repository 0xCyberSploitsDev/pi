import type { MissionRow } from "../../lib/protocol.ts";
import { MissionCard } from "./MissionCard.tsx";

interface MissionListProps {
	missions: MissionRow[];
	loading: boolean;
	onCancel: (id: string) => void;
}

export function MissionList({ missions, loading, onCancel }: MissionListProps) {
	if (loading) {
		return (
			<div className="space-y-3">
				{[0, 1, 2].map((i) => (
					<div key={i} className="card h-12 animate-pulse bg-surface/40" />
				))}
			</div>
		);
	}

	if (missions.length === 0) {
		return (
			<div className="card flex flex-col items-center justify-center gap-1 p-10 text-center">
				<p className="font-mono text-content">No missions</p>
				<p className="text-sm text-subtle">Queue a mission to run a prompt in the background.</p>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{missions.map((m) => (
				<MissionCard key={m.id} mission={m} onCancel={onCancel} />
			))}
		</div>
	);
}
