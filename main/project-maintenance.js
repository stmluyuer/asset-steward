"use strict";

const Fs = require("fs");
const Path = require("path");
const { getProjectPath } = require("./path-utils");

const DEFAULT_CACHE_DIRECTORIES = ["library", "temp"];
const CLEANABLE_CACHE_DIRECTORIES = new Set(DEFAULT_CACHE_DIRECTORIES);
const RELOAD_STRATEGY_REFRESH_ONLY = "refresh-only";
const RELOAD_STRATEGY_EDITOR_RELOAD = "editor-reload";
const DEFAULT_RELOAD_STRATEGY = RELOAD_STRATEGY_REFRESH_ONLY;

async function cleanProjectCache(payload = {}) {
  if (payload.confirmed !== true) {
    throw new Error("清理 library/temp 前必须先确认。");
  }

  const directories = normalizeCacheDirectories(payload.directories);
  const reloadStrategy = normalizeReloadStrategy(payload.reloadStrategy);
  const deleted = [];
  const skipped = [];
  const failed = [];

  for (const directory of directories) {
    const target = resolveProjectCacheDirectory(directory);
    const stat = Fs.statSync(target.fullPath, { throwIfNoEntry: false });
    if (!stat) {
      skipped.push({ path: directory, reason: "目录不存在" });
      continue;
    }
    if (!stat.isDirectory()) {
      failed.push({ path: directory, reason: "目标不是目录" });
      continue;
    }

    const before = collectDirectoryStats(target.fullPath);
    try {
      Fs.rmSync(target.fullPath, { recursive: true, force: true });
      deleted.push({
        path: directory,
        files: before.files,
        directories: before.directories,
        size: before.size
      });
    } catch (error) {
      failed.push({ path: directory, reason: error.message });
    }
  }

  const result = {
    projectPath: getProjectPath(),
    directories,
    deleted,
    skipped,
    failed,
    summary: {
      requested: directories.length,
      deleted: deleted.length,
      skipped: skipped.length,
      failed: failed.length,
      deletedFiles: deleted.reduce((sum, item) => sum + item.files, 0),
      deletedDirectories: deleted.reduce((sum, item) => sum + item.directories, 0),
      deletedSize: deleted.reduce((sum, item) => sum + item.size, 0)
    },
    reloadStrategy
  };
  try {
    result.refresh = await refreshProjectAfterCleanup(reloadStrategy);
  } catch (error) {
    throw new Error(`缓存已清理：删除 ${result.summary.deleted} 个目录，跳过 ${result.summary.skipped} 个，失败 ${result.summary.failed} 个；但重载项目失败：${error.message}`);
  }
  return result;
}

function normalizeCacheDirectories(value) {
  const raw = Array.isArray(value) && value.length ? value : DEFAULT_CACHE_DIRECTORIES;
  const directories = [...new Set(raw.map((item) => String(item || "").replace(/\\/g, "/").trim()).filter(Boolean))];
  for (const directory of directories) {
    if (!CLEANABLE_CACHE_DIRECTORIES.has(directory)) {
      throw new Error(`不允许清理 ${directory}，当前只支持 library 和 temp。`);
    }
  }
  return directories;
}

function normalizeReloadStrategy(value) {
  const strategy = String(value || DEFAULT_RELOAD_STRATEGY).trim();
  if ([RELOAD_STRATEGY_REFRESH_ONLY, RELOAD_STRATEGY_EDITOR_RELOAD].includes(strategy)) {
    return strategy;
  }
  throw new Error(`未知项目重载策略：${strategy}`);
}

function resolveProjectCacheDirectory(directory) {
  if (directory.includes("/") || directory.includes("..")) {
    throw new Error(`非法缓存目录：${directory}`);
  }

  const projectPath = Path.resolve(getProjectPath());
  const fullPath = Path.resolve(projectPath, directory);
  const relative = Path.relative(projectPath, fullPath);
  if (!relative || relative.startsWith("..") || Path.isAbsolute(relative)) {
    throw new Error(`缓存目录不在项目内：${directory}`);
  }

  return { projectPath, fullPath };
}

function collectDirectoryStats(fullPath) {
  const stats = { files: 0, directories: 1, size: 0 };
  collectDirectoryStatsInto(fullPath, stats);
  return stats;
}

function collectDirectoryStatsInto(fullPath, stats) {
  let entries = [];
  try {
    entries = Fs.readdirSync(fullPath, { withFileTypes: true });
  } catch (_error) {
    return;
  }

  for (const entry of entries) {
    const childPath = Path.join(fullPath, entry.name);
    if (entry.isDirectory()) {
      stats.directories += 1;
      collectDirectoryStatsInto(childPath, stats);
      continue;
    }
    if (entry.isFile()) {
      stats.files += 1;
      const stat = Fs.statSync(childPath, { throwIfNoEntry: false });
      stats.size += stat?.size || 0;
    }
  }
}

async function refreshProjectAfterCleanup(strategy = DEFAULT_RELOAD_STRATEGY) {
  const reloadStrategy = normalizeReloadStrategy(strategy);
  const attempts = [];
  if (reloadStrategy === RELOAD_STRATEGY_REFRESH_ONLY) {
    tryRefreshAssetDb(attempts);
  } else {
    await tryReloadProject(attempts);
  }

  const refreshed = attempts.some((item) => item.ok);
  if (reloadStrategy === RELOAD_STRATEGY_EDITOR_RELOAD && !refreshed) {
    const detail = attempts.map((item) => `${item.action}: ${item.reason || "失败"}`).join("; ");
    throw new Error(`当前 Creator 未暴露可用的项目重载/重启接口。${detail}`);
  }

  return {
    strategy: reloadStrategy,
    attempted: attempts.length > 0,
    refreshed,
    attempts,
    manualHint: getReloadStrategyHint(reloadStrategy, refreshed)
  };
}

function tryRefreshAssetDb(attempts) {
  try {
    if (global.Editor?.Message?.send) {
      global.Editor.Message.send("asset-db", "refresh-asset", "db://assets");
      attempts.push({ action: "asset-db.refresh-asset", ok: true });
      return;
    }
    attempts.push({ action: "asset-db.refresh-asset", ok: false, reason: "Editor.Message.send 不可用" });
  } catch (error) {
    attempts.push({ action: "asset-db.refresh-asset", ok: false, reason: error.message });
  }
}

function getReloadStrategyHint(strategy, refreshed) {
  if (strategy === RELOAD_STRATEGY_EDITOR_RELOAD) {
    return refreshed
      ? "已尝试执行编辑器级项目重载/重启。"
      : "当前 Creator 未暴露可用的项目重载/重启接口。";
  }

  return refreshed
    ? "已尝试刷新 AssetDB；如果 Creator 未自动重建，请手动重新打开项目。"
    : "当前 Creator 未暴露可用的资源刷新接口，请手动重新打开项目。";
}

async function tryReloadProject(attempts) {
  try {
    if (typeof global.Editor?.Project?.reload === "function") {
      await global.Editor.Project.reload();
      attempts.push({ action: "Editor.Project.reload", ok: true });
      return;
    }
    attempts.push({ action: "Editor.Project.reload", ok: false, reason: "当前 Creator 未暴露 reload 方法" });
  } catch (error) {
    attempts.push({ action: "Editor.Project.reload", ok: false, reason: error.message });
  }

  await tryEditorMessageRequest(attempts, "project", "reload");
  if (attempts.some((item) => item.ok)) {
    return;
  }
  await tryEditorMessageRequest(attempts, "app", "restart");
}

async function tryEditorMessageRequest(attempts, channel, message) {
  const action = `Editor.Message.request(${channel}, ${message})`;
  try {
    if (typeof global.Editor?.Message?.request !== "function") {
      attempts.push({ action, ok: false, reason: "Editor.Message.request 不可用" });
      return;
    }
    await global.Editor.Message.request(channel, message);
    attempts.push({ action, ok: true });
  } catch (error) {
    attempts.push({ action, ok: false, reason: error.message });
  }
}

module.exports = {
  DEFAULT_CACHE_DIRECTORIES,
  DEFAULT_RELOAD_STRATEGY,
  RELOAD_STRATEGY_REFRESH_ONLY,
  RELOAD_STRATEGY_EDITOR_RELOAD,
  cleanProjectCache,
  normalizeCacheDirectories,
  normalizeReloadStrategy,
  resolveProjectCacheDirectory,
  collectDirectoryStats,
  refreshProjectAfterCleanup
};
