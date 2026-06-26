# 架构说明

`asset-steward` 是 Cocos Creator 3.8.x 编辑器扩展，由主进程能力和面板 UI 两部分组成。

## 入口

- `package.json` 注册菜单、快捷键、消息和 dockable 面板。
- `main.js` 承载主进程消息方法和胶水逻辑。
- `panel/main.js` 承载面板模板、样式、原始运行状态、事件绑定和跨模块流程；原健康检查中的 7 项能力以独立 Tab 呈现，状态/报告快照、项目维护文案和各模块渲染已下沉到 helper。

## 兼容协议

主进程消息返回仍保留旧字段，例如 `entries`、`summary`、`rules`、`history`。新返回会额外附加：

- `ok: true`
- `protocolVersion: 1`
- `warnings: []`

面板统一通过 `requestMain()` 调用主进程消息。旧结构可以继续工作；后续如果主进程返回 `{ ok: false, error }`，面板会统一转换为异常。

错误返回统一保持：

- `ok: false`
- `protocolVersion: 1`
- `error.code`
- `error.message`
- `error.stack`

`main/protocol.js` 会推断稳定错误大类，例如输入校验、未找到、冲突/失效、权限和外部 Editor/AssetDB 错误。

## 当前模块边界

主进程当前按下面边界拆分：

- `main/protocol.js`：兼容协议和错误码推断。
- `main/path-utils.js`：路径、AssetDB URL、项目内检查。
- `main/profile.js`：profile、日志、历史迁移。
- `main/asset-scan.js`：资源扫描、meta 异常、类型统计。
- `main/reference-graph.js`：UUID 提取、序列化引用、主场景可达图。
- `main/move-plan.js`：移动预览、冲突策略、反向计划、执行历史。
- `main/runtime-resources.js`：resources 动态加载静态检查。
- `main/unused-delete.js`：未引用删除预览、备份、manifest、执行审计。
- `main/health-checks.js`：包体统计、目录规范、重复资源、材质贴图、场景/Prefab 引用健康检查。
- `main/report.js`：Markdown/JSON 会话报告。
- `main/project-maintenance.js`：缓存清理和编辑器刷新/重载策略。

面板当前按下面边界拆分：

- `panel/request.js`：面板消息请求、协议兼容、错误转换。
- `panel/format.js`：格式化、HTML escape、尺寸、日期和状态文案。
- `panel/state.js`：共享状态快照、会话报告快照、当前移动计划状态 helper、结果完整性 helper 和最近结果状态 helper；当前先承接总览、报告导出、执行按钮可用性、执行前阻止文案、确认弹窗文案、执行结果文案、资源扫描结果校验、引用检查结果校验、节点引用结果校验、未引用资源扫描结果校验、resources 动态加载检查结果校验、包体统计结果校验、目录规范结果校验、材质贴图结果校验、重复资源结果校验、场景/Prefab 引用健康结果校验、资源扫描最近结果归一化、自动分类扫描资源列表归一化、运行日志结果归一化、历史详情结果归一化、引用检查最近结果归一化、节点引用最近结果归一化、未引用扫描最近结果归一化、resources 最近结果归一化、包体统计最近结果归一化、目录规范最近结果归一化、材质贴图最近结果归一化、重复资源最近结果归一化和场景/Prefab 引用健康最近结果归一化所需状态。
- `panel/layout.js`：布局预设、Resizable 状态读写和尺寸边界。
- `panel/overview.js`：总览风险、推荐下一步、危险操作和快照模型。
- `panel/tool-panel.js`：独立功能页定义和可见性模型；功能开关同时控制对应 Tab 与页面。
- `panel/project-maintenance.js`：项目缓存清理确认文案、请求 payload、结果摘要和日志详情。
- `panel/health.js`、`panel/history.js`、`panel/unused.js`、`panel/scan.js`、`panel/node-reference.js`、`panel/classify.js`：各功能区摘要和行模型；`panel/classify.js` 也承接自动分类扫描后选中项过滤、全选当前结果、清空选择和单项勾选 helper。
- `panel/render/*`：对应功能区 DOM 渲染、empty 状态和局部按钮回调。

后续继续拆分时，优先保持“纯模型 + render 模块 + `panel/main.js` 流程编排”的边界。

## 测试

项目使用 Node 原生测试：

```bash
npm test
```

当前测试覆盖协议元信息/错误码、移动计划兼容字段、未引用删除备份 hash 和执行审计文件、项目维护、健康检查、面板模型和 DOM 渲染 helper。
