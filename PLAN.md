# dsh-skill-manager 当前结构

目标版本：DSH Desktop 0.2.0-rc.2。插件不修改 DSH 内置代码。

## Client

- `sidebar.panellist` + `main` keyed slot：侧边栏「技能」及管理页面。
- 页面含技能、MCP、外部服务三个页签；「添加技能」为独立弹窗（来源输入 → 解析候选 → 复选确认 → 完成关闭）。
- 会话 cwd 来自 `ctx.sessions.list.getSnapshot().byId[id].cwd`。
- `conversation.input.left`：工作区面板快捷入口。
- `react-dom` Portal：弹层挂载到 body，实色背景、搜索筛选、高度限制、内部错误边界；添加技能弹窗同样 Portal 到 body。
- DSH locale 词条全部为字符串模板，参数使用 `{name}` 插值。
- 添加技能为来源扫描、候选复选、导入三步，不提供空模板创建。

## Host

- 文件技能扫描：项目 .dsh/.agents、自定义、用户 .dsh/.agents、bundled 根；运行时技能只读展示。
- 全局改名禁用；项目 frontmatter 禁用；全局技能项目覆盖用同名双禁用占位。项目根查找祖先 .git，同一 Git 根内共享文件配置。
- `tools/pre-execute` 对工作区 MCP 调用和被项目占位禁用的 skill 工具加载做拒绝；已有上下文正文不撤回。
- MCP 全局开关使用官方 Plugin Manager Remote，按返回值显示生效/需重启状态。
- 同源 HTTP 路由提供清单、开关、导入 scan/commit。导入器由注册路由生命周期持有，卸载时清理暂存。
- 导入器只复制技能文件，不执行脚本或安装软件；来源/目标路径校验、冲突拒绝、来源快照复检、暂存发布、短期单次 token。

## 真实限制

- 工作区 rename/delete 菜单没有可扩展 item slot；工作区配置入口为输入框齿轮弹层，未向内置菜单注入。
- Host 文件 provider 的 watcher 决定目录失效。没有公共 `ctx.skills.invalidate()`，不伪造工具事件或调用私有失效方法。
- DSH slash 候选按 session 缓存且不监听技能变更；旧候选不是实际可加载能力的证明。页面刷新/新会话触发重新获取，但 Host watcher 完成仍需验证。
- GitHub 只支持公共仓库与明确单段分支；git clone 有超时但无网络字节上限，扫描有文件数/字节/深度限额。
- MCP 添加与服务器软件安装尚未实现，两者需要分离；外部服务为占位。

## 构建与验证

Host ESM 与 browser CJS wrapper 由 esbuild 生成；浏览器 external 为 react、react/jsx-runtime、react-dom、ui-primitives。构建产物不提交到 git。

`npm test` 执行文件自检、客户端契约、真实 React 页面/弹层/词典/导入交互、导入器安全与完整性测试。远程 GitHub 克隆与运行中 DSH 全链路不属于离线测试结论。

源码依据详见 [WORKSPACE-RESEARCH.md](WORKSPACE-RESEARCH.md)、[IMPORT-RESEARCH.md](IMPORT-RESEARCH.md)。
