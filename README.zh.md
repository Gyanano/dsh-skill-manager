# dsh-skill-manager

[English](README.md) | 中文

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：在 DSH 侧边栏新增「技能」枢纽，集中管理全部全局 Skill 与 MCP 服务器的启用状态，并支持在会话输入框内按工作区做精细控制。

基于 DSH Desktop `0.2.0-rc.2`（`@deepseek-ai/dsh 0.2.x`）开发并实测。

## 功能

### 侧边栏「技能」面板

- **技能**：列出全部文件技能（用户 / 自定义 / 内置根目录，以及内存注册的运行时技能），每个技能一个开关。启停通过 `SKILL.md` ⇄ `SKILL.md.disabled`（或 `<name>.md` ⇄ `<name>.md.disabled`）改名实现——与官方文件系统 provider 跳过技能的机制完全一致，目录监视器会自动刷新会话目录。
- **MCP 服务器**：列出 profile 中全部 `@deepseek-ai/dsh-mcp-client` 行，每个服务器一个开关；底层走官方 `pluginManager` Remote（`setPluginEnabled`），支持 HMR 热生效与「需重启」状态回报。
- **外部服务**：预留入口。

### 输入框内的工作区精细控制

会话输入框的权限/模式控件旁有一个精简设置图标，点击弹出面向当前工作区的控制面板：

- **本项目技能**：对 `<工作区>/.dsh/skills` 与 `.agents/skills` 下的技能切换官方 frontmatter 键（`disable-model-invocation`、`user-invocable`），只写入本项目文件。
- **全局技能在本工作区**：关闭开关会在 `<工作区>/.dsh/skills` 写入同名占位技能（project 层 rank 更高，且两个调用键均禁用），使该全局技能仅在本工作区对模型目录与用户命令不可见；恢复即删除占位——并通过文件体标记校验，只删除本插件创建的占位文件。
- **MCP 服务器在本工作区**：通过 `tools/pre-execute` 门禁，当会话 cwd 属于被禁工作区时拒绝 `mcp__<server>__*` 工具调用（以及被工作区禁用技能的 `skill` 加载），并向模型返回本地化的拒绝原因。

### 样式

面板完全复用官方「插件」页的几何与设计 token（页头、说明行 + 信息提示、28px 图标刷新按钮、字体排印、列表节奏），观感与官方一致。

## 安装

从源码：

```bash
git clone https://github.com/Gyanano/dsh-skill-manager.git
cd dsh-skill-manager
npm install
npm run build
dsh plugin --profile desktop add <本目录绝对路径>
```

或使用 release tarball。手动安装：在 profile 目录内 `pnpm add "file:<绝对路径>"`，并把 `"dsh-skill-manager"` 追加进 profile `package.json` 的 `dsh.profile.bundles`。

安装后重启 DSH——客户端 bundle 在页面启动时扫描装载。

## 要求

- DeepSeek Harness Desktop `0.2.0-rc.2` 或兼容的 `0.2.x` web 面。
- 零运行时依赖：Host 半仅用 Node 内置模块与注入的 DSH 服务；浏览器 bundle 仅 require `react`、`react/jsx-runtime`、`react-dom` 与 `@deepseek-ai/dsh-client-ui-primitives`。

## 工作原理

- **Host 半**（`lib/index.js`）：以与官方 provider 相同的文件语义扫描五个技能根（project-dsh、project-agents、custom、user-dsh、user-agents、bundled），在 `/plugins/dsh-skill-manager/api/*` 提供 JSON 路由，把工作区覆盖持久化到 `<DSH_HOME>/storages/dsh-skill-manager/state.json`，并安装 `tools/pre-execute` 门禁。
- **Client 半**（`lib/client.js`）：注册 `sidebar.panellist` 入口 + `main` 面板（与官方插件页相同的接缝），以及 `conversation.input.left` 输入框席位。

设计依据与完整的扩展点调研见 [PLAN.md](PLAN.md)。

## 安全说明

- HTTP 路由校验同源、限制请求体大小，且只触及已扫描技能根内的文件。
- 工作区占位仅在标记行存在时才会被删除；真实项目技能只通过 frontmatter 切换，绝不被改名。
- 工作区级 MCP 禁用是调用期强制（工具仍在目录中，调用会被拒绝并给出原因）；全局 MCP 启停经官方管理器作用于整个 profile。

## 开发

```bash
npm install
npm run build   # esbuild → lib/index.js（Host）+ lib/client.js（浏览器 wrapper）
npm test        # 单元自检 + 客户端 bundle 沙箱 + 弹层渲染测试
npx tsc -p tsconfig.json
```

## 许可证

[MIT](LICENSE)
