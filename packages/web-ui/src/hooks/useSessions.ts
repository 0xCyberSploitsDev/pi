import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import type { SessionRow } from "../lib/protocol.ts";

export interface UseSessionsResult {
	sessions: SessionRow[];
	loading: boolean;
	error: string | undefined;
	refresh: () => Promise<void>;
}

/** Fetch and refresh the list of persisted sessions (`/sessions`). */
export function useSessions(): UseSessionsResult {
	const [sessions, setSessions] = useState<SessionRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | undefined>(undefined);

	const refresh = useCallback(async () => {
		try {
			setSessions(await api.listSessions());
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

	return { sessions, loading, error, refresh };
}
