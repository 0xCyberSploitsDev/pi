import { NavLink } from "react-router-dom";
import { ChatIcon, DashboardIcon, QueueIcon, TerminalIcon } from "../icons.tsx";

const navItems = [
	{ to: "/", label: "Dashboard", Icon: DashboardIcon, end: true },
	{ to: "/missions", label: "Missions", Icon: QueueIcon, end: false },
];

export function Sidebar() {
	return (
		<aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface/50">
			<div className="flex items-center gap-2 px-5 py-5">
				<span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent">
					<TerminalIcon className="h-5 w-5" />
				</span>
				<span className="font-mono text-lg font-semibold tracking-tight">pi cloud</span>
			</div>

			<nav className="flex flex-col gap-1 px-3">
				{navItems.map(({ to, label, Icon, end }) => (
					<NavLink
						key={to}
						to={to}
						end={end}
						className={({ isActive }) =>
							`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 cursor-pointer ${
								isActive ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-raised hover:text-content"
							}`
						}
					>
						<Icon className="h-5 w-5" />
						{label}
					</NavLink>
				))}
			</nav>

			<div className="mt-auto px-5 py-4 text-xs text-subtle">
				<div className="flex items-center gap-2">
					<ChatIcon className="h-4 w-4" />
					<span>Cloud coding agent</span>
				</div>
			</div>
		</aside>
	);
}
