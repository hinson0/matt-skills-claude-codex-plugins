#!/usr/bin/env node

import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPlugin } from "./build-codex-plugin.mjs";

const TEST_SHA = "0123456789abcdef0123456789abcdef01234567";

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeSkill(root, bucket, name, { explicit = false, frontmatter = null } = {}) {
  const skillRoot = path.join(root, "skills", bucket, name);
  await fs.mkdir(skillRoot, { recursive: true });
  const invocation =
    frontmatter ?? (explicit ? "disable-model-invocation: true\n" : "");
  await fs.writeFile(
    path.join(skillRoot, "SKILL.md"),
    `---\nname: ${name}\ndescription: Test ${name}\n${invocation}---\n\n# ${name}\n`,
  );
  if (explicit) {
    await fs.mkdir(path.join(skillRoot, "agents"), { recursive: true });
    await fs.writeFile(
      path.join(skillRoot, "agents", "openai.yaml"),
      "interface:\n  display_name: Test\n  short_description: Test\npolicy:\n  allow_implicit_invocation: false\n",
    );
  }
  return skillRoot;
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "matt-skills-builder-test-"));
  await writeJson(path.join(root, "package.json"), { version: "1.0.0" });
  await fs.writeFile(path.join(root, "LICENSE"), "MIT test license\n");
  await writeSkill(root, "engineering", "alpha");
  await writeSkill(root, "productivity", "explicit", { explicit: true });
  await writeJson(path.join(root, ".claude-plugin", "plugin.json"), {
    version: "1.0.0",
    skills: ["./skills/engineering/alpha", "./skills/productivity/explicit"],
  });
  return root;
}

async function withFixture(run) {
  const root = await fixture();
  try {
    await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function expectFailure(run, pattern) {
  await assert.rejects(run, pattern);
}

const tests = [
  [
    "builds and transforms an explicit skill",
    async () =>
      withFixture(async (root) => {
        const targetRoot = path.join(root, "out");
        const result = await buildPlugin({ repoRoot: root, targetRoot, upstreamSha: TEST_SHA });
        assert.equal(result.skillCount, 2);
        assert.deepEqual(result.transformedSkills, ["explicit"]);
        const copied = await fs.readFile(
          path.join(targetRoot, "skills", "explicit", "SKILL.md"),
          "utf8",
        );
        assert.doesNotMatch(copied, /disable-model-invocation/);
        assert.match(
          await fs.readFile(
            path.join(targetRoot, "skills", "explicit", "agents", "openai.yaml"),
            "utf8",
          ),
          /allow_implicit_invocation:\s*false/,
        );
      }),
  ],
  [
    "rejects mismatched versions",
    async () =>
      withFixture(async (root) => {
        await writeJson(path.join(root, "package.json"), { version: "2.0.0" });
        await expectFailure(
          () => buildPlugin({ repoRoot: root, targetRoot: path.join(root, "out"), upstreamSha: TEST_SHA }),
          /version mismatch/,
        );
      }),
  ],
  [
    "rejects missing Codex invocation metadata",
    async () =>
      withFixture(async (root) => {
        await fs.rm(path.join(root, "skills", "productivity", "explicit", "agents", "openai.yaml"));
        await expectFailure(
          () => buildPlugin({ repoRoot: root, targetRoot: path.join(root, "out"), upstreamSha: TEST_SHA }),
          /requires agents\/openai.yaml/,
        );
      }),
  ],
  [
    "rejects conflicting invocation aliases",
    async () =>
      withFixture(async (root) => {
        await writeSkill(root, "productivity", "explicit", {
          explicit: true,
          frontmatter:
            "disable-model-invocation: true\ndisable_model_invocation: false\n",
        });
        await expectFailure(
          () => buildPlugin({ repoRoot: root, targetRoot: path.join(root, "out"), upstreamSha: TEST_SHA }),
          /aliases conflict/,
        );
      }),
  ],
  [
    "rejects duplicate flat skill names",
    async () =>
      withFixture(async (root) => {
        await writeSkill(root, "engineering", "same");
        await writeSkill(root, "productivity", "same");
        await writeJson(path.join(root, ".claude-plugin", "plugin.json"), {
          version: "1.0.0",
          skills: ["./skills/engineering/same", "./skills/productivity/same"],
        });
        await expectFailure(
          () => buildPlugin({ repoRoot: root, targetRoot: path.join(root, "out"), upstreamSha: TEST_SHA }),
          /duplicate promoted skill name/,
        );
      }),
  ],
  [
    "rejects non-promoted paths",
    async () =>
      withFixture(async (root) => {
        await writeJson(path.join(root, ".claude-plugin", "plugin.json"), {
          version: "1.0.0",
          skills: ["./skills/in-progress/alpha"],
        });
        await expectFailure(
          () => buildPlugin({ repoRoot: root, targetRoot: path.join(root, "out"), upstreamSha: TEST_SHA }),
          /unsupported promoted skill path/,
        );
      }),
  ],
  [
    "rejects missing skills",
    async () =>
      withFixture(async (root) => {
        await writeJson(path.join(root, ".claude-plugin", "plugin.json"), {
          version: "1.0.0",
          skills: ["./skills/engineering/missing"],
        });
        await expectFailure(
          () => buildPlugin({ repoRoot: root, targetRoot: path.join(root, "out"), upstreamSha: TEST_SHA }),
          /missing promoted skill/,
        );
      }),
  ],
];

let failures = 0;
for (const [name, run] of tests) {
  try {
    await run();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

if (failures > 0) process.exitCode = 1;
