import type { AgentToolResult, AgentToolUpdateCallback, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model, TextContent } from "@earendil-works/pi-ai/compat";
import { type Static, Type } from "typebox";
import { defineTool, type ToolDefinition } from "../extensions/types.ts";
import type { ModelRegistry } from "../model-registry.ts";
import type { SettingsManager } from "../settings-manager.ts";
import { createReadOnlyTools } from "../tools/index.ts";
import { resolveModelRef } from "./resolve-model.ts";
import { runSubAgents, type SubAgentProgress, type SubAgentResult, type SubAgentTask } from "./sub-agent-runner.ts";
import { persistSubAgentTranscript } from "./sub-agent-session.ts";

const spawnAgentsSchema = Type.Object({
	agents: Type.Array(
		Type.Object({
			name: Type.String({ description: "Short name identifying this sub-agent (e.g. 'auth-investigator')." }),
			prompt: Type.String({
				description:
					"Self-contained instruction for the sub-agent. It cannot see the parent conversation, so include all context it needs and tell it exactly what to report back.",
			}),
			model: Type.Optional(
				Type.String({
					description:
						"Optional model for this sub-agent as 'provider/id' or a bare model id. Use a fast/cheap model for broad scans and a stronger reasoning model for hard analysis. Defaults to the parent's model.",
				}),
			),
		}),
		{
			minItems: 1,
			maxItems: 8,
			description: "The sub-agents to run in parallel. Each works independently and reports its findings.",
		},
	),
});

export type SpawnAgentsInput = Static<typeof spawnAgentsSchema>;

export interface SpawnAgentsToolDetails {
	agents: SubAgentResult[];
}

export interface SpawnAgentsToolOptions {
	cwd: string;
	modelRegistry: ModelRegistry;
	settingsManager: SettingsManager;
	/** Resolves the model sub-agents should use. Read at call time so model switches apply. */
	getModel: () => Model<any> | undefined;
	/** Resolves the thinking level sub-agents should use. */
	getThinkingLevel: () => ThinkingLevel;
	/** Parent session id, forwarded to providers for cache locality and transcript grouping. */
	getSessionId?: () => string | undefined;
	/** Parent session file, recorded as the parent of persisted sub-agent transcripts. */
	getSessionFile?: () => string | undefined;
	/** Parent session directory, used as the base for persisted transcripts. */
	getSessionDir?: () => string | undefined;
	/** Maximum assistant turns per sub-agent. */
	maxTurns?: number;
	/** Persist each sub-agent transcript to its own JSONL session. Defaults to true. */
	persistTranscripts?: boolean;
}

const SUB_AGENT_SYSTEM_PROMPT = [
	"You are a sub-agent spawned by a coordinating agent to work on one focused task in parallel with other sub-agents.",
	"You have read-only tools (read, grep, find, ls) to investigate the codebase. You cannot modify files.",
	"Work autonomously: investigate thoroughly, then write a concise, self-contained final report.",
	"Your final message is the only thing the coordinator receives, so make it complete and actionable.",
].join("\n");

function statusLabel(result: SubAgentResult): string {
	switch (result.status) {
		case "completed":
			return "completed";
		case "error":
			return `error: ${result.errorMessage ?? "unknown error"}`;
		case "aborted":
			return "aborted";
		default:
			return result.status;
	}
}

function formatResults(results: SubAgentResult[]): string {
	return results
		.map((result) => {
			const model = result.model ? ` · ${result.model}` : "";
			const header = `## [${result.name}] (${statusLabel(result)}${model})`;
			const body = result.text.trim() || "(no output produced)";
			return `${header}\n${body}`;
		})
		.join("\n\n");
}

/**
 * Create the `spawn_agents` tool: delegate independent sub-tasks to parallel
 * read-only sub-agents and aggregate their reports.
 *
 * Sub-agents run in-process as lightweight agents with read-only tools. Each may
 * use a distinct model (a fast model for scanning, a reasoning model for hard
 * analysis). Their live progress streams through `onUpdate`, and each transcript
 * is persisted to its own JSONL session for later debugging.
 */
export function createSpawnAgentsToolDefinition(options: SpawnAgentsToolOptions): ToolDefinition {
	const persistTranscripts = options.persistTranscripts ?? true;
	return defineTool({
		name: "spawn_agents",
		label: "spawn agents",
		description:
			"Delegate independent sub-tasks to sub-agents that run in parallel and report back. Use this to investigate several questions at once (e.g. explore multiple modules, compare approaches, gather context from different areas). Each sub-agent runs with read-only tools and cannot see the conversation, so write fully self-contained prompts. Optionally assign each a model ('provider/id') to mix fast and reasoning models. Returns each sub-agent's report. Prefer this over many sequential reads when subtasks are independent.",
		promptSnippet: "Run independent sub-tasks in parallel via sub-agents",
		promptGuidelines: [
			"Use spawn_agents when a task splits into independent investigations that can run concurrently.",
			"Give each sub-agent a self-contained prompt; they cannot see the parent conversation.",
			"Assign a cheaper/faster model to broad scans and a stronger model to deep reasoning via the per-agent model field.",
			"Sub-agents are read-only. Do the actual edits yourself after reviewing their reports.",
		],
		parameters: spawnAgentsSchema,
		async execute(
			_toolCallId: string,
			params: SpawnAgentsInput,
			signal: AbortSignal | undefined,
			onUpdate: AgentToolUpdateCallback<SpawnAgentsToolDetails> | undefined,
		): Promise<AgentToolResult<SpawnAgentsToolDetails>> {
			const model = options.getModel();
			if (!model) {
				throw new Error("No model is configured; cannot spawn sub-agents.");
			}

			const tasks: SubAgentTask[] = params.agents.map((agent, index) => {
				const resolved = agent.model ? resolveModelRef(options.modelRegistry, agent.model) : undefined;
				if (agent.model && !resolved) {
					throw new Error(`Unknown model "${agent.model}" requested for sub-agent "${agent.name}".`);
				}
				return {
					id: String(index),
					name: agent.name,
					prompt: agent.prompt,
					model: resolved,
				};
			});

			// Track the latest progress per sub-agent so each onUpdate carries a
			// full snapshot of the batch.
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

			const results = await runSubAgents({
				tasks,
				model,
				thinkingLevel: options.getThinkingLevel(),
				modelRegistry: options.modelRegistry,
				settingsManager: options.settingsManager,
				systemPrompt: SUB_AGENT_SYSTEM_PROMPT,
				tools: createReadOnlyTools(options.cwd),
				maxTurns: options.maxTurns,
				sessionId: options.getSessionId?.(),
				signal,
				onTranscript: persistTranscripts
					? (result, ctx) =>
							persistSubAgentTranscript({
								cwd: options.cwd,
								baseSessionDir: options.getSessionDir?.(),
								parentSessionId: options.getSessionId?.(),
								parentSessionFile: options.getSessionFile?.(),
								name: result.name,
								model: ctx.model,
								thinkingLevel: ctx.thinkingLevel,
								messages: ctx.messages,
							})
					: undefined,
				onProgress: (progress) => {
					progressById.set(progress.id, progress);
					const snapshot = tasks.map(
						(task) =>
							progressById.get(task.id) ?? {
								id: task.id,
								name: task.name,
								status: "pending" as const,
								text: "",
								turns: 0,
							},
					);
					onUpdate?.({
						content: [{ type: "text", text: formatProgress(snapshot) }],
						details: { agents: snapshot },
					});
				},
			});

			const content: TextContent[] = [{ type: "text", text: formatResults(results) }];
			const isAllError = results.length > 0 && results.every((result) => result.status === "error");
			if (isAllError) {
				throw new Error(`All sub-agents failed:\n${formatResults(results)}`);
			}
			return { content, details: { agents: results } };
		},
	});
}

function formatProgress(snapshot: SubAgentProgress[]): string {
	return snapshot.map((agent) => `[${agent.name}] ${agent.status} (${agent.turns} turns)`).join("\n");
}
