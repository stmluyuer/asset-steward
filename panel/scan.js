"use strict";

const {
  formatIssueKind,
  formatIssueSeverity,
  formatIssueSeverityClass,
  formatPathList,
  formatSize,
  formatUuidList,
  safeNumber
} = require("./format");

function formatAssetScanSummary(summary) {
  if (!summary) {
    return "尚未扫描。只预览资源状态，不删除、不修复、不创建目录。";
  }
  const ignoredText = summary.ignoredIssueCount ? `，已忽略异常 ${safeNumber(summary.ignoredIssueCount)} 项` : "";
  return `扫描 ${summary.scanDirectory || "assets"}：文件 ${safeNumber(summary.fileCount)} 项，目录 ${safeNumber(summary.directoryCount)} 项，总大小 ${formatSize(summary.totalSize || 0)}；缺失 meta ${safeNumber(summary.missingMetaCount)} 项，孤立 meta ${safeNumber(summary.orphanMetaCount)} 项，空目录 ${safeNumber(summary.emptyDirectoryCount)} 项${ignoredText}。`;
}

function buildAssetScanResourceRows(entries) {
  return (Array.isArray(entries) ? entries : []).map((entry) => {
    const canCheckReference = entry.selectable && !entry.missingMeta;
    return {
      path: entry.path,
      extension: entry.extension || "-",
      sizeText: entry.kind === "directory" ? "-" : formatSize(entry.size || 0),
      statusClass: entry.issueIgnored ? "ready" : entry.missingMeta ? "warning" : "",
      statusText: entry.issueIgnored ? "已忽略" : entry.missingMeta ? "缺少 meta" : "正常",
      canCheckReference,
      locatePath: entry.path,
      referencePath: entry.path
    };
  });
}

function buildAssetScanIssueRows(issues) {
  return (Array.isArray(issues) ? issues : []).map((issue) => ({
    severityClass: formatIssueSeverityClass(issue.severity),
    severityText: formatIssueSeverity(issue.severity),
    kindText: formatIssueKind(issue.kind),
    path: issue.path,
    extension: issue.extension || "-",
    sizeText: issue.size > 0 ? formatSize(issue.size) : "-",
    locatable: Boolean(issue.locatable),
    locateLabel: issue.locatable ? "定位" : "仅显示",
    locatePath: issue.path
  }));
}

function buildAssetScanTypeRows(typeStats) {
  return (Array.isArray(typeStats) ? typeStats : []).map((stat) => ({
    extension: stat.extension,
    count: safeNumber(stat.count),
    totalSizeText: formatSize(stat.totalSize || 0)
  }));
}

function formatReferenceSummary(summary) {
  if (!summary) {
    return "静态搜索目标资源 UUID。未找到引用不等于可删除，还需要人工复核动态加载。";
  }
  return `扫描 ${summary.scanDirectory || "assets"}：目标 ${safeNumber(summary.targetCount)} 项，UUID ${safeNumber(summary.uuidCount)} 个，扫描序列化文件 ${safeNumber(summary.scannedFileCount)} 个，找到引用方 ${safeNumber(summary.referenceFileCount)} 个，命中 ${safeNumber(summary.totalMatchCount)} 次，解析位置 ${safeNumber(summary.referencePositionCount)} 条，可选中节点 ${safeNumber(summary.selectablePositionCount)} 条。`;
}

function buildReferenceTargetRows(targets) {
  return (Array.isArray(targets) ? targets : []).map((target) => ({
    path: target.path,
    uuidCount: safeNumber(target.uuidCount),
    uuidsTitle: (target.uuids || []).join(", "),
    uuidsText: formatUuidList(target.uuids),
    locatePath: target.path
  }));
}

function buildReferenceRows(references) {
  const rows = [];
  for (const item of Array.isArray(references) ? references : []) {
    const details = item.details?.length ? item.details : [null];
    for (const detail of details) {
      const position = detail
        ? `${detail.nodePath || "未解析节点"} | ${detail.componentType || "未知组件"} | ${detail.fieldPath || "未知字段"}`
        : `仅文件级结果，共命中 ${safeNumber(item.matchCount)} 次`;
      const matchedUuid = detail?.matchedUuid || formatUuidList(item.matchedUuids);
      const targetPaths = detail?.targetPaths || item.targetPaths;
      rows.push({
        path: item.path,
        position,
        matchedUuid,
        targetPathsTitle: (targetPaths || []).join(", "),
        targetPathsText: formatPathList(targetPaths),
        selectable: Boolean(detail?.selectable),
        locatePath: item.path,
        parentReferencePath: item.path,
        selectDetail: detail
      });
    }
  }
  return rows;
}

module.exports = {
  formatAssetScanSummary,
  buildAssetScanResourceRows,
  buildAssetScanIssueRows,
  buildAssetScanTypeRows,
  formatReferenceSummary,
  buildReferenceTargetRows,
  buildReferenceRows
};
