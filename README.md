# dsh-skill-manager

English | [中文](README.zh.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that adds a **Skills** hub to the DSH sidebar: enable/disable every global Skill and MCP server, and fine-tune both per workspace from the session composer.

Built and tested against DSH Desktop `0.2.0-rc.2` (`@deepseek-ai/dsh 0.2.x`).

## Features

### Sidebar Skills panel

- **Skills** — every file-based skill (user / custom / bundled roots, plus in-memory runtime registrations) with one switch per skill. Toggling renames `SKILL.md` ⇄ `SKILL.md.disabled` (or `<name>.md` ⇄ `<name>.md.disabled`), the exact mechanism the built-in filesystem provider uses to skip a skill; the directory watcher refreshes session catalogs automatically.
- **MCP servers** — every `@deepseek-ai/dsh-mcp-client` entry in the profile with one switch per server, backed by the official `pluginManager` Remote (`setPluginEnabled`), including HMR live-apply / restart-required reporting.
- **External services** — reserved placeholder.

### Per-workspace controls in the composer

A compact settings icon next to the permission/plan controls in the session composer opens a popover scoped to the current workspace:

- **Project skills** — toggle frontmatter keys (`disable-model-invocation`, `user-invocable`) on skills under `<workspace>/.dsh/skills` and `.agents/skills`. Writes only touch project files.
- **Global skills in this workspace** — dropping the switch writes a same-named placeholder skill into `<workspace>/.dsh/skills` (project rank outranks user roots; both invocation keys disabled), which hides the global skill from model catalogs and user commands in this workspace only. Restoring removes the placeholder — and only the placeholder, verified by a plugin-owned marker in the file body.
- **MCP servers in this workspace** — a `tools/pre-execute` gate denies tool calls of `mcp__<server>__*` (and `skill` loads of workspace-disabled skills) while the session's cwd belongs to a disabled workspace, with a localized denial reason for the model.

### Styling

The panel mirrors the official Plugins page geometry and tokens (page head, intro with info tooltip, 28px icon refresh button, typography, list rhythm) so it reads as a first-party surface.

## Install

From a checkout:

```bash
git clone https://github.com/Gyanano/dsh-skill-manager.git
cd dsh-skill-manager
npm install
npm run build
dsh plugin --profile desktop add <absolute path to this folder>
```

Or point the CLI at a release tarball. Manual installation: inside the profile directory run `pnpm add "file:<absolute path>"` and append `"dsh-skill-manager"` to `dsh.profile.bundles` in the profile's `package.json`.

Restart DSH afterwards — client bundles are scanned when the page boots.

## Requirements

- DeepSeek Harness Desktop `0.2.0-rc.2` or a compatible `0.2.x` web surface.
- No runtime package dependencies: the Host half uses only Node built-ins plus injected DSH services; the browser bundle requires only `react`, `react/jsx-runtime`, `react-dom`, and `@deepseek-ai/dsh-client-ui-primitives`.

## How it works

- **Host half** (`lib/index.js`): scans the five skill roots (project-dsh, project-agents, custom, user-dsh, user-agents, bundled) with the same file semantics as the official provider, serves JSON routes under `/plugins/dsh-skill-manager/api/*`, persists workspace overrides under `<DSH_HOME>/storages/dsh-skill-manager/state.json`, and installs the `tools/pre-execute` gate.
- **Client half** (`lib/client.js`): registers the `sidebar.panellist` entry + `main` panel (the same seams the official Plugins page uses), and the `conversation.input.left` composer seat.

Design notes and the full extension-point research live in [PLAN.md](PLAN.md).

## Security notes

- The HTTP routes validate same-origin, cap body size, and only touch files inside the scanned skill roots.
- Workspace placeholders are only deleted when the marker line is present; real project skills are toggled through their frontmatter, never renamed.
- Workspace MCP denial is call-time enforcement (the tools stay advertised; calls are refused with a reason). Global MCP enablement is profile-wide through the official manager.

## Development

```bash
npm install
npm run build   # esbuild → lib/index.js (host) + lib/client.js (browser wrapper)
npm test        # unit selftest + client bundle sandbox + popover render harness
npx tsc -p tsconfig.json
```

## License

[MIT](LICENSE)
