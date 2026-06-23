"use strict";

const Fs = require("fs");
const Path = require("path");
const Crypto = require("crypto");
const PACKAGE_VERSION = require("./package.json").version;

const PACKAGE_NAME = "project-asset-mover";
const PROFILE_RELATIVE = "profiles/project-asset-mover.json";
const LOG_RELATIVE = "profiles/project-asset-mover.logs.json";
const REPORT_DIRECTORY_RELATIVE = "reports/project-asset-mover";
const BACKUP_DIRECTORY_RELATIVE = "backups/project-asset-mover";
const PROFILE_VERSION = 2;
const MAX_HISTORY = 30;
const MAX_LOGS = 200;
const VALID_CONFLICT_POLICIES = new Set(["skip", "rename", "overwrite"]);
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];
const DEFAULT_REFERENCE_EXTENSIONS = [".scene", ".prefab", ".mtl", ".material", ".anim", ".effect"];
const DEFAULT_NODE_REFERENCE_EXTENSIONS = [".scene", ".prefab"];
const DEFAULT_CODE_SCAN_DIRECTORIES = ["assets/script", "assets/scripts"];
const CODE_EXTENSIONS = new Set([".ts", ".js"]);
const UNUSED_PROTECTED_EXTENSIONS = new Set([".cjs", ".js", ".mjs", ".ts", ".chunk"]);
const UNUSED_IGNORED_FILES = new Set([".gitkeep", ".ds_store", "thumbs.db"]);
const MATERIAL_EXTENSIONS = new Set([".material", ".mtl", ".pmtl"]);
const GRAPH_UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:@[0-9a-z_-]+)?/gi;
const GRAPH_TEXT_EXTENSIONS = new Set([
  ".anim",
  ".animgraph",
  ".chunk",
  ".effect",
  ".json",
  ".material",
  ".mtl",
  ".pmtl",
  ".prefab",
  ".scene",
  ".txt"
]);
const PROTECTED_CLEANUP_DIRECTORIES = new Set([
  "assets/res",
  "assets/resources",
  "assets/scene",
  "assets/script"
]);
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
let scriptTypeNameCache = null;

exports.load = function () {
  console.log(`[${PACKAGE_NAME}] loaded`);
};

exports.unload = function () {
  lastPlan = null;
  lastUnusedDeletePlan = null;
  scriptTypeNameCache = null;
  console.log(`[${PACKAGE_NAME}] unloaded`);
};

exports.methods = {
  openPanel() {
    Editor.Panel.open(`${PACKAGE_NAME}.main`);
  },

  scanAssets(options) {
    return scanAssets(options);
  },

  checkReferences(payload) {
    return checkReferences(payload);
  },

  async selectReferenceNode(payload) {
    return selectReferenceNode(payload);
  },

  checkNodeReferences(payload) {
    return checkNodeReferences(payload);
  },

  checkResourcesRuntime(payload) {
    return checkResourcesRuntime(payload);
  },

  reportPackageSize(payload) {
    return reportPackageSize(payload);
  },

  checkDirectoryConvention(payload) {
    return checkDirectoryConvention(payload);
  },

  checkDuplicateAssets(payload) {
    return checkDuplicateAssets(payload);
  },

  checkMaterialTextures(payload) {
    return checkMaterialTextures(payload);
  },

  checkScenePrefabReferenceHealth(payload) {
    return checkScenePrefabReferenceHealth(payload);
  },

  scanUnusedAssets(payload) {
    return scanUnusedAssets(payload);
  },

  previewUnusedDelete(payload) {
    lastUnusedDeletePlan = buildUnusedDeletePlan(payload);
    return lastUnusedDeletePlan.publicResult;
  },

  async executeUnusedDelete(payload) {
    return executeUnusedDelete(payload);
  },

  getToolboxFramework() {
    return getToolboxFramework();
  },

  loadState() {
    return loadState();
  },

  getHistoryDetail(payload) {
    return getHistoryDetail(payload);
  },

  appendLog(payload) {
    return appendLog(payload);
  },

  getLogs() {
    return getLogs();
  },

  clearLogs() {
    return clearLogs();
  },

  exportSessionReport(payload) {
    return exportSessionReport(payload);
  },

  saveRules(payload) {
    return saveRules(payload?.rules);
  },

  previewMoves(payload) {
    lastPlan = buildMovePlan(payload);
    return lastPlan.publicResult;
  },

  async executeMoves(payload) {
    return executeMoves(payload);
  },

  previewReverse(payload) {
    lastPlan = buildReversePlan(payload?.historyId, payload?.conflictPolicy);
    return lastPlan.publicResult;
  },

  locateAsset(payload) {
    return locateAsset(payload);
  },
};

function getProjectPath() {
  return global.Editor?.Project?.path || Path.resolve(__dirname, "../..");
}

function normalizeRelativePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function toProjectPath(relativePath) {
  return Path.join(getProjectPath(), normalizeRelativePath(relativePath));
}

function toDbUrl(relativePath) {
  return `db://${normalizeRelativePath(relativePath)}`;
}

function isInsideAssets(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  return normalized === "assets" || normalized.startsWith("assets/");
}

function isStrictlyInside(parentPath, childPath) {
  return normalizeRelativePath(childPath).startsWith(`${normalizeRelativePath(parentPath)}/`);
}

function comparePath(left, right) {
  return String(left).localeCompare(String(right), "zh-CN");
}

function walk(root, visitor) {
  if (!Fs.existsSync(root)) {
    return;
  }

  for (const entry of Fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = Path.join(root, entry.name);
    visitor(fullPath, entry);
    if (entry.isDirectory()) {
      walk(fullPath, visitor);
    }
  }
}

function toRelativePath(fullPath) {
  return normalizeRelativePath(Path.relative(getProjectPath(), fullPath));
}

function statPath(relativePath) {
  return Fs.statSync(toProjectPath(relativePath), { throwIfNoEntry: false }) || null;
}

function pathExists(relativePath) {
  return !!statPath(relativePath);
}

function destinationOccupied(relativePath) {
  return pathExists(relativePath) || pathExists(`${relativePath}.meta`);
}

function hasMeta(relativePath) {
  return pathExists(`${relativePath}.meta`);
}

function normalizeScanDirectory(value) {
  const directory = normalizeRelativePath(value || "assets") || "assets";
  if (!isInsideAssets(directory)) {
    throw new Error(`扫描目录必须位于 assets 下：${directory}`);
  }
  if (!statPath(directory)?.isDirectory()) {
    throw new Error(`扫描目录不存在或不是目录：${directory}`);
  }
  return directory;
}

function normalizeReferenceExtensions(value) {
  const extensions = normalizeExtensions(value);
  return extensions.length > 0 ? extensions : DEFAULT_REFERENCE_EXTENSIONS;
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(Fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  Fs.mkdirSync(Path.dirname(filePath), { recursive: true });
  Fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function getProfilePath() {
  return toProjectPath(PROFILE_RELATIVE);
}

function getLogPath() {
  return toProjectPath(LOG_RELATIVE);
}

function defaultProfile() {
  return {
    version: PROFILE_VERSION,
    rules: defaultRules(),
    history: []
  };
}

function defaultRules() {
  return [
    { id: "prefab", enabled: true, extensions: [".prefab"], nameKeywords: [], target: "assets/res/prefab" },
    { id: "audio", enabled: true, extensions: [".mp3", ".wav", ".ogg"], nameKeywords: [], target: "assets/res/audio" },
    { id: "model", enabled: true, extensions: [".fbx", ".gltf", ".glb"], nameKeywords: [], target: "assets/res/model" },
    { id: "image-ui", enabled: true, extensions: IMAGE_EXTENSIONS, nameKeywords: ["ui", "icon", "button", "btn", "joystick", "progress", "topic", "guide", "hud", "arrow", "coin", "gold", "sell", "按钮", "金币"], target: "assets/res/image/ui" },
    { id: "image-vfx", enabled: true, extensions: IMAGE_EXTENSIONS, nameKeywords: ["effect", "vfx", "fx", "glow", "particle", "ripple", "noise", "mask", "line", "lizi", "circle", "spark", "splash", "光", "圈", "特效"], target: "assets/res/image/vfx" },
    { id: "image-environment", enabled: true, extensions: IMAGE_EXTENSIONS, nameKeywords: ["water", "floor", "ground", "sky", "sea", "terrain", "track", "海", "地面", "天空"], target: "assets/res/image/environment" },
    { id: "image-model", enabled: true, extensions: IMAGE_EXTENSIONS, nameKeywords: ["_d", "_n", "_a", "_c", "albedo", "normal", "rough", "metal", "occlusion", "_ao"], target: "assets/res/image/model" },
    { id: "image-other", enabled: true, extensions: IMAGE_EXTENSIONS, nameKeywords: [], target: "assets/res/image/other" },
    { id: "effect-chunk", enabled: true, extensions: [".effect", ".chunk"], nameKeywords: [], target: "assets/res/effects" },
    { id: "material", enabled: true, extensions: [".mtl"], nameKeywords: [], target: "assets/res/material" }
  ];
}

function loadProfile() {
  const rawProfile = readJson(getProfilePath(), defaultProfile());
  const profile = migrateProfile(rawProfile);
  if (Number(rawProfile?.version) < PROFILE_VERSION) {
    saveProfile(profile);
  }
  return {
    version: PROFILE_VERSION,
    rules: sanitizeRules(profile.rules),
    history: Array.isArray(profile.history) ? profile.history.slice(0, MAX_HISTORY) : []
  };
}

function saveProfile(profile) {
  writeJson(getProfilePath(), {
    version: PROFILE_VERSION,
    rules: sanitizeRules(profile.rules),
    history: Array.isArray(profile.history) ? profile.history.slice(0, MAX_HISTORY) : []
  });
}

function migrateProfile(profile) {
  if (Number(profile?.version) >= PROFILE_VERSION) {
    return profile;
  }

  const oldRules = sanitizeRules(profile?.rules);
  const defaults = defaultRules();
  const defaultIds = new Set(defaults.map((rule) => rule.id));
  const preservedIds = new Set(["prefab", "audio", "model"]);
  const oldById = new Map(oldRules.map((rule) => [rule.id, rule]));
  const migratedDefaults = defaults.map((rule) => preservedIds.has(rule.id) && oldById.has(rule.id) ? oldById.get(rule.id) : rule);
  const customRules = oldRules.filter((rule) => rule.id !== "image" && !defaultIds.has(rule.id));
  return {
    version: PROFILE_VERSION,
    rules: [...migratedDefaults, ...customRules],
    history: Array.isArray(profile?.history) ? profile.history : []
  };
}

function loadState() {
  const profile = loadProfile();
  return {
    rules: profile.rules,
    history: profile.history,
    profilePath: PROFILE_RELATIVE
  };
}

function getHistoryDetail(payload) {
  const historyId = String(payload?.historyId || "").trim();
  if (!historyId) {
    throw new Error("缺少移动历史 ID。");
  }
  const entry = loadProfile().history.find((item) => item.id === historyId);
  if (!entry) {
    throw new Error("未找到指定移动历史，可能已超过最近 30 条保留范围。");
  }
  const moves = Array.isArray(entry.moves) ? entry.moves.map((move) => ({
    source: normalizeRelativePath(move.source),
    destination: normalizeRelativePath(move.destination),
    action: String(move.action || ""),
    overwrittenTargetRecoverable: move.overwrittenTargetRecoverable !== false
  })) : [];
  const deletedDirectories = Array.isArray(entry.deletedDirectories)
    ? entry.deletedDirectories.map(normalizeRelativePath)
    : [];
  return {
    detail: {
      id: entry.id,
      createdAt: entry.createdAt,
      kind: entry.kind,
      mode: entry.mode,
      conflictPolicy: entry.conflictPolicy,
      movedCount: Number(entry.movedCount) || moves.length,
      failedCount: Number(entry.failedCount) || 0,
      hasOverwrite: entry.hasOverwrite === true,
      deletedDirectories,
      cleanupFailedCount: Number(entry.cleanupFailedCount) || 0,
      moves,
      failedMovesPersisted: false,
      failedDirectoriesPersisted: false,
      warning: "历史记录只持久化成功移动项、覆盖风险和空目录清理摘要；执行失败项和清理失败明细需查看当次执行日志。反向计划仍需重新预览并人工复核。"
    }
  };
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

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function getLogs() {
  const data = readJson(getLogPath(), { logs: [] });
  return {
    logs: Array.isArray(data.logs) ? data.logs.slice(-MAX_LOGS) : [],
    logPath: LOG_RELATIVE
  };
}

function appendLog(payload) {
  const level = ["info", "warning", "error"].includes(payload?.level) ? payload.level : "info";
  const message = String(payload?.message || "").trim();
  if (!message) {
    return getLogs();
  }

  const data = getLogs();
  data.logs.push({
    time: new Date().toISOString(),
    level,
    message,
    detail: payload?.detail ? String(payload.detail) : ""
  });
  data.logs = data.logs.slice(-MAX_LOGS);
  writeJson(getLogPath(), { logs: data.logs });

  const output = `[${PACKAGE_NAME}] ${message}`;
  if (level === "error") {
    console.error(output);
  } else if (level === "warning") {
    console.warn(output);
  } else {
    console.log(output);
  }

  return data;
}

function clearLogs() {
  writeJson(getLogPath(), { logs: [] });
  return { logs: [], logPath: LOG_RELATIVE };
}

function exportSessionReport(payload) {
  const snapshot = cloneData(payload?.snapshot || {});
  if (snapshot.currentPlan && typeof snapshot.currentPlan === "object") {
    delete snapshot.currentPlan.token;
  }
  const generatedAt = new Date().toISOString();
  const report = {
    schemaVersion: 1,
    generatedAt,
    packageName: PACKAGE_NAME,
    packageVersion: PACKAGE_VERSION,
    projectPath: getProjectPath(),
    ...snapshot
  };
  const reportDirectory = toProjectPath(REPORT_DIRECTORY_RELATIVE);
  Fs.mkdirSync(reportDirectory, { recursive: true });
  const baseName = `project-asset-mover-${formatReportTimestamp(generatedAt)}`;
  const jsonRelativePath = normalizeRelativePath(`${REPORT_DIRECTORY_RELATIVE}/${baseName}.json`);
  const markdownRelativePath = normalizeRelativePath(`${REPORT_DIRECTORY_RELATIVE}/${baseName}.md`);
  writeJson(toProjectPath(jsonRelativePath), report);
  Fs.writeFileSync(toProjectPath(markdownRelativePath), renderSessionReportMarkdown(report), "utf8");
  return {
    generatedAt,
    reportDirectory: REPORT_DIRECTORY_RELATIVE,
    jsonPath: jsonRelativePath,
    markdownPath: markdownRelativePath,
    moduleCount: Array.isArray(report.modules) ? report.modules.length : 0
  };
}

function formatReportTimestamp(isoTime) {
  return String(isoTime || "")
    .replace(/\D/g, "")
    .slice(0, 17);
}

function renderSessionReportMarkdown(report) {
  const modules = Array.isArray(report.modules) ? report.modules : [];
  const lines = [
    "# 项目资源工具箱会话报告",
    "",
    `- 生成时间：${report.generatedAt || "-"}`,
    `- 扩展版本：${report.packageVersion || "-"}`,
    `- 项目路径：\`${escapeMarkdownInline(report.projectPath || "-")}\``,
    `- 已运行模块：${modules.length}`,
    "",
    "## 已运行模块",
    ""
  ];
  if (modules.length === 0) {
    lines.push("- 当前会话没有已运行的扫描或健康检查结果。", "");
  }
  for (const module of modules) {
    lines.push(`### ${module.title || module.id || "未命名模块"}`, "");
    appendMarkdownSummary(lines, module.summary);
    lines.push("<details>", "<summary>完整结果</summary>", "", "```json", JSON.stringify(module.data || {}, null, 2), "```", "", "</details>", "");
  }
  lines.push("## 当前移动计划", "");
  if (report.currentPlan) {
    appendMarkdownSummary(lines, report.currentPlan.summary);
    lines.push("```json", JSON.stringify(report.currentPlan, null, 2), "```", "");
  } else {
    lines.push("- 当前会话没有移动计划。", "");
  }
  lines.push("## 移动历史摘要", "");
  if (Array.isArray(report.history) && report.history.length > 0) {
    lines.push("| 时间 | 类型 | 模式 | 成功 | 失败 | 含覆盖 |", "|---|---|---|---:|---:|---|");
    for (const item of report.history) {
      lines.push(`| ${escapeMarkdownCell(item.createdAt)} | ${escapeMarkdownCell(item.kind)} | ${escapeMarkdownCell(item.mode)} | ${Number(item.movedCount) || 0} | ${Number(item.failedCount) || 0} | ${item.hasOverwrite ? "是" : "否"} |`);
    }
    lines.push("");
  } else {
    lines.push("- 当前没有移动历史摘要。", "");
  }
  lines.push("## 运行日志", "");
  if (Array.isArray(report.logs) && report.logs.length > 0) {
    lines.push("| 时间 | 级别 | 内容 |", "|---|---|---|");
    for (const log of report.logs) {
      lines.push(`| ${escapeMarkdownCell(log.time)} | ${escapeMarkdownCell(log.level)} | ${escapeMarkdownCell(log.message)} |`);
    }
    lines.push("");
  } else {
    lines.push("- 当前没有运行日志。", "");
  }
  return `${lines.join("\n")}\n`;
}

function appendMarkdownSummary(lines, summary) {
  const entries = Object.entries(summary && typeof summary === "object" ? summary : {});
  if (entries.length === 0) {
    lines.push("- 无摘要。", "");
    return;
  }
  lines.push("| 摘要字段 | 值 |", "|---|---|");
  for (const [key, value] of entries) {
    lines.push(`| ${escapeMarkdownCell(key)} | ${escapeMarkdownCell(formatMarkdownValue(value))} |`);
  }
  lines.push("");
}

function formatMarkdownValue(value) {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function escapeMarkdownCell(value) {
  return String(value ?? "-").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function escapeMarkdownInline(value) {
  return String(value ?? "-").replace(/`/g, "\\`");
}

function sanitizeRules(rules) {
  if (!Array.isArray(rules)) {
    return [];
  }

  return rules.map((rule, index) => ({
    id: String(rule?.id || `rule-${index + 1}`),
    enabled: rule?.enabled !== false,
    extensions: normalizeExtensions(rule?.extensions),
    nameKeywords: normalizeKeywords(rule?.nameKeywords),
    target: normalizeRelativePath(rule?.target)
  }));
}

function normalizeExtensions(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)
    .map((item) => item.startsWith(".") ? item : `.${item}`))];
}

function normalizeKeywords(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean))];
}

function saveRules(rules) {
  const profile = loadProfile();
  profile.rules = sanitizeRules(rules);
  saveProfile(profile);
  return { rules: profile.rules, profilePath: PROFILE_RELATIVE };
}

function scanAssets(options) {
  const search = String(options?.search || "").trim().toLowerCase();
  const extensionFilter = normalizeExtensions(options?.extensions);
  const scanDirectory = normalizeScanDirectory(options?.directory || options?.scanDirectory);
  const scanRoot = toProjectPath(scanDirectory);
  const entries = [];
  const directories = [scanDirectory];
  const issueItems = [];
  const typeStatsByExtension = new Map();
  const directoryPaths = [scanDirectory];
  let missingMetaCount = 0;
  let orphanMetaCount = 0;
  let emptyDirectoryCount = 0;
  let fileCount = 0;
  let directoryCount = 1;
  let totalSize = 0;

  walk(scanRoot, (fullPath, entry) => {
    const relative = toRelativePath(fullPath);
    if (entry.isFile() && relative.toLowerCase().endsWith(".meta")) {
      const owner = relative.slice(0, -".meta".length);
      if (!pathExists(owner)) {
        orphanMetaCount++;
        const ownerExtension = Path.extname(owner).toLowerCase();
        if (matchesScanFilters(relative, false, ownerExtension, search, extensionFilter)) {
          issueItems.push({
            kind: "orphan-meta",
            severity: "medium",
            path: relative,
            ownerPath: owner,
            extension: ownerExtension || "(无扩展名)",
            size: Fs.statSync(fullPath).size,
            locatable: false
          });
        }
      }
      return;
    }

    const isDirectory = entry.isDirectory();
    if (isDirectory) {
      directories.push(relative);
      directoryPaths.push(relative);
      directoryCount++;
    }

    const extension = isDirectory ? "" : Path.extname(entry.name).toLowerCase();
    const size = isDirectory ? 0 : Fs.statSync(fullPath).size;
    if (!isDirectory) {
      fileCount++;
      totalSize += size;
      if (matchesScanFilters(relative, false, extension, search, extensionFilter)) {
        const statKey = extension || "(无扩展名)";
        const stat = typeStatsByExtension.get(statKey) || { extension: statKey, count: 0, totalSize: 0 };
        stat.count++;
        stat.totalSize += size;
        typeStatsByExtension.set(statKey, stat);
      }
    }

    const missingMeta = !hasMeta(relative);
    if (missingMeta) {
      missingMetaCount++;
      if (matchesScanFilters(relative, isDirectory, extension, search, extensionFilter)) {
        issueItems.push({
          kind: "missing-meta",
          severity: "high",
          path: relative,
          ownerPath: relative,
          extension: isDirectory ? "(目录)" : extension || "(无扩展名)",
          size,
          locatable: true
        });
      }
    }

    if (search && !relative.toLowerCase().includes(search)) {
      return;
    }
    if (!isDirectory && extensionFilter.length > 0 && !extensionFilter.includes(extension)) {
      return;
    }

    entries.push({
      path: relative,
      name: entry.name,
      kind: isDirectory ? "directory" : "file",
      extension: isDirectory ? "(目录)" : extension || "(无扩展名)",
      size,
      missingMeta,
      selectable: relative !== "assets"
    });
  });

  for (const directory of directoryPaths) {
    if (directory === "assets" || PROTECTED_CLEANUP_DIRECTORIES.has(directory)) {
      continue;
    }
    if (isReportEmptyDirectory(directory)) {
      emptyDirectoryCount++;
      if (matchesScanFilters(directory, true, "", search, extensionFilter)) {
        issueItems.push({
          kind: "empty-directory",
          severity: "low",
          path: directory,
          ownerPath: directory,
          extension: "(目录)",
          size: 0,
          locatable: true
        });
      }
    }
  }

  entries.sort((left, right) => comparePath(left.path, right.path));
  directories.sort(comparePath);
  issueItems.sort((left, right) => comparePath(left.path, right.path));
  const typeStats = [...typeStatsByExtension.values()]
    .sort((left, right) => right.count - left.count || comparePath(left.extension, right.extension));
  return {
    entries,
    directories,
    issues: issueItems,
    typeStats,
    summary: {
      scanDirectory,
      visibleCount: entries.length,
      fileCount,
      directoryCount,
      totalSize,
      missingMetaCount,
      orphanMetaCount,
      emptyDirectoryCount,
      visibleIssueCount: issueItems.length,
      typeCount: typeStats.length
    }
  };
}

function matchesScanFilters(relativePath, isDirectory, extension, search, extensionFilter) {
  if (search && !relativePath.toLowerCase().includes(search)) {
    return false;
  }
  if (!isDirectory && extensionFilter.length > 0 && !extensionFilter.includes(extension)) {
    return false;
  }
  if (isDirectory && extensionFilter.length > 0) {
    return false;
  }
  return true;
}

function isReportEmptyDirectory(directory) {
  const stat = statPath(directory);
  if (!stat?.isDirectory()) {
    return false;
  }

  const entries = Fs.readdirSync(toProjectPath(directory));
  if (entries.length === 0) {
    return true;
  }

  const ownMetaName = `${Path.basename(directory)}.meta`;
  return entries.every((name) => name === ownMetaName);
}

function checkReferences(payload) {
  const targetPaths = normalizeReferenceTargets(payload?.paths || payload?.path || payload?.targetPath);
  const scanDirectory = normalizeScanDirectory(payload?.directory || payload?.scanDirectory);
  const referenceExtensions = normalizeReferenceExtensions(payload?.extensions || payload?.referenceExtensions);
  const targetItems = targetPaths.map((path) => collectTargetUuids(path));
  const uuidToTargets = new Map();

  for (const target of targetItems) {
    for (const uuid of target.uuids) {
      const targets = uuidToTargets.get(uuid) || [];
      targets.push(target.path);
      uuidToTargets.set(uuid, targets);
    }
  }

  const references = [];
  let scannedFileCount = 0;
  walk(toProjectPath(scanDirectory), (fullPath, entry) => {
    if (!entry.isFile()) {
      return;
    }

    const relative = toRelativePath(fullPath);
    const extension = Path.extname(relative).toLowerCase();
    if (!referenceExtensions.includes(extension)) {
      return;
    }

    scannedFileCount++;
    const text = Fs.readFileSync(fullPath, "utf8");
    const matchedUuids = [];
    let matchCount = 0;
    for (const uuid of uuidToTargets.keys()) {
      const count = countTextOccurrences(text, uuid);
      if (count > 0) {
        matchedUuids.push(uuid);
        matchCount += count;
      }
    }

    if (matchCount > 0) {
      const details = collectSerializedReferenceDetails(text, extension, uuidToTargets);
      references.push({
        path: relative,
        extension,
        matchCount,
        matchedUuids,
        targetPaths: [...new Set(matchedUuids.flatMap((uuid) => uuidToTargets.get(uuid) || []))].sort(comparePath),
        details
      });
    }
  });

  references.sort((left, right) => right.matchCount - left.matchCount || comparePath(left.path, right.path));
  const uuidCount = [...uuidToTargets.keys()].length;
  const referencePositionCount = references.reduce((sum, item) => sum + item.details.length, 0);
  const selectablePositionCount = references.reduce(
    (sum, item) => sum + item.details.filter((detail) => detail.selectable).length,
    0
  );
  return {
    targets: targetItems,
    references,
    summary: {
      scanDirectory,
      targetCount: targetItems.length,
      uuidCount,
      scannedFileCount,
      referenceFileCount: references.length,
      totalMatchCount: references.reduce((sum, item) => sum + item.matchCount, 0),
      referencePositionCount,
      selectablePositionCount,
      referenceExtensions
    },
    warning: references.length === 0
      ? "未找到静态 UUID 引用。此结果不能证明资源可删除，仍需结合动态加载和人工复核。"
      : "已找到静态 UUID 引用。删除、覆盖或移动前请复核引用方。"
  };
}

function collectSerializedReferenceDetails(text, extension, uuidToTargets) {
  if (extension !== ".scene" && extension !== ".prefab") {
    return [];
  }

  let objects;
  try {
    objects = JSON.parse(text);
  } catch (_error) {
    return [];
  }
  if (!Array.isArray(objects)) {
    return [];
  }

  const nodes = new Map();
  const objectToNode = new Map();
  objects.forEach((object, index) => {
    if (object?.__type__ !== "cc.Node") {
      return;
    }
    nodes.set(index, object);
    for (const component of object._components || []) {
      if (Number.isInteger(component?.__id__)) {
        objectToNode.set(component.__id__, index);
      }
    }
    if (Number.isInteger(object._prefab?.__id__)) {
      objectToNode.set(object._prefab.__id__, index);
    }
  });

  const nodePathCache = new Map();
  const details = [];
  objects.forEach((object, objectIndex) => {
    if (!object || typeof object !== "object") {
      return;
    }
    const nodeIndex = resolveReferenceNodeIndex(object, objectIndex, nodes, objectToNode);
    const node = nodes.get(nodeIndex);
    const nodePath = node ? buildSerializedNodePath(nodeIndex, nodes, nodePathCache, new Set()) : "";
    walkSerializedReferenceValues(object, "", (uuid, fieldPath) => {
      const targetPaths = uuidToTargets.get(uuid);
      if (!targetPaths) {
        return;
      }
      details.push({
        matchedUuid: uuid,
        targetPaths: [...targetPaths].sort(comparePath),
        objectIndex,
        fieldPath: normalizeReferenceFieldPath(fieldPath, object),
        componentType: resolveSerializedTypeName(object.__type__),
        componentTypeId: object.__type__ || "",
        nodeName: node?._name || "",
        nodePath,
        nodeUuid: typeof node?._id === "string" ? node._id : "",
        selectable: Boolean(node?._id)
      });
    });
  });

  return details.sort((left, right) =>
    comparePath(left.nodePath, right.nodePath)
    || comparePath(left.componentType, right.componentType)
    || comparePath(left.fieldPath, right.fieldPath)
    || comparePath(left.matchedUuid, right.matchedUuid)
  );
}

function checkNodeReferences(payload) {
  const nodeUuid = normalizeNodeReferenceUuid(payload?.nodeUuid || payload?.uuid);
  const scanDirectory = normalizeScanDirectory(payload?.directory || payload?.scanDirectory || "assets");
  const referenceExtensions = normalizeNodeReferenceExtensions(payload?.extensions || payload?.referenceExtensions);
  const references = [];
  const targetNodes = [];
  let scannedFileCount = 0;

  walk(toProjectPath(scanDirectory), (fullPath, entry) => {
    if (!entry.isFile()) {
      return;
    }

    const relative = toRelativePath(fullPath);
    const extension = Path.extname(relative).toLowerCase();
    if (!referenceExtensions.includes(extension)) {
      return;
    }

    scannedFileCount++;
    const text = Fs.readFileSync(fullPath, "utf8");
    const result = collectSerializedNodeReferenceDetails(text, extension, nodeUuid);
    if (result.targets.length > 0) {
      targetNodes.push(...result.targets.map((target) => ({ ...target, filePath: relative, extension })));
    }
    if (result.references.length > 0) {
      references.push({
        path: relative,
        extension,
        referenceCount: result.references.length,
        references: result.references
      });
    }
  });

  references.sort((left, right) => right.referenceCount - left.referenceCount || comparePath(left.path, right.path));
  const referencePositionCount = references.reduce((sum, item) => sum + item.referenceCount, 0);
  const selectablePositionCount = references.reduce(
    (sum, item) => sum + item.references.filter((detail) => detail.selectable).length,
    0
  );
  return {
    nodeUuid,
    targetNodes: targetNodes.sort((left, right) => comparePath(left.filePath, right.filePath) || comparePath(left.nodePath, right.nodePath)),
    references,
    summary: {
      scanDirectory,
      nodeUuid,
      scannedFileCount,
      targetFileCount: new Set(targetNodes.map((target) => target.filePath)).size,
      targetNodeCount: targetNodes.length,
      referenceFileCount: references.length,
      referencePositionCount,
      selectablePositionCount,
      referenceExtensions
    },
    warning: targetNodes.length === 0
      ? "扫描范围内没有找到该节点 ID。请确认已保存场景/Prefab，或缩小到正确的资源目录后重试。"
      : referencePositionCount === 0
        ? "已找到目标节点，但没有发现组件属性引用它。"
        : "已找到引用目标节点的组件。请打开对应场景或 Prefab 后按节点路径复核。"
  };
}

function collectSerializedNodeReferenceDetails(text, extension, nodeUuid) {
  if (extension !== ".scene" && extension !== ".prefab") {
    return { targets: [], references: [] };
  }

  let objects;
  try {
    objects = JSON.parse(text);
  } catch (_error) {
    return { targets: [], references: [] };
  }
  if (!Array.isArray(objects)) {
    return { targets: [], references: [] };
  }

  const nodes = new Map();
  const objectToNode = new Map();
  objects.forEach((object, index) => {
    if (object?.__type__ !== "cc.Node") {
      return;
    }
    nodes.set(index, object);
    for (const component of object._components || []) {
      if (Number.isInteger(component?.__id__)) {
        objectToNode.set(component.__id__, index);
      }
    }
    if (Number.isInteger(object._prefab?.__id__)) {
      objectToNode.set(object._prefab.__id__, index);
    }
  });

  const nodePathCache = new Map();
  const targetNodeIndexes = new Set();
  const targets = [];
  for (const [nodeIndex, node] of nodes) {
    if (String(node?._id || "") !== nodeUuid) {
      continue;
    }
    targetNodeIndexes.add(nodeIndex);
    targets.push({
      objectIndex: nodeIndex,
      nodeName: node._name || "",
      nodePath: buildSerializedNodePath(nodeIndex, nodes, nodePathCache, new Set()),
      nodeUuid: node._id || "",
      selectable: Boolean(node._id)
    });
  }

  if (targetNodeIndexes.size === 0) {
    return { targets, references: [] };
  }

  const references = [];
  objects.forEach((object, objectIndex) => {
    if (!isSerializedComponentLikeObject(object)) {
      return;
    }

    const ownerNodeIndex = resolveReferenceNodeIndex(object, objectIndex, nodes, objectToNode);
    const ownerNode = nodes.get(ownerNodeIndex);
    const ownerNodePath = ownerNode ? buildSerializedNodePath(ownerNodeIndex, nodes, nodePathCache, new Set()) : "";
    walkSerializedIdReferenceValues(object, "", (targetIndex, fieldPath) => {
      if (!targetNodeIndexes.has(targetIndex) || isComponentOwnerNodeField(fieldPath)) {
        return;
      }
      const targetNode = nodes.get(targetIndex);
      references.push({
        targetObjectIndex: targetIndex,
        targetNodeName: targetNode?._name || "",
        targetNodePath: targetNode ? buildSerializedNodePath(targetIndex, nodes, nodePathCache, new Set()) : "",
        targetNodeUuid: targetNode?._id || "",
        objectIndex,
        fieldPath: normalizeNodeReferenceFieldPath(fieldPath, object),
        componentType: resolveSerializedTypeName(object.__type__),
        componentTypeId: object.__type__ || "",
        nodeName: ownerNode?._name || "",
        nodePath: ownerNodePath,
        nodeUuid: typeof ownerNode?._id === "string" ? ownerNode._id : "",
        selectable: Boolean(ownerNode?._id)
      });
    });
  });

  references.sort((left, right) =>
    comparePath(left.nodePath, right.nodePath)
    || comparePath(left.componentType, right.componentType)
    || comparePath(left.fieldPath, right.fieldPath)
    || comparePath(left.targetNodePath, right.targetNodePath)
  );
  return { targets, references };
}

function isSerializedComponentLikeObject(object) {
  return Boolean(
    object
    && typeof object === "object"
    && typeof object.__type__ === "string"
    && object.__type__ !== "cc.Node"
    && (Number.isInteger(object._node?.__id__) || Number.isInteger(object.node?.__id__))
  );
}

function walkSerializedIdReferenceValues(value, path, onId) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (!Array.isArray(value) && Number.isInteger(value.__id__)) {
    onId(value.__id__, path ? `${path}.__id__` : "__id__");
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkSerializedIdReferenceValues(item, `${path}[${index}]`, onId));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "__id__") {
      continue;
    }
    walkSerializedIdReferenceValues(child, path ? `${path}.${key}` : key, onId);
  }
}

function isComponentOwnerNodeField(fieldPath) {
  return fieldPath === "_node.__id__" || fieldPath === "node.__id__";
}

function normalizeNodeReferenceFieldPath(path, object) {
  return normalizeReferenceFieldPath(String(path || "").replace(/\.__id__$/, ""), object);
}

function normalizeNodeReferenceUuid(value) {
  let nodeUuid = String(value || "").trim();
  if (!nodeUuid && typeof Editor !== "undefined") {
    const selected = Editor.Selection?.getSelected?.("node") || [];
    nodeUuid = String(selected[0] || "").trim();
  }
  if (!nodeUuid) {
    throw new Error("请先在场景中选中节点，或手动输入目标节点 ID。");
  }
  return nodeUuid;
}

function normalizeNodeReferenceExtensions(value) {
  const extensions = normalizeReferenceExtensions(value || DEFAULT_NODE_REFERENCE_EXTENSIONS.join(","))
    .filter((extension) => DEFAULT_NODE_REFERENCE_EXTENSIONS.includes(extension));
  if (extensions.length === 0) {
    throw new Error("节点引用检查只支持 .scene 和 .prefab。");
  }
  return extensions;
}

function walkSerializedReferenceValues(value, path, onUuid) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (!Array.isArray(value) && typeof value.__uuid__ === "string") {
    onUuid(value.__uuid__, path ? `${path}.__uuid__` : "__uuid__");
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkSerializedReferenceValues(item, `${path}[${index}]`, onUuid));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "__uuid__") {
      continue;
    }
    walkSerializedReferenceValues(child, path ? `${path}.${key}` : key, onUuid);
  }
}

function normalizeReferenceFieldPath(path, object) {
  if (object?.__type__ === "CCPropertyOverrideInfo" && path.startsWith("value") && Array.isArray(object.propertyPath)) {
    return object.propertyPath.reduce((result, segment) => {
      const value = String(segment);
      return /^\d+$/.test(value) ? `${result}[${value}]` : result ? `${result}.${value}` : value;
    }, "") || "value";
  }
  return String(path || "").replace(/\.__uuid__$/, "").replace(/^__uuid__$/, "(对象引用)");
}

function resolveSerializedTypeName(type) {
  const value = String(type || "");
  if (!value || value.startsWith("cc.") || typeof Editor === "undefined") {
    return value || "未知序列化对象";
  }
  try {
    const uuid = Editor.Utils.UUID.decompressUUID(value).toLowerCase();
    return getScriptTypeNames().get(uuid) || value;
  } catch (_error) {
    return value;
  }
}

function getScriptTypeNames() {
  if (scriptTypeNameCache) {
    return scriptTypeNameCache;
  }
  scriptTypeNameCache = new Map();
  for (const directory of DEFAULT_CODE_SCAN_DIRECTORIES) {
    if (!statPath(directory)?.isDirectory()) {
      continue;
    }
    walk(toProjectPath(directory), (fullPath, entry) => {
      if (!entry.isFile() || !CODE_EXTENSIONS.has(Path.extname(fullPath).toLowerCase())) {
        return;
      }
      const relative = toRelativePath(fullPath);
      const metaPath = `${relative}.meta`;
      if (!pathExists(metaPath)) {
        return;
      }
      const uuids = extractUuids(Fs.readFileSync(toProjectPath(metaPath), "utf8"));
      const typeName = Path.basename(relative, Path.extname(relative));
      for (const uuid of uuids) {
        scriptTypeNameCache.set(uuid.toLowerCase(), typeName);
      }
    });
  }
  return scriptTypeNameCache;
}

function resolveReferenceNodeIndex(object, objectIndex, nodes, objectToNode) {
  if (nodes.has(objectIndex)) {
    return objectIndex;
  }
  for (const key of ["_node", "node"]) {
    if (Number.isInteger(object?.[key]?.__id__) && nodes.has(object[key].__id__)) {
      return object[key].__id__;
    }
  }
  return objectToNode.get(objectIndex);
}

function buildSerializedNodePath(nodeIndex, nodes, cache, visiting) {
  if (cache.has(nodeIndex)) {
    return cache.get(nodeIndex);
  }
  if (visiting.has(nodeIndex)) {
    return nodes.get(nodeIndex)?._name || `节点#${nodeIndex}`;
  }
  visiting.add(nodeIndex);
  const node = nodes.get(nodeIndex);
  const name = node?._name || `节点#${nodeIndex}`;
  const parentIndex = node?._parent?.__id__;
  const path = Number.isInteger(parentIndex) && nodes.has(parentIndex)
    ? `${buildSerializedNodePath(parentIndex, nodes, cache, visiting)}/${name}`
    : name;
  visiting.delete(nodeIndex);
  cache.set(nodeIndex, path);
  return path;
}

function normalizeReferenceTargets(value) {
  const rawValues = Array.isArray(value) ? value : String(value || "").split(/[\n,;]/);
  const paths = [...new Set(rawValues.map(normalizeRelativePath).filter(Boolean))];
  if (paths.length === 0) {
    throw new Error("请先输入要检查的资源路径。");
  }

  for (const path of paths) {
    if (!isInsideAssets(path)) {
      throw new Error(`被检查资源必须位于 assets 下：${path}`);
    }
    if (path.toLowerCase().endsWith(".meta")) {
      throw new Error(`请输入资源路径，不要直接输入 .meta：${path}`);
    }
    if (!pathExists(path)) {
      throw new Error(`被检查资源不存在：${path}`);
    }
    if (!hasMeta(path)) {
      throw new Error(`被检查资源缺少 .meta，无法读取 UUID：${path}`);
    }
  }
  return paths.sort(comparePath);
}

function collectTargetUuids(path) {
  const metaPath = `${path}.meta`;
  const metaText = Fs.readFileSync(toProjectPath(metaPath), "utf8");
  const uuids = extractUuids(metaText);
  if (uuids.length === 0) {
    throw new Error(`资源 meta 中未找到 UUID：${metaPath}`);
  }

  return {
    path,
    metaPath,
    uuids,
    uuidCount: uuids.length
  };
}

function extractUuids(text) {
  const matches = String(text || "").match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
  return [...new Set(matches.map((uuid) => uuid.toLowerCase()))].sort(comparePath);
}

function countTextOccurrences(text, needle) {
  if (!needle) {
    return 0;
  }

  let count = 0;
  let index = 0;
  const lowerText = String(text || "").toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  while ((index = lowerText.indexOf(lowerNeedle, index)) >= 0) {
    count++;
    index += lowerNeedle.length;
  }
  return count;
}

function checkResourcesRuntime(payload) {
  const resourcesDirectory = normalizeResourcesDirectory(payload?.resourcesDirectory);
  const codeDirectories = normalizeCodeScanDirectories(payload?.codeDirectories);
  const resources = collectResourcesEntries(resourcesDirectory);
  const calls = collectResourcesRuntimeCalls(codeDirectories);
  const staticCalls = calls.filter((call) => call.kind === "static");
  const dynamicCalls = calls.filter((call) => call.kind === "dynamic");
  const usedResources = new Set();

  for (const call of staticCalls) {
    const matchedResources = resources.filter((resource) => resourceMatchesRuntimeCall(resource, call));
    call.matchedResources = matchedResources.map((resource) => resource.path);
    call.matchCount = matchedResources.length;
    call.status = matchedResources.length > 0 ? "matched" : "missing";
    for (const resource of matchedResources) {
      usedResources.add(resource.path);
    }
  }

  for (const resource of resources) {
    resource.used = usedResources.has(resource.path);
  }

  const unusedResources = resources.filter((resource) => !resource.used);
  const missingCalls = staticCalls.filter((call) => call.status === "missing");
  return {
    resources,
    staticCalls,
    unusedResources,
    missingCalls,
    dynamicCalls,
    summary: {
      resourcesDirectory,
      resourcesDirectoryExists: !!statPath(resourcesDirectory)?.isDirectory(),
      codeDirectories,
      resourceCount: resources.length,
      usedResourceCount: usedResources.size,
      unusedResourceCount: unusedResources.length,
      scannedCodeFileCount: calls.scannedCodeFileCount || 0,
      staticCallCount: staticCalls.length,
      matchedCallCount: staticCalls.length - missingCalls.length,
      missingCallCount: missingCalls.length,
      dynamicCallCount: dynamicCalls.length
    },
    warning: "结果只覆盖可静态识别的 resources.load/loadDir 调用；变量、字符串拼接、封装调用和其它 AssetManager 路径需要人工复核。"
  };
}

function normalizeResourcesDirectory(value) {
  const directory = normalizeRelativePath(value || "assets/resources") || "assets/resources";
  if (directory !== "assets/resources" && !directory.startsWith("assets/resources/")) {
    throw new Error(`resources 扫描目录必须位于 assets/resources 下：${directory}`);
  }
  const stat = statPath(directory);
  if (stat && !stat.isDirectory()) {
    throw new Error(`resources 扫描路径存在但不是目录：${directory}`);
  }
  return directory;
}

function normalizeCodeScanDirectories(value) {
  const rawValues = Array.isArray(value) ? value : String(value || "").split(/[\n,;]/);
  const requested = rawValues.map(normalizeRelativePath).filter(Boolean);
  const directories = [...new Set((requested.length > 0 ? requested : DEFAULT_CODE_SCAN_DIRECTORIES)
    .filter((directory) => statPath(directory)?.isDirectory()))].sort(comparePath);
  for (const directory of requested) {
    if (!isInsideAssets(directory)) {
      throw new Error(`代码扫描目录必须位于 assets 下：${directory}`);
    }
  }
  if (directories.length === 0) {
    throw new Error("未找到可扫描的代码目录，请确认 assets/script 或 assets/scripts 是否存在。");
  }
  return directories;
}

function collectResourcesEntries(resourcesDirectory) {
  const entries = [];
  walk(toProjectPath(resourcesDirectory), (fullPath, entry) => {
    if (!entry.isFile()) {
      return;
    }
    const path = toRelativePath(fullPath);
    if (path.toLowerCase().endsWith(".meta")) {
      return;
    }
    const relativeToResources = normalizeRelativePath(Path.relative(toProjectPath("assets/resources"), fullPath));
    const extension = Path.extname(relativeToResources).toLowerCase();
    entries.push({
      path,
      loadPath: normalizeRelativePath(extension ? relativeToResources.slice(0, -extension.length) : relativeToResources),
      extension: extension || "(无扩展名)",
      size: Fs.statSync(fullPath).size,
      used: false
    });
  });
  return entries.sort((left, right) => comparePath(left.path, right.path));
}

function collectResourcesRuntimeCalls(codeDirectories) {
  const calls = [];
  let scannedCodeFileCount = 0;
  for (const directory of codeDirectories) {
    walk(toProjectPath(directory), (fullPath, entry) => {
      if (!entry.isFile() || !CODE_EXTENSIONS.has(Path.extname(entry.name).toLowerCase())) {
        return;
      }
      scannedCodeFileCount++;
      const codePath = toRelativePath(fullPath);
      const text = Fs.readFileSync(fullPath, "utf8");
      calls.push(...extractResourcesRuntimeCalls(text, codePath));
    });
  }
  calls.scannedCodeFileCount = scannedCodeFileCount;
  return calls.sort((left, right) => comparePath(left.codePath, right.codePath) || left.line - right.line);
}

function extractResourcesRuntimeCalls(text, codePath) {
  const calls = [];
  const searchText = maskCommentsAndStrings(text);
  const pattern = /\bresources\s*\.\s*(loadDir|load)\s*\(/g;
  let match;
  while ((match = pattern.exec(searchText))) {
    const argument = readFirstCallArgument(text, pattern.lastIndex);
    if (!argument) {
      continue;
    }
    const expression = argument.text.trim();
    const staticPath = parseStaticStringExpression(expression);
    calls.push({
      kind: staticPath === null ? "dynamic" : "static",
      method: match[1],
      runtimePath: staticPath === null ? "" : normalizeRuntimeLoadPath(staticPath),
      expression,
      codePath,
      line: countTextLines(text, match.index),
      matchedResources: [],
      matchCount: 0,
      status: staticPath === null ? "dynamic" : "pending"
    });
  }
  return calls;
}

function maskCommentsAndStrings(text) {
  const chars = String(text || "").split("");
  let mode = "code";
  let quote = "";
  let escaped = false;
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index];
    const next = chars[index + 1];
    if (mode === "line-comment") {
      if (char === "\n") {
        mode = "code";
      } else {
        chars[index] = " ";
      }
      continue;
    }
    if (mode === "block-comment") {
      if (char === "*" && next === "/") {
        chars[index] = " ";
        chars[index + 1] = " ";
        index++;
        mode = "code";
      } else if (char !== "\n") {
        chars[index] = " ";
      }
      continue;
    }
    if (mode === "string") {
      if (char !== "\n") {
        chars[index] = " ";
      }
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        mode = "code";
        quote = "";
      }
      continue;
    }
    if (char === "/" && next === "/") {
      chars[index] = " ";
      chars[index + 1] = " ";
      index++;
      mode = "line-comment";
    } else if (char === "/" && next === "*") {
      chars[index] = " ";
      chars[index + 1] = " ";
      index++;
      mode = "block-comment";
    } else if (char === "'" || char === "\"" || char === "`") {
      chars[index] = " ";
      mode = "string";
      quote = char;
    }
  }
  return chars.join("");
}

function readFirstCallArgument(text, startIndex) {
  let quote = "";
  let escaped = false;
  let nestedDepth = 0;
  for (let index = startIndex; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      nestedDepth++;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      if (nestedDepth === 0) {
        return { text: text.slice(startIndex, index), endIndex: index };
      }
      nestedDepth--;
      continue;
    }
    if (char === "," && nestedDepth === 0) {
      return { text: text.slice(startIndex, index), endIndex: index };
    }
  }
  return null;
}

function parseStaticStringExpression(expression) {
  const value = String(expression || "").trim();
  if (value.length < 2) {
    return null;
  }
  const quote = value[0];
  if (!["'", "\"", "`"].includes(quote) || value[value.length - 1] !== quote) {
    return null;
  }
  const body = value.slice(1, -1);
  if (quote === "`" && body.includes("${")) {
    return null;
  }
  return body.replace(/\\([\\'"`])/g, "$1");
}

function normalizeRuntimeLoadPath(value) {
  return normalizeRelativePath(String(value || "").replace(/\.[^/.]+$/, ""));
}

function resourceMatchesRuntimeCall(resource, call) {
  const runtimePath = normalizeRuntimeLoadPath(call.runtimePath);
  if (call.method === "loadDir") {
    return !runtimePath || resource.loadPath === runtimePath || resource.loadPath.startsWith(`${runtimePath}/`);
  }
  return resource.loadPath === runtimePath
    || runtimePath === `${resource.loadPath}/spriteFrame`
    || runtimePath === `${resource.loadPath}/texture`;
}

function countTextLines(text, index) {
  return String(text || "").slice(0, index).split("\n").length;
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
  const scene = normalizeRelativePath(value || "assets/scene/main.scene");
  if (!isInsideAssets(scene) || Path.extname(scene).toLowerCase() !== ".scene" || !statPath(scene)?.isFile()) {
    throw new Error(`主场景必须是 assets 下存在的 .scene 文件：${scene}`);
  }
  if (!hasMeta(scene)) {
    throw new Error(`主场景缺少 .meta，无法构建依赖图：${scene}`);
  }
  return scene;
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
  const assets = [];
  const byPath = new Map();
  const byUuid = new Map();
  walk(toProjectPath("assets"), (fullPath, entry) => {
    if (!entry.isFile() || !fullPath.toLowerCase().endsWith(".meta")) {
      return;
    }
    const assetFullPath = fullPath.slice(0, -".meta".length);
    const assetStat = Fs.statSync(assetFullPath, { throwIfNoEntry: false });
    if (!assetStat?.isFile()) {
      return;
    }
    const path = toRelativePath(assetFullPath);
    const metaText = readUtf8Text(fullPath);
    const ownedUuids = collectOwnedGraphUuids(parseJsonObject(metaText));
    if (ownedUuids.size === 0) {
      return;
    }
    const dependencies = extractGraphUuids(metaText);
    if (GRAPH_TEXT_EXTENSIONS.has(Path.extname(path).toLowerCase())) {
      for (const uuid of extractGraphUuids(readUtf8Text(assetFullPath))) {
        dependencies.add(uuid);
      }
    }
    const asset = {
      path,
      extension: Path.extname(path).toLowerCase() || "(无扩展名)",
      size: assetStat.size,
      ownedUuids,
      dependencies
    };
    assets.push(asset);
    byPath.set(path, asset);
    for (const uuid of ownedUuids) {
      byUuid.set(uuid, asset);
    }
  });

  let unresolvedReferenceCount = 0;
  for (const asset of assets) {
    for (const uuid of asset.dependencies) {
      if (!asset.ownedUuids.has(uuid) && !byUuid.has(uuid)) {
        unresolvedReferenceCount++;
      }
    }
  }
  return { assets, byPath, byUuid, unresolvedReferenceCount };
}

function collectReachableAssetChains(rootAsset, byUuid) {
  const chains = new Map([[rootAsset.path, [rootAsset.path]]]);
  const pending = [rootAsset];
  while (pending.length > 0) {
    const asset = pending.shift();
    const parentChain = chains.get(asset.path);
    for (const uuid of asset.dependencies) {
      const dependency = byUuid.get(uuid);
      if (!dependency || chains.has(dependency.path)) {
        continue;
      }
      chains.set(dependency.path, [...parentChain, dependency.path]);
      pending.push(dependency);
    }
  }
  return { chains };
}

function readUtf8Text(filePath) {
  return Fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return {};
  }
}

function collectOwnedGraphUuids(meta) {
  const result = new Set();
  collectGraphMetaNodeUuids(meta, result);
  return result;
}

function collectGraphMetaNodeUuids(node, result) {
  if (!node || typeof node !== "object") {
    return;
  }
  if (typeof node.uuid === "string") {
    result.add(node.uuid.toLowerCase());
  }
  if (node.subMetas && typeof node.subMetas === "object") {
    for (const subMeta of Object.values(node.subMetas)) {
      collectGraphMetaNodeUuids(subMeta, result);
    }
  }
}

function extractGraphUuids(text) {
  const result = new Set();
  for (const match of String(text || "").matchAll(GRAPH_UUID_PATTERN)) {
    result.add(match[0].toLowerCase());
  }
  return result;
}

function isPathInDirectory(path, directory) {
  return path === directory || isStrictlyInside(directory, path);
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
    const rule = cleanRules.find((item) => ruleMatchesSource(item, entry.path, Path.extname(entry.path).toLowerCase()));
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
  const hash = Crypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const file = Fs.openSync(fullPath, "r");
  try {
    let bytesRead = 0;
    do {
      bytesRead = Fs.readSync(file, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        hash.update(buffer.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);
  } finally {
    Fs.closeSync(file);
  }
  return hash.digest("hex");
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
  const extensions = normalizeReferenceExtensions(payload?.extensions || ".scene,.prefab")
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
  const values = Array.isArray(value) ? value : String(value || "").split(/[\n,;]/);
  const result = new Set();
  for (const item of values) {
    for (const uuid of extractGraphUuids(String(item || ""))) {
      result.add(uuid);
    }
  }
  return result;
}

function countGraphUuidOccurrences(text) {
  const counts = new Map();
  for (const match of String(text || "").matchAll(GRAPH_UUID_PATTERN)) {
    const uuid = match[0].toLowerCase();
    counts.set(uuid, (counts.get(uuid) || 0) + 1);
  }
  return counts;
}

function scanUnusedAssets(payload) {
  const scene = normalizeScenePath(payload?.scene);
  const scanDirectory = normalizeScanDirectory(payload?.directory || payload?.scanDirectory || "assets/res");
  const graph = buildSerializedAssetGraph();
  const sceneAsset = graph.byPath.get(scene);
  if (!sceneAsset) {
    throw new Error(`主场景没有有效 UUID：${scene}`);
  }
  const reachable = collectReachableAssetChains(sceneAsset, graph.byUuid).chains;
  const candidates = [];
  let scannedCount = 0;
  let reachableCount = 0;
  let protectedCount = 0;
  let ignoredCount = 0;
  let candidateTotalSize = 0;
  for (const asset of graph.assets) {
    if (asset.path === scene || !isPathInDirectory(asset.path, scanDirectory)) {
      continue;
    }
    if (UNUSED_IGNORED_FILES.has(Path.basename(asset.path).toLowerCase())) {
      ignoredCount++;
      continue;
    }
    scannedCount++;
    if (reachable.has(asset.path)) {
      reachableCount++;
      continue;
    }
    if (UNUSED_PROTECTED_EXTENSIONS.has(asset.extension)) {
      protectedCount++;
      continue;
    }
    candidateTotalSize += asset.size;
    candidates.push({
      path: asset.path,
      extension: asset.extension,
      size: asset.size,
      risk: "dynamic-unknown"
    });
  }
  candidates.sort((left, right) => right.size - left.size || comparePath(left.path, right.path));
  return {
    candidates,
    protectedExtensions: [...UNUSED_PROTECTED_EXTENSIONS].sort(comparePath),
    summary: {
      scene,
      scanDirectory,
      scannedCount,
      reachableCount,
      candidateCount: candidates.length,
      candidateTotalSize,
      protectedCount,
      ignoredCount,
      unresolvedReferenceCount: graph.unresolvedReferenceCount
    },
    warning: "候选仅表示未从主场景序列化 UUID 依赖图到达，不代表可以删除。resources.load/loadDir、AssetManager、运行时拼接路径和渠道资源无法可靠确认；脚本与 Shader Chunk 已强制保护。"
  };
}

function buildUnusedDeletePlan(payload) {
  const scene = normalizeScenePath(payload?.scene);
  const scanDirectory = normalizeScanDirectory(payload?.directory || payload?.scanDirectory || "assets/res");
  const backupScope = normalizeUnusedDeleteBackupScope(payload?.backupScope);
  const selectedPaths = canonicalizeSelectedPaths(payload?.paths);
  if (selectedPaths.length === 0) {
    throw new Error("请先勾选要删除的未引用候选。");
  }
  const currentScan = scanUnusedAssets({ scene, directory: scanDirectory });
  const candidateByPath = new Map(currentScan.candidates.map((item) => [item.path, item]));
  const items = selectedPaths.map((path) => buildUnusedDeletePlanItem(path, candidateByPath));
  const readyItems = items.filter((item) => item.status === "ready");
  const token = `${Date.now()}-${Crypto.randomBytes(8).toString("hex")}`;
  const plan = {
    token,
    kind: "unused-delete",
    scene,
    scanDirectory,
    backupScope,
    items,
    summary: summarizeUnusedDeletePlan(items, backupScope),
    warning: "删除候选已按当前主场景依赖图重新校验；执行时会再次校验并先创建备份。删除后仍需在 Creator 中回归场景、Prefab、resources 动态加载和玩法。"
  };
  return {
    ...plan,
    publicResult: cloneData(plan)
  };
}

function buildUnusedDeletePlanItem(path, candidateByPath) {
  const candidate = candidateByPath.get(path);
  const base = {
    path,
    extension: Path.extname(path).toLowerCase() || "(无扩展名)",
    size: statPath(path)?.size || 0,
    status: "blocked",
    reason: ""
  };
  if (!candidate) {
    return { ...base, reason: "当前资源不在最新未引用候选中，请重新扫描和复核" };
  }
  if (!statPath(path)?.isFile()) {
    return { ...base, reason: "资源文件不存在" };
  }
  if (!hasMeta(path)) {
    return { ...base, reason: "资源缺少 .meta，拒绝删除" };
  }
  return {
    ...base,
    extension: candidate.extension,
    size: candidate.size,
    status: "ready",
    reason: "已重新确认为未引用候选"
  };
}

function summarizeUnusedDeletePlan(items, backupScope) {
  const ready = items.filter((item) => item.status === "ready");
  return {
    total: items.length,
    ready: ready.length,
    blocked: items.length - ready.length,
    totalSize: ready.reduce((sum, item) => sum + (Number(item.size) || 0), 0),
    backupScope
  };
}

function normalizeUnusedDeleteBackupScope(value) {
  return value === "scan-directory" ? "scan-directory" : "selected";
}

async function executeUnusedDelete(payload) {
  const token = String(payload?.token || "");
  if (!lastUnusedDeletePlan || token !== lastUnusedDeletePlan.token) {
    throw new Error("未引用删除计划已失效，请重新生成预览。");
  }
  if (payload?.confirmed !== true) {
    throw new Error("执行删除前必须完成二次确认。");
  }
  const readyItems = lastUnusedDeletePlan.items.filter((item) => item.status === "ready");
  if (readyItems.length === 0) {
    throw new Error("当前删除计划没有可执行项。");
  }
  validateUnusedDeletePlanStillCurrent(lastUnusedDeletePlan);
  const backup = createUnusedDeleteBackup(lastUnusedDeletePlan);
  const deleted = [];
  const failed = [];
  for (const item of readyItems.sort((left, right) => right.path.length - left.path.length || comparePath(left.path, right.path))) {
    try {
      await Editor.Message.request("asset-db", "delete-asset", toDbUrl(item.path));
      if (!await waitUntil(() => !pathExists(item.path), 5000)) {
        throw new Error("AssetDB 删除后资源仍存在");
      }
      deleted.push({
        path: item.path,
        size: item.size
      });
    } catch (error) {
      failed.push({
        path: item.path,
        message: error?.message || String(error)
      });
    }
  }
  lastUnusedDeletePlan = null;
  return {
    backup,
    deleted,
    failed,
    warning: "删除已通过 AssetDB 执行。请重新运行资源扫描、未引用扫描、场景/Prefab 引用健康检查，并在 Creator 中回归相关场景。"
  };
}

function validateUnusedDeletePlanStillCurrent(plan) {
  const currentScan = scanUnusedAssets({ scene: plan.scene, directory: plan.scanDirectory });
  const candidatePaths = new Set(currentScan.candidates.map((item) => item.path));
  const invalid = plan.items
    .filter((item) => item.status === "ready")
    .filter((item) => !candidatePaths.has(item.path) || !statPath(item.path)?.isFile() || !hasMeta(item.path));
  if (invalid.length > 0) {
    throw new Error(`删除前校验失败，请重新扫描和预览：${invalid.map((item) => item.path).join("、")}`);
  }
}

function createUnusedDeleteBackup(plan) {
  const generatedAt = new Date().toISOString();
  const backupRoot = normalizeRelativePath(`${BACKUP_DIRECTORY_RELATIVE}/unused-delete-${formatReportTimestamp(generatedAt)}`);
  const files = collectUnusedDeleteBackupFiles(plan);
  const copiedFiles = [];
  Fs.mkdirSync(toProjectPath(backupRoot), { recursive: true });
  for (const file of files) {
    const destination = normalizeRelativePath(`${backupRoot}/${file}`);
    Fs.mkdirSync(Path.dirname(toProjectPath(destination)), { recursive: true });
    Fs.copyFileSync(toProjectPath(file), toProjectPath(destination));
    copiedFiles.push({
      source: file,
      backupPath: destination,
      size: statPath(file)?.size || 0
    });
  }
  const manifest = {
    schemaVersion: 1,
    generatedAt,
    backupScope: plan.backupScope,
    scene: plan.scene,
    scanDirectory: plan.scanDirectory,
    deleteCandidates: plan.items.filter((item) => item.status === "ready").map((item) => ({
      path: item.path,
      extension: item.extension,
      size: item.size
    })),
    copiedFiles
  };
  const manifestPath = normalizeRelativePath(`${backupRoot}/manifest.json`);
  writeJson(toProjectPath(manifestPath), manifest);
  return {
    generatedAt,
    backupDirectory: backupRoot,
    manifestPath,
    fileCount: copiedFiles.length,
    totalSize: copiedFiles.reduce((sum, item) => sum + item.size, 0)
  };
}

function collectUnusedDeleteBackupFiles(plan) {
  const result = new Set();
  if (plan.backupScope === "scan-directory") {
    walk(toProjectPath(plan.scanDirectory), (fullPath, entry) => {
      if (entry.isFile()) {
        result.add(toRelativePath(fullPath));
      }
    });
  } else {
    for (const item of plan.items.filter((candidate) => candidate.status === "ready")) {
      result.add(item.path);
      if (pathExists(`${item.path}.meta`)) {
        result.add(`${item.path}.meta`);
      }
    }
  }
  return [...result]
    .filter((path) => statPath(path)?.isFile())
    .sort(comparePath);
}

function buildMovePlan(payload) {
  const mode = payload?.mode === "rules" ? "rules" : "manual";
  const conflictPolicy = validateConflictPolicy(payload?.conflictPolicy);
  const selectedPaths = canonicalizeSelectedPaths(payload?.paths);
  const ruleResult = mode === "rules"
    ? buildRuleCandidates(selectedPaths, payload?.rules, payload?.ruleScope)
    : null;
  const candidates = ruleResult?.candidates || buildManualCandidates(selectedPaths, payload?.targetDirectory);

  return finalizePlan({
    mode,
    kind: "move",
    conflictPolicy,
    candidates,
    rules: mode === "rules" ? sanitizeRules(payload?.rules) : [],
    directoriesToCreate: ruleResult?.directoriesToCreate || []
  });
}

function validateConflictPolicy(value) {
  const policy = String(value || "skip");
  if (!VALID_CONFLICT_POLICIES.has(policy)) {
    throw new Error(`不支持的冲突策略：${policy}`);
  }
  return policy;
}

function canonicalizeSelectedPaths(paths) {
  const normalized = [...new Set((Array.isArray(paths) ? paths : [])
    .map(normalizeRelativePath)
    .filter((item) => item && item !== "assets"))]
    .sort((left, right) => left.length - right.length || comparePath(left, right));

  for (const path of normalized) {
    if (!isInsideAssets(path)) {
      throw new Error(`资源路径必须位于 assets 下：${path}`);
    }
  }

  return normalized.filter((path, index) => !normalized.slice(0, index).some((parent) => isStrictlyInside(parent, path)));
}

function buildManualCandidates(paths, targetDirectory) {
  const target = normalizeRelativePath(targetDirectory);
  validateTargetDirectory(target);
  return paths.map((source) => ({
    source,
    destination: normalizeRelativePath(`${target}/${Path.basename(source)}`),
    ruleId: ""
  }));
}

function buildRuleCandidates(selectedPaths, rules, ruleScope) {
  const cleanRules = sanitizeRules(rules).filter((rule) => rule.enabled);
  for (const rule of cleanRules) {
    validateRuleTarget(rule.target);
  }

  const sourcePaths = ruleScope === "selected"
    ? expandSelectedFiles(selectedPaths)
    : scanAssets({}).entries.filter((entry) => entry.kind === "file").map((entry) => entry.path);

  const candidates = [];
  for (const source of sourcePaths) {
    const sourceStat = statPath(source);
    if (!sourceStat?.isFile()) {
      continue;
    }

    const extension = Path.extname(source).toLowerCase();
    const rule = cleanRules.find((item) => ruleMatchesSource(item, source, extension));
    if (!rule) {
      continue;
    }

    candidates.push({
      source,
      destination: normalizeRelativePath(`${rule.target}/${Path.basename(source)}`),
      ruleId: rule.id
    });
  }
  return {
    candidates,
    directoriesToCreate: [...new Set(candidates
      .map((candidate) => Path.posix.dirname(candidate.destination))
      .filter((target) => !pathExists(target)))]
  };
}

function ruleMatchesSource(rule, source, extension = Path.extname(source).toLowerCase()) {
  if (!rule.extensions.includes(extension)) {
    return false;
  }
  if (rule.nameKeywords.length === 0) {
    return true;
  }

  const fileName = Path.basename(source, extension).toLowerCase();
  return rule.nameKeywords.some((keyword) => fileName.includes(keyword));
}

function expandSelectedFiles(selectedPaths) {
  const result = new Set();
  const allFiles = scanAssets({}).entries.filter((entry) => entry.kind === "file");
  for (const selected of selectedPaths) {
    const selectedStat = statPath(selected);
    if (selectedStat?.isFile()) {
      result.add(selected);
      continue;
    }
    if (selectedStat?.isDirectory()) {
      for (const entry of allFiles) {
        if (isStrictlyInside(selected, entry.path)) {
          result.add(entry.path);
        }
      }
    }
  }
  return [...result].sort(comparePath);
}

function validateTargetDirectory(target) {
  if (!isInsideAssets(target) || !statPath(target)?.isDirectory()) {
    throw new Error(`目标目录必须是 assets 下已存在的目录：${target || "(空)"}`);
  }
}

function validateRuleTarget(target) {
  if (!isInsideAssets(target) || target === "assets") {
    throw new Error(`自动分类目标必须是 assets 下的子目录：${target || "(空)"}`);
  }
  if (pathExists(target) && !statPath(target)?.isDirectory()) {
    throw new Error(`自动分类目标已存在但不是目录：${target}`);
  }
}

function finalizePlan({ mode, kind, conflictPolicy, candidates, rules, historyId = "", directoriesToCreate = [] }) {
  const sourceSet = new Set(candidates.map((item) => item.source));
  const reservedDestinations = new Set();
  const items = [];
  const creatableDirectories = new Set(directoriesToCreate.map(normalizeRelativePath));

  for (const candidate of candidates) {
    items.push(resolvePlanItem(candidate, conflictPolicy, sourceSet, reservedDestinations, creatableDirectories));
  }

  const token = Crypto.randomBytes(12).toString("hex");
  const movable = items.filter((item) => item.status === "ready");
  const overwriteCount = movable.filter((item) => item.action === "overwrite").length;
  const publicResult = {
    token,
    kind,
    mode,
    historyId,
    conflictPolicy,
    items,
    directoriesToCreate: [...creatableDirectories].sort(comparePath),
    summary: {
      total: items.length,
      ready: movable.length,
      blocked: items.length - movable.length,
      overwrite: overwriteCount,
      renamed: movable.filter((item) => item.action === "rename").length,
      createDirectory: creatableDirectories.size
    },
    requiresBackupConfirmation: overwriteCount > 0,
    warning: overwriteCount > 0
      ? "计划包含覆盖：目标文件会先通过 AssetDB 删除，反向计划无法恢复被覆盖的原目标。"
      : "执行前请复核源路径与目标路径。移动将通过 Creator AssetDB 完成。"
  };

  return {
    token,
    kind,
    mode,
    historyId,
    conflictPolicy,
    rules,
    directoriesToCreate: [...creatableDirectories],
    items,
    publicResult
  };
}

function resolvePlanItem(candidate, conflictPolicy, sourceSet, reservedDestinations, creatableDirectories = new Set()) {
  const source = normalizeRelativePath(candidate.source);
  const requestedDestination = normalizeRelativePath(candidate.destination);
  const base = {
    source,
    requestedDestination,
    destination: requestedDestination,
    ruleId: candidate.ruleId || "",
    action: "move",
    status: "ready",
    reason: ""
  };

  if (!isInsideAssets(source) || source === "assets" || !pathExists(source)) {
    return blocked(base, "源资源不存在或不允许移动");
  }
  if (!hasMeta(source)) {
    return blocked(base, "源资源缺少 .meta");
  }
  if (!isInsideAssets(requestedDestination) || requestedDestination === "assets") {
    return blocked(base, "目标路径不在 assets 下");
  }
  if (!statPath(Path.posix.dirname(requestedDestination))?.isDirectory() && !creatableDirectories.has(Path.posix.dirname(requestedDestination))) {
    return blocked(base, "目标父目录不存在");
  }
  if (source === requestedDestination) {
    return blocked(base, "资源已位于目标位置");
  }
  if (statPath(source)?.isDirectory() && isStrictlyInside(source, requestedDestination)) {
    return blocked(base, "不能把目录移动到自身子目录");
  }
  if (sourceSet.has(requestedDestination)) {
    return blocked(base, "目标同时是本批次源资源");
  }

  const targetExists = destinationOccupied(requestedDestination) || reservedDestinations.has(requestedDestination);
  if (!targetExists) {
    reservedDestinations.add(requestedDestination);
    return base;
  }

  if (conflictPolicy === "skip") {
    return blocked(base, "目标已存在，按策略跳过");
  }

  if (conflictPolicy === "rename") {
    const destination = findAvailableDestination(requestedDestination, reservedDestinations);
    reservedDestinations.add(destination);
    return { ...base, destination, action: "rename" };
  }

  const sourceStat = statPath(source);
  const targetStat = statPath(requestedDestination);
  if (!sourceStat?.isFile() || !targetStat?.isFile()) {
    return blocked(base, "覆盖仅允许文件覆盖现有文件");
  }
  if (!hasMeta(requestedDestination)) {
    return blocked(base, "覆盖目标缺少 .meta");
  }
  if (reservedDestinations.has(requestedDestination)) {
    return blocked(base, "同一计划中多个资源不能覆盖同一目标");
  }

  reservedDestinations.add(requestedDestination);
  return { ...base, action: "overwrite" };
}

function blocked(item, reason) {
  return { ...item, status: "blocked", reason };
}

function findAvailableDestination(requestedDestination, reservedDestinations) {
  const parsed = Path.posix.parse(requestedDestination);
  for (let index = 1; index < 10000; index++) {
    const candidate = normalizeRelativePath(`${parsed.dir}/${parsed.name}_${index}${parsed.ext}`);
    if (!destinationOccupied(candidate) && !reservedDestinations.has(candidate)) {
      return candidate;
    }
  }
  throw new Error(`无法为冲突资源生成可用名称：${requestedDestination}`);
}

function buildReversePlan(historyId, conflictPolicy) {
  const profile = loadProfile();
  const history = profile.history.find((item) => item.id === historyId);
  if (!history) {
    throw new Error("找不到所选历史记录。");
  }

  const candidates = history.moves.map((move) => ({
    source: move.destination,
    destination: move.source,
    ruleId: "reverse"
  }));
  return finalizePlan({
    mode: "history",
    kind: "reverse",
    historyId,
    conflictPolicy: validateConflictPolicy(conflictPolicy),
    candidates,
    rules: [],
    directoriesToCreate: [...new Set(candidates.map((item) => Path.posix.dirname(item.destination)).filter((target) => !pathExists(target)))]
  });
}

async function executeMoves(payload) {
  const token = String(payload?.token || "");
  if (!lastPlan || token !== lastPlan.token) {
    throw new Error("移动计划已失效，请重新预览。");
  }

  const readyItems = lastPlan.items.filter((item) => item.status === "ready");
  if (readyItems.length === 0) {
    throw new Error("当前计划没有可执行项。");
  }
  if (readyItems.some((item) => item.action === "overwrite") && payload?.backupConfirmed !== true) {
    throw new Error("覆盖前必须确认已完成项目备份。");
  }

  const createdDirectories = await ensureAssetDirectories(lastPlan.directoriesToCreate);
  const moved = [];
  const failed = [];
  for (const item of [...readyItems].sort((left, right) => right.source.length - left.source.length)) {
    try {
      validateItemBeforeExecution(item);
      if (item.action === "overwrite") {
        await Editor.Message.request("asset-db", "delete-asset", toDbUrl(item.destination));
      }
      await Editor.Message.request("asset-db", "move-asset", toDbUrl(item.source), toDbUrl(item.destination));
      moved.push({
        source: item.source,
        destination: item.destination,
        action: item.action,
        overwrittenTargetRecoverable: item.action !== "overwrite"
      });
    } catch (error) {
      failed.push({
        source: item.source,
        destination: item.destination,
        message: error?.message || String(error)
      });
    }
  }

  const cleanup = payload?.cleanupEmptyDirectories === true
    ? await cleanupEmptySourceDirectories(moved)
    : { deletedDirectories: [], failedDirectories: [] };
  const history = recordHistory(lastPlan, moved, failed, cleanup);
  lastPlan = null;
  return { moved, failed, createdDirectories, ...cleanup, history };
}

async function ensureAssetDirectories(directories) {
  const missing = [...new Set((Array.isArray(directories) ? directories : [])
    .map(normalizeRelativePath)
    .filter((directory) => !pathExists(directory)))]
    .sort((left, right) => left.length - right.length || comparePath(left, right));
  if (missing.length === 0) {
    return [];
  }

  const refreshRoots = new Set();
  for (const directory of missing) {
    validateRuleTarget(directory);
    let ancestor = Path.posix.dirname(directory);
    while (ancestor !== "assets" && !pathExists(ancestor)) {
      ancestor = Path.posix.dirname(ancestor);
    }
    refreshRoots.add(ancestor);
    Fs.mkdirSync(toProjectPath(directory), { recursive: true });
  }

  for (const root of refreshRoots) {
    Editor.Message.send("asset-db", "refresh-asset", toDbUrl(root));
  }
  const imported = await waitUntil(() => missing.every((directory) => statPath(directory)?.isDirectory() && hasMeta(directory)), 10000);
  if (!imported) {
    throw new Error(`AssetDB 未能创建分类目录或生成 meta：${missing.filter((directory) => !hasMeta(directory)).join("、")}`);
  }
  return missing;
}

async function waitUntil(predicate, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return predicate();
}

async function cleanupEmptySourceDirectories(moved) {
  const deletedDirectories = [];
  const failedDirectories = [];
  for (const directory of collectSourceDirectoryCandidates(moved)) {
    try {
      const stat = statPath(directory);
      if (!stat?.isDirectory() || Fs.readdirSync(toProjectPath(directory)).length > 0) {
        continue;
      }
      if (!hasMeta(directory)) {
        throw new Error("空目录缺少 .meta，拒绝直接删除");
      }
      await Editor.Message.request("asset-db", "delete-asset", toDbUrl(directory));
      if (!await waitUntil(() => !pathExists(directory), 3000)) {
        throw new Error("AssetDB 删除后目录仍存在");
      }
      deletedDirectories.push(directory);
    } catch (error) {
      failedDirectories.push({
        path: directory,
        message: error?.message || String(error)
      });
    }
  }
  return { deletedDirectories, failedDirectories };
}

function collectSourceDirectoryCandidates(moved) {
  const candidates = new Set();
  for (const move of moved) {
    let directory = Path.posix.dirname(move.source);
    while (directory !== "assets" && isInsideAssets(directory)) {
      if (!PROTECTED_CLEANUP_DIRECTORIES.has(directory)) {
        candidates.add(directory);
      }
      directory = Path.posix.dirname(directory);
    }
  }
  return [...candidates].sort((left, right) => right.length - left.length || comparePath(left, right));
}

function validateItemBeforeExecution(item) {
  if (!pathExists(item.source) || !hasMeta(item.source)) {
    throw new Error("执行前源资源不存在或缺少 .meta");
  }
  if (!statPath(Path.posix.dirname(item.destination))?.isDirectory()) {
    throw new Error("执行前目标目录不存在");
  }
  if (item.action === "move" || item.action === "rename") {
    if (destinationOccupied(item.destination)) {
      throw new Error("执行前目标路径已被占用，请重新预览");
    }
  } else if (!statPath(item.destination)?.isFile()) {
    throw new Error("覆盖目标已不存在或不是文件，请重新预览");
  }
}

function recordHistory(plan, moved, failed, cleanup) {
  if (moved.length === 0) {
    return null;
  }

  const profile = loadProfile();
  const history = {
    id: `${Date.now()}-${Crypto.randomBytes(4).toString("hex")}`,
    createdAt: new Date().toISOString(),
    kind: plan.kind,
    mode: plan.mode,
    conflictPolicy: plan.conflictPolicy,
    movedCount: moved.length,
    failedCount: failed.length,
    hasOverwrite: moved.some((item) => item.action === "overwrite"),
    deletedDirectories: cleanup.deletedDirectories,
    cleanupFailedCount: cleanup.failedDirectories.length,
    moves: moved
  };
  profile.history.unshift(history);
  profile.history = profile.history.slice(0, MAX_HISTORY);
  saveProfile(profile);
  return history;
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
  canonicalizeSelectedPaths,
  destinationOccupied,
  expandSelectedFiles,
  ruleMatchesSource,
  collectSourceDirectoryCandidates,
  findAvailableDestination,
  resolvePlanItem,
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
