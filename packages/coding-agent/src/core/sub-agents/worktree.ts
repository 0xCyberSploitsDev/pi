import { join } from "node:path";
import { execCommand } from "../exec.ts";

/** A git worktree created for an isolated writable sub-agent. */
export interface Worktree {
	/** Absolute path to the worktree directory. */
	path: string;
	/** Branch checked out in the worktree. */
	branch: string;
}

export interface CreateWorktreeOptions {
	/** Repository root (any path inside the repo works). */
	repoCwd: string;
	/** Directory where worktree checkouts are placed. */
	worktreesDir: string;
	/** Desired branch name seed; sanitized and de-duplicated before use. */
	branchSeed: string;
	/** Base ref the new branch is created from. Defaults to HEAD. */
	baseRef?: string;
	signal?: AbortSignal;
}

/** Sanitize an arbitrary string into a git-ref-safe branch segment. */
export function sanitizeBranchName(seed: string): string {
	const cleaned = seed
		.toLowerCase()
		.replace(/[^a-z0-9._/-]+/g, "-")
		.replace(/^[-./]+|[-./]+$/g, "")
		.replace(/\/{2,}/g, "/")
		.replace(/-{2,}/g, "-")
		.slice(0, 60);
	return cleaned || "agent";
}

async function git(repoCwd: string, args: string[], signal?: AbortSignal): Promise<string> {
	const result = await execCommand("git", args, repoCwd, { signal, timeout: 60_000 });
	if (result.code !== 0) {
		throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim()}`);
	}
	return result.stdout.trim();
}

/** True when `repoCwd` is inside a git work tree. */
export async function isGitRepo(repoCwd: string, signal?: AbortSignal): Promise<boolean> {
	const result = await execCommand("git", ["rev-parse", "--is-inside-work-tree"], repoCwd, {
		signal,
		timeout: 30_000,
	});
	return result.code === 0 && result.stdout.trim() === "true";
}

/**
 * Create an isolated git worktree on a fresh branch.
 *
 * The branch name is derived from `branchSeed`, sanitized, and suffixed with a
 * short unique token so concurrent workers never collide. Each worktree is a
 * full checkout that a writable sub-agent can edit without touching the parent's
 * working tree.
 */
export async function createWorktree(options: CreateWorktreeOptions): Promise<Worktree> {
	const { repoCwd, worktreesDir, branchSeed, baseRef, signal } = options;
	const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
	const branch = `pi/${sanitizeBranchName(branchSeed)}-${unique}`;
	const path = join(worktreesDir, branch.replace(/\//g, "-"));

	const args = ["worktree", "add", "-b", branch, path];
	if (baseRef) args.push(baseRef);
	await git(repoCwd, args, signal);

	return { path, branch };
}

/** Return the unified diff of all changes (tracked and untracked) in a worktree. */
export async function getWorktreeDiff(worktree: Worktree, signal?: AbortSignal): Promise<string> {
	// Stage everything (intent-to-add for new files) so the diff includes
	// untracked files, then diff against HEAD without leaving anything staged.
	await execCommand("git", ["add", "-A", "--intent-to-add", "."], worktree.path, { signal, timeout: 60_000 });
	const result = await execCommand("git", ["diff", "HEAD"], worktree.path, { signal, timeout: 60_000 });
	return result.stdout;
}

/** List files changed (relative paths) in a worktree compared to HEAD. */
export async function getWorktreeChangedFiles(worktree: Worktree, signal?: AbortSignal): Promise<string[]> {
	const result = await execCommand("git", ["status", "--porcelain"], worktree.path, { signal, timeout: 60_000 });
	return result.stdout
		.split("\n")
		.map((line) => line.slice(3).trim())
		.filter((line) => line.length > 0);
}

/**
 * Remove a worktree and delete its branch.
 *
 * Best-effort: failures are swallowed so cleanup never breaks a tool call. Uses
 * `--force` because the worktree may contain uncommitted edits we are discarding
 * (the parent agent applies changes itself after reviewing the diff).
 */
export async function removeWorktree(repoCwd: string, worktree: Worktree, signal?: AbortSignal): Promise<void> {
	await execCommand("git", ["worktree", "remove", "--force", worktree.path], repoCwd, { signal, timeout: 60_000 });
	await execCommand("git", ["branch", "-D", worktree.branch], repoCwd, { signal, timeout: 60_000 });
}
