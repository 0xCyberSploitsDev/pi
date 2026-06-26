import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SessionList } from "../components/session/SessionList.tsx";
import { PlusIcon } from "../components/icons.tsx";
import { useModels } from "../hooks/useModels.ts";
import { useSessions } from "../hooks/useSessions.ts";
import { api } from "../lib/api.ts";

function StatCard({ label, value }: { label: string; value: string | number }) {
	return (
		<div className="card p-4">
			<div className="text-2xl font-semibold text-content">{value}</div>
			<div className="mt-1 text-xs uppercase tracking-wide text-subtle">{label}</div>
		</div>
	);
}

export function Dashboard() {
	const navigate = useNavigate();
	const { sessions, loading, refresh } = useSessions();
	const { models } = useModels();
	const [creating, setCreating] = useState(false);
	const [model, setModel] = useState("");
	const [error, setError] = useState<string | undefined>(undefined);

	const availableModels = useMemo(() => models.filter((m) => m.available), [models]);
	const activeModel = model || (availableModels[0] ? `${availableModels[0].provider}/${availableModels[0].id}` : "");

	const createSession = async () => {
		setCreating(true);
		setError(undefined);
		try {
			const res = await api.createSession({ model: activeModel || undefined });
			await refresh();
			navigate(`/sessions/${res.id}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setCreating(false);
		}
	};

	const deleteSession = async (id: string) => {
		await api.deleteSession(id);
		await refresh();
	};

	return (
		<div className="mx-auto h-full max-w-5xl overflow-y-auto px-8 py-8">
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-xl font-semibold text-content">Dashboard</h1>
					<p className="mt-1 text-sm text-subtle">Manage your agent sessions.</p>
				</div>
				<div className="flex items-center gap-2">
					<select
						value={activeModel}
						onChange={(e) => setModel(e.target.value)}
						className="input w-auto cursor-pointer py-2 font-mono text-xs"
						aria-label="Model for new session"
					>
						{availableModels.length === 0 && <option value="">No models available</option>}
						{availableModels.map((m) => (
							<option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
								{m.provider}/{m.name}
							</option>
						))}
					</select>
					<button type="button" className="btn-primary" onClick={createSession} disabled={creating}>
						<PlusIcon className="h-4 w-4" />
						New session
					</button>
				</div>
			</div>

			<div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
				<StatCard label="Sessions" value={sessions.length} />
				<StatCard label="Models available" value={availableModels.length} />
				<StatCard label="Providers" value={new Set(availableModels.map((m) => m.provider)).size} />
			</div>

			{error && (
				<div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
			)}

			<SessionList sessions={sessions} loading={loading} onDelete={deleteSession} />
		</div>
	);
}
