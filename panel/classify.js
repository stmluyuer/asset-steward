"use strict";

const {
  formatAction,
  formatSize,
} = require("./format");

function formatClassifyScanSummary(summary, selectedCount) {
  if (!summary) {
    return "尚未扫描。";
  }
  return `当前显示 ${summary.visibleCount} 项；全项目缺少 meta ${summary.missingMetaCount} 项；孤立 meta ${summary.orphanMetaCount} 项；已选择 ${selectedCount} 项。`;
}

function buildClassifyAssetRows(entries, selectedPaths) {
  const selected = selectedPaths || new Set();
  return (entries || []).map((entry) => ({
    path: entry.path,
    extension: entry.extension || "",
    sizeText: entry.kind === "directory" ? "-" : formatSize(entry.size),
    selectable: Boolean(entry.selectable),
    selected: selected.has(entry.path),
    statusClass: entry.missingMeta ? "warning" : "",
    statusText: entry.missingMeta ? "缺少 meta" : "正常",
    locatePath: entry.path,
  }));
}

function filterSelectedPathsByEntries(selectedPaths, entries) {
  const entryPaths = new Set((entries || []).map((entry) => entry.path));
  return new Set([...selectedPaths || []].filter((path) => entryPaths.has(path)));
}

function selectVisibleClassifyEntries(selectedPaths, entries) {
  const nextSelected = new Set(selectedPaths || []);
  for (const entry of entries || []) {
    if (entry.selectable) {
      nextSelected.add(entry.path);
    }
  }
  return nextSelected;
}

function clearClassifySelection() {
  return new Set();
}

function toggleClassifySelection(selectedPaths, path, selected) {
  const nextSelected = new Set(selectedPaths || []);
  if (selected) {
    nextSelected.add(path);
  } else {
    nextSelected.delete(path);
  }
  return nextSelected;
}

function buildRuleRows(rules) {
  return (rules || []).map((rule) => ({
    rule,
    enabled: rule.enabled !== false,
    extensionsText: (rule.extensions || []).join(","),
    keywordsText: (rule.nameKeywords || []).join(","),
    targetText: rule.target || "",
  }));
}

function formatPlanSummary(plan) {
  if (!plan) {
    return "尚未生成计划。";
  }
  const summary = plan.summary || {};
  return `共 ${summary.total} 项；可执行 ${summary.ready} 项；阻止 ${summary.blocked} 项；自动重命名 ${summary.renamed} 项；覆盖 ${summary.overwrite} 项；将创建目录 ${summary.createDirectory} 个。`;
}

function buildPlanRows(plan) {
  if (!plan) {
    return [];
  }
  return (plan.items || []).map((item) => ({
    statusClass: item.status === "ready" ? "ready" : "blocked",
    statusText: item.status === "ready" ? "可执行" : "已阻止",
    actionText: formatAction(item.action),
    source: item.source || "",
    destination: item.destination || "",
    reasonText: item.reason || item.ruleId || "-",
  }));
}

module.exports = {
  formatClassifyScanSummary,
  buildClassifyAssetRows,
  filterSelectedPathsByEntries,
  selectVisibleClassifyEntries,
  clearClassifySelection,
  toggleClassifySelection,
  buildRuleRows,
  formatPlanSummary,
  buildPlanRows,
};
