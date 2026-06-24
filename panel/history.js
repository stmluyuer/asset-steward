"use strict";

const {
  formatAction,
  formatDate,
  formatLogLevel,
  formatLogLevelClass,
  formatPathList,
  safeNumber
} = require("./format");

function buildHistoryOptions(history, formatters = {}) {
  const formatDateValue = typeof formatters.formatDate === "function" ? formatters.formatDate : formatDate;
  return (Array.isArray(history) ? history : []).map((item) => ({
    value: item.id,
    text: `${formatDateValue(item.createdAt)} | ${item.kind === "reverse" ? "反向" : "移动"} ${safeNumber(item.movedCount)} 项${item.hasOverwrite ? " | 含覆盖" : ""}`
  }));
}

function formatHistoryDetailSummary(detail, formatters = {}) {
  if (!detail) {
    return "选择一条移动历史后查看完整已移动项和清理结果。";
  }
  const formatDateValue = typeof formatters.formatDate === "function" ? formatters.formatDate : formatDate;
  const failedMoveHint = detail.failedMovesPersisted
    ? `失败明细 ${safeNumber(detail.failedMoves?.length)} 项已持久化。`
    : "失败明细未持久化，请查看当次执行日志。";
  return `${formatDateValue(detail.createdAt)}：${detail.kind === "reverse" ? "反向" : "移动"} / ${detail.mode || "-"} / ${detail.conflictPolicy || "-"}；成功 ${safeNumber(detail.movedCount)} 项，失败 ${safeNumber(detail.failedCount)} 项，含覆盖 ${detail.hasOverwrite ? "是" : "否"}。${failedMoveHint}`;
}

function formatHistoryCleanupSummary(detail) {
  if (!detail) {
    return "暂无清理结果。";
  }
  const cleanupFailedHint = detail.failedDirectoriesPersisted
    ? `清理失败明细 ${safeNumber(detail.failedDirectories?.length)} 项已持久化。`
    : "失败明细未持久化。";
  return `删除空源目录 ${safeNumber(detail.deletedDirectories?.length)} 个：${formatPathList(detail.deletedDirectories)}；清理失败 ${safeNumber(detail.cleanupFailedCount)} 个（${cleanupFailedHint}）。`;
}

function buildHistoryMoveRows(detail) {
  return (Array.isArray(detail?.moves) ? detail.moves : []).map((move) => ({
    actionText: formatAction(move.action),
    source: move.source,
    destination: move.destination,
    recoverableClass: move.overwrittenTargetRecoverable ? "ready" : "warning",
    recoverableText: move.overwrittenTargetRecoverable ? "是" : "否"
  }));
}

function buildLogRows(logs, formatters = {}) {
  const formatDateValue = typeof formatters.formatDate === "function" ? formatters.formatDate : formatDate;
  return (Array.isArray(logs) ? logs : []).slice().reverse().map((log) => ({
    timeText: formatDateValue(log.time),
    levelClass: formatLogLevelClass(log.level),
    levelText: formatLogLevel(log.level),
    detail: log.detail || "",
    message: log.message || ""
  }));
}

function toHistorySummary(item) {
  return {
    id: item.id,
    createdAt: item.createdAt,
    kind: item.kind,
    mode: item.mode,
    conflictPolicy: item.conflictPolicy,
    movedCount: item.movedCount,
    failedCount: item.failedCount,
    hasOverwrite: item.hasOverwrite,
    deletedDirectoryCount: Array.isArray(item.deletedDirectories) ? item.deletedDirectories.length : 0,
    cleanupFailedCount: item.cleanupFailedCount
  };
}

function formatExportSessionReportSummary(result) {
  return `已导出 ${safeNumber(result?.moduleCount)} 个已运行模块：${result?.markdownPath || ""}、${result?.jsonPath || ""}`;
}

module.exports = {
  buildHistoryOptions,
  formatHistoryDetailSummary,
  formatHistoryCleanupSummary,
  buildHistoryMoveRows,
  buildLogRows,
  toHistorySummary,
  formatExportSessionReportSummary
};
