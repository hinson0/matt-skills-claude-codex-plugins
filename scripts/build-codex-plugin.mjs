#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
export const PLUGIN_NAME = "mattpocock-skills";
export const PLUGIN_ROOT = path.join(REPO_ROOT, "plugins", PLUGIN_NAME);
export const UPSTREAM_REPOSITORY = "https://github.com/mattpocock/skills";
export const TRANSFORM_REASON =
  "Unsupported by Codex; equivalent policy is preserved via agents/openai.yaml policy.allow_implicit_invocation=false";

function readJson(filePath) {
  return fs.readFile(filePath, "utf8").then(JSON.parse);
}

function parseYamlBoolean(rawValue, label) {
  const withoutComment = rawValue.replace(/\s+#.*$/, "").trim().toLowerCase();
  if (withoutComment === "true") return true;
  if (withoutComment === "false") return false;
  throw new Error(`${label} must be a YAML boolean`);
}

function frontmatterLines(contents, skillName) {
  const lines = contents.split("\n");
  if (lines[0] !== "---") {
    throw new Error(`${skillName}: SKILL.md must start with YAML frontmatter`);
  }
  const closingIndex = lines.indexOf("---", 1);
  if (closingIndex === -1) {
    throw new Error(`${skillName}: SKILL.md frontmatter is not closed`);
  }
  return { lines, closingIndex };
}

function claudeInvocationFields(contents, skillName) {
  const { lines, closingIndex } = frontmatterLines(contents, skillName);
  const aliases = new Map();
  for (let index = 1; index < closingIndex; index += 1) {
    const match = lines[index].match(
      /^(disable-model-invocation|disable_model_invocation)\s*:\s*(.*?)\s*$/,
    );
    if (!match) continue;
    if (aliases.has(match[1])) {
      throw new Error(`${skillName}: duplicate frontmatter field ${match[1]}`);
    }
    aliases.set(match[1], {
      index,
      value: parseYamlBoolean(match[2], `${skillName}: ${match[1]}`),
    });
  }
  const values = [...aliases.values()].map(({ value }) => value);
  if (values.includes(true) && values.includes(false)) {
    throw new Error(`${skillName}: invocation frontmatter aliases conflict`);
  }
  return { aliases, enabled: values.includes(true), lines };
}

async function requireCodexExplicitInvocation(skillRoot, skillName) {
  const metadataPath = path.join(skillRoot, "agents", "openai.yaml");
  let contents;
  try {
    contents = await fs.readFile(metadataPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `${skillName}: disable-model-invocation=true requires agents/openai.yaml`,
      );
    }
    throw error;
  }

  const lines = contents.split("\n");
  const policyIndexes = lines
    .map((line, index) => (/^policy\s*:\s*(?:#.*)?$/.test(line) ? index : -1))
    .filter((index) => index !== -1);
  if (policyIndexes.length !== 1) {
    throw new Error(`${skillName}: agents/openai.yaml must contain one root policy block`);
  }

  const start = policyIndexes[0] + 1;
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    if (/^[^\s#][^:]*\s*:/.test(lines[index])) {
      end = index;
      break;
    }
  }

  const values = [];
  for (let index = start; index < end; index += 1) {
    const match = lines[index].match(/^\s+allow_implicit_invocation\s*:\s*(.*?)\s*$/);
    if (match) {
      values.push(
        parseYamlBoolean(
          match[1],
          `${skillName}: policy.allow_implicit_invocation`,
        ),
      );
    }
  }
  if (values.length !== 1 || values[0] !== false) {
    throw new Error(
      `${skillName}: disable-model-invocation=true requires policy.allow_implicit_invocation=false`,
    );
  }
}

async function rejectSymlinks(root, label) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`${label}: symlinks are not supported (${entryPath})`);
    }
    if (entry.isDirectory()) await rejectSymlinks(entryPath, label);
  }
}

async function transformCopiedSkill(skillRoot, skillName) {
  const skillPath = path.join(skillRoot, "SKILL.md");
  const contents = await fs.readFile(skillPath, "utf8");
  const { aliases, enabled, lines } = claudeInvocationFields(contents, skillName);
  if (!enabled) return false;

  await requireCodexExplicitInvocation(skillRoot, skillName);
  const indexesToRemove = new Set(
    [...aliases.values()].filter(({ value }) => value).map(({ index }) => index),
  );
  const transformed = lines
    .filter((_, index) => !indexesToRemove.has(index))
    .join("\n");
  await fs.writeFile(skillPath, transformed);
  return true;
}

function resolveUpstreamSha(repoRoot) {
  const supplied = process.env.CODEX_UPSTREAM_SHA?.trim();
  const sha =
    supplied ||
    execFileSync("git", ["rev-parse", "upstream/main"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`invalid upstream commit SHA: ${sha}`);
  }
  return sha;
}

function pluginManifest(version) {
  return {
    name: PLUGIN_NAME,
    version,
    description:
      "Unofficial Codex packaging of Matt Pocock's MIT-licensed agent skills for real engineering.",
    author: {
      name: "hinson0",
      url: "https://github.com/hinson0",
    },
    homepage: UPSTREAM_REPOSITORY,
    repository: "https://github.com/hinson0/matt-skills-claude-codex-plugins",
    license: "MIT",
    keywords: ["engineering", "skills", "tdd", "code-review", "productivity"],
    skills: "./skills/",
    interface: {
      displayName: "Matt Pocock Skills",
      shortDescription: "Engineering and productivity skills for Codex",
      longDescription:
        "Unofficial Codex packaging of the promoted skills from mattpocock/skills.",
      developerName: "hinson0",
      category: "Developer Tools",
      capabilities: ["Interactive", "Read", "Write"],
      defaultPrompt: ["Use the appropriate Matt Pocock skill for this task."],
    },
  };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function buildPlugin({
  repoRoot = REPO_ROOT,
  targetRoot = PLUGIN_ROOT,
  upstreamSha = resolveUpstreamSha(repoRoot),
} = {}) {
  const packageJson = await readJson(path.join(repoRoot, "package.json"));
  const claudeManifest = await readJson(
    path.join(repoRoot, ".claude-plugin", "plugin.json"),
  );
  if (packageJson.version !== claudeManifest.version) {
    throw new Error(
      `version mismatch: package.json=${packageJson.version}, Claude plugin=${claudeManifest.version}`,
    );
  }
  if (!Array.isArray(claudeManifest.skills) || claudeManifest.skills.length === 0) {
    throw new Error("Claude plugin must declare a non-empty skills array");
  }

  const skills = [];
  const seenNames = new Set();
  for (const relativePath of claudeManifest.skills) {
    if (
      typeof relativePath !== "string" ||
      !/^\.\/skills\/(engineering|productivity)\/[^/]+$/.test(relativePath)
    ) {
      throw new Error(`unsupported promoted skill path: ${relativePath}`);
    }
    const sourceRoot = path.resolve(repoRoot, relativePath);
    const expectedPrefix = `${path.join(repoRoot, "skills")}${path.sep}`;
    if (!sourceRoot.startsWith(expectedPrefix)) {
      throw new Error(`skill path escapes repository skills root: ${relativePath}`);
    }
    const name = path.basename(sourceRoot);
    if (seenNames.has(name)) throw new Error(`duplicate promoted skill name: ${name}`);
    seenNames.add(name);
    const stats = await fs.stat(sourceRoot).catch(() => null);
    if (!stats?.isDirectory()) throw new Error(`missing promoted skill: ${relativePath}`);
    if (!(await fs.stat(path.join(sourceRoot, "SKILL.md")).catch(() => null))?.isFile()) {
      throw new Error(`missing SKILL.md: ${relativePath}`);
    }
    await rejectSymlinks(sourceRoot, name);
    skills.push({ name, relativePath, sourceRoot });
  }

  await fs.rm(targetRoot, { recursive: true, force: true });
  const targetSkillsRoot = path.join(targetRoot, "skills");
  await fs.mkdir(targetSkillsRoot, { recursive: true });

  const transformedSkills = [];
  for (const skill of skills) {
    const destination = path.join(targetSkillsRoot, skill.name);
    await fs.cp(skill.sourceRoot, destination, {
      recursive: true,
      force: true,
      dereference: false,
      preserveTimestamps: true,
    });
    if (await transformCopiedSkill(destination, skill.name)) {
      transformedSkills.push(skill.name);
    }
  }

  const version = `${packageJson.version}+codex.${upstreamSha.slice(0, 12)}`;
  await writeJson(
    path.join(targetRoot, ".codex-plugin", "plugin.json"),
    pluginManifest(version),
  );
  await fs.copyFile(path.join(repoRoot, "LICENSE"), path.join(targetRoot, "LICENSE"));
  await writeJson(path.join(targetRoot, "UPSTREAM.json"), {
    repository: UPSTREAM_REPOSITORY,
    commit: upstreamSha,
    version: packageJson.version,
    skills: skills.map(({ name, relativePath }) => ({ name, path: relativePath })),
    transformedSkills,
    transformations: [
      {
        type: "remove-skill-frontmatter",
        field: "disable-model-invocation",
        aliases: ["disable-model-invocation", "disable_model_invocation"],
        value: true,
        reason: TRANSFORM_REASON,
      },
    ],
  });
  return { version, skillCount: skills.length, transformedSkills };
}

async function collectTree(root, relative = "") {
  const current = path.join(root, relative);
  const entries = await fs.readdir(current, { withFileTypes: true });
  const tree = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`generated plugin contains symlink: ${child}`);
    if (entry.isDirectory()) {
      tree.push({ path: `${child}/`, type: "directory" });
      tree.push(...(await collectTree(root, child)));
    } else if (entry.isFile()) {
      const stats = await fs.stat(path.join(root, child));
      tree.push({
        path: child,
        type: "file",
        mode: stats.mode & 0o777,
        contents: await fs.readFile(path.join(root, child), "base64"),
      });
    }
  }
  return tree;
}

export async function assertPluginMatchesExpected({ repoRoot = REPO_ROOT } = {}) {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matt-skills-codex-check-"));
  try {
    const expectedRoot = path.join(temporaryRoot, PLUGIN_NAME);
    await buildPlugin({ repoRoot, targetRoot: expectedRoot });
    const [expected, actual] = await Promise.all([
      collectTree(expectedRoot),
      collectTree(path.join(repoRoot, "plugins", PLUGIN_NAME)),
    ]);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      throw new Error("generated Codex plugin is stale; run node scripts/build-codex-plugin.mjs");
    }
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes("--check")) {
    await assertPluginMatchesExpected();
    console.log("Codex plugin is up to date");
    return;
  }
  const result = await buildPlugin();
  console.log(
    `Built ${result.skillCount} skills at ${result.version}; transformed ${result.transformedSkills.length}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
