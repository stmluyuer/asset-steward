"use strict";

const { compatibleSuccess, compatibleError } = require("./main/protocol");
const {
  normalizeRelativePath,
  toDbUrl,
  toRelativePath,
  isInsideAssets,
  pathExists,
  destinationOccupied,
} = require("./main/path-utils");
const {
  migrateProfile,
  loadState,
  getHistoryDetail,
  getLogs,
  appendLog,
  clearLogs,
  normalizeExtensions,
  normalizeKeywords,
  saveRules,
  saveToolVisibility,
} = require("./main/profile");
const AssetScan = require("./main/asset-scan");
const ReferenceGraph = require("./main/reference-graph");
const RuntimeResources = require("./main/runtime-resources");
const MovePlan = require("./main/move-plan");
const Report = require("./main/report");
const UnusedDelete = require("./main/unused-delete");
const HealthChecks = require("./main/health-checks");
const PACKAGE_VERSION = require("./package.json").version;

const PACKAGE_NAME = "asset-steward";
const TOOLBOX_FRAMEWORK_VERSION = 1;
const TOOLBOX_MODULES = [
  {
    id: "asset-scan",
    tab: "scan",
    title: "资源扫描",
    status: "ready",
    summary: "已接入缺失 meta、孤立 meta、空目录、类型统计和资源列表。",
    input: "搜索路径、扩展名、扫描目录",
    output: "扫描摘要、异常列表、类型统计、资源列表",
    safety: "只读扫描，不删除、不修复、不创建目录。",
    nextAction: "作为后续报告导出、包体统计和目录规范检查的数据入口。"
  },
  {
    id: "reference-check",
    tab: "scan",
    title: "资源引用检查",
    status: "ready",
    summary: "已接入目标资源 UUID 静态反查、上级继续查询和场景/Prefab 精确引用位置。",
    input: "被检查资源、扫描目录、序列化文件类型",
    output: "目标 UUID、引用文件、节点路径、组件、字段、关联目标",
    safety: "只做静态 UUID 搜索；选中节点只作用于当前打开资源，未找到引用不等于可删除。",
    nextAction: "结合未引用候选和动态加载路径检查复核资源用途。"
  },
  {
    id: "scene-node-reference-check",
    tab: "health",
    title: "场景节点引用检查",
    status: "ready",
    summary: "已接入目标节点 ID 反查，报告引用该节点的组件、组件节点路径和字段。",
    input: "当前选中节点或节点 ID、扫描目录、场景/Prefab 文件类型",
    output: "目标节点位置、引用组件所在节点、组件类型、字段路径",
    safety: "只读解析 .scene/.prefab 序列化 __id__ 引用；不修改场景，不自动切换打开资源。",
    nextAction: "在 Creator 中打开对应场景或 Prefab 后按节点路径复核引用关系。"
  },
  {
    id: "auto-classify",
    tab: "classify",
    title: "自动分类",
    status: "ready",
    summary: "已接入规则分类、手动移动、冲突处理、预览执行和反向计划。",
    input: "资源选择、分类规则、目标目录、冲突策略",
    output: "移动预览、执行结果、历史记录",
    safety: "通过 Creator AssetDB 移动；覆盖必须备份勾选和二次确认。",
    nextAction: "复用分类规则给目录规范检查生成建议目标。"
  },
  {
    id: "scene-unused-assets",
    tab: "unused",
    title: "场景未引用资源",
    status: "ready",
    summary: "已接入主场景 UUID 依赖图的未引用资源只读候选扫描。",
    input: "目标场景、扫描目录、保护类型",
    output: "扫描数量、已引用数量、未引用候选、无法解析数量",
    safety: "只展示和定位；脚本与 Shader Chunk 强制保护，不提供删除。",
    nextAction: "结合动态加载检查和人工复核确认候选。"
  },
  {
    id: "unused-delete-candidates",
    tab: "unused",
    title: "未引用删除候选",
    status: "ready",
    summary: "已接入未引用候选删除预览、强制备份和 AssetDB 删除执行。",
    input: "主场景、扫描目录、人工勾选候选、备份范围、二次确认",
    output: "待删除预览、备份 manifest、删除结果、失败项",
    safety: "默认不选中任何项；执行前必须由工具成功创建备份并二次确认。",
    nextAction: "删除后结合报告导出、场景/Prefab 引用健康检查和 Creator 回归复核。"
  },
  {
    id: "resources-runtime-check",
    tab: "health",
    title: "resources 动态加载检查",
    status: "ready",
    summary: "已接入 assets/resources 和 resources.load/loadDir 静态路径对照检查。",
    input: "代码扫描目录、resources 扫描目录",
    output: "resources 资源、静态加载路径、疑似未加载项、疑似缺失路径、动态拼接告警",
    safety: "只报告，不移动或删除 resources 资源。",
    nextAction: "结合资源引用检查和人工复核判断疑似未使用资源。"
  },
  {
    id: "package-size-report",
    tab: "health",
    title: "包体贡献统计",
    status: "ready",
    summary: "已接入递归目录、扩展名、Top 单文件和主场景递归引用大文件统计。",
    input: "扫描目录、主场景、Top N、是否包含 meta",
    output: "目录大小排行、类型大小排行、Top 大文件、Top 主场景引用大文件及引用链",
    safety: "只统计，不判断是否应该删除。",
    nextAction: "结合引用检查优先定位高收益优化项。"
  },
  {
    id: "directory-convention",
    tab: "health",
    title: "目录规范检查",
    status: "ready",
    summary: "已接入自动分类规则的只读目录规范检查和移动预览转换。",
    input: "扫描目录、自动分类规则",
    output: "不符合目录规范资源、建议目标目录、可转化移动计划",
    safety: "默认只报告；移动仍走自动分类预览和确认。",
    nextAction: "人工复核建议后转为现有移动预览计划。"
  },
  {
    id: "duplicate-assets",
    tab: "health",
    title: "重复资源检查",
    status: "ready",
    summary: "已接入不同目录同名资源和 SHA-256 重复内容检查。",
    input: "扫描目录",
    output: "同名资源组、重复 hash 资源组",
    safety: "只报告，不自动删除重复资源。",
    nextAction: "结合引用检查人工确认保留项和替换方案。"
  },
  {
    id: "material-textures",
    tab: "health",
    title: "材质贴图检查",
    status: "ready",
    summary: "已接入材质贴图 UUID 关系、待复核引用和主场景可达状态检查。",
    input: "扫描目录、主场景、材质文件类型",
    output: "材质到贴图关系、待复核 UUID、主场景可达状态",
    safety: "只报告，不自动修复材质。",
    nextAction: "人工复核无法解析的 UUID，并在资源整理后重新运行检查。"
  },
  {
    id: "scene-prefab-reference-health",
    tab: "health",
    title: "场景和 Prefab 引用健康",
    status: "ready",
    summary: "已接入 .scene/.prefab 无法解析 UUID 和白名单检查。",
    input: "扫描目录、文件类型、UUID 白名单",
    output: "无法解析 UUID、涉及文件、命中次数",
    safety: "只报告；内置资源 UUID 需要白名单。",
    nextAction: "在 Creator 中打开涉及文件复核，并维护确认过的内置资源白名单。"
  },
  {
    id: "markdown-report",
    tab: "history",
    title: "Markdown 报告导出",
    status: "ready",
    summary: "已接入当前面板会话最近结果、移动计划、历史摘要和日志的 Markdown 报告。",
    input: "最近扫描结果、计划预览、执行结果、运行日志",
    output: "可人工复核的 Markdown 报告",
    safety: "只导出文本，不修改资源。",
    nextAction: "每轮资源整理或健康检查后导出并人工复核。"
  },
  {
    id: "json-report",
    tab: "history",
    title: "JSON 报告导出",
    status: "ready",
    summary: "已接入与 Markdown 共用会话快照的结构化 JSON 报告。",
    input: "扫描结果、引用检查结果、移动历史、健康检查结果",
    output: "JSON 报告",
    safety: "只导出文本，不修改资源。",
    nextAction: "用于后续自动化、差异比较和人工复核。"
  },
  {
    id: "history-detail",
    tab: "history",
    title: "历史详情",
    status: "ready",
    summary: "已接入单次历史完整移动列表、覆盖风险和空目录清理结果查看。",
    input: "移动历史 ID",
    output: "完整移动列表、覆盖风险、清理结果、失败明细持久化状态",
    safety: "反向计划仍需人工复核后执行。",
    nextAction: "后续补充反向计划执行结果记录和失败项持久化。"
  }
];
const TOOLBOX_TABS = [
  { id: "scan", title: "资源扫描", status: "ready" },
  { id: "classify", title: "自动分类", status: "ready" },
  { id: "unused", title: "未引用资源", status: "ready" },
  { id: "health", title: "健康检查", status: "ready" },
  { id: "history", title: "历史与报告", status: "scaffold" }
];

let lastPlan = null;
let lastUnusedDeletePlan = null;

exports.load = function () {
  console.log(`[${PACKAGE_NAME}] loaded`);
};

exports.unload = function () {
  lastPlan = null;
  lastUnusedDeletePlan = null;
  ReferenceGraph.clearScriptTypeNameCache();
  console.log(`[${PACKAGE_NAME}] unloaded`);
};

exports.methods = {
  openPanel() {
    Editor.Panel.open(`${PACKAGE_NAME}.main`);
  },

  scanAssets(options) {
    return withProtocol(() => scanAssets(options));
  },

  checkReferences(payload) {
    return withProtocol(() => checkReferences(payload));
  },

  async selectReferenceNode(payload) {
    return withProtocol(() => selectReferenceNode(payload));
  },

  checkNodeReferences(payload) {
    return withProtocol(() => checkNodeReferences(payload));
  },

  checkResourcesRuntime(payload) {
    return withProtocol(() => checkResourcesRuntime(payload));
  },

  reportPackageSize(payload) {
    return withProtocol(() => reportPackageSize(payload));
  },

  checkDirectoryConvention(payload) {
    return withProtocol(() => checkDirectoryConvention(payload));
  },

  checkDuplicateAssets(payload) {
    return withProtocol(() => checkDuplicateAssets(payload));
  },

  checkMaterialTextures(payload) {
    return withProtocol(() => checkMaterialTextures(payload));
  },

  checkScenePrefabReferenceHealth(payload) {
    return withProtocol(() => checkScenePrefabReferenceHealth(payload));
  },

  scanUnusedAssets(payload) {
    return withProtocol(() => scanUnusedAssets(payload));
  },

  previewUnusedDelete(payload) {
    return withProtocol(() => {
      lastUnusedDeletePlan = buildUnusedDeletePlan(payload);
      return lastUnusedDeletePlan.publicResult;
    });
  },

  async executeUnusedDelete(payload) {
    return withProtocol(() => executeUnusedDelete(payload));
  },

  getToolboxFramework() {
    return withProtocol(() => getToolboxFramework());
  },

  loadState() {
    return withProtocol(() => loadState());
  },

  getHistoryDetail(payload) {
    return withProtocol(() => getHistoryDetail(payload));
  },

  appendLog(payload) {
    return withProtocol(() => appendLog(payload));
  },

  getLogs() {
    return withProtocol(() => getLogs());
  },

  clearLogs() {
    return withProtocol(() => clearLogs());
  },

  exportSessionReport(payload) {
    return withProtocol(() => exportSessionReport(payload));
  },

  saveRules(payload) {
    return withProtocol(() => saveRules(payload?.rules));
  },

  saveToolVisibility(payload) {
    return withProtocol(() => saveToolVisibility(payload?.toolVisibility));
  },

  previewMoves(payload) {
    return withProtocol(() => {
      lastPlan = buildMovePlan(payload);
      return lastPlan.publicResult;
    });
  },

  async executeMoves(payload) {
    return withProtocol(() => executeMoves(payload));
  },

  previewReverse(payload) {
    return withProtocol(() => {
      lastPlan = MovePlan.buildReversePlan(payload?.historyId, payload?.conflictPolicy);
      return lastPlan.publicResult;
    });
  },

  locateAsset(payload) {
    return withProtocol(() => locateAsset(payload));
  },

  getSelectedAssetPath() {
    return withProtocol(() => getSelectedAssetPath());
  },
};

function toProtocol(payload, warnings = []) {
  return compatibleSuccess(payload, warnings);
}

function toProtocolError(error, code = "ERR_ASSET_STEWARD") {
  return compatibleError(error, code);
}

function withProtocol(action, errorCode = "ERR_ASSET_STEWARD") {
  try {
    const payload = action();
    if (payload && typeof payload.then === "function") {
      return payload.then((result) => toProtocol(result)).catch((error) => toProtocolError(error, errorCode));
    }
    return toProtocol(payload);
  } catch (error) {
    return toProtocolError(error, errorCode);
  }
}

function normalizeScanDirectory(value) {
  return AssetScan.normalizeScanDirectory(value);
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function getToolboxFramework() {
  return cloneData({
    version: TOOLBOX_FRAMEWORK_VERSION,
    packageVersion: PACKAGE_VERSION,
    tabs: TOOLBOX_TABS,
    modules: TOOLBOX_MODULES,
    summary: {
      readyCount: TOOLBOX_MODULES.filter((item) => item.status === "ready").length,
      scaffoldCount: TOOLBOX_TABS.filter((item) => item.status === "scaffold").length,
      plannedCount: TOOLBOX_MODULES.filter((item) => item.status === "planned").length
    },
    safetyRules: [
      "健康检查和未引用资源候选只执行只读扫描，不执行删除或修复。",
      "后续删除能力必须保留预览、备份勾选和二次确认。",
      "所有 Cocos 资源移动和删除都必须通过 Creator AssetDB。",
      "动态加载路径、内置资源 UUID 和渠道资源需要人工复核。"
    ]
  });
}

function exportSessionReport(payload) {
  return Report.exportSessionReport(payload);
}

function formatReportTimestamp(isoTime) {
  return Report.formatReportTimestamp(isoTime);
}

function renderSessionReportMarkdown(report) {
  return Report.renderSessionReportMarkdown(report);
}

function scanAssets(options) {
  return AssetScan.scanAssets(options);
}

function checkReferences(payload) {
  return ReferenceGraph.checkReferences(payload);
}

async function getSelectedAssetPath() {
  const selected = Editor.Selection?.getSelected?.("asset") || [];
  const selectedAsset = selected[0];
  if (!selectedAsset) {
    throw new Error("请先在资源管理器中选中一个资源。");
  }

  const directPath = normalizeAssetPathCandidate(selectedAsset);
  const path = directPath || normalizeAssetPathCandidate(await querySelectedAssetInfo(selectedAsset));
  if (!path) {
    throw new Error("无法从当前选中项解析资源路径。");
  }
  if (path.toLowerCase().endsWith(".meta")) {
    throw new Error(`请选择资源本体，不要选择 .meta：${path}`);
  }
  if (!isInsideAssets(path) || !pathExists(path)) {
    throw new Error(`当前选中资源不存在或不在 assets 下：${path}`);
  }

  return { path };
}

async function querySelectedAssetInfo(selectedAsset) {
  try {
    return await Editor.Message.request("asset-db", "query-asset-info", selectedAsset);
  } catch (_error) {
    return null;
  }
}

function normalizeAssetPathCandidate(value) {
  if (!value) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map(normalizeAssetPathCandidate).find(Boolean) || "";
  }
  if (typeof value === "object") {
    return [
      value.url,
      value.path,
      value.file,
      value.source,
      value.asset?.url,
      value.asset?.path
    ].map(normalizeAssetPathCandidate).find(Boolean) || "";
  }

  const raw = String(value).trim();
  if (!raw) {
    return "";
  }
  if (raw.startsWith("db://")) {
    return normalizeRelativePath(raw.slice("db://".length));
  }

  const relativePath = normalizeRelativePath(raw);
  if (isInsideAssets(relativePath)) {
    return relativePath;
  }

  const projectRelativePath = toRelativePath(raw);
  return isInsideAssets(projectRelativePath) ? projectRelativePath : "";
}

function collectSerializedReferenceDetails(text, extension, uuidToTargets) {
  return ReferenceGraph.collectSerializedReferenceDetails(text, extension, uuidToTargets);
}

function checkNodeReferences(payload) {
  return ReferenceGraph.checkNodeReferences(payload);
}

function collectSerializedNodeReferenceDetails(text, extension, nodeUuid) {
  return ReferenceGraph.collectSerializedNodeReferenceDetails(text, extension, nodeUuid);
}

function extractUuids(text) {
  return ReferenceGraph.extractUuids(text);
}

function countTextOccurrences(text, needle) {
  return ReferenceGraph.countTextOccurrences(text, needle);
}

function checkResourcesRuntime(payload) {
  return RuntimeResources.checkResourcesRuntime(payload);
}

function extractResourcesRuntimeCalls(text, codePath) {
  return RuntimeResources.extractResourcesRuntimeCalls(text, codePath);
}

function parseStaticStringExpression(expression) {
  return RuntimeResources.parseStaticStringExpression(expression);
}

function resourceMatchesRuntimeCall(resource, call) {
  return RuntimeResources.resourceMatchesRuntimeCall(resource, call);
}

function reportPackageSize(payload) {
  return HealthChecks.reportPackageSize(payload);
}

function checkDirectoryConvention(payload) {
  return HealthChecks.checkDirectoryConvention(payload);
}

function checkDuplicateAssets(payload) {
  return HealthChecks.checkDuplicateAssets(payload);
}

function checkMaterialTextures(payload) {
  return HealthChecks.checkMaterialTextures(payload);
}

function checkScenePrefabReferenceHealth(payload) {
  return HealthChecks.checkScenePrefabReferenceHealth(payload);
}

function scanUnusedAssets(payload) {
  return UnusedDelete.scanUnusedAssets(payload);
}

function buildUnusedDeletePlan(payload) {
  return UnusedDelete.buildUnusedDeletePlan(payload);
}

async function executeUnusedDelete(payload) {
  const result = await UnusedDelete.executeUnusedDelete(payload, lastUnusedDeletePlan);
  lastUnusedDeletePlan = null;
  return result;
}

function validateUnusedDeletePlanStillCurrent(plan) {
  return UnusedDelete.validateUnusedDeletePlanStillCurrent(plan);
}

function createUnusedDeleteBackup(plan) {
  return UnusedDelete.createUnusedDeleteBackup(plan);
}

function writeUnusedDeleteExecutionAudit(backup, result) {
  return UnusedDelete.writeUnusedDeleteExecutionAudit(backup, result);
}

function collectUnusedDeleteBackupFiles(plan) {
  return UnusedDelete.collectUnusedDeleteBackupFiles(plan);
}

async function executeMoves(payload) {
  const result = await MovePlan.executeMovePlan(payload, lastPlan);
  lastPlan = null;
  return result;
}

function buildMovePlan(payload) {
  return MovePlan.buildMovePlan(payload, { scanAssets });
}

function expandSelectedFiles(selectedPaths) {
  return MovePlan.expandSelectedFiles(selectedPaths, { scanAssets });
}

function locateAsset(payload) {
  const path = normalizeRelativePath(payload?.path);
  if (!isInsideAssets(path) || !pathExists(path)) {
    throw new Error("资源不存在，可能已经移动或删除。");
  }
  Editor.Message.send("assets", "twinkle", toDbUrl(path));
  return { path };
}

async function selectReferenceNode(payload) {
  const nodeUuid = String(payload?.nodeUuid || "").trim();
  if (!nodeUuid) {
    throw new Error("该引用位置没有可用于选择节点的稳定 ID。");
  }
  let node;
  try {
    node = await Editor.Message.request("scene", "query-node", nodeUuid);
  } catch (_error) {
    throw new Error("当前打开的场景或 Prefab 中未找到该节点，请先打开对应引用资源。");
  }
  if (!node) {
    throw new Error("当前打开的场景或 Prefab 中未找到该节点，请先打开对应引用资源。");
  }
  Editor.Selection.select("node", nodeUuid);
  return {
    nodeUuid,
    nodePath: String(payload?.nodePath || "")
  };
}

exports._test = {
  normalizeRelativePath,
  normalizeExtensions,
  normalizeKeywords,
  canonicalizeSelectedPaths: MovePlan.canonicalizeSelectedPaths,
  destinationOccupied,
  expandSelectedFiles,
  ruleMatchesSource: MovePlan.ruleMatchesSource,
  collectSourceDirectoryCandidates: MovePlan.collectSourceDirectoryCandidates,
  findAvailableDestination: MovePlan.findAvailableDestination,
  resolvePlanItem: MovePlan.resolvePlanItem,
  buildMovePlan,
  scanAssets,
  getHistoryDetail,
  checkReferences,
  collectSerializedReferenceDetails,
  getSelectedAssetPath,
  normalizeAssetPathCandidate,
  checkNodeReferences,
  collectSerializedNodeReferenceDetails,
  selectReferenceNode,
  checkResourcesRuntime,
  reportPackageSize,
  checkDirectoryConvention,
  checkDuplicateAssets,
  checkMaterialTextures,
  checkScenePrefabReferenceHealth,
  scanUnusedAssets,
  buildUnusedDeletePlan,
  executeUnusedDelete,
  createUnusedDeleteBackup,
  writeUnusedDeleteExecutionAudit,
  collectUnusedDeleteBackupFiles,
  exportSessionReport,
  renderSessionReportMarkdown,
  formatReportTimestamp,
  buildSerializedAssetGraph: ReferenceGraph.buildSerializedAssetGraph,
  collectReachableAssetChains: ReferenceGraph.collectReachableAssetChains,
  collectMaterialTextureReferences: HealthChecks.collectMaterialTextureReferences,
  normalizeUuidWhitelist: ReferenceGraph.normalizeUuidWhitelist,
  countGraphUuidOccurrences: ReferenceGraph.countGraphUuidOccurrences,
  buildDuplicateGroups: HealthChecks.buildDuplicateGroups,
  hashFileSha256: UnusedDelete.hashFileSha256,
  extractGraphUuids: ReferenceGraph.extractGraphUuids,
  getToolboxFramework,
  normalizeTopN: HealthChecks.normalizeTopN,
  extractResourcesRuntimeCalls,
  parseStaticStringExpression,
  resourceMatchesRuntimeCall,
  extractUuids,
  countTextOccurrences,
  migrateProfile
};
