# dsh-skill-manager 方案路线（调研结论）

目标版本：DSH Desktop 0.2.0-rc.2（本机安装，源码位于 `resources/app.asar` 内 `dsh/`）。
参考实现：随桌面版安装的 `dsh-codex`（完整第三方插件 TS 源码，同版本实测可运行）。

## 扩展点（已从 DSH 源码逐包确认）

| 需求 | 扩展点 | 依据 |
|---|---|---|
| 侧边栏「插件/自动化任务」下方新增「技能」 | `sidebar.panellist`（root 作用域 list slot，条目 `{id, order, label}` + 图标组件，组件 props `{size, active}`）+ `main`（root 作用域 keyed slot，key 同 id） | `dsh-client-ui-sidebar/lib/client.js`、`dsh-client-ui-plugin-manager/lib/client.js`（plugins 面板即此写法） |
| 输入框权限设置右侧图标 | `conversation.input.left`（session 作用域 list slot，渲染在 permission/plan 控件之后，即「工作区内修改」下拉右侧的空白区） | `dsh-client-ui-conversation/lib/client.js` L17520-17524、L18309 |
| 全局 Skill 启用管理 | 技能发现来自 `@deepseek-ai/dsh-skill-filesystem`（web 面上由 agent preset 挂载）：目录束 `<name>/SKILL.md` / 平铺 `<name>.md`；`SKILL.md.disabled` / `<name>.md.disabled` 不被识别（官方 provider 只认精确文件名）；目录有 chokidar 监听，改动自动失效刷新 | `dsh-skill-filesystem/README.md` |
| 工作区级 Skill 控制 | 项目根 `<projectRoot>/.dsh/skills`、`.agents/skills` rank 100/200，天然按 cwd 生效：① 本项目技能改 frontmatter（`disable-model-invocation` / `user-invocable`，官方键）；② 全局技能在本工作区禁用 = 在 `<cwd>/.dsh/skills/<name>/SKILL.md` 写同名占位技能（project 层 rank 更高，胜出同名全局技能），frontmatter 同时置两个禁用键 → 模型目录与用户命令均不可见；恢复 = 删除占位（仅删除带本插件标记的文件）。注册表分层为 host+preset 层，第三方 host 层 provider 无法压制 preset 层同名技能，故不用 provider 方案 | `dsh-skill/README.md`+`lib/index.js`（collect 逐层 merge，后者覆盖）、`dsh-web-app/cordis.patch.yml`（base `skill-filesystem` 行禁用、preset 内挂载） |
| MCP 管理 | MCP server 即 Loader 行（`name: '@deepseek-ai/dsh-mcp-client'`，每 server 一行）。全局开关走官方 `pluginManager` Remote：`listPlugins()` 过滤 moduleName，`setPluginEnabled(entryId, enabled)`（写 profile cordis.patch.yml disabled 覆盖，HMR 热生效）；工作区级禁用 = `tools/pre-execute` waterfall 门禁（返回 `{kind:'deny', reason}`，`exec.agent.session.header.cwd` 定位工作区，拦截 `mcp__<server>__*` 与 `skill` 工具调用） | `dsh-plugin-manager/README.md`+typert.host.js、`dsh-tools/README.md` L85、`dsh-workspace-changes/lib/index.js` L1095 |
| 外部服务连接 | 预留 Tab，显示「暂未支持」 | 用户说明（暂时没有） |
| Host↔Client 通信 | HTTP 精确路由 `ctx.webServer.register({kind:'exact', path:'/plugins/dsh-skill-manager/...', handler})`，浏览器直接同源 fetch（dsh-codex 同款，免 Typert 描述符） | `dsh-codex/src/auth-routes.ts` L874 |
| 打包加载 | `package.json` `dsh.bundle.patch` → cordis.patch.yml（必须用 `insert:` 块新增行）；`dsh.client{platform:'web', inject:[...]}` + `exports['./client']='./lib/client.js'`；client 产物需 `window.__ModuleLoader__.load({id:<包名>, factory:(require)=>{...}})` 包裹，external 仅 `react`、`react/jsx-runtime`、`@deepseek-ai/dsh-client-ui-primitives`（基线表/组合内 row 均可 require） | `dsh-client-modules/README.md`+lib、`dsh-codex/package.json`+`lib/client.js` |
| 安装 | `dsh plugin --profile desktop add <目录或tgz>`（CLI 实测存在，v0.2.0-rc.2），或 profile 内 `pnpm add file:` + `dsh.profile.bundles` 追加；重启后生效 | 官方 README、本机 profile |

## 交付形态

- Host 半（lib/index.js）：技能清单扫描（五大根 + 自定义目录 + bundled，含 .disabled 识别与 frontmatter 解析）、全局开关（.disabled 改名）、工作区开关（frontmatter / 占位技能）、状态存储（`~/.dsh/storages/dsh-skill-manager/state.json`，原子写）、HTTP 路由、`tools/pre-execute` 工作区门禁。
- Client 半（lib/client.js）：侧边栏「技能」入口 + 全局面板（技能 / MCP / 外部服务三 Tab）+ 输入框精简设置图标 + 工作区弹层（本项目技能开关、全局技能本工作区开关、MCP 全局/本工作区开关）。
- 零第三方运行时依赖：Host 仅 node 内置模块 + 注入服务；Client 仅 react(+jsx-runtime) 与 ui-primitives。

## 已排除的阻塞项

1. GitHub/raw 域名 DNS 污染 → 改用本机 app.asar 内源码 + 已安装插件源码调研，全部结论来自同版本实现。
2. preset 层技能目录无法被 host 层 provider 压制 → 采用「占位同名技能」文件方案（纯官方语义）。
3. MCP 无 workspace 级配置层 → 采用 pre-execute 调用门禁（全局开关仍走官方 pluginManager）。
4. esbuild 等构建工具本机无 → npm 双源（npmmirror/npmjs）实测可达，本地安装。
5. 客户端模块图：inject 行仅保证到达顺序；require 解析 = 种子表 → 已注册工厂，primitives 为组合内 row 可直接 require。
6. 会话 cwd：client 侧 `ctx.sessions.list.getSnapshot().byId[id].cwd`；host 侧 `exec.agent.session.header.cwd`；二者与工作区路径做规范化匹配（win32 大小写折叠）。
