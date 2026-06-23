"use strict";

const Crypto = require("crypto");
const Fs = require("fs");
const Path = require("path");
const {
  normalizeRelativePath,
  toProjectPath,
  toDbUrl,
  comparePath,
  walk,
  toRelativePath,
  statPath,
  pathExists,
  hasMeta,
  writeJson,
} = require("./path-utils");
const AssetScan = require("./asset-scan");
const ReferenceGraph = require("./reference-graph");
const MovePlan = require("./move-plan");
const { formatReportTimestamp } = require("./report");

const BACKUP_DIRECTORY_RELATIVE = "backups/asset-steward";
const UNUSED_PROTECTED_EXTENSIONS = new Set([".cjs", ".js", ".mjs", ".ts", ".chunk"]);
const UNUSED_IGNORED_FILES = new Set([".gitkeep", ".ds_store", "thumbs.db"]);

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function scanUnusedAssets(payload) {
  const scene = ReferenceGraph.normalizeScenePath(payload?.scene);
  const scanDirectory = AssetScan.normalizeScanDirectory(payload?.directory || payload?.scanDirectory || "assets/res");
  const graph = ReferenceGraph.buildSerializedAssetGraph();
  const sceneAsset = graph.byPath.get(scene);
  if (!sceneAsset) {
    throw new Error(`主场景没有有效 UUID：${scene}`);
  }
  const reachable = ReferenceGraph.collectReachableAssetChains(sceneAsset, graph.byUuid).chains;
  const candidates = [];
  let scannedCount = 0;
  let reachableCount = 0;
  let protectedCount = 0;
  let ignoredCount = 0;
  let candidateTotalSize = 0;
  for (const asset of graph.assets) {
    if (asset.path === scene || !ReferenceGraph.isPathInDirectory(asset.path, scanDirectory)) {
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
  const scene = ReferenceGraph.normalizeScenePath(payload?.scene);
  const scanDirectory = AssetScan.normalizeScanDirectory(payload?.directory || payload?.scanDirectory || "assets/res");
  const backupScope = normalizeUnusedDeleteBackupScope(payload?.backupScope);
  const selectedPaths = MovePlan.canonicalizeSelectedPaths(payload?.paths);
  if (selectedPaths.length === 0) {
    throw new Error("请先勾选要删除的未引用候选。");
  }
  const currentScan = scanUnusedAssets({ scene, directory: scanDirectory });
  const candidateByPath = new Map(currentScan.candidates.map((item) => [item.path, item]));
  const items = selectedPaths.map((path) => buildUnusedDeletePlanItem(path, candidateByPath));
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

async function executeUnusedDelete(payload, plan) {
  const token = String(payload?.token || "");
  if (!plan || token !== plan.token) {
    throw new Error("未引用删除计划已失效，请重新生成预览。");
  }
  if (payload?.confirmed !== true) {
    throw new Error("执行删除前必须完成二次确认。");
  }
  const readyItems = plan.items.filter((item) => item.status === "ready");
  if (readyItems.length === 0) {
    throw new Error("当前删除计划没有可执行项。");
  }
  validateUnusedDeletePlanStillCurrent(plan);
  const backup = createUnusedDeleteBackup(plan);
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
  const auditPath = writeUnusedDeleteExecutionAudit(backup, { deleted, failed });
  return {
    backup,
    auditPath,
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
      size: statPath(file)?.size || 0,
      sha256: hashFileSha256(toProjectPath(file))
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

function writeUnusedDeleteExecutionAudit(backup, result) {
  const audit = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    backupDirectory: backup.backupDirectory,
    manifestPath: backup.manifestPath,
    deleted: Array.isArray(result.deleted) ? result.deleted : [],
    failed: Array.isArray(result.failed) ? result.failed : []
  };
  const auditPath = normalizeRelativePath(`${backup.backupDirectory}/execution-result.json`);
  writeJson(toProjectPath(auditPath), audit);
  return auditPath;
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

module.exports = {
  BACKUP_DIRECTORY_RELATIVE,
  UNUSED_PROTECTED_EXTENSIONS,
  UNUSED_IGNORED_FILES,
  scanUnusedAssets,
  buildUnusedDeletePlan,
  buildUnusedDeletePlanItem,
  summarizeUnusedDeletePlan,
  normalizeUnusedDeleteBackupScope,
  executeUnusedDelete,
  validateUnusedDeletePlanStillCurrent,
  createUnusedDeleteBackup,
  writeUnusedDeleteExecutionAudit,
  collectUnusedDeleteBackupFiles,
  hashFileSha256,
  waitUntil,
};
