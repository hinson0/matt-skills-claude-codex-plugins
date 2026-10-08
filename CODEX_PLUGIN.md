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

Each run merges upstream `main` with its original commit history, then rebuilds the Codex plugin. The fork's packaging files remain part of the merged branch. Upstream GitHub workflows are merged too. `UPSTREAM.json` records the upstream commit used for the generated plugin. A successful run updates both the Git history and the Codex plugin, so no separate `Update branch` operation is needed.

Create a fine-grained personal access token for this fork with **Contents: read and write** and **Workflows: write**. Store it as the Actions repository secret `UPSTREAM_SYNC_TOKEN`. The checkout and push use this token because the default `GITHUB_TOKEN` cannot push new upstream workflow files. Replace the secret when the token expires.

The workflow pushes merged history even when the generated plugin has no changes. If Git reports a merge conflict, resolve it before retrying the workflow; the workflow does not discard fork commits or force-push.

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

To merge upstream locally first:

```bash
git fetch upstream main
node scripts/test-upstream-history.mjs
git merge --no-edit upstream/main
```

Commit or stash local changes before merging. Rebuild and validate the plugin after the merge, then commit the generated changes and push the branch.

Claude Code users should continue using the official plugin:

```bash
claude plugins install mattpocock-skills
```
