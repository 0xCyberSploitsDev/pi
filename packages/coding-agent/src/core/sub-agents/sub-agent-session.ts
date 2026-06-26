import { join } from "node:path";
import type { AgentMessage, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai/compat";
import { getDefaultSessionDir, SessionManager } from "../session-manager.ts";

export interface PersistSubAgentOptions {
	/** Working directory the sub-agent ran against (used for the session header cwd). */
	cwd: string;
	/**
	 * Base session directory of the parent. Sub-agent transcripts are written to
	 * `<baseSessionDir>/subagents/<parentSessionId>/`. Defaults to the parent's
	 * default session dir derived from `cwd`.
	 */
	baseSessionDir?: string;
	/** Parent session id; sub-agent transcripts are grouped under it. */
	parentSessionId?: string;
	/** Parent session file path, recorded as the transcript's parentSession. */
	parentSessionFile?: string;
	/** Short sub-agent name, used in the transcript's session info. */
	name: string;
	model: Model<any>;
	thinkingLevel: ThinkingLevel;
	messages: AgentMessage[];
}

/** Directory holding persisted sub-agent transcripts for a parent session. */
export function getSubAgentSessionDir(cwd: string, parentSessionId?: string, baseSessionDir?: string): string {
	const root = baseSessionDir ?? getDefaultSessionDir(cwd);
	const base = join(root, "subagents");
	return parentSessionId ? join(base, parentSessionId) : base;
}

/**
 * Persist a finished sub-agent's transcript to its own JSONL session file.
 *
 * The file lives under `<sessionDir>/subagents/<parentSessionId>/` and records
 * the model, thinking level, and every message the sub-agent produced. It links
 * back to the parent via the session header's `parentSession` field so the tree
 * of delegated work can be reconstructed later for debugging or replay.
 *
 * Returns the transcript file path, or undefined when there is nothing to write.
 */
export function persistSubAgentTranscript(options: PersistSubAgentOptions): string | undefined {
	if (options.messages.length === 0) return undefined;

	const sessionDir = getSubAgentSessionDir(options.cwd, options.parentSessionId, options.baseSessionDir);
	const manager = SessionManager.create(options.cwd, sessionDir, {
		parentSession: options.parentSessionFile,
	});

	manager.appendModelChange(options.model.provider, options.model.id);
	manager.appendThinkingLevelChange(options.thinkingLevel);
	manager.appendSessionInfo(options.name);
	for (const message of options.messages) {
		manager.appendMessage(message as Parameters<SessionManager["appendMessage"]>[0]);
	}

	return manager.getSessionFile();
}
