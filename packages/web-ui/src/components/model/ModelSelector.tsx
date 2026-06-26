import { useMemo } from "react";
import { useModels } from "../../hooks/useModels.ts";
import type { SessionStateSnapshot, WireThinkingLevel } from "../../lib/protocol.ts";

interface ModelSelectorProps {
	state: SessionStateSnapshot | undefined;
	onSelectModel: (model: string) => void;
	onSelectThinking: (level: WireThinkingLevel) => void;
}

export function ModelSelector({ state, onSelectModel, onSelectThinking }: ModelSelectorProps) {
	const { models, loading } = useModels();

	// Group available models by provider for a readable dropdown.
	const grouped = useMemo(() => {
		const byProvider = new Map<string, { value: string; label: string }[]>();
		for (const m of models) {
			if (!m.available) continue;
			const list = byProvider.get(m.provider) ?? [];
			list.push({ value: `${m.provider}/${m.id}`, label: m.name });
			byProvider.set(m.provider, list);
		}
		return [...byProvider.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	}, [models]);

	const thinkingLevels = state?.availableThinkingLevels ?? [];

	return (
		<div className="flex items-center gap-2">
			<select
				value={state?.model ?? ""}
				onChange={(e) => onSelectModel(e.target.value)}
				disabled={loading || grouped.length === 0}
				className="input w-auto cursor-pointer py-1.5 font-mono text-xs"
				aria-label="Model"
			>
				{!state?.model && <option value="">Select model</option>}
				{grouped.map(([provider, list]) => (
					<optgroup key={provider} label={provider}>
						{list.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</optgroup>
				))}
			</select>

			{state?.supportsThinking && thinkingLevels.length > 0 && (
				<select
					value={state.thinkingLevel}
					onChange={(e) => onSelectThinking(e.target.value as WireThinkingLevel)}
					className="input w-auto cursor-pointer py-1.5 font-mono text-xs"
					aria-label="Thinking level"
				>
					{thinkingLevels.map((level) => (
						<option key={level} value={level}>
							think: {level}
						</option>
					))}
				</select>
			)}
		</div>
	);
}
