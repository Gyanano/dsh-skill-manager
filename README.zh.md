# dsh-skill-manager

[English](README.md) | 中文

用于 DeepSeek Harness Desktop 0.2.0-rc.2 的第三方技能管理插件。

## 功能

- 「技能」页管理已扫描文件技能的全局启停；内存注册技能只读。
- 「添加技能」打开独立弹窗：输入 GitHub 公共仓库 URL 或本地文件夹绝对路径，解析后列出 SKILL.md 候选，复选需要的技能并确认添加，完成后可关闭弹窗。技能复制完整目录到 `<DSH_HOME>/skills`。不执行脚本，不覆盖现有同名目录或文件技能。
- 仓库 URL 支持 `https://github.com/owner/repo`，或单段明确分支的 `/tree/branch`；不支持私有仓库、子目录 URL、带斜杠的分支。GitHub 导入依赖本机 git。
- 会话输入框齿轮打开当前工作区的项目技能、全局技能覆盖及 MCP 调用门禁面板。
- MCP 全局开关调用官方 Plugin Manager；外部服务和 MCP 添加尚未实现。

## 工作区与生效范围

项目根按 DSH 的规则查找祖先 `.git`，没有则使用 cwd。同一 Git 项目根的多个工作区共享项目技能文件与覆盖。

项目技能切换 `disable-model-invocation`、`user-invocable`。全局技能的项目级禁用写入同名、双禁用的项目占位技能；恢复只删除插件标记的占位文件，目录含其他文件时拒绝删除。全局禁用则改名 SKILL.md 或平铺 .md 为 .disabled。

Host 文件监视器失效后会重新计算技能目录。旧会话的模型目录可在后续步骤更新，但已加载到对话中的正文不会被撤回。DSH 0.2.0-rc.2 的 `/` 候选有独立的 session 缓存，未监听技能文件变更，因此旧 `/` 列表仍显示技能不等于模型仍可加载它。页面刷新或新建会话可触发客户端重新获取；仍应检查实际目录/调用结果，而不是仅看开关或旧候选列表。

官方工作区「重命名/删除」菜单没有插件 item 扩展槽。本插件不修改 DSH 内置菜单，使用独立「工作区设置」页签。

## 安装与开发

```bash
git clone https://github.com/Gyanano/dsh-skill-manager.git
cd dsh-skill-manager
npm ci
npm run build
dsh plugin --profile desktop add <本目录绝对路径>
```

安装或 Host 更新后完整重启 DSH；客户端 bundle 更新后刷新页面。源码仓库不包含构建产物，无已发布 release tarball。

```bash
npx tsc -p tsconfig.json
npm run build
npm test
```

测试覆盖文件操作、客户端契约、真实 React 弹层/词典/导入选择，以及导入文件完整性、冲突、路径、junction、变更复检与限额。额外非安装烟测成功扫描 anthropics/skills 公共 GitHub 仓库，得到 20 个候选。运行中 DSH 的完整导入/目录生效端到端验证尚未完成。

## 导入安全

GitHub 使用无交互公共 HTTPS 浅克隆，关闭凭据助手、钩子和子模块；不安装依赖或执行来源脚本。扫描 token 五分钟有效，提交时复检来源，再以暂存目录和原子改名发布。默认限制扫描深度 20、文件/目录 10,000、读取 64 MiB，克隆超时 60 秒；读取限额不是网络下载限额。拒绝符号链接、junction、hardlink 与特殊文件。同名或无效技能不可选，冲突整批拒绝。

技能内容可能指导模型执行高风险操作，导入前请审核可信来源。MCP 工作区禁用是调用期拒绝，不隐藏工具目录；全局 MCP 开关适用整个 profile。

## 研究依据

- [导入与 MCP](IMPORT-RESEARCH.md)：cc-switch 第一方源码、导入边界与 DSH MCP 配置。
- [工作区与目录缓存](WORKSPACE-RESEARCH.md)：菜单限制、工作区 API、Host 与 `/` 列表更新机制。
- [结构说明](PLAN.md)。

## 许可证

[MIT](LICENSE)
