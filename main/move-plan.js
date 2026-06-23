"use strict";

const Crypto = require("crypto");
const Fs = require("fs");
const Path = require("path");
const {
  normalizeRelativePath,
  toProjectPath,
  toDbUrl,
  isInsideAssets,
  isStrictlyInside,
  comparePath,
  statPath,
  pathExists,
  destinationOccupied,
  hasMeta,
} = require("./path-utils");
const {
  loadProfile,
  saveProfile,
  sanitizeRules,
} = require("./profile");

const VALID_CONFLICT_POLICIES = new Set(["skip", "rename", "overwrite"]);
const PROTECTED_CLEANUP_DIRECTORIES = new Set([
  "assets/res",
  "assets/resources",
  "assets/scene",
  "assets/script"
]);

function buildMovePlan(payload, dependencies) {
  const mode = payload?.mode === "rules" ? "rules" : "manual";
  const conflictPolicy = validateConflictPolicy(payload?.conflictPolicy);
  const selectedPaths = canonicalizeSelectedPaths(payload?.paths);
  const ruleResult = mode === "rules"
    ? buildRuleCandidates(selectedPaths, payload?.rules, payload?.ruleScope, dependencies)
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

function buildRuleCandidates(selectedPaths, rules, ruleScope, dependencies) {
  const cleanRules = sanitizeRules(rules).filter((rule) => rule.enabled);
  for (const rule of cleanRules) {
    validateRuleTarget(rule.target);
  }

  const scanAssets = getScanAssets(dependencies);
  const sourcePaths = ruleScope === "selected"
    ? expandSelectedFiles(selectedPaths, dependencies)
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

function getScanAssets(dependencies) {
  if (typeof dependencies?.scanAssets !== "function") {
    throw new Error("移动计划模块缺少 scanAssets 依赖。");
  }
  return dependencies.scanAssets;
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

function expandSelectedFiles(selectedPaths, dependencies) {
  const result = new Set();
  const allFiles = getScanAssets(dependencies)({}).entries.filter((entry) => entry.kind === "file");
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

async function executeMovePlan(payload, plan) {
  const token = String(payload?.token || "");
  if (!plan || token !== plan.token) {
    throw new Error("移动计划已失效，请重新预览。");
  }

  const readyItems = plan.items.filter((item) => item.status === "ready");
  if (readyItems.length === 0) {
    throw new Error("当前计划没有可执行项。");
  }
  if (readyItems.some((item) => item.action === "overwrite") && payload?.backupConfirmed !== true) {
    throw new Error("覆盖前必须确认已完成项目备份。");
  }

  const createdDirectories = await ensureAssetDirectories(plan.directoriesToCreate);
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
  const history = recordHistory(plan, moved, failed, cleanup);
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
    failedMoves: failed,
    failedDirectories: cleanup.failedDirectories,
    moves: moved
  };
  profile.history.unshift(history);
  saveProfile(profile);
  return history;
}

module.exports = {
  buildMovePlan,
  validateConflictPolicy,
  canonicalizeSelectedPaths,
  buildManualCandidates,
  buildRuleCandidates,
  ruleMatchesSource,
  expandSelectedFiles,
  validateTargetDirectory,
  validateRuleTarget,
  finalizePlan,
  resolvePlanItem,
  findAvailableDestination,
  buildReversePlan,
  executeMovePlan,
  ensureAssetDirectories,
  waitUntil,
  cleanupEmptySourceDirectories,
  collectSourceDirectoryCandidates,
  validateItemBeforeExecution,
  recordHistory,
};
