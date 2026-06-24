# 开发手册

本文档面向维护 `asset-steward` 的开发者，说明当前模块边界、协议约定、测试方式和扩展新能力时的注意事项。

## 项目入口

- `package.json`：注册菜单、快捷键、消息和 dockable 面板。
- `main.js`：主进程消息入口和少量胶水逻辑。
- `panel/main.js`：面板模板、样式、共享状态、事件绑定和流程编排。
- `docs/optimization-roadmap.md`：当前优化路线图和完成度。

## 主进程模块

- `main/protocol.js`：兼容协议包装、成功/失败返回和错误码推断。
- `main/path-utils.js`：路径规范化、AssetDB URL、项目内路径检查。
- `main/profile.js`：profile、历史和日志读写，以及旧 `project-asset-mover` 数据迁移。
- `main/asset-scan.js`：资源扫描、`.meta` 异常和类型统计。
- `main/reference-graph.js`：UUID 提取、序列化资源引用、主场景可达图、节点引用检查。
- `main/runtime-resources.js`：`resources.load/loadDir` 静态调用分析。
- `main/move-plan.js`：移动预览、冲突策略、反向计划和执行。
- `main/unused-delete.js`：未引用删除预览、备份、manifest 和执行审计。
- `main/health-checks.js`：包体统计、目录规范、重复资源、材质贴图、场景/Prefab 引用健康。
- `main/report.js`：Markdown/JSON 会话报告。
- `main/project-maintenance.js`：项目缓存清理和编辑器刷新/重载策略。

新增主进程能力时，优先放入对应模块，再在 `main.js` 暴露消息方法。

## 面板模块

- `panel/request.js`：面板消息请求和协议错误转换。
- `panel/format.js`：格式化、HTML escape、日期、尺寸、状态文案。
- `panel/layout.js`：布局预设、Resizable 状态读写、CSS 变量生成和拖拽尺寸边界。
- `panel/overview.js`：总览风险、推荐下一步、危险操作、快照和摘要模型。
- `panel/tool-panel.js`：独立功能页定义和功能开关模型；同一 `data-tool-module` 同时标记页签与页面。
- `panel/health.js`、`panel/history.js`、`panel/unused.js`、`panel/scan.js`、`panel/node-reference.js`、`panel/classify.js`：各功能区的纯模型和摘要/行数据。
- `panel/render/*`：各功能区 DOM 渲染和按钮事件回调绑定。

新增面板能力时，优先遵循“纯模型 + render 模块 + main.js 流程编排”的结构：

1. 纯计算和行模型放在 `panel/<feature>.js`。
2. DOM 写入和局部按钮绑定放在 `panel/render/<feature>.js`。
3. 共享状态、主进程请求和跨 Tab 流程保留在 `panel/main.js`。
4. 新增测试覆盖模型和 render 回调。

## 兼容协议

主进程消息必须返回兼容结构：

```js
{
  ok: true,
  protocolVersion: 1,
  warnings: []
}
```

错误返回必须保持：

```js
{
  ok: false,
  protocolVersion: 1,
  error: {
    code: "ERR_ASSET_STEWARD_VALIDATION",
    message: "...",
    stack: "..."
  }
}
```

`compatibleError()` 会通过 `inferProtocolErrorCode()` 推断错误大类。当前稳定大类包括：

- `ERR_ASSET_STEWARD_VALIDATION`
- `ERR_ASSET_STEWARD_NOT_FOUND`
- `ERR_ASSET_STEWARD_CONFLICT`
- `ERR_ASSET_STEWARD_PERMISSION`
- `ERR_ASSET_STEWARD_EXTERNAL`
- `ERR_ASSET_STEWARD`

如果业务代码已经抛出带 `code: "ERR_..."` 的错误，会优先保留该错误码。

## 安全规则

- 任何移动、覆盖、删除、缓存清理都必须有预览或确认步骤。
- 删除类能力必须先创建备份和审计文件。
- 只读健康检查不能顺手修复资源。
- 不要删除、移动或重写用户未要求处理的文件。
- 不要把真实 token、密码或个人敏感信息写入文档、日志或报告。

详细约束见 [`safety.md`](safety.md)。

## 测试

使用 Node 原生测试：

```bash
npm test
```

建议按改动范围选择最小验证：

- 协议或主进程模块：`node --check main.js`、`node --check main/<module>.js`、`npm test`。
- 面板纯模型或渲染模块：`node --check panel/main.js`、`node --check panel/<module>.js`、`node --check panel/render/<module>.js`、`npm test`。
- 文档改动：检查链接目标存在，并同步更新 `docs/optimization-roadmap.md`。

当前测试覆盖协议、移动计划、引用图、未引用删除、项目维护、报告导出、健康检查、面板模型和 DOM 渲染 helper。

## 发布和打包

当前 `package.json` 提供：

```bash
npm run package:plugin
```

该命令调用 `scripts/package-cocos-plugin.ps1`。打包前应先运行测试，并确认路线图和 README 中的能力描述与当前代码一致。

## 文档职责

- `README.md`：项目简介、快速入口和文档导航。
- `docs/user-guide.md`：用户如何使用工具。
- `docs/developer-guide.md`：开发维护说明。
- `docs/architecture.md`：架构边界。
- `docs/safety.md`：安全边界。
- `docs/optimization-roadmap.md`：优化进度和后续方向。
- `docs/changelog.md`：面向发布和交付的用户可见变化。
- `FEATURES.md`：较完整的功能规划和历史设计背景。
