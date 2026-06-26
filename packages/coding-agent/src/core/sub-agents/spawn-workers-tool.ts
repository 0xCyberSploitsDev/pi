import type { AgentTool, AgentToolResult, AgentToolUpdateCallback, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model, TextContent } from "@earendil-works/pi-ai/compat";
import { type Static, Type } from "typebox";
import { defineTool, type ToolDefinition } from "../extensions/types.ts";
import type { ModelRegistry } from "../model-registry.ts";
import type { SettingsManager } from "../settings-manager.ts";
import { createCodingTools, createReadOnlyTools } from "../tools/index.ts";
import { wrapToolDefinition } from "../tools/tool-definition-wrapper.ts";
import { resolveModelRef } from "./resolve-model.ts";
import { createSpawnAgentsToolDefinition } from "./spawn-agents-tool.ts";
import { runSubAgents, type SubAgentProgress, type SubAgentResult, type SubAgentTask } from "./sub-agent-runner.ts";
import { persistSubAgentTranscript } from "./sub-agent-session.ts";
import {
	createWorktree,
	getWorktreeChangedFiles,
	getWorktreeDiff,
	isGitRepo,
	removeWorktree,
	type Worktree,
} from "./worktree.ts";

const spawnWorkersSchema = Type.Object({
	workers: Type.Array(
		Type.Object({
			name: Type.String({ description: "Short name identifying this worker (e.g. 'add-pagination')." }),
			prompt: Type.String({
				description:
					"Self-contained instruction. The worker edits files in its own isolated git worktree and cannot see the parent conversation, so include all context. Tell it exactly what to implement.",
			}),
			model: Type.Optional(
				Type.String({ description: "Optional model as 'provider/id' or bare id. Defaults to the parent's model." }),
			),
		}),
		{
			minItems: 1,
			maxItems: 4,
			description: "Workers that each implement a task in parallel inside an isolated git worktree.",
		},
	),
	review: Type.Optional(
		Type.Boolean({
			description:
				"When true, a read-only reviewer sub-agent cross-validates every worker's diff and reports issues before you apply anything. Defaults to true.",
		}),
	),
});

export type SpawnWorkersInput = Static<typeof spawnWorkersSchema>;

/** Outcome for a single writable worker. */
export interface WorkerResult extends SubAgentResult {
	/** Branch the worker's worktree was created on. */
	branch?: string;
	/** Unified diff of the worker's changes against HEAD. */
	diff?: string;
	/** Relative paths the worker changed. */
	changedFiles?: string[];
}

export interface SpawnWorkersToolDetails {
	workers: WorkerResult[];
	/** Reviewer's cross-validation report, when review was requested. */
	review?: string;
}

export interface SpawnWorkersToolOptions {
	cwd: string;
	modelRegistry: ModelRegistry;
	settingsManager: SettingsManager;
	/** Directory under which isolated worktrees are created. */
	worktreesDir: string;
	getModel: () => Model<any> | undefined;
	getThinkingLevel: () => ThinkingLevel;
	getSessionId?: () => string | undefined;
	getSessionFile?: () => string | undefined;
	/** Parent session directory, used as the base for persisted transcripts. */
	getSessionDir?: () => string | undefined;
	maxTurns?: number;
	/** Persist each worker transcript to its own JSONL session. Defaults to true. */
	persistTranscripts?: boolean;
	/** Keep worktrees after capturing diffs (for manual inspection). Defaults to false. */
	keepWorktrees?: boolean;
}

const WORKER_SYSTEM_PROMPT = [
	"You are a worker sub-agent spawned by a coordinating agent to implement one focused task in parallel with other workers.",
	"You are working inside your OWN isolated git worktree. Edits you make do not affect other workers or the parent.",
	"You have full coding tools (read, bash, edit, write) plus spawn_agents for read-only investigation.",
	"Implement the task completely. Do not commit; the coordinator reviews your diff and applies changes.",
	"End with a concise final report: what you changed, why, and anything the coordinator must verify.",
].join("\n");

const REVIEWER_SYSTEM_PROMPT = [
	"You are a reviewer sub-agent. Several workers implemented changes in isolated worktrees.",
	"You are given each worker's task and unified diff. Cross-validate the changes:",
	"flag correctness bugs, conflicts between workers, missed requirements, and risky edits.",
	"You have read-only tools. Produce a concise, actionable review the coordinator can act on before applying anything.",
].join("\n");

function statusLabel(result: SubAgentResult): string {
	if (result.status === "error") return `error: ${result.errorMessage ?? "unknown error"}`;
	return result.status;
}

function formatWorkers(workers: WorkerResult[]): string {
	return workers
		.map((w) => {
			const model = w.model ? ` · ${w.model}` : "";
			const files = w.changedFiles?.length ? `\nFiles: ${w.changedFiles.join(", ")}` : "";
			const report = w.text.trim() || "(no report produced)";
			const diff = w.diff?.trim() ? `\n\nDiff:\n\`\`\`diff\n${w.diff.trim()}\n\`\`\`` : "\n\n(no changes)";
			return `## [${w.name}] (${statusLabel(w)}${model})${files}\n${report}${diff}`;
		})
		.join("\n\n");
}

/**
 * Create the `spawn_workers` tool: writable sub-agents that each implement a
 * task in an isolated git worktree, with optional cross-validation review.
 *
 * Each worker runs in its own `git worktree` on a fresh branch with full coding
 * tools, so concurrent edits never collide. The tool captures each worker's diff
 * against HEAD, runs an optional read-only reviewer that cross-validates all
 * diffs together, persists every transcript, and returns the diffs plus review.
 * The coordinator applies changes itself after reviewing — the parent working
 * tree is never mutated directly.
 */
export function createSpawnWorkersToolDefinition(options: SpawnWorkersToolOptions): ToolDefinition {
	const persistTranscripts = options.persistTranscripts ?? true;
	return defineTool({
		name: "spawn_workers",
		label: "spawn workers",
		description:
			"Delegate independent IMPLEMENTATION tasks to writable worker sub-agents that run in parallel, each in its own isolated git worktree. Workers have full coding tools and edit files without touching your working tree or each other. An optional reviewer cross-validates all diffs. Returns each worker's diff and the review. Use this for parallel, independent edits (e.g. implement feature A and refactor module B at once); review and apply the diffs yourself afterwards.",
		promptSnippet: "Run independent implementation tasks in parallel via isolated worktree workers",
		promptGuidelines: [
			"Use spawn_workers only for INDEPENDENT implementation tasks that can be developed in parallel.",
			"Each worker edits its own git worktree; you must review and apply the returned diffs yourself.",
			"Keep workers independent: overlapping edits to the same files cause conflicting diffs.",
			"Leave review enabled to catch correctness bugs and inter-worker conflicts before applying.",
		],
		parameters: spawnWorkersSchema,
		async execute(
			_toolCallId: string,
			params: SpawnWorkersInput,
			signal: AbortSignal | undefined,
			onUpdate: AgentToolUpdateCallback<SpawnWorkersToolDetails> | undefined,
		): Promise<AgentToolResult<SpawnWorkersToolDetails>> {
			const model = options.getModel();
			if (!model) {
				throw new Error("No model is configured; cannot spawn workers.");
			}
			if (!(await isGitRepo(options.cwd, signal))) {
				throw new Error("spawn_workers requires a git repository (isolated worktrees cannot be created).");
			}

			const thinkingLevel = options.getThinkingLevel();
			const sessionId = options.getSessionId?.();
			const sessionFile = options.getSessionFile?.();

			// One worktree per worker, created up front so we can map task -> tools.
			const worktrees = new Map<string, Worktree>();
			const created: Worktree[] = [];
			try {
				const tasks: SubAgentTask[] = [];
				for (const [index, worker] of params.workers.entries()) {
					const resolved = worker.model ? resolveModelRef(options.modelRegistry, worker.model) : undefined;
					if (worker.model && !resolved) {
						throw new Error(`Unknown model "${worker.model}" requested for worker "${worker.name}".`);
					}
					const worktree = await createWorktree({
						repoCwd: options.cwd,
						worktreesDir: options.worktreesDir,
						branchSeed: worker.name,
						signal,
					});
					created.push(worktree);
					const id = String(index);
					worktrees.set(id, worktree);
					tasks.push({
						id,
						name: worker.name,
						prompt: worker.prompt,
						model: resolved,
						tools: buildWorkerTools(worktree.path, options),
					});
				}

				const progressById = new Map<string, SubAgentProgress>(
					tasks.map((task) => [
						task.id,
						{
							id: task.id,
							name: task.name,
							status: "pending",
							text: "",
							turns: 0,
							model: `${(task.model ?? model).provider}/${(task.model ?? model).id}`,
						},
					]),
				);
				const emitProgress = (review?: string) => {
					const snapshot = tasks.map((task): WorkerResult => {
						const p = progressById.get(task.id);
						const worktree = worktrees.get(task.id);
						return {
							id: task.id,
							name: task.name,
							status: p?.status ?? "pending",
							text: p?.text ?? "",
							turns: p?.turns ?? 0,
							model: p?.model,
							branch: worktree?.branch,
						};
					});
					onUpdate?.({
						content: [{ type: "text", text: formatWorkers(snapshot) }],
						details: { workers: snapshot, review },
					});
				};

				const subResults = await runSubAgents({
					tasks,
					model,
					thinkingLevel,
					modelRegistry: options.modelRegistry,
					settingsManager: options.settingsManager,
					systemPrompt: WORKER_SYSTEM_PROMPT,
					tools: [],
					maxTurns: options.maxTurns,
					sessionId,
					signal,
					onTranscript: persistTranscripts
						? (result, ctx) =>
								persistSubAgentTranscript({
									cwd: options.cwd,
									baseSessionDir: options.getSessionDir?.(),
									parentSessionId: sessionId,
									parentSessionFile: sessionFile,
									name: result.name,
									model: ctx.model,
									thinkingLevel: ctx.thinkingLevel,
									messages: ctx.messages,
								})
						: undefined,
					onProgress: (progress) => {
						progressById.set(progress.id, progress);
						emitProgress();
					},
				});

				// Capture diffs from each worktree.
				const workers: WorkerResult[] = [];
				for (const result of subResults) {
					const worktree = worktrees.get(result.id);
					const worker: WorkerResult = { ...result, branch: worktree?.branch };
					if (worktree) {
						try {
							worker.diff = await getWorktreeDiff(worktree, signal);
							worker.changedFiles = await getWorktreeChangedFiles(worktree, signal);
						} catch (error) {
							worker.diff = `(failed to capture diff: ${error instanceof Error ? error.message : String(error)})`;
						}
					}
					workers.push(worker);
				}

				const review = params.review === false ? undefined : await runReview(workers, options, model, signal);

				const content: TextContent[] = [{ type: "text", text: renderFinal(workers, review) }];
				const isAllError = workers.length > 0 && workers.every((w) => w.status === "error");
				if (isAllError) {
					throw new Error(`All workers failed:\n${formatWorkers(workers)}`);
				}
				return { content, details: { workers, review } };
			} finally {
				if (!options.keepWorktrees) {
					await Promise.all(
						created.map((worktree) =>
							removeWorktree(options.cwd, worktree, signal).catch(() => {
								// Best-effort cleanup; a leaked worktree must not fail the tool.
							}),
						),
					);
				}
			}
		},
	});
}

/**
 * Build the tool set for a worker: full coding tools scoped to its worktree,
 * plus a read-only `spawn_agents` so the worker can delegate investigation. The
 * nested sub-agents are read-only and never receive spawn tools, which bounds
 * the delegation tree at this depth.
 */
function buildWorkerTools(worktreePath: string, options: SpawnWorkersToolOptions): AgentTool[] {
	const coding = createCodingTools(worktreePath);
	const investigate = createSpawnAgentsToolDefinition({
		cwd: worktreePath,
		modelRegistry: options.modelRegistry,
		settingsManager: options.settingsManager,
		getModel: options.getModel,
		getThinkingLevel: options.getThinkingLevel,
		getSessionId: options.getSessionId,
		getSessionFile: options.getSessionFile,
		getSessionDir: options.getSessionDir,
		maxTurns: options.maxTurns,
		persistTranscripts: false,
	});
	return [...coding, wrapToolDefinition(investigate)];
}

/** Run a read-only reviewer that cross-validates every worker's diff. */
async function runReview(
	workers: WorkerResult[],
	options: SpawnWorkersToolOptions,
	model: Model<any>,
	signal: AbortSignal | undefined,
): Promise<string | undefined> {
	const withChanges = workers.filter((w) => w.diff && !w.diff.startsWith("(failed"));
	if (withChanges.length === 0) return undefined;

	const prompt = [
		"Review the following parallel worker changes. Cross-validate them and report issues.",
		"",
		...withChanges.map((w) => `### Worker: ${w.name}\nTask report:\n${w.text.trim()}\n\nDiff:\n${w.diff}`),
	].join("\n");

	const [result] = await runSubAgents({
		tasks: [{ id: "reviewer", name: "reviewer", prompt }],
		model,
		thinkingLevel: options.getThinkingLevel(),
		modelRegistry: options.modelRegistry,
		settingsManager: options.settingsManager,
		systemPrompt: REVIEWER_SYSTEM_PROMPT,
		tools: createReadOnlyTools(options.cwd),
		maxTurns: options.maxTurns,
		sessionId: options.getSessionId?.(),
		signal,
	});
	return result?.text;
}

function renderFinal(workers: WorkerResult[], review: string | undefined): string {
	const parts = [formatWorkers(workers)];
	if (review) parts.push(`## Cross-validation review\n${review}`);
	return parts.join("\n\n");
}
