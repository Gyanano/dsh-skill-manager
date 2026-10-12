# DSH 0.2.0-rc.2 工作区菜单与技能 catalog 研究

## 范围与结论

依据本机发行包的真实注册、消费代码做静态研究，不修改 DSH 或插件产品代码，不将静态推断称为运行验证。工作区 UI 包版本确认为 `0.2.0-rc.2`：[包信息:1–4](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-client-ui-workspace/package.json#L1-L4>)。证据主要来自已提取的发行源码；缺少的 session-controller、workspace-controller、ui-skill 包通过用户指定的本地 [ASAR 读取脚本](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/asar.mjs>)提取至同一临时源码树。当前没有连接 REA 工具，本报告不声称具有 REA Evidence 或浏览器运行证据。

**核心结论：不能通过现有的工作区菜单 item slot，把 composer 齿轮迁入工作区行的“重命名 / 删除”菜单；该菜单没有公开 item slot。** 存在的 `sidebar.workspaces.session.menu.item` 是会话菜单，不是工作区菜单。可在插件自己的技能主面板加工作区选择器，或在会话菜单加入口；两者都不是用户指定位置。整个工作区浏览器可用 single slot shadow 替换，但不是局部菜单扩展，会接管现有浏览器行为。

**技能不是“旧会话永不更新、新会话才生效”。** 模型 catalog 每步检查并可追加完整 replacement；host registry 有可失效缓存；slash UI 则按 sessionId 缓存第一次读取，未订阅技能变更，所以旧会话 slash 可显示已经禁用的技能。

## 1. 实际 slot：注册与消费

### 工作区行菜单

- `ProjectRowItem` 内直接构造 `workspaceMenuItems = [{id:'rename'}, {id:'delete'}]`，交给 `Menu.items`；`onSelect` 对其他 id 直接 return，再调用 `actions.rename/delete`。没有 `renderSlot` 或 contributor 查询：[工作区菜单:1270–1284](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-client-ui-workspace/lib/client.js#L1270-L1284>)、[消费与分派:1314–1327](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-client-ui-workspace/lib/client.js#L1314-L1327>)。
- `sidebar.workspaces` 注册的 children 为 directoryFlow、session.menu.item、session.row.action、session.row.leading/hover 等；没有工作区菜单 item：[注册表:4299–4329](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-client-ui-workspace/lib/client.js#L4299-L4329>)。
- 所以不能猜测 `sidebar.workspaces.workspace.menu.item` 或 `sidebar.workspaces.menu.item` 就存在；未声明名称执行 `slots.register` 会报错：[声明检查:163–165](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-client-ui-slots/lib/index.js#L163-L165>)。`slots.inject` 等待名称并不等于有消费位置。

### 确实存在的会话菜单

`sidebar.workspaces.session.menu.item` 为 `list/root`，注册用 `ctx.slots.inject(name, factory)` 与 `ctx.slots.register({name,id,order,locale,inject}, Component)`。内置 pin/rename/fork/archive 的 order 分别为 100/200/300/400：[声明及内置注册:4306–4359](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-client-ui-workspace/lib/client.js#L4306-L4359>)。消费者向组件传入 `sessionId`、`displayTitle`，并通过 hookContext 提供 menuOpenState：[消费:1646–1668](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-client-ui-workspace/lib/client.js#L1646-L1668>)。技能入口可用 sessionId 查询 cwd，但它会出现在**会话**的三个点菜单，不能对外称为工作区菜单实现。

### composer 与替代入口

`conversation.input.left` 真实声明为 `list/session`：[声明:18293–18319](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-client-ui-conversation/lib/client.js#L18293-L18319>)，消费在 composer 内：[消费:17524](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-client-ui-conversation/lib/client.js#L17524>)。

插件拥有自己的全局技能面板和 composer 控件；工作区选择器可以置于该主面板，不依赖虚构 workspace menu slot。DSH 工作区浏览器容器是 `sidebar.workspaces` single/root：[父声明:503–510](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js#L503-L510>)。注册不同 priority 可 shadow 同一 single slot（较低值渲染），但这是替换整个浏览器，不是向现成菜单加行：[priority 规则:163–172](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-client-ui-slots/lib/index.js#L163-L172>)。DOM/React 私有对象补丁不属于稳定 API，本报告不将其作为受支持扩展方案。

## 2. 工作区选择器可用的真实 API

客户端服务名是 `workspaces`；`ctx.workspaces.list` 为实际 model，而不是 session list：[服务注册:380–391](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-api-workspace-controller/lib/client.js#L380-L391>)。

```ts
ctx.workspaces.list.subscribe(listener): () => void
ctx.workspaces.list.getSnapshot(): {
  items: WorkspaceView[];
  archivedSessionIds: string[];
  pinnedSessionIds: string[];
  state: unknown;
  phase: unknown;
  error: unknown;
}
```

上面的 state/phase/error 用 unknown 仅为省略具体 union，不声称这是原始 TS 类型。真实订阅和 snapshot 构造见[实现:240–267](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-api-workspace-controller/lib/client.js#L240-L267>)。

`WorkspaceView` 实际字段为 `workspaceId, path, title, sessionIds, createdAt, updatedAt`，时间字段为 string；**工作目录字段叫 path，不叫 cwd，也没有 byId**：[生成的类型声明:737–738](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-api-workspace-controller/lib/typert.host.js#L737-L738>)。主面板可 inject `workspaces`，用闭包包装 subscribe/getSnapshot 配合 `useSyncExternalStore`，按 workspaceId 选择项目，将选中 item.path 传给插件 workspace API。不要用仅包含已有会话 cwd 的列表代替完整工作区列表。服务也暴露 create、rename、delete、insertBefore 等命令，但没有工作区菜单 contributor API：[命令:393–415](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-api-workspace-controller/lib/client.js#L393-L415>)。

## 3. 三层 catalog / cache 必须区分

### A. host registry 的候选缓存

`ctx.skills.list` 调用 `snapshot`；`get` 用 winner 的 provider 动态读正文：[接口实现:224–263](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-skill/lib/index.js#L224-L263>)。完整发现结果缓存，key 为 `{cwd, scopes:[scope identities], revision}`，不是 sessionId：[收集缓存:265–295](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-skill/lib/index.js#L265-L295>)、[key:395–400](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-skill/lib/index.js#L395-L400>)。默认上限 128；没有按时间 TTL；不完整发现不缓存。

provider 注册工厂接收 `control.invalidate()`；有效调用清空缓存并提高 revision，发出 host `skills/change`：[provider control:147–156](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-skill/lib/index.js#L147-L156>)、[清空:376–379](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-skill/lib/index.js#L376-L379>)、[host event:402–411](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-skill/lib/index.js#L402-L411>)。它不是已证明存在的浏览器 remote 通知。这里的 `invalidate(): void` 是 `registerProvider(create)` 工厂收到的注册专属 control 能力，不是 `ctx.skills.invalidate()` 公共方法。发行说明也明确失效由 provider 驱动：[公共约定:101–103](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-skill/README.md#L101-L103>)。`skills/change` 是清缓存之后发出的通知，不是 registry 监听的清缓存命令；主动 `ctx.emit('skills/change')` 不能代替 invalidation。不要将编译 JS 内部的 `invalidateCache()` 或直接修改缓存当成公共 API。

filesystem provider 使用 watcher：add/change/unlink 等相关事件排队 invalidate：[watcher:412–469](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-skill-filesystem/lib/index.js#L412-L469>)。默认 watch 为 true，稳定阈值 200ms、轮询间隔 100ms，但不是“保存后200ms必完成”保证：[配置:21–42](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-skill-filesystem/lib/index.js#L21-L42>)。watch 关闭/故障、异步事件窗口内，创建新会话也可能复用 host 旧候选缓存。

### B. 模型看到的 durable session catalog

`tool-skill` 每次 `agent/pre-step` 调用当前 registry snapshot，保留完整发现且可 model invoke 的技能；比较当前条目的 name/description digest 与已发布、当前 surface 可见的消息。变化时生成完整 replacement catalog；空列表也可撤销已发布列表；不完整发现时保留上次状态：[pre-step:203–235](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-tool-skill/lib/index.js#L203-L235>)、[replacement 文案:262–285](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-tool-skill/lib/index.js#L262-L285>)、[history:331–347](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-tool-skill/lib/index.js#L331-L347>)。

因此旧会话可在下一模型步骤更新，并非只在创建时固定。已经进入历史的 skill 正文/结果不会因禁用自动删除；更新列表是取消可用性指导，不是擦除模型已接收知识。模型再次调用 `skill` 时，工具重新 list/get 并检查 modelInvocable：[加载边界:138–150](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-tool-skill/lib/index.js#L138-L150>)。用户手写 `/name` 也重新 get 并检查 userInvocable；不满足则不注入正文：[用户边界:168–200](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-tool-skill/lib/index.js#L168-L200>)。

### C. slash UI 的 sessionId 缓存

`dsh-client-ui-skill` 的闭包维护 `fetches: Map<sessionId, {promise, abort, settled}>`；首次 warm/candidates 请求 `ctx.remote.skills.list({sessionId})`，成功结果保留；后续菜单与 lexicon 都复用：[缓存:321–362](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-client-ui-skill/lib/client.js#L321-L362>)、[菜单/lexicon:379–403](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-client-ui-skill/lib/client.js#L379-L403>)。失败时删除 entry。

真实失效路径只有 agent-preset/selected 对指定 session、connection/reset 清空、source dispose 清空；没有监听 skills/change、文件变化或插件的技能开关，也没有从该插件导出 refresh 方法：[失效:364–373](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-client-ui-skill/lib/client.js#L364-L373>)、[监听与销毁:428–437](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-client-ui-skill/lib/client.js#L428-L437>)。关闭重开 slash 或切回同 session 不能据此保证刷新。页面重载重建客户端闭包可以清除该层缓存，但不清除 host registry。

remote 的 `skills/list` 本身并不读取历史 skill-catalog 消息，也没有本地 session catalog Map：它冷读会话 header.cwd 和 preset，借用 live/preset scope，调用 registry.list 后过滤 userInvocable，返回 metadata：[host API:116–170](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-api-session-controller/lib/types/skill-catalog.js#L116-L170>)。因此 slash catalog 与模型 catalog 的过滤目标也不同。

## 4. 禁用实际行为与路径

filesystem 的项目 root 向祖先寻找 `.git`，找不到返回原 cwd：[DSH root:807–814](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-skill-filesystem/lib/index.js#L807-L814>)。插件的 [root 实现:15–24](<src/paths.ts#L15-L24>)同样如此。因此同 Git root 内不同 workspace path 共享项目技能文件；工作区禁用 stub 不是严格逐 cwd 隔离。

同层优先级为 project-dsh 100、project-agents 200、runtime 250、custom 300、user-dsh 400、user-agents 500、bundled 600：[filesystem ranks:21–25](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-skill-filesystem/lib/index.js#L21-L25>)、[runtime/bundled:20–23](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-skill/lib/index.js#L20-L23>)。agent scope 近层可覆盖全局层，rank只决定同层竞争：[层合并:108–115](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-skill/lib/index.js#L108-L115>)。

有效的项目同名 stub 使用 `disable-model-invocation: true`、`user-invocable: false` 时，**不会先被 provider 跳过再 fallback 全局技能**。provider 照常加入 invocation-neutral candidate：[discoverRoot:581–611](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-skill-filesystem/lib/index.js#L581-L611>)；registry 先挑同名 winner：[winner:312–325](<C:/Users/Lucky/AppData/Local/Temp/dsh-study/src/@deepseek-ai/dsh-skill/lib/index.js#L312-L325>)，消费端才按 invocation filter。invalid frontmatter、错误 root、近 agent scope winner 或缓存未失效则需另外排查，不能归咎于 flags 本身。

| 状态 | host 已完成失效后模型 catalog / 加载 | slash UI |
|---|---|---|
| 新 session，首次读取 | 当前 winner 决定可用性；有效双禁用 stub 不列出且不加载 | 发起首次 remote 请求，userInvocable=false 不列出 |
| 旧 session，已发布 catalog | 下一 pre-step 追加 replacement；再次工具调用重新检查 | 已缓存条目仍可显示，直到客户端失效 |
| 禁用前已加载正文 | 历史正文仍存在，禁用不会擦除 | 与正文历史无关 |
| host watcher尚未失效 | 候选可能仍旧；provider.get 会读当前文件并再查 flags，但 rename/删除或不同winner情形不保证 | 新旧 session 都不能仅凭首次请求保证最新 |

## 5. 可复现的诊断顺序

1. 确认目标 session 的 header.cwd、所选 preset；计算祖先 Git root，检查双禁用 stub 确实落在该 root 的 `.dsh/skills/<name>/SKILL.md`，frontmatter 能解析。不要只看面板显示“禁用”。
2. 在浏览器网络记录中查该 session 的真实 `skills/list` 请求/响应：若重新开 slash 没有请求，就是客户端 fetches 命中。用页面重载清除 client 层后比较同一旧 session 的响应；不要先换 session 混淆变量。
3. 响应仍含技能，排查 host watcher、实际 root、preset scope、文件有效性及同名winner；响应已无技能但旧slash仍显示，排查 client layer。host `skills/change` 不能直接等同浏览器已刷新。
4. 在旧 session 发送真实下一 turn，查看新增的 durable `skill-catalog` replacement，再测试 `/name` 或模型 skill 调用的实际结果。不要将 slash 是否存在当成模型是否能加载的证明。
5. UI迁移应明确区分：主面板工作区 selector 是现有 API 可行方案；工作区“重命名/删除旁技能设置”是当前局部扩展 API 不支持。没有可用替代入口前，不应因误判 slot 而直接撤掉 composer 入口。
