#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  PLUGIN_NAME,
  PLUGIN_ROOT,
  REPO_ROOT,
  TRANSFORM_REASON,
  UPSTREAM_REPOSITORY,
  assertPluginMatchesExpected,
} from "./build-codex-plugin.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function main() {
  await assertPluginMatchesExpected();

  const marketplace = await readJson(
    path.join(REPO_ROOT, ".agents", "plugins", "marketplace.json"),
  );
  assert(marketplace.name === "hinson0-matt-skills", "unexpected marketplace name");
  assert(
    marketplace.interface?.displayName === "Matt Pocock Skills for Codex (Unofficial)",
    "unexpected marketplace display name",
  );
  assert(Array.isArray(marketplace.plugins) && marketplace.plugins.length === 1, "marketplace must contain one plugin");
  const entry = marketplace.plugins[0];
  assert(entry.name === PLUGIN_NAME, "marketplace plugin name mismatch");
  assert(entry.source?.source === "local", "marketplace source must be local");
  assert(entry.source?.path === `./plugins/${PLUGIN_NAME}`, "marketplace path mismatch");
  assert(entry.policy?.installation === "AVAILABLE", "installation policy mismatch");
  assert(entry.policy?.authentication === "ON_INSTALL", "authentication policy mismatch");
  assert(entry.category === "Developer Tools", "marketplace category mismatch");

  const manifest = await readJson(path.join(PLUGIN_ROOT, ".codex-plugin", "plugin.json"));
  assert(manifest.name === PLUGIN_NAME, "plugin manifest name mismatch");
  assert(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\+codex\.[0-9a-f]{12}$/.test(manifest.version), "plugin version is not strict semver with an upstream cachebuster");
  assert(manifest.author?.name === "hinson0", "plugin publisher mismatch");
  assert(manifest.skills === "./skills/", "plugin skills path mismatch");
  for (const field of ["displayName", "shortDescription", "longDescription", "developerName", "category", "capabilities", "defaultPrompt"]) {
    assert(manifest.interface?.[field] !== undefined, `missing interface.${field}`);
  }

  const upstream = await readJson(path.join(PLUGIN_ROOT, "UPSTREAM.json"));
  assert(upstream.repository === UPSTREAM_REPOSITORY, "upstream repository mismatch");
  assert(/^[0-9a-f]{40}$/.test(upstream.commit), "upstream commit must be a full SHA");
  assert(Array.isArray(upstream.skills) && upstream.skills.length > 0, "upstream skills are missing");
  assert(Array.isArray(upstream.transformedSkills), "transformed skill list is missing");
  assert(upstream.transformations?.length === 1, "unexpected transformation count");
  assert(upstream.transformations[0].reason === TRANSFORM_REASON, "transformation reason mismatch");

  const skillEntries = (await fs.readdir(path.join(PLUGIN_ROOT, "skills"), { withFileTypes: true }))
    .filter((entry) => !entry.name.startsWith("."));
  assert(skillEntries.every((entry) => entry.isDirectory()), "skills root may contain only skill directories");
  assert(skillEntries.length === upstream.skills.length, "generated skill count mismatch");
  for (const entry of skillEntries) {
    const skillRoot = path.join(PLUGIN_ROOT, "skills", entry.name);
    assert((await fs.stat(path.join(skillRoot, "SKILL.md"))).isFile(), `${entry.name}: missing SKILL.md`);
    const skillText = await fs.readFile(path.join(skillRoot, "SKILL.md"), "utf8");
    assert(!/^disable[-_]model[-_]invocation\s*:\s*true\b/im.test(skillText), `${entry.name}: Claude-only invocation field was not removed`);
  }

  const licenseMatches =
    (await fs.readFile(path.join(REPO_ROOT, "LICENSE"), "utf8")) ===
    (await fs.readFile(path.join(PLUGIN_ROOT, "LICENSE"), "utf8"));
  assert(licenseMatches, "generated LICENSE differs from upstream");
  console.log(
    `Codex plugin validation passed: ${upstream.skills.length} skills, ${upstream.transformedSkills.length} transformed`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
