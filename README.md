# 项目资源管家

面向 Cocos Creator 3.8.6 的项目级编辑器扩展。当前提供资源扫描、资源引用检查、资源自动分类、批量移动、未引用资源清理、健康检查、移动历史、反向移动计划和报告导出。

## 使用方式

1. 在扩展管理器启用 `asset-steward`。
2. 点击顶部菜单 `项目资源管家 -> 打开资源管家`。
3. 在顶部 Tab 中选择功能页。
4. 原“健康检查”中的 7 项能力已经拆为独立功能页，可直接从顶部 Tab 进入。
5. 顶部“工具面板”可按项目保存功能开关；关闭后对应功能页和 Tab 会一起隐藏。
6. 移动前先生成预览计划，人工复核后再执行。

## 资源管家 Tab

- `资源扫描`：独立展示缺失 `.meta`、孤立 `.meta`、空目录和类型统计；提供资源 UUID 静态引用检查；只预览和定位，不删除、不修复。
- `自动分类`：当前完整可用的资源扫描、规则分类、手动移动和计划执行。
- `未引用资源`：已接入主场景 UUID 依赖图的未引用候选扫描、筛选、定位、删除预览、强制备份和 AssetDB 删除执行；原独立扩展保持不变。
- 独立检查页：`节点引用`、`resources 加载`、`包体统计`、`目录规范`、`材质贴图`、`重复资源`、`场景引用`。
- `工具面板`：可开启或关闭上述独立功能，例如隐藏 resources 动态加载检查；配置保存到项目 profile。
- `历史与报告`：当前支持移动历史详情、反向移动计划、运行日志和当前会话 Markdown/JSON 报告导出。

## 开发与维护

- 用户手册见 [`docs/user-guide.md`](docs/user-guide.md)。
- 开发手册见 [`docs/developer-guide.md`](docs/developer-guide.md)。
- 架构边界见 [`docs/architecture.md`](docs/architecture.md)。
- 移动、删除和审计安全边界见 [`docs/safety.md`](docs/safety.md)。
- 优化路线图见 [`docs/optimization-roadmap.md`](docs/optimization-roadmap.md)。
- 发布变更记录见 [`docs/changelog.md`](docs/changelog.md)。
- 运行最小自动化测试：`npm test`。

## 详细说明

- 日常使用流程、各功能页说明和安全建议见 [`docs/user-guide.md`](docs/user-guide.md)。
- 更完整的移动、删除、覆盖、缓存清理和审计边界见 [`docs/safety.md`](docs/safety.md)。
- 较完整的功能规划和历史设计背景见 [`FEATURES.md`](FEATURES.md)。
