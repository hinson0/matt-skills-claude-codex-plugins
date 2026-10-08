# Unofficial Codex plugin

This fork packages the promoted skills from [mattpocock/skills](https://github.com/mattpocock/skills) as a native Codex plugin. Matt Pocock owns the upstream skills. This repository only maintains the Codex packaging.

## Install

```bash
codex plugin marketplace add hinson0/matt-skills-claude-codex-plugins --ref main
codex plugin add mattpocock-skills@mattpocock
```

Start a new Codex task after installation. Remove project-local copies previously installed by `npx skills` before using the plugin, otherwise Codex may load duplicate skills.

## Update

Run the `Sync upstream and build Codex plugin` workflow in GitHub Actions. After it completes:

```bash
codex plugin marketplace upgrade mattpocock
codex plugin add mattpocock-skills@mattpocock
```

Start a new Codex task after reinstalling.

Each run imports the latest skill sources, documentation, and Claude plugin skill list from upstream `main`, then rebuilds the Codex plugin. It mirrors added, renamed, and removed skills. The fork's GitHub workflows and marketplace configuration stay local, so the workflow uses the default `GITHUB_TOKEN` without a separate personal access token. `UPSTREAM.json` records the imported upstream commit; the workflow imports a source snapshot rather than merging upstream Git history.

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

To sync the sources locally first:

```bash
git fetch upstream main
node scripts/test-sync-upstream-skills.mjs
node scripts/sync-upstream-skills.mjs
```

Commit or stash changes to skill sources before syncing. The sync command stages the imported files and leaves fork packaging files untouched.

Claude Code users should continue using the official plugin:

```bash
claude plugins install mattpocock-skills
```
