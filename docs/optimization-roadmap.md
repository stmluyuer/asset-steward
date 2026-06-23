# 优化路线图

本文档记录 `asset-steward` 后续还需要做哪些优化，以及当前优化到什么程度。更新时间：2026-06-23。

## 当前结论

当前处于 **第一轮兼容式工程化优化已完成** 的阶段。

这一轮已经完成：

- 主进程返回增加兼容协议元信息：`ok`、`protocolVersion`、`warnings`。
- 面板消息调用收敛到 `requestMain()`，兼容旧返回结构，并为后续 `{ ok: false, error }` 做好入口。
- 新执行的移动历史会持久化失败移动明细和清理失败目录明细。
- 未引用删除备份 manifest 记录 SHA-256，并在执行后写入 `execution-result.json`。
- 新增 Node 原生测试，覆盖协议、移动计划、删除备份和执行审计。
- 新增 `docs/architecture.md` 和 `docs/safety.md`，README 增加维护入口。
- 主进程消息出口增加兼容错误协议包装，错误返回 `{ ok: false, error }`，面板仍通过 `requestMain()` 转成异常展示。
- 增加旧 `project-asset-mover` profile/log 兼容读取测试。
- 增加报告导出 token 过滤测试，主进程会递归移除报告快照里的 `token` 字段。
- 拆出 `panel/request.js` 和 `panel/format.js`，面板请求兼容转换与格式化工具已从大面板文件中分离。
- 拆出 `main/path-utils.js`、`main/profile.js` 和 `main/move-plan.js`，路径工具、profile/log 读写、移动预览和执行已从 `main.js` 中分离。
- 拆出 `main/asset-scan.js`、`main/reference-graph.js` 和 `main/runtime-resources.js`，资源扫描、UUID 引用图和 resources 动态加载静态检查已模块化。
- 拆出 `main/unused-delete.js` 和 `main/report.js`，未引用删除预览/备份/审计与会话报告导出已模块化。
- 拆出 `main/health-checks.js`，包体统计、目录规范、重复资源、材质贴图和场景/Prefab 引用健康检查已模块化。
- 新增面板内 Resizable 分栏第一版，资源扫描、引用检查、自动分类、节点引用、resources 检查和重复资源检查的左右区域可拖拽调整宽度。

还没有完成：

- 面板大文件拆分。
- 所有模块的系统性测试覆盖。
- 完整统一的新协议错误返回。
- 面板内 Resizable 分栏仍需继续覆盖更多区域和完善布局预设。
- UI 总览面板、风险聚合和布局预设。

## 优化状态总览

| 优化方向 | 当前状态 | 完成度 | 当前证据 | 后续目标 |
| --- | --- | ---: | --- | --- |
| 兼容 IPC 协议 | 已完成错误返回入口 | 80% | `main/protocol.js`、`toProtocol()`、`withProtocol()`、`requestMain()` | 继续细化不同错误码 |
| 面板请求收敛 | 已拆出请求模块 | 80% | `panel/request.js`、`requestMain()`、`createAssetStewardError()` | 继续统一 loading、错误提示和日志 |
| 危险操作审计 | 已完成第一版 | 65% | 移动失败明细持久化、删除备份 hash、`execution-result.json` | 增加恢复辅助入口、备份校验入口、审计报告聚合 |
| 自动化测试 | 已覆盖阶段 1 收尾项和主进程模块拆分关键路径 | 50% | `npm.cmd test` 通过 15 个测试 | 覆盖更多扫描、引用图、resources 检查和历史迁移边界 |
| 文档收敛 | 已完成起步 | 45% | `docs/architecture.md`、`docs/safety.md`、本文档 | 从 `FEATURES.md` 拆出 roadmap、用户手册、开发手册 |
| 主进程模块拆分 | 已完成核心扫描、移动、删除审计、报告与健康检查拆分 | 85% | `main/path-utils.js`、`main/profile.js`、`main/move-plan.js`、`main/asset-scan.js`、`main/reference-graph.js`、`main/runtime-resources.js`、`main/unused-delete.js`、`main/report.js`、`main/health-checks.js` | 后续按需要继续拆工具箱元信息或入口胶水 |
| 面板模块拆分 | 已完成基础工具拆分 | 15% | `panel/request.js`、`panel/format.js`；`panel/main.js` 仍承载模板、样式、状态和渲染 | 按 Tab 或模块拆分状态、渲染、事件绑定 |
| UI 风险总览 | 未开始 | 0% | 各 Tab 结果仍分散展示 | 增加全局风险摘要、推荐下一步、最近执行状态 |
| 面板内 Resizable 分栏 | 已完成第一版 | 25% | `panel/main.js`：多个双栏区域插入拖拽分隔条，并用本地布局保存左侧宽度 | 继续覆盖三栏区域、垂直分隔和布局预设 |
| 性能与大项目体验 | 未开始 | 0% | 扫描仍是同步文件遍历为主 | 增量扫描、进度反馈、取消任务、缓存 UUID 图 |

## 建议阶段

### 阶段 1：兼容式工程化收尾

目标：不改变用户工作流，继续提升可维护性和可验证性。

已完成：

- 兼容协议元信息。
- 面板请求入口收敛。
- 基础审计持久化。
- 起步测试。

建议补齐：

- 已完成：为主进程错误补 `compatibleError()` 包装，但保持旧面板仍能通过异常捕获显示错误。
- 已完成：增加历史迁移测试，覆盖旧 `project-asset-mover` profile/log 的兼容读取。
- 已完成：增加报告导出测试，确认执行 token 不会写入报告。
- 已完成：增加 `panel/request.js`，把 `requestMain()` 从大面板文件中拆出。
- 已完成：增加 `panel/format.js`，把面板格式化、HTML escape、尺寸、日期等工具函数从大面板文件中拆出。

验收标准：

- `node --check main.js`
- `node --check panel/main.js`
- `node --check main/protocol.js`
- `npm.cmd test`

### 阶段 2：主进程模块拆分

目标：降低 `main.js` 的维护成本，让核心逻辑可以独立测试。

建议拆分：

- 已完成：`main/path-utils.js`：路径、AssetDB URL、项目路径、文件状态。
- 已完成：`main/profile.js`：profile、日志、历史迁移。
- 已完成：`main/asset-scan.js`：资源扫描、meta 异常、类型统计。
- 已完成：`main/reference-graph.js`：UUID 提取、序列化资源引用、主场景可达图。
- 已完成：`main/runtime-resources.js`：`resources.load/loadDir` 静态检查。
- 已完成：`main/move-plan.js`：移动预览、冲突策略、反向计划、执行。
- 已完成：`main/unused-delete.js`：未引用删除预览、备份、manifest、执行审计。
- 已完成：`main/report.js`：Markdown/JSON 报告。
- 已完成：`main/health-checks.js`：包体统计、目录规范、重复资源、材质贴图和场景/Prefab 引用健康检查。

验收标准：

- 外部消息名不变。
- 面板旧字段读取不变。
- `_test` 或新测试入口覆盖拆出的纯函数。
- 拆分前后 `npm.cmd test` 通过。

### 阶段 3：面板模块拆分

目标：让 UI 可以安全演进为面板内可拖拽调整大小的分栏布局。

建议拆分：

- `panel/request.js`：消息请求和错误转换。
- `panel/state.js`：共享状态、当前计划、最近扫描结果。
- `panel/render/history.js`
- `panel/render/scan.js`
- `panel/render/unused.js`
- `panel/render/health.js`
- `panel/render/classify.js`
- `panel/format.js`：格式化、HTML escape、尺寸、日期。

验收标准：

- 现有 Tab 行为不变。
- 所有按钮事件仍只绑定一次。
- 面板重载后默认扫描、历史、日志仍能正常加载。

### 阶段 4：面板内 Resizable 分栏

目标：把固定 Tab 逐步升级为可布局的工作台，而不是继续堆长页面。

建议实现顺序：

1. 新增内部窗口容器，不先替换所有 Tab。
2. 先接入 2 到 3 个低风险模块，例如资源扫描、引用检查、日志。
3. 实现拖拽、缩放、最小尺寸、边界限制。
4. 将布局保存到 profile，例如 `panelLayout`。
5. 增加“重置布局”“平铺布局”“最大化窗口”。
6. 再逐步迁移健康检查、未引用、报告模块。

验收标准：

- 每个小窗口可拖拽、可缩放。
- Creator 面板缩放后窗口不丢失到可视区外。
- 重载扩展后布局恢复。
- 旧 Tab 或布局预设仍能快速进入原有工作流。

### 阶段 5：风险总览和体验优化

目标：让用户打开工具后先看到“当前风险和下一步”，而不是自己在各 Tab 里找答案。

建议新增：

- 总览区域：最近扫描范围、风险数量、危险操作状态。
- 风险分组：缺失 meta、未引用候选、无法解析 UUID、重复资源、大文件。
- 推荐下一步：例如“先跑场景/Prefab 引用健康检查”“先导出报告”。
- 操作前检查清单：移动、覆盖、删除分别显示必须确认项。

验收标准：

- 用户打开面板后能在 10 秒内判断当前项目风险大类。
- 每个风险入口能跳转到对应模块。
- 危险操作的前置条件可见、可追踪。

## 近期推荐顺序

1. 继续完善面板内 Resizable 分栏：优先覆盖包体统计三栏区域、纵向分隔和布局重置入口。
2. 做总览风险面板。
3. 继续补健康检查模块的边界测试，优先覆盖包体统计、目录规范和场景/Prefab 引用健康。

## 暂不建议做的事

- 不建议现在一次性把所有 Tab 改成小窗口，风险太大。
- 不建议现在引入大型前端框架，当前扩展没有构建链，依赖越少越稳。
- 不建议破坏式改 IPC 返回结构，应继续保持旧字段兼容，直到面板和测试都完全覆盖。
- 不建议自动修复 `.meta` 或自动删除重复资源，这类能力需要更强的回滚和审计支持。
