# Skills 导入与 DSH MCP 机制调研

调研时间：2026-10-13（Asia/Shanghai）。仅研究，未修改产品源码，未安装/执行任何技能或 MCP，未读取用户配置、环境变量值、凭据文件或认证信息。按要求加载 research skill；本次不再委派。

## 证据范围

- cc-switch 第一方仓库：[farion1231/cc-switch](https://github.com/farion1231/cc-switch)，使用 `git ls-remote` 与浅克隆取得当前 HEAD `90fb37ffb76bf06f2d021cd020b7f677216e916c`。以下源码 URL 固定此提交。研究副本位于本地 Temp，不属于产品源码。
- DSH 依据用户指定的 extracted artifacts；MCP 包版本为 `0.2.0-rc.2`，其 manifest 指向第一方仓库 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，目录 `packages/mcp/mcp-client`。证据：[package.json:1–15](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-mcp-client/package.json#L1-L15>)。
- 浏览抓取 GitHub 被工具的非公网 DNS 检查拒绝，git HTTPS 获取成功。未将网络限制解释成仓库不存在。给定 app.asar 虚拟 checkout 下的 docs 路径不可直接访问；本报告不声称阅读该路径的文档。DSH 引用以实际读到的第一方包 README 与发布 JS 为准，不将 README 中指向但未读取的 TS 文件当作验证证据。

## 一、cc-switch 的当前实现

### 1. GitHub 技能发现

`discover_available_skills` 从数据库取得仓库配置，调用 `discover_available_report`。只扫描 enabled 仓库，`join_all` 并行获取；逐仓库收集 failure，不因单仓库失败丢掉其他结果；最后去重、按名称小写排序。

证据：[commands/skill.rs:120–132](https://github.com/farion1231/cc-switch/blob/90fb37ffb76bf06f2d021cd020b7f677216e916c/src-tauri/src/commands/skill.rs#L120-L132)、[services/skill.rs:2913–2945](https://github.com/farion1231/cc-switch/blob/90fb37ffb76bf06f2d021cd020b7f677216e916c/src-tauri/src/services/skill.rs#L2913-L2945)。

这不是 GitHub Search API 全站搜索：每仓库下载 ZIP，在临时目录递归寻找 `SKILL.md`。某目录发现 `SKILL.md` 后立即返回，不继续寻找它的子目录技能；根目录技能以 repo.name 作为 directory，嵌套技能以相对路径表示。元数据来自 YAML frontmatter 的 name/description，解析失败回退空元数据；展示 key 为 `owner/repo:directory`。

证据：[services/skill.rs:3015–3125](https://github.com/farion1231/cc-switch/blob/90fb37ffb76bf06f2d021cd020b7f677216e916c/src-tauri/src/services/skill.rs#L3015-L3125)。

下载使用 `https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip`；优先配置分支（非空且非 HEAD），再 main/master，记录实际成功分支。扫描与安装的下载都有 60 秒外层 timeout。失败分支清理临时目录，TempDir 守卫保障释放。

证据：[services/skill.rs:3529–3577](https://github.com/farion1231/cc-switch/blob/90fb37ffb76bf06f2d021cd020b7f677216e916c/src-tauri/src/services/skill.rs#L3529-L3577)、[3015–3025](https://github.com/farion1231/cc-switch/blob/90fb37ffb76bf06f2d021cd020b7f677216e916c/src-tauri/src/services/skill.rs#L3015-L3025)。

### 2. 本地扫描

`scan_unmanaged` 在应用 skills 目录、`~/.agents/skills` 与 SSOT 扫描直接子目录：排除非目录、点开头目录、已被数据库管理的 directory、无 `SKILL.md` 的目录；读不到的根目录跳过。按目录名合并多来源，保留第一来源 path 与汇总 foundIn。它不是任意文件夹递归扫描。

SSOT 当前可选择 cc-switch 配置目录下 skills，或 `~/.agents/skills`。应用目录支持 override，否则使用 Claude/Codex/Gemini/OpenCode 等各自标准路径。

证据：[services/skill.rs:2131–2189](https://github.com/farion1231/cc-switch/blob/90fb37ffb76bf06f2d021cd020b7f677216e916c/src-tauri/src/services/skill.rs#L2131-L2189)、[630–708](https://github.com/farion1231/cc-switch/blob/90fb37ffb76bf06f2d021cd020b7f677216e916c/src-tauri/src/services/skill.rs#L630-L708)。

### 3. 多选导入与安装必须区分

本地 `SkillImportDialog` 使用 `Set<directory>` 管理多选，默认全部选中，支持名称/目录/来源搜索、全选、清空；筛选只影响可见列表，全选仍选全部 skills。提交生成 `ImportSkillSelection[]`，每项含 directory 与目标应用布尔集合；导入中禁用提交/取消并阻止关闭，空选择不可提交。默认应用来自发现来源，额外手选应用应用于所有选中技能。

证据：[SkillImportDialog.tsx:29–107](https://github.com/farion1231/cc-switch/blob/90fb37ffb76bf06f2d021cd020b7f677216e916c/src/components/skills/SkillImportDialog.tsx#L29-L107)、[139–157](https://github.com/farion1231/cc-switch/blob/90fb37ffb76bf06f2d021cd020b7f677216e916c/src/components/skills/SkillImportDialog.tsx#L139-L157)、[243–261](https://github.com/farion1231/cc-switch/blob/90fb37ffb76bf06f2d021cd020b7f677216e916c/src/components/skills/SkillImportDialog.tsx#L243-L261)。

后端 `import_from_apps` 持写锁，逐项校验 directory，然后在可信候选根中重新寻找来源，不使用客户端任意 path；找不到或无 `SKILL.md` 跳过；目标不存在才复制 SSOT；为勾选但尚不存在的应用投影，投影失败撤销对应启用标志。当前是循环处理，不应宣传整批全有或全无事务；同名不同源合并且取首来源，也不是可靠的内容冲突选择模型。

证据：[commands/skill.rs:109–116](https://github.com/farion1231/cc-switch/blob/90fb37ffb76bf06f2d021cd020b7f677216e916c/src-tauri/src/commands/skill.rs#L109-L116)、[services/skill.rs:2195–2350](https://github.com/farion1231/cc-switch/blob/90fb37ffb76bf06f2d021cd020b7f677216e916c/src-tauri/src/services/skill.rs#L2195-L2350)。

GitHub 发现页当前 `handleInstall(row)` 是逐技能安装，维护 installing/failed 的逐 key 状态；`installTo` 处理该技能的多个应用目标。已检查的此入口不是 GitHub 技能列表多选批量导入。借鉴时应明确：本地多选 UI 已有可参考实现，GitHub 批量能力需要我们自己设计。

证据：[SkillsPage.tsx:355–401](https://github.com/farion1231/cc-switch/blob/90fb37ffb76bf06f2d021cd020b7f677216e916c/src/components/skills/SkillsPage.tsx#L355-L401)。

### 4. 已确认的安全措施与边界

- 技能源路径必须是安全相对路径；安装目录取末段并清洗；下载源 canonicalize 后检查包含在临时根内。网络前后分别获取写锁并复查已有安装，避免下载期间的并发状态变化。证据：[services/skill.rs:847–992](https://github.com/farion1231/cc-switch/blob/90fb37ffb76bf06f2d021cd020b7f677216e916c/src-tauri/src/services/skill.rs#L847-L992)。
- 下载按实际 chunk 累积限制压缩体 128 MiB；归档条目上限 30,000、落盘总预算 512 MiB、symlink 目标读取上限 4 KiB。不是只信 Content-Length/声明的解压 size。证据：[常量:386–402](https://github.com/farion1231/cc-switch/blob/90fb37ffb76bf06f2d021cd020b7f677216e916c/src-tauri/src/services/skill.rs#L386-L402)、[3581–3636](https://github.com/farion1231/cc-switch/blob/90fb37ffb76bf06f2d021cd020b7f677216e916c/src-tauri/src/services/skill.rs#L3581-L3636)。
- ZIP 使用 `enclosed_name()`，剥归档根后再拒绝 ParentDir，防止一级 `..` 在 strip_prefix 后逃出目标。普通文件/目录与 symlink 物化共用预算。证据：[3737–3807](https://github.com/farion1231/cc-switch/blob/90fb37ffb76bf06f2d021cd020b7f677216e916c/src-tauri/src/services/skill.rs#L3737-L3807)。
- ZIP symlink 不直接创建真实链接：解析目标、canonicalize，拒绝根外目标、拒绝目标包含链接自身，再复制内容并计入预算。证据：[4025–4105](https://github.com/farion1231/cc-switch/blob/90fb37ffb76bf06f2d021cd020b7f677216e916c/src-tauri/src/services/skill.rs#L4025-L4105)。
- 这些属于文件路径与资源防护，不等于审核技能文本、脚本可信或扫描恶意指令。已读导入链路没有足够证据证明本地来源内部 symlink、全局并发数量、技能正文长度都有同等级安全上限；不可把 ZIP 防护推断为本地复制防护。

## 二、DSH MCP 添加配置与“安装”的不同含义

### 1. 添加一个 MCP 就是添加一个插件配置实例

第一方 README 明确：每台服务器一条 `@deepseek-ai/dsh-mcp-client` 配置；无默认启用服务器。插件 exports 为 Config/apply，运行时每实例连接一个服务器，使用 Cordis 生命周期/HMR 释放旧连接与工具再加载。不是把 Claude `mcpServers` JSON 原封不动存入 DSH 即可。

证据：[README.zh.md:12、28–71](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-mcp-client/README.zh.md#L28-L71>)、[lib/index.js:745–835](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-mcp-client/lib/index.js#L745-L835>)。

可生成的无凭据最小配置示例（仅展示，不执行）：

```yaml
- id: mcp-example
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: example
    transport: stdio
    command: '<用户确认的可执行文件>'
    args: []
```

配置 schema 当前只包含两类：

| 类型 | 配置字段 |
|---|---|
| stdio | serverName、command 必填；args 默认 []，env 默认 {}，cwd 默认空串 |
| streamable-http | serverName、url 必填；headers 默认 {} |
| 共同 | toolCallTimeoutMs 默认 60000；failOnStartupError 默认 false；maxInstructionBytes 默认 32768；reconnect |

serverName 格式 `[A-Za-z0-9_-]{1,32}`；同一注册作用域重名会失败。未确认 legacy SSE transport 支持，当前 union 没有该分支。证据：[lib/index.js:760–832](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-mcp-client/lib/index.js#L760-L832>)。

stdio transport 将 command/args/cwd 交给 MCP SDK；父环境先 scrub，再合并显式 env。README 描述 scrub 删除匹配 `/KEY|PASSWORD|SECRET|TOKEN/i` 与 `DSH_*` 的环境名称。Streamable HTTP 以 URL 与 headers 建传输。stdio 协商可能启动临时探测进程，然后实际服务进程，不能将“测试连接”认为无执行副作用。

证据：[lib/index.js:12–47](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-mcp-client/lib/index.js#L12-L47>)、[README.zh.md:28、136–138](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-mcp-client/README.zh.md#L136-L138>)。

### 2. MCP 运行安全与状态

工具公开名称为 `mcp__<serverName>__<rawName>`，有损规范化时追加身份 hash；远端原始名字仅用于 wire call。同一服务器重复工具或注册冲突被拒绝；发现失败保留旧一代，注册冲突撤销尝试中的新一代，不产生部分新工具。插件等待初始 connect 与 discovery；非严格启动失败不阻断插件激活，所以“配置保存成功”不等于“工具可用”。

证据：[lib/index.js:96–160](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-mcp-client/lib/index.js#L96-L160>)、[809–832](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-mcp-client/lib/index.js#L809-L832>)。

服务器 instructions 带服务器归属、字节上限，并以 `interpolate: false` 字面加入 systemPrompt；这不是恶意提示词过滤。重连默认启用、500 ms 初始、30 秒封顶、10 次预算；释放等待关闭与同步，不能确认旧进程关闭时停止重连以避免重叠进程。

证据：[lib/index.js:433–441](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-mcp-client/lib/index.js#L433-L441>)、[534–582](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-mcp-client/lib/index.js#L534-L582>)、[654–674](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-mcp-client/lib/index.js#L654-L674>)、[731–742](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-mcp-client/lib/index.js#L731-L742>)。

### 3. 三种安装不可混同

1. **添加 MCP 配置**：写入一条 MCP client 实例，激活时启动本地程序或访问远端端点。
2. **安装 MCP server 可执行程序**：可能由用户预先安装，或 command 为 npx/uvx 等启动器在运行时获取。README 的 npx 示例表明这可能带网络与代码执行；不是 MCP client 自己提供的一套软件包安装协议。
3. **安装 DSH bundle**：Plugin Manager 的 `installBundle` 执行 pnpm add，检查安装目标唯一、manifest 声明 `dsh.bundle`、patch 可加载及 DSH peer 兼容，再更新选择并应用。普通 npm MCP server 或仅桥接的 MCP client 包未必声明 bundle，不能盲目交给此 API。

证据：[MCP README:34–53](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-mcp-client/README.zh.md#L34-L53>)、[Plugin Manager lib/index.js:1691–1789](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-plugin-manager/lib/index.js#L1691-L1789>)。

Plugin Manager 当前机制：

- inspect 安装前识别 registry/local/git/tarball；GitHub 安装前 git ls-remote 连接检查默认 5 秒，禁用认证提示/助手；私有 registry 不自动泄漏到公共 fallback。
- requestId 提供日志、状态、取消；失败/取消/非 bundle 恢复 manifest 与 lockfile，已下载文件、已批准脚本副作用可能保留，不能宣称全盘回滚。
- 依赖 build scripts 独立批准，approvedBuilds 只允许当前待决定的包名；授权持久化且允许宿主用户权限执行。工具管理改动要求 danger-full-access 或逐调用批准；已安装 Host 插件不受工作区沙箱隔离。
- HMR 启用时 profile 改动即时生效，否则 restart-required；profile 级操作影响所有使用该 profile 的会话。

证据：[Plugin Manager README.zh.md:31–63](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-plugin-manager/README.zh.md#L31-L63>)、[92–94](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-plugin-manager/README.zh.md#L92-L94>)、[129–150](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-plugin-manager/README.zh.md#L129-L150>)。

已检查的 UI settings/Plugin Manager/Cordis 包没有搜索到专门的 MCP 添加 API；这只描述检查范围，不能断言全 DSH 无此功能。现有 bundle 管理 API 不能被当成任意 MCP entry 编辑 API。实际 profile 写入/重组接入点仍需实施前验证，不应靠猜测私有远程方法落地。

## 三、可实施建议（方案，不是现有能力声明）

### 技能导入

1. 分离 `discover → preview → import`。本地与 GitHub 统一候选结构：sourceType、sourceId、repository/ref/path 或可信 rootId/relativePath、名称、描述、内容摘要、冲突状态；显示来源及将写入的目标，默认不覆盖。
2. 多选借鉴 cc-switch 的 Set 与状态锁；明确“全选当前结果”还是“全选全部候选”，显示隐藏但已选数量。GitHub batch 自行增加，不复制单技能 handler 后声称已有批量。
3. GitHub 输入只允许明确 owner/repo/ref/path，避免 arbitrary URL SSRF；批量每仓库只下载一次，固定 commit SHA 后扫描与导入共享同一临时快照，避免分支在预览与确认之间变化。限制并发（例如 3）、网络 timeout、条目数、下载/解压/元数据大小、深度；预算应按整批而非仅单包计量。
4. 本地扫描仅访问用户明确选择的 skills 根；不扫 home 全树，不解析 credential/env 文件。不要按 basename 合并不同内容：按来源身份保留候选，hash 相同才能合并，冲突让用户选择。
5. Host 二次解析 candidateId，拒绝任意前端绝对 path；revalidate realpath containment 与源摘要，拒绝 symlink/junction/reparse-point 逃逸或默认不跟随。目标使用临时 sibling 写入再原子 rename，明确已有内容采用跳过/改名/确认替换；只导入数据，不执行 scripts。
6. 批量返回每项 imported/skipped/conflict/failed/cancelled 与实际目标路径，允许重试失败项。做清理与恢复测试：Zip Slip、Windows drive/UNC、zip bomb、symlink/junction、同名内容冲突、权限失败、取消中断、并发导入、源在确认前变更。

### MCP 导入/添加

1. 单独做 MCP 配置适配层：JSON `mcpServers` → DSH 每服务器一 entry；仅白名单映射 stdio 或 streamable-http，未知 transport/字段给明确诊断。校验 namespace 唯一、命令/参数类型、URL scheme、entryId 冲突，不自动启用未知来源。
2. 导入前展示 command/args/cwd 或 endpoint、影响范围、是否运行 npx/uvx、是否会执行/下载外部代码；“保存配置”“测试连接”“安装程序/组合包”三个操作分开授权，测试也有进程和网络副作用。
3. 不自动读取实际 env/header 值；预览只展示敏感字段名称/占位符。凭据由用户在专门表单或已有 secret reference 机制填写，不写入研究文档、日志、toast、导出的候选或模型上下文；不从 GitHub 配置执行 YAML `!!js` 或其他表达式。
4. profile 写入需确定正式 API、锁与 HMR 机制，保留无关 YAML 字段、备份可恢复、原子写入；不绕过 Plugin Manager 的审批/compatibility/build-script 机制。若 UI 内尚无正式 entry mutation API，先界定小型 Host adapter，而非伪造调用。
5. 状态分 saved、connecting、ready、degraded、restart-required；用真实 discovery 结果判断可用，保持 serverName 稳定以保存历史与权限规则。bundle 安装与 MCP server 启动分别处理错误，不能用“pnpm 成功”代表 MCP ready。

## 结论

可直接借鉴 cc-switch 的“指定仓库 ZIP → SKILL.md 扫描”、本地未管理技能多选、后端重校验、归档路径/预算防护与逐项错误模型；不能据此宣称其 GitHub 已有多选批量，或本地复制具备 ZIP 的全部防护。DSH MCP 是每服务器桥接实例；配置写入、server 程序获取、DSH bundle 安装是三条不同链路。产品落地应先完成安全预览与技能数据导入，再独立接入具有明确授权和凭据边界的 MCP 配置能力。
