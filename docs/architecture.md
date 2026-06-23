# 架构说明

`asset-steward` 是 Cocos Creator 3.8.x 编辑器扩展，由主进程能力和面板 UI 两部分组成。

## 入口

- `package.json` 注册菜单、快捷键、消息和 dockable 面板。
- `main.js` 承载主进程消息方法、资源扫描、引用图、移动计划、删除备份、历史和报告。
- `panel/main.js` 承载面板模板、样式、状态、渲染和消息调用。

## 兼容协议

主进程消息返回仍保留旧字段，例如 `entries`、`summary`、`rules`、`history`。新返回会额外附加：

- `ok: true`
- `protocolVersion: 1`
- `warnings: []`

面板统一通过 `requestMain()` 调用主进程消息。旧结构可以继续工作；后续如果主进程返回 `{ ok: false, error }`，面板会统一转换为异常。

## 推荐拆分方向

当前第一轮优化只增加兼容协议和测试支撑，不改变功能行为。后续拆分时建议按下面边界迁移：

- `main/asset-scan.js`：资源扫描、meta 异常、类型统计。
- `main/reference-graph.js`：UUID 提取、序列化引用、主场景可达图。
- `main/move-plan.js`：移动预览、冲突策略、反向计划、执行历史。
- `main/unused-delete.js`：未引用删除预览、备份、manifest、执行审计。
- `main/health-checks.js`：包体统计、目录规范、重复资源、材质贴图、场景/Prefab 引用健康检查。
- `main/report.js`：Markdown/JSON 会话报告。
- `panel/request.js`：面板消息请求、协议兼容、错误转换。
- `panel/tabs/*`：各 Tab 的状态、渲染和事件绑定。

## 测试

项目使用 Node 原生测试：

```bash
npm test
```

第一批覆盖协议元信息、移动计划兼容字段、未引用删除备份 hash 和执行审计文件。
