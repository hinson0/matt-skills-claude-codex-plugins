#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = await fs.readFile(path.join(repoRoot, ".github/workflows/sync-upstream.yml"), "utf8");

// Exercise the workflow's real shell commands against disposable local remotes.
function shellStep(name) {
  const start = workflow.indexOf(`      - name: ${name}\n`);
  assert(start >= 0, `missing workflow step: ${name}`);
  const end = workflow.indexOf("      - name: ", start + 1);
  const step = workflow.slice(start, end < 0 ? undefined : end);
  const run = step.match(/        run: \|\n((?:          [^\n]*\n?)+)/);
  assert(run, `missing shell block: ${name}`);
  return run[1].split("\n").map((line) => line.replace(/^ {10}/, "")).join("\n");
}

const merge = shellStep("Merge upstream");
const publish = shellStep("Commit generated changes");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "matt-upstream-history-test-"));
const checkout = path.join(root, "checkout");
const fork = path.join(root, "fork.git");
const upstream = path.join(root, "upstream.git");
const git = (...args) => execFileSync("git", args, {
  cwd: checkout, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
}).trim();
const run = (script) => execFileSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", script], {
  cwd: checkout, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
});
const write = async (file, contents) => {
  await fs.mkdir(path.dirname(path.join(checkout, file)), { recursive: true });
  await fs.writeFile(path.join(checkout, file), contents);
};

try {
  await fs.mkdir(checkout);
  git("init", "-q", "-b", "main");
  git("config", "user.name", "History test");
  git("config", "user.email", "history-test@example.invalid");
  await write("skills/alpha/SKILL.md", "Original skill\n");
  git("add", ".");
  git("commit", "-qm", "Common ancestor");
  const base = git("rev-parse", "HEAD");

  await write("plugins/mattpocock-skills/UPSTREAM.json", "Existing generated plugin\n");
  await write(".agents/plugins/marketplace.json", "Fork marketplace\n");
  await write(".github/workflows/sync-upstream.yml", workflow);
  git("add", ".");
  git("commit", "-qm", "Fork packaging");
  const forkHead = git("rev-parse", "HEAD");
  git("init", "-q", "--bare", fork);
  git("remote", "add", "origin", fork);
  git("push", "-q", "origin", "HEAD:main");

  git("switch", "-qc", "upstream-fixture", base);
  await write(".github/workflows/needs-info.yml", "name: Upstream workflow\n");
  await write("skills/alpha/SKILL.md", "Updated skill\n");
  git("add", ".");
  git("commit", "-qm", "Upstream changes outside generated plugin");
  const upstreamHead = git("rev-parse", "HEAD");
  git("init", "-q", "--bare", upstream);
  git("push", "-q", upstream, "HEAD:main");
  git("switch", "-q", "main");
  git("config", `url.${upstream}.insteadOf`, "https://github.com/mattpocock/skills.git");

  run(merge);
  assert.equal(git("diff", "--name-only", forkHead, "HEAD", "--", "plugins"), "");
  run(publish);
  git("fetch", "-q", "origin", "main");
  git("merge-base", "--is-ancestor", upstreamHead, "origin/main");
  git("merge-base", "--is-ancestor", forkHead, "origin/main");
  assert.equal(git("rev-list", "--count", "origin/main..upstream/main"), "0");
  assert.equal(git("show", "origin/main:.agents/plugins/marketplace.json"), "Fork marketplace");
  assert.equal(git("show", "origin/main:.github/workflows/sync-upstream.yml"), workflow.trim());
  assert.equal(git("show", "origin/main:.github/workflows/needs-info.yml"), "name: Upstream workflow");
  console.log("ok - pushes original upstream history even when generated plugin files are unchanged");

  const mergedHead = git("rev-parse", "HEAD");
  git("remote", "remove", "upstream");
  run(merge);
  run(publish);
  assert.equal(git("rev-parse", "HEAD"), mergedHead);
  assert.equal(git("status", "--porcelain"), "");
  console.log("ok - repeating an already-current sync creates no extra commits");

  await write("skills/alpha/SKILL.md", "Fork edit\n");
  git("add", ".");
  git("commit", "-qm", "Fork edit");
  git("push", "-q", "origin", "HEAD:main");
  const beforeConflict = git("rev-parse", "HEAD");
  git("switch", "-q", "upstream-fixture");
  await write("skills/alpha/SKILL.md", "Conflicting upstream edit\n");
  git("add", ".");
  git("commit", "-qm", "Upstream edit");
  git("push", "-q", upstream, "HEAD:main");
  git("switch", "-q", "main");
  git("remote", "remove", "upstream");
  assert.throws(() => run(merge));
  assert.equal(git("rev-parse", "HEAD"), beforeConflict);
  assert.equal(git("rev-parse", "origin/main"), beforeConflict);
  assert.equal(git("diff", "--name-only", "--diff-filter=U"), "skills/alpha/SKILL.md");
  console.log("ok - a merge conflict stops sync before any upstream changes are pushed");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
