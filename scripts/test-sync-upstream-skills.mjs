#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { syncUpstreamSkills } from "./sync-upstream-skills.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "matt-skills-sync-test-"));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const write = async (file, contents) => {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), contents);
};

try {
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Sync test");
  git("config", "user.email", "sync-test@example.invalid");
  await write("skills/engineering/old/SKILL.md", "Old skill\n");
  await write("skills/productivity/kept/SKILL.md", "Kept skill\n");
  await write("docs/engineering/old.md", "Old docs\n");
  await write(".claude-plugin/plugin.json", '{"version":"1.2.3"}\n');
  await write(".agents/invocation.md", "Old invocation\n");
  await write(".changeset/old.md", "Consumed release note\n");
  await write(".github/workflows/existing.yml", "name: Old workflow\n");
  await write(".agents/plugins/marketplace.json", "Fork marketplace\n");
  await write("scripts/build-codex-plugin.mjs", "Fork builder\n");
  await write("plugins/mattpocock-skills/UPSTREAM.json", "Fork provenance\n");
  await write("CODEX_PLUGIN.md", "Fork instructions\n");
  await write("CONTEXT.md", "Old glossary\n");
  git("add", ".");
  git("commit", "-qm", "Initial fork");
  const forkSha = git("rev-parse", "HEAD");

  git("switch", "-qc", "upstream-fixture");
  git("rm", "-q", "skills/engineering/old/SKILL.md", "docs/engineering/old.md", "CONTEXT.md", ".changeset/old.md");
  await write("skills/engineering/new/SKILL.md", "New skill\n");
  await write("skills/productivity/kept/SKILL.md", "Updated skill\n");
  await write("docs/engineering/new.md", "New docs\n");
  await write(".claude-plugin/plugin.json", '{"version":"1.3.1"}\n');
  await write(".agents/invocation.md", "Updated invocation\n");
  await write(".changeset/new.md", "New release note\n");
  await write(".github/workflows/existing.yml", "name: Changed upstream workflow\n");
  await write(".github/workflows/needs-info.yml", "name: New upstream workflow\n");
  await write(".agents/plugins/marketplace.json", "Upstream marketplace\n");
  await write("scripts/build-codex-plugin.mjs", "Upstream builder\n");
  await write("plugins/mattpocock-skills/UPSTREAM.json", "Upstream provenance\n");
  await write("CODEX_PLUGIN.md", "Upstream instructions\n");
  await write("GLOSSARY.md", "New glossary\n");
  git("add", ".");
  git("commit", "-qm", "Upstream skills and workflow changes");
  const upstreamSha = git("rev-parse", "HEAD");
  git("switch", "-q", "main");

  const result = syncUpstreamSkills({ repoRoot: root, upstreamRef: upstreamSha });
  assert.equal(result.sha, upstreamSha);
  assert.equal(git("rev-parse", "HEAD"), forkSha);
  assert.equal(await fs.readFile(path.join(root, "skills/engineering/new/SKILL.md"), "utf8"), "New skill\n");
  assert.equal(await fs.readFile(path.join(root, "skills/productivity/kept/SKILL.md"), "utf8"), "Updated skill\n");
  assert.equal(await fs.readFile(path.join(root, ".claude-plugin/plugin.json"), "utf8"), '{"version":"1.3.1"}\n');
  assert.equal(await fs.readFile(path.join(root, ".agents/invocation.md"), "utf8"), "Updated invocation\n");
  assert.equal(await fs.readFile(path.join(root, "GLOSSARY.md"), "utf8"), "New glossary\n");
  await assert.rejects(fs.stat(path.join(root, "skills/engineering/old/SKILL.md")), { code: "ENOENT" });
  await assert.rejects(fs.stat(path.join(root, "docs/engineering/old.md")), { code: "ENOENT" });
  await assert.rejects(fs.stat(path.join(root, "CONTEXT.md")), { code: "ENOENT" });
  await assert.rejects(fs.stat(path.join(root, ".changeset/old.md")), { code: "ENOENT" });
  assert.equal(await fs.readFile(path.join(root, ".changeset/new.md"), "utf8"), "New release note\n");
  await assert.rejects(fs.stat(path.join(root, ".github/workflows/needs-info.yml")), { code: "ENOENT" });
  for (const file of [
    ".github/workflows/existing.yml", ".agents/plugins/marketplace.json",
    "scripts/build-codex-plugin.mjs", "plugins/mattpocock-skills/UPSTREAM.json", "CODEX_PLUGIN.md",
  ]) {
    assert.equal(git("show", `:${file}`), git("show", `${forkSha}:${file}`));
  }
  assert.equal(git("diff", "--cached", "--name-only", "--", ".github/workflows"), "");
  git("commit", "-qm", "Sync skill snapshot");
  assert.equal(git("rev-parse", "HEAD^"), forkSha);
  assert.equal(git("rev-list", "--count", "HEAD^..HEAD"), "1");
  console.log("ok - syncs additions, updates and deletions without workflow changes or upstream history");

  syncUpstreamSkills({ repoRoot: root, upstreamRef: upstreamSha });
  assert.equal(git("status", "--porcelain"), "");
  console.log("ok - syncing the same upstream snapshot again is a no-op");

  await write("skills/productivity/kept/SKILL.md", "Local edit\n");
  assert.throws(() => syncUpstreamSkills({ repoRoot: root, upstreamRef: upstreamSha }), /commit or stash source changes/);
  assert.equal(await fs.readFile(path.join(root, "skills/productivity/kept/SKILL.md"), "utf8"), "Local edit\n");
  console.log("ok - refuses to overwrite local source changes");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
