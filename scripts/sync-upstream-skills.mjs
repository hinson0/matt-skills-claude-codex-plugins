#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Import skill sources and their documentation. Fork packaging and workflows
// stay local so GITHUB_TOKEN never needs permission to update workflows.
export const SOURCE_PATHS = [
  "skills",
  "docs",
  ".agents/adr",
  ".agents/install-block.md",
  ".agents/invocation.md",
  ".agents/writing-docs.md",
  ".changeset",
  ".claude-plugin/plugin.json",
  ".out-of-scope",
  "README.md",
  "CHANGELOG.md",
  "package.json",
  "package-lock.json",
  "LICENSE",
  "SCOPE.md",
  "GLOSSARY.md",
  "CONTEXT.md",
];

function isSource(file) {
  return SOURCE_PATHS.some((source) => file === source || file.startsWith(`${source}/`));
}

export function syncUpstreamSkills({ repoRoot = REPO_ROOT, upstreamRef = "upstream/main" } = {}) {
  const git = (args, input) => execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const files = (args) => git(args).split("\0").filter(Boolean);
  const sha = git(["rev-parse", "--verify", "--end-of-options", `${upstreamRef}^{commit}`]).trim();
  const dirtySources = [
    ...files(["diff", "--name-only", "-z", "HEAD"]),
    ...files(["ls-files", "--others", "--exclude-standard", "-z"]),
  ].filter(isSource);
  if (dirtySources.length > 0) {
    throw new Error(`commit or stash source changes before syncing: ${dirtySources.join(", ")}`);
  }

  // Include previous files as well as new files so upstream deletions and
  // renames are mirrored. Restore a tree, without merging upstream history.
  const upstreamFiles = files(["ls-tree", "-r", "--name-only", "-z", sha]).filter(isSource);
  if (!upstreamFiles.includes(".claude-plugin/plugin.json") ||
      !upstreamFiles.some((file) => file.startsWith("skills/") && file.endsWith("/SKILL.md"))) {
    throw new Error("upstream must contain the Claude plugin manifest and skill sources");
  }
  const sourceFiles = [...new Set([
    ...files(["ls-tree", "-r", "--name-only", "-z", "HEAD"]),
    ...upstreamFiles,
  ].filter(isSource))].sort();
  if (sourceFiles.length === 0) throw new Error("no upstream skill source files found");
  git([
    "--literal-pathspecs", "restore", `--source=${sha}`, "--staged", "--worktree",
    "--pathspec-from-file=-", "--pathspec-file-nul",
  ], `${sourceFiles.join("\0")}\0`);
  return { sha, fileCount: sourceFiles.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = syncUpstreamSkills({ upstreamRef: process.argv[2] ?? "upstream/main" });
    console.log(`Synced skill sources from ${result.sha}; fork workflows and packaging preserved`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
