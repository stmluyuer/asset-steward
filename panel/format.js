"use strict";

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizePanelExtensions(value) {
  return [...new Set(String(value || "").split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => item.startsWith(".") ? item : `.${item}`))];
}

function formatAction(action) {
  return { move: "移动", rename: "重命名后移动", overwrite: "覆盖后移动" }[action] || action;
}

function formatLogLevel(level) {
  return { info: "信息", warning: "警告", error: "错误" }[level] || level;
}

function formatLogLevelClass(level) {
  return level === "error" ? "blocked" : (level === "warning" ? "warning" : "ready");
}

function formatRuntimeCallStatus(call) {
  if (call.kind === "dynamic") {
    return "动态待复核";
  }
  return call.status === "matched" ? "静态命中" : "疑似缺失";
}

function formatRuntimeCallStatusClass(call) {
  if (call.kind === "dynamic" || call.status !== "matched") {
    return "warning";
  }
  return "ready";
}

function formatMaterialTextureStatus(status) {
  return {
    resolved: "已解析",
    review: "待复核",
    "invalid-material": "材质无法解析"
  }[status] || status || "-";
}

function formatMaterialTextureStatusClass(status) {
  return status === "resolved" ? "ready" : (status === "invalid-material" ? "blocked" : "warning");
}

function formatShortHash(hash) {
  const value = String(hash || "");
  return value.length > 12 ? `${value.slice(0, 12)}...` : value || "-";
}

function formatUnusedDeleteBackupScope(scope) {
  return scope === "scan-directory" ? "整个扫描目录" : "勾选候选和 .meta";
}

function formatIssueKind(kind) {
  return {
    "missing-meta": "缺失 meta",
    "orphan-meta": "孤立 meta",
    "empty-directory": "空目录"
  }[kind] || kind;
}

function formatIssueSeverity(severity) {
  return { high: "高", medium: "中", low: "低" }[severity] || severity;
}

function formatIssueSeverityClass(severity) {
  return severity === "high" ? "blocked" : (severity === "medium" ? "warning" : "ready");
}

function formatUuidList(uuids) {
  const values = Array.isArray(uuids) ? uuids : [];
  if (values.length <= 2) {
    return values.join(", ");
  }
  return `${values.slice(0, 2).join(", ")} 等 ${values.length} 个`;
}

function formatPathList(paths) {
  const values = Array.isArray(paths) ? paths : [];
  if (values.length <= 1) {
    return values.join("");
  }
  return `${values[0]} 等 ${values.length} 项`;
}

function formatReferenceChain(chain) {
  const values = Array.isArray(chain) ? chain : [];
  if (values.length <= 4) {
    return values.join(" -> ");
  }
  return `${values.slice(0, 2).join(" -> ")} -> ... -> ${values[values.length - 1]}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatPercent(value, total) {
  const number = Number(value);
  const totalNumber = Number(total);
  if (!Number.isFinite(number) || !Number.isFinite(totalNumber) || totalNumber <= 0) {
    return "0.0%";
  }
  return `${(number / totalNumber * 100).toFixed(1)}%`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = {
  safeNumber,
  normalizePanelExtensions,
  formatAction,
  formatLogLevel,
  formatLogLevelClass,
  formatRuntimeCallStatus,
  formatRuntimeCallStatusClass,
  formatMaterialTextureStatus,
  formatMaterialTextureStatusClass,
  formatShortHash,
  formatUnusedDeleteBackupScope,
  formatIssueKind,
  formatIssueSeverity,
  formatIssueSeverityClass,
  formatUuidList,
  formatPathList,
  formatReferenceChain,
  formatSize,
  formatPercent,
  formatDate,
  escapeHtml,
};
