"use strict";

const Fs = require("fs");
const {
  getProjectPath,
  normalizeRelativePath,
  toProjectPath,
  writeJson,
} = require("./path-utils");

const PACKAGE_NAME = "asset-steward";
const REPORT_DIRECTORY_RELATIVE = "reports/asset-steward";
const PACKAGE_VERSION = require("../package.json").version;

function exportSessionReport(payload) {
  const snapshot = sanitizeReportSnapshot(payload?.snapshot || {});
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
  const baseName = `asset-steward-${formatReportTimestamp(generatedAt)}`;
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

function sanitizeReportSnapshot(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeReportSnapshot);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const sanitized = {};
  for (const [key, childValue] of Object.entries(value)) {
    if (key.toLowerCase() === "token") {
      continue;
    }
    sanitized[key] = sanitizeReportSnapshot(childValue);
  }
  return sanitized;
}

function formatReportTimestamp(isoTime) {
  return String(isoTime || "")
    .replace(/\D/g, "")
    .slice(0, 17);
}

function renderSessionReportMarkdown(report) {
  const modules = Array.isArray(report.modules) ? report.modules : [];
  const lines = [
    "# 项目资源管家会话报告",
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

module.exports = {
  REPORT_DIRECTORY_RELATIVE,
  exportSessionReport,
  sanitizeReportSnapshot,
  formatReportTimestamp,
  renderSessionReportMarkdown,
  appendMarkdownSummary,
  formatMarkdownValue,
  escapeMarkdownCell,
  escapeMarkdownInline,
};
