import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import type { ModelDescriptor } from "../lib/protocol.ts";

export interface UseModelsResult {
	models: ModelDescriptor[];
	loading: boolean;
	error: string | undefined;
	refresh: () => Promise<void>;
}

/** Fetch the list of models exposed by the server (`/models`). */
export function useModels(): UseModelsResult {
	const [models, setModels] = useState<ModelDescriptor[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | undefined>(undefined);

	const refresh = useCallback(async () => {
		try {
			setModels(await api.listModels());
			setError(undefined);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return { models, loading, error, refresh };
}
