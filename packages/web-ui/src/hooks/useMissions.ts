import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api.ts";
import type { MissionRow, MissionStatus } from "../lib/protocol.ts";

export interface UseMissionsResult {
	missions: MissionRow[];
	loading: boolean;
	error: string | undefined;
	refresh: () => Promise<void>;
	create: (body: { prompt: string; sessionId?: string; model?: string }) => Promise<void>;
	cancel: (id: string) => Promise<void>;
}

function hasActiveMission(missions: MissionRow[]): boolean {
	return missions.some((m) => m.status === "queued" || m.status === "running");
}

/** Poll the mission queue. Polls faster while any mission is active. */
export function useMissions(filter?: MissionStatus): UseMissionsResult {
	const [missions, setMissions] = useState<MissionRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | undefined>(undefined);

	// Mirror the latest list so the polling loop can pick its cadence without
	// re-subscribing on every change.
	const missionsRef = useRef<MissionRow[]>([]);
	missionsRef.current = missions;

	const refresh = useCallback(async () => {
		try {
			const rows = await api.listMissions(filter);
			setMissions(rows);
			setError(undefined);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [filter]);

	useEffect(() => {
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const tick = async () => {
			await refresh();
			if (cancelled) return;
			const delay = hasActiveMission(missionsRef.current) ? 1500 : 5000;
			timer = setTimeout(tick, delay);
		};

		void tick();
		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [refresh]);

	const create = useCallback(
		async (body: { prompt: string; sessionId?: string; model?: string }) => {
			await api.createMission(body);
			await refresh();
		},
		[refresh],
	);

	const cancel = useCallback(
		async (id: string) => {
			await api.cancelMission(id);
			await refresh();
		},
		[refresh],
	);

	return { missions, loading, error, refresh, create, cancel };
}
