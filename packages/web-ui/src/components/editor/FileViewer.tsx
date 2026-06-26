import { FileIcon } from "../icons.tsx";

interface FileViewerProps {
	path?: string;
	content: string;
}

/**
 * Lightweight read-only file viewer with line numbers. A full editor
 * (CodeMirror) can replace this later; for previewing agent file reads a
 * monospace, scrollable view is sufficient and keeps the bundle small.
 */
export function FileViewer({ path, content }: FileViewerProps) {
	const lines = content.split("\n");
	return (
		<div className="card overflow-hidden">
			{path && (
				<div className="flex items-center gap-2 border-b border-border px-3 py-2 font-mono text-xs text-muted">
					<FileIcon className="h-4 w-4 text-subtle" />
					<span className="truncate">{path}</span>
				</div>
			)}
			<div className="max-h-96 overflow-auto">
				<pre className="flex font-mono text-xs leading-relaxed">
					<code className="select-none border-r border-border px-2 py-3 text-right text-subtle">
						{lines.map((_, i) => (
							// biome-ignore lint: line numbers have no stable id
							<div key={i}>{i + 1}</div>
						))}
					</code>
					<code className="overflow-x-auto px-3 py-3 text-content">
						{lines.map((line, i) => (
							// biome-ignore lint: file lines have no stable id
							<div key={i} className="whitespace-pre">
								{line || " "}
							</div>
						))}
					</code>
				</pre>
			</div>
		</div>
	);
}
