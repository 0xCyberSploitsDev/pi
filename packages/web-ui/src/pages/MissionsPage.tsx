import { useState } from "react";
import { MissionList } from "../components/mission/MissionList.tsx";
import { PlusIcon } from "../components/icons.tsx";
import { useMissions } from "../hooks/useMissions.ts";
import { useModels } from "../hooks/useModels.ts";
import type { MissionStatus } from "../lib/protocol.ts";

const filters: Array<{ value: MissionStatus | "all"; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "queued", label: "Queued" },
	{ value: "running", label: "Running" },
	{ value: "completed", label: "Completed" },
	{ value: "failed", label: "Failed" },
];

export function MissionsPage() {
	const [filter, setFilter] = useState<MissionStatus | "all">("all");
	const { missions, loading, create, cancel, error } = useMissions(filter === "all" ? undefined : filter);
	const { models } = useModels();
	const available = models.filter((m) => m.available);

	const [prompt, setPrompt] = useState("");
	const [model, setModel] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [formError, setFormError] = useState<string | undefined>(undefined);

	const submit = async () => {
		const text = prompt.trim();
		if (!text) return;
		setSubmitting(true);
		setFormError(undefined);
		try {
			await create({ prompt: text, model: model || undefined });
			setPrompt("");
		} catch (err) {
			setFormError(err instanceof Error ? err.message : String(err));
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="mx-auto h-full max-w-5xl overflow-y-auto px-8 py-8">
			<div className="mb-6">
				<h1 className="text-xl font-semibold text-content">Missions</h1>
				<p className="mt-1 text-sm text-subtle">Queue prompts to run asynchronously in the background.</p>
			</div>

			<div className="card mb-6 p-4">
				<textarea
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					rows={3}
					placeholder="Describe the mission prompt..."
					className="input resize-y"
				/>
				<div className="mt-3 flex items-center gap-2">
					<select
						value={model}
						onChange={(e) => setModel(e.target.value)}
						className="input w-auto cursor-pointer py-2 font-mono text-xs"
						aria-label="Model"
					>
						<option value="">Default model</option>
						{available.map((m) => (
							<option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
								{m.provider}/{m.name}
							</option>
						))}
					</select>
					<button type="button" className="btn-primary ml-auto" onClick={submit} disabled={submitting || !prompt.trim()}>
						<PlusIcon className="h-4 w-4" />
						Queue mission
					</button>
				</div>
				{formError && <div className="mt-2 text-sm text-danger">{formError}</div>}
			</div>

			<div className="mb-4 flex items-center gap-2">
				{filters.map((f) => (
					<button
						type="button"
						key={f.value}
						onClick={() => setFilter(f.value)}
						className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200 cursor-pointer ${
							filter === f.value ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-raised hover:text-content"
						}`}
					>
						{f.label}
					</button>
				))}
			</div>

			{error && (
				<div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
			)}

			<MissionList missions={missions} loading={loading} onCancel={cancel} />
		</div>
	);
}
