import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import type { Context } from "@earendil-works/pi-ai/compat";
import { afterEach, describe, expect, it } from "vitest";
import {
	createSpawnAgentsToolDefinition,
	createSpawnWorkersToolDefinition,
	persistSubAgentTranscript,
	runSubAgents,
	type SpawnWorkersToolDetails,
} from "../../src/core/sub-agents/index.ts";
import { resolveModelRef } from "../../src/core/sub-agents/resolve-model.ts";
import {
	createWorktree,
	getWorktreeChangedFiles,
	getWorktreeDiff,
	isGitRepo,
	removeWorktree,
	sanitizeBranchName,
} from "../../src/core/sub-agents/worktree.ts";
import { createHarness, type Harness } from "./harness.ts";

/** Find the last user prompt text in a faux request context. */
function lastUserText(context: Context): string {
	const user = [...context.messages].reverse().find((m) => m.role === "user");
	if (!user || user.role !== "user") return "";
	if (typeof user.content === "string") return user.content;
	return user.content
		.filter((part): part is { type: "text"; text: string } => part.type === "text")
		.map((part) => part.text)
		.join("");
}

function git(cwd: string, args: string): void {
	execSync(`git ${args}`, { cwd, stdio: "ignore" });
}

function createTempRepo(): string {
	const dir = join(tmpdir(), `pi-workers-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	git(dir, "init -b main");
	git(dir, "config user.email test@example.com");
	git(dir, "config user.name Test");
	git(dir, "commit --allow-empty -m initial");
	return dir;
}

describe("sub-agents: distinct models", () => {
	const harnesses: Harness[] = [];
	afterEach(() => {
		while (harnesses.length > 0) harnesses.pop()?.cleanup();
	});

	it("runs each sub-agent on its assigned model and reports it", async () => {
		const harness = await createHarness({
			models: [{ id: "fast-1" }, { id: "smart-1" }],
		});
		harnesses.push(harness);
		harness.setResponses([
			(context) => fauxAssistantMessage(`report:${lastUserText(context)}`),
			(context) => fauxAssistantMessage(`report:${lastUserText(context)}`),
		]);

		const fast = harness.getModel("fast-1");
		const smart = harness.getModel("smart-1");
		expect(fast && smart).toBeTruthy();

		const results = await runSubAgents({
			tasks: [
				{ id: "0", name: "scanner", prompt: "scan", model: fast },
				{ id: "1", name: "reasoner", prompt: "reason", model: smart },
			],
			model: harness.getModel(),
			thinkingLevel: "off",
			modelRegistry: harness.session.modelRegistry,
			settingsManager: harness.settingsManager,
			systemPrompt: "test",
			tools: [],
		});

		const byName = Object.fromEntries(results.map((r) => [r.name, r]));
		expect(byName.scanner?.model).toBe(`${fast?.provider}/fast-1`);
		expect(byName.reasoner?.model).toBe(`${smart?.provider}/smart-1`);
	});
});

describe("sub-agents: model resolution", () => {
	const harnesses: Harness[] = [];
	afterEach(() => {
		while (harnesses.length > 0) harnesses.pop()?.cleanup();
	});

	it("resolves provider/id and bare id, and returns undefined for unknown", async () => {
		const harness = await createHarness({ models: [{ id: "fast-1" }, { id: "smart-1" }] });
		harnesses.push(harness);
		const registry = harness.session.modelRegistry;
		const provider = harness.getModel().provider;

		expect(resolveModelRef(registry, `${provider}/smart-1`)?.id).toBe("smart-1");
		expect(resolveModelRef(registry, "fast-1")?.id).toBe("fast-1");
		expect(resolveModelRef(registry, "does-not-exist")).toBeUndefined();
		expect(resolveModelRef(registry, "")).toBeUndefined();
	});
});

describe("sub-agents: transcript persistence", () => {
	const harnesses: Harness[] = [];
	afterEach(() => {
		while (harnesses.length > 0) harnesses.pop()?.cleanup();
	});

	it("persists each sub-agent transcript to its own JSONL session", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		harness.setResponses([(context) => fauxAssistantMessage(`report:${lastUserText(context)}`)]);

		const baseSessionDir = join(harness.tempDir, "sessions");
		const results = await runSubAgents({
			tasks: [{ id: "0", name: "alpha", prompt: "investigate" }],
			model: harness.getModel(),
			thinkingLevel: "off",
			modelRegistry: harness.session.modelRegistry,
			settingsManager: harness.settingsManager,
			systemPrompt: "test",
			tools: [],
			onTranscript: (result, ctx) =>
				persistSubAgentTranscript({
					cwd: harness.tempDir,
					baseSessionDir,
					parentSessionId: "parent-123",
					name: result.name,
					model: ctx.model,
					thinkingLevel: ctx.thinkingLevel,
					messages: ctx.messages,
				}),
		});

		const file = results[0]?.transcriptFile;
		expect(file).toBeTruthy();
		expect(file && existsSync(file)).toBe(true);
		expect(file).toContain(join("subagents", "parent-123"));

		const lines = readFileSync(file as string, "utf-8")
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l));
		expect(lines[0].type).toBe("session");
		expect(lines.some((e) => e.type === "model_change")).toBe(true);
		expect(lines.some((e) => e.type === "message" && e.message.role === "assistant")).toBe(true);
	});
});

describe("worktree helpers", () => {
	const repos: string[] = [];
	afterEach(() => {
		while (repos.length > 0) {
			const dir = repos.pop();
			if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
		}
	});

	it("sanitizes branch names", () => {
		expect(sanitizeBranchName("Add Pagination!")).toBe("add-pagination");
		expect(sanitizeBranchName("  --weird//name-- ")).toBe("weird/name");
		expect(sanitizeBranchName("")).toBe("agent");
	});

	it("creates an isolated worktree, captures diff, and removes it", async () => {
		const repo = createTempRepo();
		repos.push(repo);
		expect(await isGitRepo(repo)).toBe(true);

		const worktreesDir = join(repo, ".worktrees");
		const worktree = await createWorktree({
			repoCwd: repo,
			worktreesDir,
			branchSeed: "feature x",
		});
		expect(existsSync(worktree.path)).toBe(true);
		expect(worktree.branch).toMatch(/^pi\/feature-x-/);

		// Edit inside the worktree only.
		const { writeFileSync } = await import("node:fs");
		writeFileSync(join(worktree.path, "new.txt"), "hello worktree\n");

		const changed = await getWorktreeChangedFiles(worktree);
		expect(changed).toContain("new.txt");
		const diff = await getWorktreeDiff(worktree);
		expect(diff).toContain("new.txt");
		expect(diff).toContain("hello worktree");

		// Parent working tree is untouched.
		expect(existsSync(join(repo, "new.txt"))).toBe(false);

		await removeWorktree(repo, worktree);
		expect(existsSync(worktree.path)).toBe(false);
	});

	it("reports non-git directories", async () => {
		const dir = join(tmpdir(), `pi-nogit-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(dir, { recursive: true });
		repos.push(dir);
		expect(await isGitRepo(dir)).toBe(false);
	});
});

describe("spawn_workers tool", () => {
	const harnesses: Harness[] = [];
	const repos: string[] = [];
	afterEach(() => {
		while (harnesses.length > 0) harnesses.pop()?.cleanup();
		while (repos.length > 0) {
			const dir = repos.pop();
			if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
		}
	});

	it("runs writable workers in isolated worktrees and captures their diffs", async () => {
		const repo = createTempRepo();
		repos.push(repo);
		const harness = await createHarness();
		harnesses.push(harness);

		// Workers run in parallel and share one faux response queue, so key each
		// response on the worker's task instead of relying on call order.
		harness.setResponses([
			(context) => {
				const text = lastUserText(context);
				if (context.messages.some((m) => m.role === "toolResult")) {
					return fauxAssistantMessage(text.includes("a.txt") ? "worker A done" : "worker B done");
				}
				const path = text.includes("a.txt") ? "a.txt" : "b.txt";
				const content = path === "a.txt" ? "from worker A" : "from worker B";
				return fauxAssistantMessage([fauxToolCall("write", { path, content })], { stopReason: "toolUse" });
			},
			(context) => {
				const text = lastUserText(context);
				if (context.messages.some((m) => m.role === "toolResult")) {
					return fauxAssistantMessage(text.includes("a.txt") ? "worker A done" : "worker B done");
				}
				const path = text.includes("a.txt") ? "a.txt" : "b.txt";
				const content = path === "a.txt" ? "from worker A" : "from worker B";
				return fauxAssistantMessage([fauxToolCall("write", { path, content })], { stopReason: "toolUse" });
			},
			(context) => {
				const text = lastUserText(context);
				return fauxAssistantMessage(text.includes("a.txt") ? "worker A done" : "worker B done");
			},
			(context) => {
				const text = lastUserText(context);
				return fauxAssistantMessage(text.includes("a.txt") ? "worker A done" : "worker B done");
			},
		]);

		const tool = createSpawnWorkersToolDefinition({
			cwd: repo,
			modelRegistry: harness.session.modelRegistry,
			settingsManager: harness.settingsManager,
			worktreesDir: join(repo, ".worktrees"),
			getModel: () => harness.getModel(),
			getThinkingLevel: () => "off",
			persistTranscripts: false,
		});

		const result = await tool.execute(
			"call-1",
			{
				workers: [
					{ name: "worker-a", prompt: "create a.txt" },
					{ name: "worker-b", prompt: "create b.txt" },
				],
				review: false,
			},
			undefined,
			undefined,
			undefined as never,
		);

		const details = result.details as SpawnWorkersToolDetails;
		expect(details.workers).toHaveLength(2);
		const byName = Object.fromEntries(details.workers.map((w) => [w.name, w]));
		expect(byName["worker-a"]?.changedFiles).toContain("a.txt");
		expect(byName["worker-b"]?.changedFiles).toContain("b.txt");
		expect(byName["worker-a"]?.diff).toContain("from worker A");

		// Parent repo must be untouched and worktrees cleaned up.
		expect(existsSync(join(repo, "a.txt"))).toBe(false);
		const worktreesDir = join(repo, ".worktrees");
		expect(!existsSync(worktreesDir) || readdirSync(worktreesDir).length === 0).toBe(true);
	});

	it("runs a cross-validation reviewer over worker diffs", async () => {
		const repo = createTempRepo();
		repos.push(repo);
		const harness = await createHarness();
		harnesses.push(harness);

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("write", { path: "c.txt", content: "content c" })], {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage("worker C done"),
			fauxAssistantMessage("REVIEW: changes look correct, no conflicts."),
		]);

		const tool = createSpawnWorkersToolDefinition({
			cwd: repo,
			modelRegistry: harness.session.modelRegistry,
			settingsManager: harness.settingsManager,
			worktreesDir: join(repo, ".worktrees"),
			getModel: () => harness.getModel(),
			getThinkingLevel: () => "off",
			persistTranscripts: false,
		});

		const result = await tool.execute(
			"call-2",
			{ workers: [{ name: "worker-c", prompt: "create c.txt" }], review: true },
			undefined,
			undefined,
			undefined as never,
		);

		const details = result.details as SpawnWorkersToolDetails;
		expect(details.review).toContain("REVIEW:");
		const text = result.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain("Cross-validation review");
	});

	it("fails clearly when cwd is not a git repository", async () => {
		const dir = join(tmpdir(), `pi-nogit-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(dir, { recursive: true });
		repos.push(dir);
		const harness = await createHarness();
		harnesses.push(harness);

		const tool = createSpawnWorkersToolDefinition({
			cwd: dir,
			modelRegistry: harness.session.modelRegistry,
			settingsManager: harness.settingsManager,
			worktreesDir: join(dir, ".worktrees"),
			getModel: () => harness.getModel(),
			getThinkingLevel: () => "off",
			persistTranscripts: false,
		});

		await expect(
			tool.execute(
				"call-3",
				{ workers: [{ name: "w", prompt: "do something" }] },
				undefined,
				undefined,
				undefined as never,
			),
		).rejects.toThrow(/git repository/);
	});
});

describe("delegation depth bound", () => {
	const harnesses: Harness[] = [];
	afterEach(() => {
		while (harnesses.length > 0) harnesses.pop()?.cleanup();
	});

	it("read-only sub-agents never receive spawn tools", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		// The spawn_agents tool itself wires read-only tools (read/grep/find/ls)
		// for sub-agents; it never includes spawn_agents or spawn_workers, so a
		// sub-agent cannot recurse into more delegation.
		const tool = createSpawnAgentsToolDefinition({
			cwd: harness.tempDir,
			modelRegistry: harness.session.modelRegistry,
			settingsManager: harness.settingsManager,
			getModel: () => harness.getModel(),
			getThinkingLevel: () => "off",
			persistTranscripts: false,
		});
		harness.setResponses([(context) => fauxAssistantMessage(`report:${lastUserText(context)}`)]);

		const result = await tool.execute(
			"call-d",
			{ agents: [{ name: "investigator", prompt: "look around" }] },
			undefined,
			undefined,
			undefined as never,
		);
		const text = result.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain("[investigator]");
	});
});
