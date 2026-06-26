export { resolveModelRef } from "./resolve-model.ts";
export {
	createSpawnAgentsToolDefinition,
	type SpawnAgentsInput,
	type SpawnAgentsToolDetails,
	type SpawnAgentsToolOptions,
} from "./spawn-agents-tool.ts";
export {
	createSpawnWorkersToolDefinition,
	type SpawnWorkersInput,
	type SpawnWorkersToolDetails,
	type SpawnWorkersToolOptions,
	type WorkerResult,
} from "./spawn-workers-tool.ts";
export {
	type RunSubAgentsOptions,
	runSubAgents,
	type SubAgentProgress,
	type SubAgentResult,
	type SubAgentStatus,
	type SubAgentTask,
	type SubAgentTranscriptHook,
} from "./sub-agent-runner.ts";
export {
	getSubAgentSessionDir,
	type PersistSubAgentOptions,
	persistSubAgentTranscript,
} from "./sub-agent-session.ts";
export {
	type CreateWorktreeOptions,
	createWorktree,
	getWorktreeChangedFiles,
	getWorktreeDiff,
	isGitRepo,
	removeWorktree,
	sanitizeBranchName,
	type Worktree,
} from "./worktree.ts";
