# dsh-skill-manager

English | [中文](README.zh.md)

Third-party skill manager for DeepSeek Harness Desktop 0.2.0-rc.2.

## Features

- Global file-skill switches; runtime registrations are read-only.
- **Add skill** scans a public GitHub repository URL or an absolute local folder, previews SKILL.md candidates, and imports explicitly checked skills with their complete directories into `<DSH_HOME>/skills`. Existing skills are never overwritten; source scripts are never executed.
- GitHub URLs support `https://github.com/owner/repo` and `/tree/branch` with an unambiguous single-segment ref. Private repositories, subtree URLs and slash-containing refs are unsupported. Git is required for GitHub imports.
- **Workspace settings** tab selects a DSH workspace to manage project skill flags, global-skill project overrides and MCP call-time denial. The composer gear remains available as a shortcut.
- Global MCP enablement uses the official Plugin Manager. MCP creation and external service connections are not implemented.

## Scope and catalog updates

Project roots follow DSH's ancestor `.git` lookup, falling back to cwd. Workspaces under the same Git root share project skill files and overrides.

Project toggles edit `disable-model-invocation` and `user-invocable`. Project overrides create same-named, dual-disabled placeholder skills. Restoration only removes marked placeholders and refuses directories containing additional files. Global toggles rename SKILL.md or flat .md files to/from .disabled.

Host filesystem invalidation refreshes catalogs; existing model sessions can receive replacement catalogs on subsequent steps. Previously loaded conversation content is not withdrawn. DSH 0.2.0-rc.2 independently caches `/` candidates per session without subscribing to skill-file changes. A stale `/` entry is not evidence that the model can still load the skill. Refreshing the page or opening a new session triggers client refetching; verify the actual catalog/call result rather than just switch state.

DSH's workspace rename/delete menu has no plugin item slot. This plugin uses a standalone workspace tab and does not patch built-in menus.

## Install and develop

```bash
git clone https://github.com/Gyanano/dsh-skill-manager.git
cd dsh-skill-manager
npm ci
npm run build
dsh plugin --profile desktop add <absolute checkout path>
```

Restart DSH after installation or Host updates; refresh the page after browser-bundle updates. Build artifacts are not committed and no release tarball is published.

```bash
npx tsc -p tsconfig.json
npm run build
npm test
```

Tests cover file operations, bundle contracts, real React popover/localization/import selection, import preservation, conflicts, paths, junctions, source-change checks and limits. A separate non-installing smoke test successfully scanned the public anthropics/skills repository and found 20 candidates. Complete import/catalog-update behavior inside a running DSH instance is not yet verified end-to-end.

## Import safety

Public HTTPS shallow clones disable credential helpers, hooks and submodules, with no dependency installation or source execution. Scan tokens expire after five minutes; import revalidates source snapshots and publishes via staged directory renames. Defaults: depth 20, 10,000 files/directories, 64 MiB scanned bytes, 60-second clone timeout. The scan-byte limit is not a download limit. Symlinks, junctions, hardlinks and special files are rejected. Conflicting/invalid candidates cannot be selected; commit conflicts reject the entire batch.

Review trusted skill sources: their instructions can direct consequential model actions. Workspace MCP restrictions deny calls without hiding advertised tools; global MCP switches affect the profile.

## Research

- [Import and MCP research](IMPORT-RESEARCH.md): first-party cc-switch sources and DSH MCP configuration.
- [Workspace and cache research](WORKSPACE-RESEARCH.md): menu/API constraints and catalog caching.
- [Architecture](PLAN.md).

## License

[MIT](LICENSE)
