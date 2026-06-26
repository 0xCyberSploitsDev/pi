import {
	Agent,
	type AgentEvent,
	type AgentMessage,
	type AgentTool,
	type ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai/compat";
import { convertToLlm } from "../messages.ts";
import type { ModelRegistry } from "../model-registry.ts";
import { createModelStreamFn } from "../model-stream.ts";
import type { SettingsManager } from "../settings-manager.ts";

/** Status of a single sub-agent over its lifetime. */
export type SubAgentStatus = "pending" | "running" | "completed" | "error" | "aborted";

/** A task handed to a single sub-agent. */
export interface SubAgentTask {
	/** Stable id used to correlate progress updates and results. */
	id: string;
	/** Short human-readable name shown in UIs. */
	name: string;
	/** The instruction the sub-agent works on. */
	prompt: string;
	/** Per-task model override. Falls back to the batch default model. */
	model?: Model<any>;
	/** Per-task thinking level override. Falls back to the batch default. */
	thinkingLevel?: ThinkingLevel;
	/** Per-task tools. Falls back to the batch default tools. */
	tools?: AgentTool[];
	/** Per-task system prompt override. Falls back to the batch default. */
	systemPrompt?: string;
}

/** Live progress snapshot for one sub-agent. */
export interface SubAgentProgress {
	id: string;
	name: string;
	status: SubAgentStatus;
	/** Latest streamed assistant text (may be partial while running). */
	text: string;
	/** Number of completed assistant turns. */
	turns: number;
	/** "provider/id" of the model this sub-agent runs on. */
	model?: string;
	/** Error message when status is "error". */
	errorMessage?: string;
}

/** Final result for one sub-agent. */
export interface SubAgentResult {
	id: string;
	name: string;
	status: SubAgentStatus;
	/** Final assistant text produced by the sub-agent. */
	text: string;
	turns: number;
	/** "provider/id" of the model this sub-agent ran on. */
	model?: string;
	/** Path to the persisted transcript JSONL, when persistence is enabled. */
	transcriptFile?: string;
	errorMessage?: string;
}

/** Called once a sub-agent settles, with its full transcript for persistence. */
export type SubAgentTranscriptHook = (
	result: SubAgentResult,
	context: { task: SubAgentTask; model: Model<any>; thinkingLevel: ThinkingLevel; messages: AgentMessage[] },
) => Promise<string | undefined> | string | undefined;

export interface RunSubAgentsOptions {
	tasks: SubAgentTask[];
	/** Default model used by sub-agents that do not override it. */
	model: Model<any>;
	/** Default thinking level for sub-agents that do not override it. */
	thinkingLevel: ThinkingLevel;
	modelRegistry: ModelRegistry;
	settingsManager: SettingsManager;
	/** Default system prompt shared by sub-agents that do not override it. */
	systemPrompt: string;
	/** Default tools available to each sub-agent. A fresh array is used per sub-agent. */
	tools: AgentTool[];
	/** Maximum assistant turns per sub-agent before it is force-stopped. */
	maxTurns?: number;
	/** Parent session id, forwarded to providers for cache locality. */
	sessionId?: string;
	/** Called whenever a sub-agent's progress changes. */
	onProgress?: (progress: SubAgentProgress) => void;
	/** Called after each sub-agent settles, with its transcript. Return the persisted file path. */
	onTranscript?: SubAgentTranscriptHook;
	/** Abort signal from the parent tool call. */
	signal?: AbortSignal;
}

const DEFAULT_MAX_TURNS = 30;

function extractAssistantText(message: AgentMessage): string {
	if (message.role !== "assistant") return "";
	if (typeof message.content === "string") return message.content;
	return message.content
		.filter((part): part is { type: "text"; text: string } => part.type === "text")
		.map((part) => part.text)
		.join("");
}

function modelLabel(model: Model<any>): string {
	return `${model.provider}/${model.id}`;
}

/**
 * Run a batch of sub-agents concurrently in the current process.
 *
 * Each sub-agent is an independent {@link Agent} sharing the parent's provider
 * configuration (auth, retry, attribution) but with its own transcript, model,
 * thinking level, and tools. The runner returns once every sub-agent settles.
 * Individual failures are captured per result rather than rejecting the whole
 * batch. When `onTranscript` is provided it is awaited after each sub-agent
 * settles so callers can persist the full conversation.
 */
export async function runSubAgents(options: RunSubAgentsOptions): Promise<SubAgentResult[]> {
	const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
	const streamFn = createModelStreamFn(options.modelRegistry, options.settingsManager);

	const runOne = async (task: SubAgentTask): Promise<SubAgentResult> => {
		const model = task.model ?? options.model;
		const thinkingLevel = task.thinkingLevel ?? options.thinkingLevel;
		const tools = task.tools ?? options.tools;
		const systemPrompt = task.systemPrompt ?? options.systemPrompt;

		const progress: SubAgentProgress = {
			id: task.id,
			name: task.name,
			status: "running",
			text: "",
			turns: 0,
			model: modelLabel(model),
		};
		const emit = () => options.onProgress?.({ ...progress });
		emit();

		if (options.signal?.aborted) {
			progress.status = "aborted";
			emit();
			return { ...progress };
		}

		const agent = new Agent({
			initialState: {
				systemPrompt,
				model,
				thinkingLevel,
				tools,
			},
			convertToLlm,
			streamFn,
			sessionId: options.sessionId,
		});

		const abortOnParent = () => agent.abort();
		options.signal?.addEventListener("abort", abortOnParent, { once: true });

		const unsubscribe = agent.subscribe((event: AgentEvent) => {
			switch (event.type) {
				case "message_update":
				case "message_start":
					if (event.message.role === "assistant") {
						const text = extractAssistantText(event.message);
						if (text) progress.text = text;
						emit();
					}
					break;
				case "turn_end": {
					progress.turns += 1;
					const text = extractAssistantText(event.message);
					if (text) progress.text = text;
					// Stop a runaway sub-agent: once it stops calling tools the loop
					// ends on its own, but cap total turns defensively.
					if (progress.turns >= maxTurns) agent.abort();
					emit();
					break;
				}
			}
		});

		try {
			await agent.prompt(task.prompt);
			await agent.waitForIdle();
			const last = [...agent.state.messages].reverse().find((m) => m.role === "assistant");
			const errored = last?.role === "assistant" && (last.stopReason === "error" || last.stopReason === "aborted");
			progress.status = options.signal?.aborted ? "aborted" : errored ? "error" : "completed";
			if (last) progress.text = extractAssistantText(last) || progress.text;
			if (errored && last?.role === "assistant") progress.errorMessage = last.errorMessage;
		} catch (error) {
			progress.status = "error";
			progress.errorMessage = error instanceof Error ? error.message : String(error);
		} finally {
			unsubscribe();
			options.signal?.removeEventListener("abort", abortOnParent);
		}

		const result: SubAgentResult = { ...progress };
		if (options.onTranscript) {
			try {
				const transcriptFile = await options.onTranscript(result, {
					task,
					model,
					thinkingLevel,
					messages: [...agent.state.messages],
				});
				if (transcriptFile) result.transcriptFile = transcriptFile;
			} catch {
				// Persistence is best-effort; never fail a sub-agent because its
				// transcript could not be written.
			}
		}

		emit();
		return result;
	};

	return Promise.all(options.tasks.map(runOne));
}
