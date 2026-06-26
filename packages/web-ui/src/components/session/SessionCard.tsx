import { Link } from "react-router-dom";
import type { SessionRow } from "../../lib/protocol.ts";
import { TrashIcon } from "../icons.tsx";

function relativeTime(iso: string): string {
	const date = new Date(iso);
	const diff = Date.now() - date.getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	return date.toLocaleDateString();
}

interface SessionCardProps {
	session: SessionRow;
	onDelete: (id: string) => void;
}

export function SessionCard({ session, onDelete }: SessionCardProps) {
	const title = session.name || session.sdkSessionId?.slice(0, 8) || session.id.slice(0, 8);
	const modelLabel = session.model ? `${session.provider ?? ""}/${session.model}` : "no model";

	return (
		<div className="card-interactive group flex items-center gap-4 p-4">
			<Link to={`/sessions/${session.id}`} className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate font-medium text-content">{title}</span>
				</div>
				<div className="mt-1 flex items-center gap-3 text-xs text-subtle">
					<span className="truncate font-mono">{modelLabel}</span>
					<span>·</span>
					<span>{relativeTime(session.updatedAt)}</span>
				</div>
			</Link>
			<button
				type="button"
				onClick={() => onDelete(session.id)}
				className="rounded-md p-2 text-subtle opacity-0 transition-all duration-200 hover:bg-danger/10 hover:text-danger group-hover:opacity-100 cursor-pointer"
				aria-label="Delete session"
			>
				<TrashIcon className="h-4 w-4" />
			</button>
		</div>
	);
}
