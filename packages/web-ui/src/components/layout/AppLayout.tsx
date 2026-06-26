import { useState } from "react";
import { Outlet } from "react-router-dom";
import { getApiKey, setApiKey } from "../../lib/api.ts";
import { Sidebar } from "./Sidebar.tsx";

export function AppLayout() {
	const [keyInput, setKeyInput] = useState(getApiKey());
	const [savedKey, setSavedKey] = useState(getApiKey());
	const [editing, setEditing] = useState(false);

	const save = () => {
		setApiKey(keyInput.trim());
		setSavedKey(keyInput.trim());
		setEditing(false);
	};

	return (
		<div className="flex h-screen overflow-hidden bg-base text-content">
			<Sidebar />
			<div className="flex min-w-0 flex-1 flex-col">
				<header className="flex items-center justify-between gap-4 border-b border-border bg-surface/40 px-6 py-3">
					<div className="text-sm text-muted">Connected to local server</div>
					<div className="flex items-center gap-2">
						{editing ? (
							<>
								<input
									type="password"
									value={keyInput}
									onChange={(e) => setKeyInput(e.target.value)}
									placeholder="API key"
									className="input w-56 py-1.5"
									// biome-ignore lint: intentional autofocus for the inline key editor
									autoFocus
								/>
								<button type="button" className="btn-primary py-1.5" onClick={save}>
									Save
								</button>
							</>
						) : (
							<button
								type="button"
								className="btn-ghost py-1.5"
								onClick={() => setEditing(true)}
								title="Set the API key used for server requests"
							>
								<span
									className={`h-2 w-2 rounded-full ${savedKey ? "bg-accent shadow-glow" : "bg-subtle"}`}
									aria-hidden="true"
								/>
								{savedKey ? "API key set" : "Set API key"}
							</button>
						)}
					</div>
				</header>
				<main className="min-h-0 flex-1 overflow-hidden">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
