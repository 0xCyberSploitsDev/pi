import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChatPanel } from "../components/chat/ChatPanel.tsx";
import { ChevronIcon, ForkIcon } from "../components/icons.tsx";
import { ModelSelector } from "../components/model/ModelSelector.tsx";
import { useSession } from "../hooks/useSession.ts";
import { api } from "../lib/api.ts";
import type { SessionRow } from "../lib/protocol.ts";

const statusLabel: Record<string, string> = {
	connecting: "Connecting",
	open: "Live",
	closed: "Offline",
};

export function SessionPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [row, setRow] = useState<SessionRow | undefined>(undefined);
	const [loadError, setLoadError] = useState<string | undefined>(undefined);

	useEffect(() => {
		if (!id) return;
		let cancelled = false;
		api
			.getSession(id)
			.then((res) => {
				if (!cancelled) setRow(res.session);
			})
			.catch((err) => {
				if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
			});
		return () => {
			cancelled = true;
		};
	}, [id]);

	const session = useSession(row?.sdkSessionId ?? undefined);

	const fork = async () => {
		if (!id) return;
		const res = await api.forkSession(id);
		navigate(`/sessions/${res.id}`);
	};

	if (loadError) {
		return (
			<div className="flex h-full items-center justify-center text-center">
				<div>
					<p className="text-danger">{loadError}</p>
					<Link to="/" className="btn-ghost mt-3">
						Back to dashboard
					</Link>
				</div>
			</div>
		);
	}

	const statusColor =
		session.status === "open" ? "bg-accent shadow-glow" : session.status === "connecting" ? "bg-warning" : "bg-subtle";

	return (
		<div className="flex h-full flex-col">
			<header className="flex items-center gap-3 border-b border-border bg-surface/40 px-6 py-3">
				<Link to="/" className="rounded-md p-1.5 text-subtle hover:bg-surface-raised hover:text-content cursor-pointer">
					<ChevronIcon className="h-5 w-5 rotate-180" />
				</Link>
				<div className="min-w-0">
					<div className="truncate text-sm font-medium text-content">
						{session.state?.name || row?.name || "Session"}
					</div>
					<div className="flex items-center gap-1.5 text-xs text-subtle">
						<span className={`h-1.5 w-1.5 rounded-full ${statusColor}`} aria-hidden="true" />
						{statusLabel[session.status]}
					</div>
				</div>
				<div className="ml-auto flex items-center gap-2">
					<ModelSelector state={session.state} onSelectModel={session.setModel} onSelectThinking={session.setThinking} />
					<button type="button" className="btn-ghost py-1.5" onClick={fork} title="Fork into a new session">
						<ForkIcon className="h-4 w-4" />
						Fork
					</button>
				</div>
			</header>
			<div className="min-h-0 flex-1">
				<ChatPanel session={session} />
			</div>
		</div>
	);
}
