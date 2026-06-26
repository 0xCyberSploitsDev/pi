import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import type { Context } from "@earendil-works/pi-ai/compat";
import { afterEach, describe, expect, it } from "vitest";
import {
	createSpawnAgentsToolDefinition,
	runSubAgents,
	type SpawnAgentsToolDetails,
} from "../../src/core/sub-agents/index.ts";
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

describe("sub-agents", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("runs multiple sub-agents in parallel and returns each report", async () => {
		const harness = await createHarness();
		harnesses.push(harness);

		// Context-keyed responses so consumption order does not matter.
		harness.setResponses([
			(context) => fauxAssistantMessage(`report:${lastUserText(context)}`),
			(context) => fauxAssistantMessage(`report:${lastUserText(context)}`),
		]);

		const progressUpdates: string[] = [];
		const results = await runSubAgents({
			tasks: [
				{ id: "0", name: "alpha", prompt: "task-A" },
				{ id: "1", name: "beta", prompt: "task-B" },
			],
			model: harness.getModel(),
			thinkingLevel: "off",
			modelRegistry: harness.session.modelRegistry,
			settingsManager: harness.settingsManager,
			systemPrompt: "test sub-agent",
			tools: [],
			onProgress: (p) => progressUpdates.push(`${p.name}:${p.status}`),
		});

		expect(results).toHaveLength(2);
		const byName = Object.fromEntries(results.map((r) => [r.name, r]));
		expect(byName.alpha?.status).toBe("completed");
		expect(byName.beta?.status).toBe("completed");
		expect(byName.alpha?.text).toBe("report:task-A");
		expect(byName.beta?.text).toBe("report:task-B");
		expect(progressUpdates).toContain("alpha:completed");
		expect(progressUpdates).toContain("beta:completed");
	});

	it("captures a sub-agent failure without rejecting the batch", async () => {
		const harness = await createHarness();
		harnesses.push(harness);

		// Only one response is queued; the second sub-agent gets a faux error.
		harness.setResponses([(context) => fauxAssistantMessage(`report:${lastUserText(context)}`)]);

		const results = await runSubAgents({
			tasks: [
				{ id: "0", name: "ok", prompt: "good" },
				{ id: "1", name: "boom", prompt: "bad" },
			],
			model: harness.getModel(),
			thinkingLevel: "off",
			modelRegistry: harness.session.modelRegistry,
			settingsManager: harness.settingsManager,
			systemPrompt: "test sub-agent",
			tools: [],
		});

		const statuses = results.map((r) => r.status).sort();
		expect(statuses).toEqual(["completed", "error"]);
	});

	it("aggregates sub-agent reports through the spawn_agents tool", async () => {
		const harness = await createHarness();
		harnesses.push(harness);

		harness.setResponses([
			(context) => fauxAssistantMessage(`report:${lastUserText(context)}`),
			(context) => fauxAssistantMessage(`report:${lastUserText(context)}`),
		]);

		const tool = createSpawnAgentsToolDefinition({
			cwd: harness.tempDir,
			modelRegistry: harness.session.modelRegistry,
			settingsManager: harness.settingsManager,
			getModel: () => harness.getModel(),
			getThinkingLevel: () => "off",
		});

		const updates: SpawnAgentsToolDetails[] = [];
		const result = await tool.execute(
			"call-1",
			{
				agents: [
					{ name: "alpha", prompt: "task-A" },
					{ name: "beta", prompt: "task-B" },
				],
			},
			undefined,
			(partial) => {
				const details = partial.details as SpawnAgentsToolDetails | undefined;
				if (details) updates.push(details);
			},
			undefined as never,
		);

		const details = result.details as SpawnAgentsToolDetails;
		expect(details.agents).toHaveLength(2);
		expect(details.agents.every((a) => a.status === "completed")).toBe(true);
		const text = result.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		expect(text).toContain("[alpha]");
		expect(text).toContain("[beta]");
		expect(text).toContain("report:task-A");
		expect(text).toContain("report:task-B");
		expect(updates.length).toBeGreaterThan(0);
	});
});
