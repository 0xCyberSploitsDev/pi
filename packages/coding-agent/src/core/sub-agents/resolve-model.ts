import type { Model } from "@earendil-works/pi-ai/compat";
import type { ModelRegistry } from "../model-registry.ts";

/**
 * Resolve a model reference string to a concrete model.
 *
 * Accepts `"provider/id"` (exact) or a bare model id matched across providers.
 * Prefers models with configured auth so a sub-agent never picks a model the
 * user cannot actually call. Returns undefined when nothing matches.
 */
export function resolveModelRef(modelRegistry: ModelRegistry, ref: string): Model<any> | undefined {
	const trimmed = ref.trim();
	if (!trimmed) return undefined;

	const slash = trimmed.indexOf("/");
	if (slash > 0) {
		const provider = trimmed.slice(0, slash);
		const id = trimmed.slice(slash + 1);
		const exact = modelRegistry.find(provider, id);
		if (exact) return exact;
	}

	const available = modelRegistry.getAvailable();
	const all = modelRegistry.getAll();
	const matchesId = (m: Model<any>) => m.id === trimmed || `${m.provider}/${m.id}` === trimmed;
	return available.find(matchesId) ?? all.find(matchesId);
}
