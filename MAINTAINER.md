# Matt Skills 双插件改造、使用与维护说明

本文档说明本 Fork 做了什么改造、Claude Code 和 Codex 如何安装使用，以及以后如何同步 `mattpocock/skills` 的上游更新。

## 项目定位

- 上游仓库：[mattpocock/skills](https://github.com/mattpocock/skills)
- 本 Fork：[hinson0/matt-skills-claude-codex-plugins](https://github.com/hinson0/matt-skills-claude-codex-plugins)
- 上游作者：Matt Pocock
- Codex 打包维护者：hinson0
- 许可证：MIT，上游 LICENSE 保持原样

上游已经提供 Claude Code 官方插件，但 Codex 原来需要通过 `npx skills` 把技能复制到项目的 `.agents/skills`。这种方式每次更新都要修改项目文件，也可能在多个项目中留下不同版本。

本 Fork 在不修改上游已有文件的前提下，增加原生 Codex marketplace 和插件包。Claude Code 继续使用上游官方插件，Codex 则从本 Fork 统一安装和更新。

## 我们增加了什么

本 Fork 只新增 Codex 相关内容：

```text
.agents/plugins/marketplace.json
.github/workflows/sync-upstream.yml
plugins/mattpocock-skills/
scripts/build-codex-plugin.mjs
scripts/validate-codex-plugin.mjs
scripts/test-codex-plugin.mjs
CODEX_PLUGIN.md
MAINTAINER.md
```

各部分职责：

- `.agents/plugins/marketplace.json`：Codex marketplace 入口。
- `plugins/mattpocock-skills/`：生成后的 Codex 插件包。
- `build-codex-plugin.mjs`：读取上游 Claude 清单并生成 Codex 包。
- `validate-codex-plugin.mjs`：检查版本、目录、来源和兼容转换。
- `test-codex-plugin.mjs`：覆盖版本冲突、非法路径、重名技能和策略缺失等失败场景。
- `sync-upstream.yml`：手动同步上游、生成、验证、安装测试并推送结果。

## 技能范围如何确定

`.claude-plugin/plugin.json` 的 `skills` 数组是正式技能范围的唯一来源。

生成器只接受以下两个正式目录：

```text
skills/engineering/
skills/productivity/
```

`deprecated`、`in-progress`、`misc`、`personal` 等非正式目录不会进入 Codex 插件。因此，上游新增或删除正式技能后，不需要在本 Fork 维护第二份技能名单。

## Claude 与 Codex 的兼容转换

Claude 使用下面的 `SKILL.md` frontmatter 表示技能只能由用户显式调用：

```yaml
disable-model-invocation: true
```

Codex 使用 `agents/openai.yaml`：

```yaml
policy:
  allow_implicit_invocation: false
```

生成器遇到 Claude 显式调用字段时，会执行以下检查和转换：

1. 确认同一技能存在 `agents/openai.yaml`。
2. 确认 `policy.allow_implicit_invocation` 严格等于 `false`。
3. 只从生成副本中删除 Claude 专用 frontmatter 字段。
4. 保留 Codex 的 `allow_implicit_invocation: false`。
5. 将被转换的技能记录到 `UPSTREAM.json`。

如果映射缺失、值错误或两个字段别名冲突，构建会直接失败，避免技能意外变成可自动调用。上游原始技能文件始终保持不变。

## Codex 首次安装

添加远程 Git marketplace：

```bash
codex plugin marketplace add \
  hinson0/matt-skills-claude-codex-plugins \
  --ref main
```

安装插件：

```bash
codex plugin add mattpocock-skills@hinson0-matt-skills
```

确认安装状态：

```bash
codex plugin list | grep mattpocock-skills
```

安装后新建一个 Codex 任务。已打开的任务不会重新读取插件和技能目录。

## 如何使用技能

第一次在一个项目中使用时，先明确要求 Codex 使用 `setup-matt-pocock-skills`，完成 issue tracker、文档位置和 triage 标签配置。

不知道该用哪个技能时，明确要求 Codex 使用 `ask-matt`。它会根据当前任务选择合适的工作流。

常见示例：

```text
请使用 ask-matt 判断这个需求应该走哪个流程。

请使用 diagnosing-bugs 诊断这个故障，先不要修改代码。

请使用 tdd 测试先行实现这个功能。

请使用 code-review 审查当前分支相对 main 的改动。
```

部分技能允许 Codex 根据任务自动选择，部分技能只能由用户明确点名。生成包会保留上游定义的调用策略。

## Claude Code 安装

Claude Code 继续使用上游官方插件：

```bash
claude plugins install mattpocock-skills
```

本 Fork 的职责仅是保留上游 Claude 能力并增加 Codex 打包，不重新发布 Claude 插件。

## 从 `npx skills` 迁移

不要同时保留原来复制到项目中的同名技能和新插件，否则 Codex 可能重复加载。

迁移前先检查项目：

```bash
find .agents/skills -mindepth 1 -maxdepth 1 -type d 2>/dev/null
```

确认哪些目录来自 `mattpocock/skills` 后，只清理这些旧副本。不要批量删除不属于本插件的自定义技能。

迁移只需做一次。以后更新通过 marketplace 完成，不再修改项目内的 `.agents/skills`。

## 日常同步上游

推荐使用 GitHub Action。它会合并上游、重新生成插件、运行验证和真实安装测试，全部成功后才推送。

触发同步：

```bash
gh workflow run sync-upstream.yml \
  --repo hinson0/matt-skills-claude-codex-plugins
```

查看最近一次运行：

```bash
gh run list \
  --repo hinson0/matt-skills-claude-codex-plugins \
  --workflow sync-upstream.yml \
  --limit 1
```

查看失败日志：

```bash
gh run view <run-id> \
  --repo hinson0/matt-skills-claude-codex-plugins \
  --log-failed
```

没有上游变化时，Action 不会创建空提交。

## 同步后更新本机 Codex

GitHub Action 成功后，刷新 marketplace 并重新安装插件：

```bash
codex plugin marketplace upgrade hinson0-matt-skills
codex plugin add mattpocock-skills@hinson0-matt-skills
```

确认版本：

```bash
codex plugin list | grep mattpocock-skills
```

最后新建 Codex 任务。

插件版本格式如下：

```text
<上游版本>+codex.<上游提交短 SHA>
```

即使上游没有修改版本号，只要提交发生变化，Codex 包也会得到不同的缓存标识。

## 本地生成与验证

只有修改 Codex 打包逻辑或处理同步冲突时，才需要在本地运行以下命令：

```bash
node scripts/build-codex-plugin.mjs
node scripts/build-codex-plugin.mjs --check
node scripts/validate-codex-plugin.mjs
node scripts/test-codex-plugin.mjs
```

运行 bundled plugin validator：

```bash
python3 /Users/a114514/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py \
  plugins/mattpocock-skills
```

确认没有破坏上游 Claude 插件：

```bash
claude plugin validate . --strict
```

全部命令成功后才提交生成结果。

## 手动同步备用流程

GitHub Action 无法完成合并时，可以在本地处理：

```bash
git fetch upstream main
git switch main
git merge upstream/main

node scripts/build-codex-plugin.mjs
node scripts/build-codex-plugin.mjs --check
node scripts/validate-codex-plugin.mjs
node scripts/test-codex-plugin.mjs
```

处理并验证完成后，再提交和推送到 Fork。发生冲突时只解决本 Fork 新增文件与上游之间的真实冲突，不要重写上游内容。

## GitHub Workflows 状态

查看状态：

```bash
gh workflow list \
  --repo hinson0/matt-skills-claude-codex-plugins \
  --all
```

预期结果：

- `Release`：禁用。它属于上游 changesets 发布流程，不应在 Fork 中执行。
- `Sync upstream and build Codex plugin`：启用，由维护者手动触发。

## 常见问题

### 安装后看不到技能

先确认插件已启用：

```bash
codex plugin list | grep mattpocock-skills
```

然后新建一个 Codex 任务。插件安装发生在旧任务创建之后时，旧任务不会自动刷新技能列表。

### 技能重复出现

通常是项目内仍有 `npx skills` 复制的 `.agents/skills`，同时又安装了插件。检查并只清理 Matt Skills 的旧副本。

### Marketplace 仍指向本地目录

检查来源：

```bash
codex plugin marketplace list --json
```

`hinson0-matt-skills` 的 `sourceType` 应为 `git`，来源应是本 Fork 的 GitHub 地址。

### 同步 Action 失败

优先查看失败日志。常见原因包括：

- 上游两个版本文件不一致。
- 新正式技能没有对应的 `SKILL.md`。
- engineering 和 productivity 出现同名技能，无法平铺。
- Claude 显式调用字段缺少等价的 Codex 策略。
- 上游新增了不被允许的正式技能路径。
- 上游与 Fork 新增文件发生合并冲突。

Action 在验证失败时不会推送半成品。

## 必须保持的约束

- 上游已有文件保持原样。
- `.claude-plugin/plugin.json` 是正式技能清单的唯一来源。
- `plugins/mattpocock-skills/` 是生成目录，不手工修改。
- 只允许记录在 `UPSTREAM.json` 中的兼容转换。
- `package.json.version` 与 Claude plugin version 必须一致。
- Fork 的上游 `Release` workflow 保持禁用。
- 同步失败时先修复原因，不绕过校验器强行发布。
- 安装或更新插件后新建 Codex 任务。
