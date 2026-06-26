# 优化路线图

本文档记录 `asset-steward` 后续还需要做哪些优化，以及当前优化到什么程度。更新时间：2026-06-26。

## 当前结论

当前处于 **第一轮兼容式工程化优化已完成** 的阶段。

这一轮已经完成：

- 主进程返回增加兼容协议元信息：`ok`、`protocolVersion`、`warnings`。
- 面板消息调用收敛到 `requestMain()`，兼容旧返回结构，并为后续 `{ ok: false, error }` 做好入口。
- 新执行的移动历史会持久化失败移动明细和清理失败目录明细。
- 未引用删除备份 manifest 记录 SHA-256，并在执行后写入 `execution-result.json`。
- 新增 Node 原生测试，覆盖协议、移动计划、删除备份和执行审计。
- 新增 `docs/architecture.md` 和 `docs/safety.md`，README 增加维护入口。
- 从 `FEATURES.md` 拆出稳定使用文档：新增 `docs/user-guide.md` 和 `docs/developer-guide.md`，README 增加文档导航，`FEATURES.md` 保留为完整功能规划和历史设计背景。
- README 已压缩为快速入口和文档导航，详细功能、安全边界和规划分别落到 `docs/user-guide.md`、`docs/safety.md` 和 `FEATURES.md`。
- 新增 `docs/changelog.md`，记录面向发布和交付的用户可见变化、维护改进、安全注意点和验证方式。
- `FEATURES.md` 已改为功能规划和历史设计背景定位，并移除各功能段重复的用户操作清单，改由 `docs/user-guide.md` 承接日常使用流程。
- `FEATURES.md` 已进一步压缩已落地功能细节，将资源扫描、自动分类、未引用资源、引用检查、健康检查和历史报告收敛为“已落地能力索引”，保留后续实现顺序、暂缓项和扩展背景。
- 主进程消息出口增加兼容错误协议包装，错误返回 `{ ok: false, error }`，面板仍通过 `requestMain()` 转成异常展示。
- 协议错误返回补充集中错误码推断，区分 validation、not-found、conflict、permission、external 等稳定错误大类。
- 增加旧 `project-asset-mover` profile/log 兼容读取测试。
- 增加报告导出 token 过滤测试，主进程会递归移除报告快照里的 `token` 字段。
- 拆出 `panel/request.js` 和 `panel/format.js`，面板请求兼容转换与格式化工具已从大面板文件中分离。
- 拆出 `main/path-utils.js`、`main/profile.js` 和 `main/move-plan.js`，路径工具、profile/log 读写、移动预览和执行已从 `main.js` 中分离。
- 拆出 `main/asset-scan.js`、`main/reference-graph.js` 和 `main/runtime-resources.js`，资源扫描、UUID 引用图和 resources 动态加载静态检查已模块化。
- 拆出 `main/unused-delete.js` 和 `main/report.js`，未引用删除预览/备份/审计与会话报告导出已模块化。
- 拆出 `main/health-checks.js`，包体统计、目录规范、重复资源、材质贴图和场景/Prefab 引用健康检查已模块化。
- 新增面板内 Resizable 分栏第一版，资源扫描、引用检查、自动分类、节点引用、resources 检查和重复资源检查的左右区域可拖拽调整宽度。
- 包体贡献统计三栏区域已接入可拖拽纵向分隔，并增加全局“重置布局”入口。
- 包体贡献统计区域已增加上下分隔，可调整三栏统计区和主场景递归引用大文件区的高度。
- 包体贡献统计区域已增加“平铺”“最大化统计”“最大化引用”三种布局预设。
- 新增 UI 风险总览第一版，默认打开总览 Tab，聚合已运行模块风险、推荐下一步和危险操作状态，并提供跳转入口。
- 健康检查模块补充包体统计、目录规范和场景/Prefab 引用健康的边界测试。
- UI 风险总览补充风险权重排序、跨会话最近风险快照和总览一键健康检查入口。
- 面板内 Resizable 分栏预设已推广到节点引用、resources 动态加载检查和重复资源检查。
- 自动化测试补充 resources 动态加载检查和序列化资源引用图边界。
- 拆出 `panel/layout.js` 和 `panel/overview.js`，布局预设计算与总览排序/快照工具可独立测试。
- `panel/layout.js` 继续承接 Resizable 分栏状态读写、CSS 变量生成、拖拽尺寸边界和 handle 变量名计算，`panel/main.js` 仅保留 DOM 事件生命周期。
- 自动化测试补充 profile 历史/日志保留窗口和历史详情新旧失败明细提示边界。
- `panel/overview.js` 继续承接总览风险、推荐下一步、危险操作条目、摘要文案和跨会话快照读写，`panel/render/overview.js` 承接总览 DOM 渲染，`panel/main.js` 仅保留总览动作路由和一键检查流程。
- 拆出 `panel/health.js`，resources、包体统计、目录规范、材质贴图、重复资源和场景/Prefab 引用健康的摘要文案与表格行模型可独立测试。
- 拆出 `panel/render/health.js`，健康检查区域的 DOM 表格渲染、empty 状态和定位按钮绑定已从 `panel/main.js` 分离。
- 拆出 `panel/history.js` 和 `panel/render/history.js`，历史下拉、历史详情、运行日志和报告导出摘要的模型/DOM 渲染已模块化。
- 拆出 `panel/unused.js` 和 `panel/render/unused.js`，未引用候选筛选、候选表格、删除预览摘要和删除预览表格已模块化。
- 拆出 `panel/scan.js` 和 `panel/render/scan.js`，资源扫描列表与资源引用检查表格已模块化。
- 拆出 `panel/node-reference.js` 和 `panel/render/node-reference.js`，场景节点引用检查目标节点和引用组件表格已模块化。
- 拆出 `panel/classify.js` 和 `panel/render/classify.js`，自动分类资源列表、规则编辑行和移动计划表格已模块化。
- `panel/classify.js` 补充自动分类扫描后选中项过滤、全选当前结果、清空选择和单项勾选 helper，扫描刷新后只保留仍存在于当前结果里的选中资源。
- 拆出 `panel/tool-panel.js` 和 `panel/render/tool-panel.js`，功能开关模块定义、可见性归一化、开关行渲染和模块显隐应用已模块化。
- 拆出 `panel/render/overview.js`，总览摘要、跨会话快照文案、风险/推荐/操作列表 DOM 渲染已从 `panel/main.js` 分离。
- 原健康检查聚合页已拆成节点引用、resources 加载、包体统计、目录规范、材质贴图、重复资源和场景引用 7 个独立 Tab；总览跳转和工具开关同步适配独立页面。
- 自动化测试补充面板共享格式化 helper 的状态文案和 class 映射，覆盖 action、log、resources 动态加载、材质贴图、hash、备份范围和资源扫描 issue 标签。
- 拆出 `panel/state.js` 起步版，先承接总览所需的共享状态快照拼装、会话报告快照拼装、当前移动计划执行可用性判断、执行前阻止文案、确认弹窗文案、执行结果文案、资源扫描结果完整性判断、引用检查结果完整性判断、节点引用结果完整性判断、未引用扫描结果完整性判断、resources 动态加载检查结果完整性判断、包体统计结果完整性判断、目录规范结果完整性判断、材质贴图结果完整性判断、重复资源结果完整性判断、场景/Prefab 引用健康结果完整性判断、资源扫描最近结果状态归一化、自动分类扫描资源列表状态归一化、运行日志结果状态归一化、历史详情结果状态归一化、引用检查最近结果状态归一化、节点引用最近结果状态归一化、未引用扫描最近结果状态归一化、resources 最近结果状态归一化、包体统计最近结果状态归一化、目录规范最近结果状态归一化、材质贴图最近结果状态归一化、重复资源最近结果状态归一化和场景/Prefab 引用健康最近结果状态归一化，并增加面板状态 helper 测试。
- 拆出 `panel/project-maintenance.js`，项目缓存清理的确认文案、请求 payload、结果摘要和日志详情已可独立测试。
- 面板“关闭面板”入口已走主进程消息协议，不再依赖用户手动关闭 dock 面板。
- 资源扫描页已收敛为摘要和资源列表，缺失 meta、孤立 meta、空目录等风险仍保留在摘要/报告数据中，面板不再重复展示低价值统计表。
- 打包脚本支持配置化直装到目标 Cocos 项目的 `Extensions` 目录，同时仍输出可直接使用的插件目录和 zip。

本轮收尾结论：

- 第一轮兼容式工程化优化已完成，可按当前测试结果作为交付基线。
- `panel/main.js` 仍保留模板、样式、原始运行状态和跨模块流程编排，这是当前无构建链 Creator 扩展的入口胶水，不再作为第一轮未完成项处理。
- 继续细化业务级错误码、完整工作台式窗口、跨会话完整结果持久化和大项目性能属于第二轮增强，不阻塞第一轮收尾。

## 优化状态总览

| 优化方向 | 当前状态 | 完成度 | 当前证据 | 后续目标 |
| --- | --- | ---: | --- | --- |
| 兼容 IPC 协议 | 已完成错误返回入口和第一批错误码分类 | 86% | `main/protocol.js`、`compatibleError()`、`inferProtocolErrorCode()`、`toProtocol()`、`withProtocol()`、`requestMain()`；错误码覆盖 validation、not-found、conflict、permission、external 和 fallback | 继续为具体业务域补更细错误码和面板展示 |
| 面板请求收敛 | 已拆出请求模块 | 80% | `panel/request.js`、`requestMain()`、`createAssetStewardError()` | 继续统一 loading、错误提示和日志 |
| 危险操作审计 | 已完成第一版 | 65% | 移动失败明细持久化、删除备份 hash、`execution-result.json` | 增加恢复辅助入口、备份校验入口、审计报告聚合 |
| 自动化测试 | 第一轮验收通过 | 100% | `npm.cmd test` 通过 80 个测试；覆盖协议错误码分类、项目维护、包体统计、目录规范、场景/Prefab 引用健康、resources 动态加载、序列化资源引用图、脚本组件引用解析、profile 历史/日志保留、历史详情失败明细提示、面板共享格式化状态映射、面板状态快照 helper、会话报告快照 helper、当前移动计划文案 helper、各模块结果完整性和最近结果状态 helper、项目缓存清理 helper、总览风险/推荐/操作构建、总览/健康/历史/未引用/扫描/节点引用/自动分类/工具面板 DOM 渲染、布局预设和 Resizable 尺寸/持久化 helper | 第二轮再补真实面板交互和大项目性能边界 |
| 文档收敛 | 已拆出用户手册、开发手册、架构、安全、路线图和变更记录，README 已去重为快速导航，FEATURES 已收敛为规划/背景文档 | 94% | `README.md` 导航到 `docs/user-guide.md`、`docs/developer-guide.md`、`docs/architecture.md`、`docs/safety.md`、`docs/optimization-roadmap.md`、`docs/changelog.md` 和 `FEATURES.md`；`docs/architecture.md` 已同步当前主进程/面板模块边界；详细功能、安全说明和发布变化已从 README 移到专项文档；`FEATURES.md` 已用“已落地能力索引”替代前半部分逐项实现说明，并保留实现顺序、暂缓项和扩展背景 | 后续只需随功能变化维护规划状态，并继续把稳定使用细节放到用户/开发/安全文档 |
| 主进程模块拆分 | 已完成核心扫描、移动、删除审计、报告与健康检查拆分 | 85% | `main/path-utils.js`、`main/profile.js`、`main/move-plan.js`、`main/asset-scan.js`、`main/reference-graph.js`、`main/runtime-resources.js`、`main/unused-delete.js`、`main/report.js`、`main/health-checks.js` | 后续按需要继续拆工具箱元信息或入口胶水 |
| 面板模块拆分 | 第一轮拆分完成，剩余为入口胶水 | 100% | `panel/request.js`、`panel/format.js`、`panel/state.js`、`panel/layout.js`、`panel/overview.js`、`panel/health.js`、`panel/history.js`、`panel/unused.js`、`panel/scan.js`、`panel/node-reference.js`、`panel/classify.js`、`panel/tool-panel.js`、`panel/project-maintenance.js`、`panel/render/*`；状态快照、会话报告、计划执行文案、各模块结果完整性和最近结果归一化、总览/健康/历史/未引用/扫描/节点引用/自动分类/工具面板渲染、项目缓存清理文案与请求已离开 `panel/main.js` | 第二轮如要继续瘦身，可优先抽模板/样式或按 Tab 拆流程编排 |
| UI 风险总览 | 第一版完成并通过测试 | 100% | `panel/overview.js`：构建资源异常、未引用候选、resources 风险、重复资源、材质/引用健康、危险操作计划、最近执行和日志告警，并格式化摘要/快照；`panel/render/overview.js`：渲染总览摘要、快照和三组列表；`panel/main.js`：保留默认总览 Tab、动作路由和一键只读健康检查 | 第二轮再做更细风险解释、跨会话完整结果持久化和更多模块自动执行入口 |
| 面板内 Resizable 分栏 | 第一版完成并通过 helper 测试 | 100% | `panel/main.js`：多个双栏区域和包体统计三栏区域插入拖拽分隔条，包体统计区支持上下高度调整；`panel/layout.js`：布局预设、拖拽尺寸 clamp、CSS 变量生成、localStorage 状态读写 helper；包体统计、节点引用、resources 检查和重复资源检查均有平铺/最大化预设，头部提供“重置布局”入口 | 第二轮再扩展为完整工作台式窗口能力 |
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
- 已完成：为协议错误返回补 `inferProtocolErrorCode()`，在兼容结构内区分输入校验、未找到、冲突/失效、权限和外部 Editor/AssetDB 错误。
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

- 已完成：`panel/request.js`：消息请求和错误转换。
- 已完成：`panel/state.js`：总览所需共享状态快照、会话报告快照拼装、当前计划执行可用性判断、执行前阻止文案、确认弹窗文案、执行结果文案、各功能结果完整性判断和最近结果状态归一化。
- 已完成：`panel/render/overview.js`：总览摘要、快照和风险/推荐/操作列表渲染。
- 已完成：`panel/render/history.js`
- 已完成：`panel/render/scan.js`
- 已完成：`panel/render/unused.js`
- 已完成：`panel/render/health.js`
- 已完成：`panel/classify.js` 和 `panel/render/classify.js`：自动分类摘要、资源列表、规则编辑行和计划表格。
- 已完成：`panel/tool-panel.js` 和 `panel/render/tool-panel.js`：工具模块定义、功能开关行和模块显隐应用。
- 已完成：`panel/project-maintenance.js`：项目缓存清理确认文案、请求 payload、结果摘要和日志详情。
- 已完成：`panel/format.js`：格式化、HTML escape、尺寸、日期。

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
4. 已完成本地持久化 helper：当前布局保存到本地 `asset-steward.resizableSplits.v1`；后续可继续迁移到 profile，例如 `panelLayout`。
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

第一轮已完成。下一轮如果继续投入，建议按下面顺序单独开新阶段：

1. 大项目体验：增量扫描、进度反馈、取消任务和 UUID 图缓存。
2. 工作台式布局：把当前 Resizable 分栏扩展为更完整的可恢复工作区。
3. 风险总览二期：补跨会话完整结果持久化、风险解释和更多只读自动执行入口。

## 暂不建议做的事

- 不建议现在一次性把所有 Tab 改成小窗口，风险太大。
- 不建议现在引入大型前端框架，当前扩展没有构建链，依赖越少越稳。
- 不建议破坏式改 IPC 返回结构，应继续保持旧字段兼容，直到面板和测试都完全覆盖。
- 不建议自动修复 `.meta` 或自动删除重复资源，这类能力需要更强的回滚和审计支持。
