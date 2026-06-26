import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
	return (
		<svg
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.75"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			{children}
		</svg>
	);
}

export const TerminalIcon = (p: IconProps) => (
	<Base {...p}>
		<polyline points="4 7 9 12 4 17" />
		<line x1="12" y1="17" x2="20" y2="17" />
	</Base>
);

export const DashboardIcon = (p: IconProps) => (
	<Base {...p}>
		<rect x="3" y="3" width="7" height="9" rx="1" />
		<rect x="14" y="3" width="7" height="5" rx="1" />
		<rect x="14" y="12" width="7" height="9" rx="1" />
		<rect x="3" y="16" width="7" height="5" rx="1" />
	</Base>
);

export const ChatIcon = (p: IconProps) => (
	<Base {...p}>
		<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
	</Base>
);

export const QueueIcon = (p: IconProps) => (
	<Base {...p}>
		<line x1="8" y1="6" x2="21" y2="6" />
		<line x1="8" y1="12" x2="21" y2="12" />
		<line x1="8" y1="18" x2="21" y2="18" />
		<line x1="3" y1="6" x2="3.01" y2="6" />
		<line x1="3" y1="12" x2="3.01" y2="12" />
		<line x1="3" y1="18" x2="3.01" y2="18" />
	</Base>
);

export const PlusIcon = (p: IconProps) => (
	<Base {...p}>
		<line x1="12" y1="5" x2="12" y2="19" />
		<line x1="5" y1="12" x2="19" y2="12" />
	</Base>
);

export const StopIcon = (p: IconProps) => (
	<Base {...p}>
		<rect x="6" y="6" width="12" height="12" rx="2" />
	</Base>
);

export const SendIcon = (p: IconProps) => (
	<Base {...p}>
		<line x1="22" y1="2" x2="11" y2="13" />
		<polygon points="22 2 15 22 11 13 2 9 22 2" />
	</Base>
);

export const TrashIcon = (p: IconProps) => (
	<Base {...p}>
		<polyline points="3 6 5 6 21 6" />
		<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
	</Base>
);

export const ForkIcon = (p: IconProps) => (
	<Base {...p}>
		<circle cx="6" cy="6" r="3" />
		<circle cx="6" cy="18" r="3" />
		<circle cx="18" cy="6" r="3" />
		<path d="M6 9v6" />
		<path d="M18 9a9 9 0 0 1-9 9" />
	</Base>
);

export const ChevronIcon = (p: IconProps) => (
	<Base {...p}>
		<polyline points="9 18 15 12 9 6" />
	</Base>
);

export const FileIcon = (p: IconProps) => (
	<Base {...p}>
		<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
		<polyline points="14 2 14 8 20 8" />
	</Base>
);

export const PencilIcon = (p: IconProps) => (
	<Base {...p}>
		<path d="M12 20h9" />
		<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
	</Base>
);

export const SpinnerIcon = (p: IconProps) => (
	<Base {...p} className={`animate-spin ${p.className ?? ""}`}>
		<path d="M21 12a9 9 0 1 1-6.219-8.56" />
	</Base>
);
