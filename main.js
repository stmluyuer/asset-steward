"use strict";

const Fs = require("fs");
const Path = require("path");
const { compatibleSuccess, compatibleError } = require("./main/protocol");
const {
  getProjectPath,
  normalizeRelativePath,
  toProjectPath,
  toDbUrl,
  isInsideAssets,
  isStrictlyInside,
  comparePath,
  walk,
  toRelativePath,
  statPath,
  pathExists,
  destinationOccupied,
  hasMeta,
} = require("./main/path-utils");
const {
  loadProfile,
  migrateProfile,
  loadState,
  getHistoryDetail,
  getLogs,
  appendLog,
  clearLogs,
  sanitizeRules,
  normalizeExtensions,
  normalizeKeywords,
  saveRules,
} = require("./main/profile");
const AssetScan = require("./main/asset-scan");
const ReferenceGraph = require("./main/reference-graph");
const RuntimeResources = require("./main/runtime-resources");
const MovePlan = require("./main/move-plan");
const Report = require("./main/report");
const UnusedDelete = require("./main/unused-delete");
const PACKAGE_VERSION = require("./package.json").version;

const PACKAGE_NAME = "asset-steward";
const UNUSED_IGNORED_FILES = UnusedDelete.UNUSED_IGNORED_FILES;
const MATERIAL_EXTENSIONS = new Set([".material", ".mtl", ".pmtl"]);
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
  const scanDirectory = normalizeScanDirectory(payload?.directory || payload?.scanDirectory);
  const scene = normalizeScenePath(payload?.scene);
  const includeMeta = payload?.includeMeta === true;
  const topN = normalizeTopN(payload?.topN);
  const files = [];
  const directoryStats = new Map();
  const typeStats = new Map();
  let excludedMetaCount = 0;
  let excludedMetaSize = 0;

  walk(toProjectPath(scanDirectory), (fullPath, entry) => {
    if (!entry.isFile()) {
      return;
    }
    const path = toRelativePath(fullPath);
    const size = Fs.statSync(fullPath).size;
    if (!includeMeta && path.toLowerCase().endsWith(".meta")) {
      excludedMetaCount++;
      excludedMetaSize += size;
      return;
    }

    const extension = Path.extname(path).toLowerCase() || "(无扩展名)";
    const file = { path, extension, size };
    files.push(file);
    addSizeStat(typeStats, extension, size);

    let directory = normalizeRelativePath(Path.dirname(path));
    while (directory && directory !== "." && directory !== scanDirectory && isStrictlyInside(scanDirectory, directory)) {
      addSizeStat(directoryStats, directory, size);
      directory = normalizeRelativePath(Path.dirname(directory));
    }
  });

  const directoryRanking = [...directoryStats.entries()]
    .map(([path, stat]) => ({ path, count: stat.count, totalSize: stat.totalSize }))
    .sort(sortSizeRanking);
  const typeRanking = [...typeStats.entries()]
    .map(([extension, stat]) => ({ extension, count: stat.count, totalSize: stat.totalSize }))
    .sort(sortSizeRanking);
  const topFiles = files.slice()
    .sort((left, right) => right.size - left.size || comparePath(left.path, right.path))
    .slice(0, topN);
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const reachableReport = buildReachableSizeReport(scene, scanDirectory, topN);
  return {
    directoryRanking,
    typeRanking,
    topFiles,
    referencedTopFiles: reachableReport.topFiles,
    summary: {
      scanDirectory,
      scene,
      includeMeta,
      topN,
      fileCount: files.length,
      totalSize,
      directoryCount: directoryRanking.length,
      typeCount: typeRanking.length,
      excludedMetaCount,
      excludedMetaSize,
      referencedFileCount: reachableReport.fileCount,
      referencedTotalSize: reachableReport.totalSize,
      unresolvedReferenceCount: reachableReport.unresolvedReferenceCount
    },
    warning: "主场景引用排行只依据序列化 UUID 依赖链；resources.load/loadDir 即使可静态识别也不计入。统计值为项目源资源磁盘体积，不等同于构建后包体。"
  };
}

function normalizeScenePath(value) {
  return ReferenceGraph.normalizeScenePath(value);
}

function buildReachableSizeReport(scene, scanDirectory, topN) {
  const graph = buildSerializedAssetGraph();
  const sceneAsset = graph.byPath.get(scene);
  if (!sceneAsset) {
    throw new Error(`主场景没有有效 UUID：${scene}`);
  }
  const reachable = collectReachableAssetChains(sceneAsset, graph.byUuid);
  const files = [];
  let totalSize = 0;
  for (const asset of graph.assets) {
    if (asset.path === scene || !isPathInDirectory(asset.path, scanDirectory) || !reachable.chains.has(asset.path)) {
      continue;
    }
    totalSize += asset.size;
    files.push({
      path: asset.path,
      extension: asset.extension,
      size: asset.size,
      chain: reachable.chains.get(asset.path)
    });
  }
  files.sort((left, right) => right.size - left.size || comparePath(left.path, right.path));
  return {
    fileCount: files.length,
    totalSize,
    topFiles: files.slice(0, topN),
    unresolvedReferenceCount: graph.unresolvedReferenceCount
  };
}

function buildSerializedAssetGraph() {
  return ReferenceGraph.buildSerializedAssetGraph();
}

function collectReachableAssetChains(rootAsset, byUuid) {
  return ReferenceGraph.collectReachableAssetChains(rootAsset, byUuid);
}

function readUtf8Text(filePath) {
  return ReferenceGraph.readUtf8Text(filePath);
}

function parseJsonObject(text) {
  return ReferenceGraph.parseJsonObject(text);
}

function collectOwnedGraphUuids(meta) {
  return ReferenceGraph.collectOwnedGraphUuids(meta);
}

function collectGraphMetaNodeUuids(node, result) {
  return ReferenceGraph.collectGraphMetaNodeUuids(node, result);
}

function extractGraphUuids(text) {
  return ReferenceGraph.extractGraphUuids(text);
}

function isPathInDirectory(path, directory) {
  return ReferenceGraph.isPathInDirectory(path, directory);
}

function normalizeTopN(value) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) {
    return 20;
  }
  return Math.min(200, Math.max(1, number));
}

function addSizeStat(stats, key, size) {
  const stat = stats.get(key) || { count: 0, totalSize: 0 };
  stat.count++;
  stat.totalSize += size;
  stats.set(key, stat);
}

function sortSizeRanking(left, right) {
  return right.totalSize - left.totalSize || right.count - left.count || comparePath(left.path || left.extension, right.path || right.extension);
}

function checkDirectoryConvention(payload) {
  const scanDirectory = normalizeScanDirectory(payload?.directory || payload?.scanDirectory || "assets/res");
  const cleanRules = sanitizeRules(payload?.rules || loadProfile().rules).filter((rule) => rule.enabled);
  for (const rule of cleanRules) {
    validateRuleTarget(rule.target);
  }

  const mismatches = [];
  let fileCount = 0;
  let matchedCount = 0;
  let compliantCount = 0;
  let unmatchedCount = 0;
  let missingMetaCount = 0;
  for (const entry of scanAssets({ directory: scanDirectory }).entries) {
    if (entry.kind !== "file") {
      continue;
    }
    fileCount++;
    const rule = cleanRules.find((item) => MovePlan.ruleMatchesSource(item, entry.path, Path.extname(entry.path).toLowerCase()));
    if (!rule) {
      unmatchedCount++;
      continue;
    }
    matchedCount++;
    const currentDirectory = normalizeRelativePath(Path.posix.dirname(entry.path));
    if (currentDirectory === rule.target) {
      compliantCount++;
      continue;
    }
    if (entry.missingMeta) {
      missingMetaCount++;
    }
    mismatches.push({
      path: entry.path,
      extension: entry.extension,
      size: entry.size,
      missingMeta: entry.missingMeta,
      currentDirectory,
      suggestedDirectory: rule.target,
      suggestedPath: normalizeRelativePath(`${rule.target}/${Path.basename(entry.path)}`),
      ruleId: rule.id
    });
  }
  mismatches.sort((left, right) => comparePath(left.suggestedDirectory, right.suggestedDirectory) || comparePath(left.path, right.path));
  return {
    mismatches,
    summary: {
      scanDirectory,
      fileCount,
      ruleCount: cleanRules.length,
      matchedCount,
      compliantCount,
      mismatchCount: mismatches.length,
      unmatchedCount,
      missingMetaCount
    },
    warning: "目录规范检查只依据当前自动分类规则的首个命中项。生成移动预览后仍需复核冲突、重命名、覆盖和缺少 meta 等风险。"
  };
}

function checkDuplicateAssets(payload) {
  const scanDirectory = normalizeScanDirectory(payload?.directory || payload?.scanDirectory || "assets/res");
  const files = [];
  walk(toProjectPath(scanDirectory), (fullPath, entry) => {
    if (!entry.isFile() || fullPath.toLowerCase().endsWith(".meta")) {
      return;
    }
    const path = toRelativePath(fullPath);
    if (UNUSED_IGNORED_FILES.has(Path.basename(path).toLowerCase())) {
      return;
    }
    const stat = Fs.statSync(fullPath);
    files.push({
      path,
      fullPath,
      name: Path.basename(path),
      extension: Path.extname(path).toLowerCase() || "(无扩展名)",
      size: stat.size
    });
  });

  const sameNameGroups = buildDuplicateGroups(
    files,
    (file) => file.name.toLowerCase(),
    (key, members) => ({
      key,
      name: members[0].name,
      members: toPublicDuplicateMembers(members)
    })
  );

  const sizeBuckets = groupItems(files, (file) => String(file.size));
  const hashCandidates = [...sizeBuckets.values()].filter((members) => members.length > 1).flat();
  for (const file of hashCandidates) {
    file.hash = hashFileSha256(file.fullPath);
  }
  const duplicateHashGroups = buildDuplicateGroups(
    hashCandidates,
    (file) => file.hash,
    (key, members) => ({
      key,
      hash: key,
      size: members[0].size,
      duplicateBytes: members[0].size * (members.length - 1),
      members: toPublicDuplicateMembers(members)
    })
  );
  const duplicateHashFileCount = duplicateHashGroups.reduce((total, group) => total + group.members.length, 0);
  const sameNameFileCount = sameNameGroups.reduce((total, group) => total + group.members.length, 0);
  const duplicateBytes = duplicateHashGroups.reduce((total, group) => total + group.duplicateBytes, 0);
  return {
    sameNameGroups,
    duplicateHashGroups,
    summary: {
      scanDirectory,
      fileCount: files.length,
      hashCandidateCount: hashCandidates.length,
      sameNameGroupCount: sameNameGroups.length,
      sameNameFileCount,
      duplicateHashGroupCount: duplicateHashGroups.length,
      duplicateHashFileCount,
      duplicateBytes
    },
    warning: "同名和相同 hash 仅表示需要人工复核，不代表资源可以删除。删除或替换前必须结合 UUID 引用、动态加载和玩法需求确认。"
  };
}

function groupItems(items, getKey) {
  const groups = new Map();
  for (const item of items) {
    const key = getKey(item);
    const members = groups.get(key) || [];
    members.push(item);
    groups.set(key, members);
  }
  return groups;
}

function buildDuplicateGroups(items, getKey, createGroup) {
  return [...groupItems(items, getKey).entries()]
    .filter(([, members]) => members.length > 1)
    .map(([key, members]) => createGroup(key, [...members].sort((left, right) => comparePath(left.path, right.path))))
    .sort((left, right) => right.members.length - left.members.length || comparePath(left.key, right.key));
}

function toPublicDuplicateMembers(members) {
  return members.map((file) => ({
    path: file.path,
    name: file.name,
    extension: file.extension,
    size: file.size
  }));
}

function hashFileSha256(fullPath) {
  return UnusedDelete.hashFileSha256(fullPath);
}

function checkMaterialTextures(payload) {
  const scene = normalizeScenePath(payload?.scene);
  const scanDirectory = normalizeScanDirectory(payload?.directory || payload?.scanDirectory || "assets/res");
  const graph = buildSerializedAssetGraph();
  const sceneAsset = graph.byPath.get(scene);
  if (!sceneAsset) {
    throw new Error(`主场景没有有效 UUID：${scene}`);
  }
  const reachable = collectReachableAssetChains(sceneAsset, graph.byUuid).chains;
  const references = [];
  let materialCount = 0;
  let reachableMaterialCount = 0;
  let noTextureMaterialCount = 0;
  let invalidMaterialCount = 0;
  let resolvedReferenceCount = 0;
  let reviewReferenceCount = 0;

  walk(toProjectPath(scanDirectory), (fullPath, entry) => {
    if (!entry.isFile()) {
      return;
    }
    const materialPath = toRelativePath(fullPath);
    const materialExtension = Path.extname(materialPath).toLowerCase();
    if (!MATERIAL_EXTENSIONS.has(materialExtension)) {
      return;
    }
    materialCount++;
    const materialReachable = reachable.has(materialPath);
    if (materialReachable) {
      reachableMaterialCount++;
    }
    let material;
    try {
      material = JSON.parse(readUtf8Text(fullPath));
    } catch (error) {
      invalidMaterialCount++;
      references.push({
        materialPath,
        materialExtension,
        materialReachable,
        propertyPath: "-",
        uuid: "-",
        expectedType: "-",
        status: "invalid-material",
        texturePath: null
      });
      return;
    }
    const textureReferences = collectMaterialTextureReferences(material);
    if (textureReferences.length === 0) {
      noTextureMaterialCount++;
      return;
    }
    for (const reference of textureReferences) {
      const texture = graph.byUuid.get(reference.uuid);
      const status = texture ? "resolved" : "review";
      if (texture) {
        resolvedReferenceCount++;
      } else {
        reviewReferenceCount++;
      }
      references.push({
        materialPath,
        materialExtension,
        materialReachable,
        propertyPath: reference.propertyPath,
        uuid: reference.uuid,
        expectedType: reference.expectedType,
        status,
        texturePath: texture?.path || null
      });
    }
  });

  references.sort((left, right) => {
    const statusOrder = { "invalid-material": 0, review: 1, resolved: 2 };
    return (statusOrder[left.status] ?? 9) - (statusOrder[right.status] ?? 9)
      || comparePath(left.materialPath, right.materialPath)
      || comparePath(left.propertyPath, right.propertyPath)
      || comparePath(left.uuid, right.uuid);
  });
  return {
    references,
    materialExtensions: [...MATERIAL_EXTENSIONS].sort(comparePath),
    summary: {
      scene,
      scanDirectory,
      materialCount,
      reachableMaterialCount,
      unreachableMaterialCount: materialCount - reachableMaterialCount,
      textureReferenceCount: resolvedReferenceCount + reviewReferenceCount,
      resolvedReferenceCount,
      reviewReferenceCount,
      noTextureMaterialCount,
      invalidMaterialCount
    },
    warning: "无法在项目资源 UUID 图中解析的贴图引用统一标记为“待复核”，可能是引擎内置资源；检查只报告和定位，不自动修复材质。"
  };
}

function collectMaterialTextureReferences(material) {
  const references = [];
  collectMaterialTextureReferenceNodes(material, "", references);
  return references;
}

function collectMaterialTextureReferenceNodes(node, propertyPath, references) {
  if (!node || typeof node !== "object") {
    return;
  }
  if (
    typeof node.__uuid__ === "string"
    && typeof node.__expectedType__ === "string"
    && /(?:texture|spriteframe)/i.test(node.__expectedType__)
  ) {
    references.push({
      propertyPath: propertyPath || "(根节点)",
      uuid: node.__uuid__.toLowerCase(),
      expectedType: node.__expectedType__
    });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectMaterialTextureReferenceNodes(item, `${propertyPath}[${index}]`, references));
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    collectMaterialTextureReferenceNodes(value, propertyPath ? `${propertyPath}.${key}` : key, references);
  }
}

function checkScenePrefabReferenceHealth(payload) {
  const scanDirectory = normalizeScanDirectory(payload?.directory || payload?.scanDirectory || "assets");
  const extensions = ReferenceGraph.normalizeReferenceExtensions(payload?.extensions || ".scene,.prefab")
    .filter((extension) => extension === ".scene" || extension === ".prefab");
  if (extensions.length === 0) {
    throw new Error("文件类型至少需要包含 .scene 或 .prefab。");
  }
  const whitelist = normalizeUuidWhitelist(payload?.whitelist);
  const graph = buildSerializedAssetGraph();
  const issues = [];
  const unresolvedUuids = new Set();
  const affectedFiles = new Set();
  let scannedFileCount = 0;
  let referenceCount = 0;
  let resolvedReferenceCount = 0;
  let whitelistReferenceCount = 0;
  let unresolvedReferenceCount = 0;

  walk(toProjectPath(scanDirectory), (fullPath, entry) => {
    if (!entry.isFile()) {
      return;
    }
    const filePath = toRelativePath(fullPath);
    const extension = Path.extname(filePath).toLowerCase();
    if (!extensions.includes(extension)) {
      return;
    }
    scannedFileCount++;
    const counts = countGraphUuidOccurrences(readUtf8Text(fullPath));
    const fileAsset = graph.byPath.get(filePath);
    for (const [uuid, matchCount] of counts) {
      referenceCount += matchCount;
      if (fileAsset?.ownedUuids.has(uuid) || graph.byUuid.has(uuid)) {
        resolvedReferenceCount += matchCount;
        continue;
      }
      if (whitelist.has(uuid)) {
        whitelistReferenceCount += matchCount;
        continue;
      }
      unresolvedReferenceCount += matchCount;
      unresolvedUuids.add(uuid);
      affectedFiles.add(filePath);
      issues.push({
        filePath,
        extension,
        uuid,
        matchCount,
        status: "review"
      });
    }
  });
  issues.sort((left, right) => right.matchCount - left.matchCount || comparePath(left.filePath, right.filePath) || comparePath(left.uuid, right.uuid));
  return {
    issues,
    whitelist: [...whitelist].sort(comparePath),
    extensions,
    summary: {
      scanDirectory,
      scannedFileCount,
      referenceCount,
      resolvedReferenceCount,
      whitelistReferenceCount,
      unresolvedReferenceCount,
      unresolvedUuidCount: unresolvedUuids.size,
      affectedFileCount: affectedFiles.size
    },
    warning: "无法解析 UUID 统一标记为“待复核”，不直接判定资源丢失。部分引擎内置资源可在确认后加入白名单；检查只报告和定位，不自动修复场景或 Prefab。"
  };
}

function normalizeUuidWhitelist(value) {
  return ReferenceGraph.normalizeUuidWhitelist(value);
}

function countGraphUuidOccurrences(text) {
  return ReferenceGraph.countGraphUuidOccurrences(text);
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
  buildSerializedAssetGraph,
  collectReachableAssetChains,
  collectMaterialTextureReferences,
  normalizeUuidWhitelist,
  countGraphUuidOccurrences,
  buildDuplicateGroups,
  hashFileSha256,
  extractGraphUuids,
  getToolboxFramework,
  normalizeTopN,
  extractResourcesRuntimeCalls,
  parseStaticStringExpression,
  resourceMatchesRuntimeCall,
  extractUuids,
  countTextOccurrences,
  migrateProfile
};
