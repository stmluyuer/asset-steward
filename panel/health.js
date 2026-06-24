"use strict";

const {
  safeNumber,
  formatRuntimeCallStatus,
  formatRuntimeCallStatusClass,
  formatMaterialTextureStatus,
  formatMaterialTextureStatusClass,
  formatShortHash,
  formatReferenceChain,
  formatSize,
  formatPercent
} = require("./format");

function formatResourcesRuntimeSummary(summary) {
  if (!summary) {
    return "只静态检查 resources.load/loadDir；变量、拼接路径和封装调用需要人工复核。";
  }
  const directoryState = summary.resourcesDirectoryExists === false ? `；${summary.resourcesDirectory || "assets/resources"} 当前不存在` : "";
  return `扫描 resources 资源 ${safeNumber(summary.resourceCount)} 项、代码文件 ${safeNumber(summary.scannedCodeFileCount)} 个；静态调用 ${safeNumber(summary.staticCallCount)} 项，其中疑似缺失 ${safeNumber(summary.missingCallCount)} 项；动态调用 ${safeNumber(summary.dynamicCallCount)} 项；疑似未加载资源 ${safeNumber(summary.unusedResourceCount)} 项${directoryState}。`;
}

function buildResourcesUnusedRows(resources) {
  return (Array.isArray(resources) ? resources : []).map((resource) => ({
    path: resource.path,
    loadPath: resource.loadPath,
    extension: resource.extension || "-",
    sizeText: formatSize(resource.size || 0),
    locatePath: resource.path
  }));
}

function buildResourcesCallRows(staticCalls, dynamicCalls) {
  return [
    ...(Array.isArray(staticCalls) ? staticCalls : []),
    ...(Array.isArray(dynamicCalls) ? dynamicCalls : [])
  ]
    .sort((left, right) => String(left.codePath).localeCompare(String(right.codePath), "zh-CN") || left.line - right.line)
    .map((call) => {
      const displayPath = call.kind === "static" ? call.runtimePath : call.expression;
      return {
        statusClass: formatRuntimeCallStatusClass(call),
        statusText: formatRuntimeCallStatus(call),
        method: call.method || "-",
        displayPath: displayPath || "(空路径)",
        displayTitle: displayPath || "",
        codeLocation: `${call.codePath}:${safeNumber(call.line)}`,
        matchCount: safeNumber(call.matchCount),
        locatePath: call.codePath
      };
    });
}

function buildResourcesAllRows(resources) {
  return (Array.isArray(resources) ? resources : []).map((resource) => ({
    statusClass: resource.used ? "ready" : "warning",
    statusText: resource.used ? "静态命中" : "待复核",
    path: resource.path,
    loadPath: resource.loadPath,
    extension: resource.extension || "-",
    sizeText: formatSize(resource.size || 0),
    locatePath: resource.path
  }));
}

function formatPackageSizeSummary(summary) {
  if (!summary) {
    return "统计项目源资源磁盘体积，不等同于最终构建包体。";
  }
  const metaText = summary.includeMeta
    ? "包含 .meta"
    : `排除 .meta ${safeNumber(summary.excludedMetaCount)} 项（${formatSize(summary.excludedMetaSize || 0)}）`;
  return `扫描 ${summary.scanDirectory || "assets"}：文件 ${safeNumber(summary.fileCount)} 项，总大小 ${formatSize(summary.totalSize || 0)}，子目录 ${safeNumber(summary.directoryCount)} 个，类型 ${safeNumber(summary.typeCount)} 类，Top ${safeNumber(summary.topN)}；主场景递归可达 ${safeNumber(summary.referencedFileCount)} 项（${formatSize(summary.referencedTotalSize || 0)}），未解析 UUID ${safeNumber(summary.unresolvedReferenceCount)} 个；${metaText}。`;
}

function buildPackageDirectoryRows(items, totalSize) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    path: item.path,
    count: safeNumber(item.count),
    totalSizeText: formatSize(item.totalSize || 0),
    percentText: formatPercent(item.totalSize, totalSize),
    locatePath: item.path
  }));
}

function buildPackageTypeRows(items, totalSize) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    extension: item.extension || "-",
    count: safeNumber(item.count),
    totalSizeText: formatSize(item.totalSize || 0),
    percentText: formatPercent(item.totalSize, totalSize)
  }));
}

function buildPackageTopFileRows(items, totalSize) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    path: item.path,
    extension: item.extension || "-",
    sizeText: formatSize(item.size || 0),
    percentText: formatPercent(item.size, totalSize),
    locatePath: item.path
  }));
}

function buildPackageReferencedTopFileRows(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const chain = Array.isArray(item.chain) ? item.chain : [];
    return {
      path: item.path,
      extension: item.extension || "-",
      sizeText: formatSize(item.size || 0),
      chainText: chain.join(" -> "),
      chainDisplay: formatReferenceChain(chain),
      locatePath: item.path
    };
  });
}

function formatDirectoryConventionSummary(summary) {
  if (!summary) {
    return "复用当前自动分类规则，只报告首个命中规则下目录不符合的资源。";
  }
  return `扫描 ${summary.scanDirectory || "assets/res"}：文件 ${safeNumber(summary.fileCount)} 项，启用规则 ${safeNumber(summary.ruleCount)} 条；命中 ${safeNumber(summary.matchedCount)} 项，目录正确 ${safeNumber(summary.compliantCount)} 项，不符合 ${safeNumber(summary.mismatchCount)} 项，未命中 ${safeNumber(summary.unmatchedCount)} 项，缺少 meta ${safeNumber(summary.missingMetaCount)} 项。`;
}

function buildDirectoryConventionRows(mismatches) {
  return (Array.isArray(mismatches) ? mismatches : []).map((item) => ({
    path: item.path,
    extension: item.extension || "-",
    currentDirectory: item.currentDirectory,
    suggestedDirectory: item.suggestedDirectory,
    ruleId: item.ruleId || "-",
    statusClass: item.missingMeta ? "blocked" : "warning",
    statusText: item.missingMeta ? "缺少 meta" : "建议移动",
    locatePath: item.path
  }));
}

function formatMaterialTextureSummary(summary) {
  if (!summary) {
    return "扫描 .mtl/.material/.pmtl；无法解析的贴图 UUID 标记为待复核，不自动修复。";
  }
  return `扫描 ${summary.scanDirectory || "assets/res"}：材质 ${safeNumber(summary.materialCount)} 个，主场景可达 ${safeNumber(summary.reachableMaterialCount)} 个、不可达 ${safeNumber(summary.unreachableMaterialCount)} 个；贴图引用 ${safeNumber(summary.textureReferenceCount)} 条，已解析 ${safeNumber(summary.resolvedReferenceCount)} 条、待复核 ${safeNumber(summary.reviewReferenceCount)} 条；无贴图引用材质 ${safeNumber(summary.noTextureMaterialCount)} 个，无法解析材质文件 ${safeNumber(summary.invalidMaterialCount)} 个。`;
}

function buildMaterialTextureRows(references) {
  return (Array.isArray(references) ? references : []).map((item) => ({
    statusClass: formatMaterialTextureStatusClass(item.status),
    statusText: formatMaterialTextureStatus(item.status),
    materialReachableClass: item.materialReachable ? "ready" : "warning",
    materialReachableText: item.materialReachable ? "是" : "否",
    materialPath: item.materialPath,
    propertyPath: item.propertyPath || "-",
    uuid: item.uuid || "-",
    texturePath: item.texturePath || "-",
    textureLocatePath: item.texturePath || "",
    materialLocatePath: item.materialPath
  }));
}

function formatDuplicateAssetSummary(summary) {
  if (!summary) {
    return "检查不同目录同名资源和 SHA-256 相同内容；只报告和定位，不自动删除。";
  }
  return `扫描 ${summary.scanDirectory || "assets/res"}：资源 ${safeNumber(summary.fileCount)} 项，hash 候选 ${safeNumber(summary.hashCandidateCount)} 项；同名 ${safeNumber(summary.sameNameGroupCount)} 组/${safeNumber(summary.sameNameFileCount)} 项，重复内容 ${safeNumber(summary.duplicateHashGroupCount)} 组/${safeNumber(summary.duplicateHashFileCount)} 项，理论可减少重复体积 ${formatSize(summary.duplicateBytes || 0)}。`;
}

function buildDuplicateGroupRows(groups, keyMode = "name") {
  const rows = [];
  for (const group of Array.isArray(groups) ? groups : []) {
    const groupKey = keyMode === "hash" ? formatShortHash(group.hash || group.key) : (group.name || group.key);
    for (const member of group.members || []) {
      rows.push({
        groupTitle: group.key || "-",
        groupKey,
        memberCount: safeNumber(group.members?.length),
        path: member.path,
        extension: member.extension || "-",
        sizeText: formatSize(member.size || 0),
        locatePath: member.path
      });
    }
  }
  return rows;
}

function formatScenePrefabReferenceHealthSummary(summary) {
  if (!summary) {
    return "无法解析 UUID 标记为待复核；白名单精确匹配，只报告和定位，不自动修复。";
  }
  return `扫描 ${summary.scanDirectory || "assets"}：文件 ${safeNumber(summary.scannedFileCount)} 个，UUID 引用 ${safeNumber(summary.referenceCount)} 次；已解析 ${safeNumber(summary.resolvedReferenceCount)} 次，白名单 ${safeNumber(summary.whitelistReferenceCount)} 次，待复核 ${safeNumber(summary.unresolvedReferenceCount)} 次/${safeNumber(summary.unresolvedUuidCount)} 个 UUID，涉及 ${safeNumber(summary.affectedFileCount)} 个文件。`;
}

function buildScenePrefabReferenceHealthRows(issues) {
  return (Array.isArray(issues) ? issues : []).map((item) => ({
    statusClass: "warning",
    statusText: "待复核",
    filePath: item.filePath,
    extension: item.extension || "-",
    uuid: item.uuid || "-",
    matchCount: safeNumber(item.matchCount),
    locatePath: item.filePath
  }));
}

module.exports = {
  formatResourcesRuntimeSummary,
  buildResourcesUnusedRows,
  buildResourcesCallRows,
  buildResourcesAllRows,
  formatPackageSizeSummary,
  buildPackageDirectoryRows,
  buildPackageTypeRows,
  buildPackageTopFileRows,
  buildPackageReferencedTopFileRows,
  formatDirectoryConventionSummary,
  buildDirectoryConventionRows,
  formatMaterialTextureSummary,
  buildMaterialTextureRows,
  formatDuplicateAssetSummary,
  buildDuplicateGroupRows,
  formatScenePrefabReferenceHealthSummary,
  buildScenePrefabReferenceHealthRows
};
