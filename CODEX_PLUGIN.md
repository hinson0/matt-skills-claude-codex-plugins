# Unofficial Codex plugin

This fork packages the promoted skills from [mattpocock/skills](https://github.com/mattpocock/skills) as a native Codex plugin. Matt Pocock owns the upstream skills. This repository only maintains the Codex packaging.

## Install

```bash
codex plugin marketplace add hinson0/matt-skills-claude-codex-plugins --ref main
codex plugin add mattpocock-skills@hinson0-matt-skills
```

Start a new Codex task after installation. Remove project-local copies previously installed by `npx skills` before using the plugin, otherwise Codex may load duplicate skills.

## Update

Run the `Sync upstream and build Codex plugin` workflow in GitHub Actions. After it completes:

```bash
codex plugin marketplace upgrade hinson0-matt-skills
codex plugin add mattpocock-skills@hinson0-matt-skills
```

Start a new Codex task after reinstalling.

## Packaging contract

The Claude plugin manifest is the source of truth for promoted skills. The build copies those skill directories into a flat Codex plugin directory.

One compatibility transformation is allowed: when Claude frontmatter sets `disable-model-invocation: true`, the build first requires `agents/openai.yaml` to set `policy.allow_implicit_invocation: false`, then removes the Claude-only frontmatter field from the generated copy. `UPSTREAM.json` records the upstream commit and every transformed skill.

Build and validate locally with:

```bash
node scripts/build-codex-plugin.mjs
node scripts/build-codex-plugin.mjs --check
node scripts/validate-codex-plugin.mjs
node scripts/test-codex-plugin.mjs
```

Claude Code users should continue using the official plugin:

```bash
claude plugins install mattpocock-skills
```
