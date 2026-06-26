"use strict";

function formatProjectCacheReloadStrategyText(reloadStrategy) {
  return reloadStrategy === "editor-reload"
    ? "执行编辑器级项目重载/重启；如果当前 Creator API 不支持，将返回错误"
    : "刷新 AssetDB，并在必要时手动重新打开项目";
}

function formatProjectCacheCleanConfirmMessage(reloadStrategy) {
  return `即将删除项目根目录下的 library 和 temp 缓存目录，并${formatProjectCacheReloadStrategyText(reloadStrategy)}。\n\n该操作不可撤销，建议先关闭预览、构建和正在运行的任务。\n\n继续执行？`;
}

function buildProjectCacheCleanRequest(reloadStrategy) {
  return {
    directories: ["library", "temp"],
    confirmed: true,
    reloadStrategy
  };
}

function formatProjectCacheCleanSummary(result = {}, deps = {}) {
  const safeNumber = deps.safeNumber || ((value) => Number(value) || 0);
  const formatSize = deps.formatSize || ((value) => `${Number(value) || 0} B`);
  const summary = result.summary || {};
  const refreshHint = result.refresh?.manualHint || "请根据 Creator 状态手动重新打开项目。";
  return `缓存清理完成：删除 ${safeNumber(summary.deleted)} 个目录，跳过 ${safeNumber(summary.skipped)} 个，失败 ${safeNumber(summary.failed)} 个；释放约 ${formatSize(summary.deletedSize || 0)}。${refreshHint}`;
}

function buildProjectCacheCleanLogDetail(result = {}) {
  return JSON.stringify({
    deleted: result.deleted,
    skipped: result.skipped,
    failed: result.failed,
    refresh: result.refresh
  }, null, 2);
}

module.exports = {
  formatProjectCacheReloadStrategyText,
  formatProjectCacheCleanConfirmMessage,
  buildProjectCacheCleanRequest,
  formatProjectCacheCleanSummary,
  buildProjectCacheCleanLogDetail
};
