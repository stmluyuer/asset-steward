"use strict";

const {
  formatSize,
  formatUnusedDeleteBackupScope,
  normalizePanelExtensions,
  safeNumber
} = require("./format");

function filterUnusedCandidates(candidates, searchValue, extensionValue) {
  const search = String(searchValue || "").trim().toLowerCase();
  const extensions = Array.isArray(extensionValue) ? extensionValue : normalizePanelExtensions(extensionValue);
  return (Array.isArray(candidates) ? candidates : []).filter((item) => {
    if (search && !String(item.path).toLowerCase().includes(search)) {
      return false;
    }
    return extensions.length === 0 || extensions.includes(String(item.extension).toLowerCase());
  });
}

function formatUnusedSummary(summary, visibleCount) {
  if (!summary) {
    return "只展示和定位候选，不提供删除。脚本与 Shader Chunk 强制保护，动态加载需要人工复核。";
  }
  return `主场景 ${summary.scene}，扫描 ${summary.scanDirectory}：纳入判断 ${safeNumber(summary.scannedCount)} 项，可达 ${safeNumber(summary.reachableCount)} 项，候选 ${safeNumber(summary.candidateCount)} 项（${formatSize(summary.candidateTotalSize || 0)}），保护 ${safeNumber(summary.protectedCount)} 项，未解析 UUID ${safeNumber(summary.unresolvedReferenceCount)} 个；当前筛选显示 ${safeNumber(visibleCount)} 项。`;
}

function buildUnusedCandidateRows(candidates, selectedPaths) {
  const selected = selectedPaths instanceof Set ? selectedPaths : new Set(selectedPaths || []);
  return (Array.isArray(candidates) ? candidates : []).map((item) => ({
    selected: selected.has(item.path),
    path: item.path,
    extension: item.extension || "-",
    sizeText: formatSize(item.size || 0),
    riskText: "动态加载与运行时引用未知",
    locatePath: item.path
  }));
}

function formatUnusedDeleteSummary(plan, selectedCount) {
  if (!plan) {
    return `已勾选 ${safeNumber(selectedCount)} 项；默认不选中任何候选。执行前会重新校验候选并创建备份。`;
  }
  const summary = plan.summary || {};
  return `删除预览：共 ${safeNumber(summary.total)} 项，可删除 ${safeNumber(summary.ready)} 项，阻止 ${safeNumber(summary.blocked)} 项，资源体积 ${formatSize(summary.totalSize || 0)}；备份范围 ${formatUnusedDeleteBackupScope(summary.backupScope)}。`;
}

function buildUnusedDeleteRows(plan) {
  return (Array.isArray(plan?.items) ? plan.items : []).map((item) => ({
    statusClass: item.status === "ready" ? "ready" : "blocked",
    statusText: item.status === "ready" ? "可删除" : "已阻止",
    path: item.path,
    extension: item.extension || "-",
    sizeText: formatSize(item.size || 0),
    reason: item.reason || "-"
  }));
}

function canExecuteUnusedDelete(plan, confirmed) {
  return Boolean(plan && confirmed && safeNumber(plan.summary?.ready) > 0);
}

module.exports = {
  filterUnusedCandidates,
  formatUnusedSummary,
  buildUnusedCandidateRows,
  formatUnusedDeleteSummary,
  buildUnusedDeleteRows,
  canExecuteUnusedDelete
};
