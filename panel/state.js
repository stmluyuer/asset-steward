"use strict";

function buildOverviewState(parts = {}) {
  return {
    classifyScanSummary: parts.classifyScanSummary || null,
    scanReportSummary: parts.scanReportSummary || null,
    unusedSummary: parts.unusedSummary || null,
    resourcesRuntimeSummary: parts.resourcesRuntimeSummary || null,
    packageSizeSummary: parts.packageSizeSummary || null,
    directoryConventionSummary: parts.directoryConventionSummary || null,
    materialTextureSummary: parts.materialTextureSummary || null,
    duplicateAssetSummary: parts.duplicateAssetSummary || null,
    scenePrefabReferenceSummary: parts.scenePrefabReferenceSummary || null,
    currentPlan: parts.currentPlan || null,
    unusedDeletePlan: parts.unusedDeletePlan || null,
    history: Array.isArray(parts.history) ? parts.history : [],
    runtimeLogs: Array.isArray(parts.runtimeLogs) ? parts.runtimeLogs : []
  };
}

function addSessionReportModule(modules, id, title, summary, data) {
  if (!summary) {
    return;
  }
  modules.push({ id, title, summary, data });
}

function isSessionReportModuleEnabled(options, id) {
  const isToolEnabled = options?.isToolEnabled;
  return typeof isToolEnabled === "function" ? isToolEnabled(id) : true;
}

function sanitizeCurrentPlanForReport(plan) {
  if (!plan) {
    return null;
  }
  const { token, ...reportPlan } = plan;
  return reportPlan;
}

function canExecuteMovePlan(plan) {
  return Boolean(plan && Number(plan.summary?.ready) > 0);
}

function getMovePlanExecutionBlockReason(plan, backupConfirmed) {
  if (!plan?.token) {
    return "请先生成移动预览。";
  }
  if (plan.requiresBackupConfirmation && !backupConfirmed) {
    return "当前计划包含覆盖项，必须先备份项目并勾选确认。";
  }
  return "";
}

function formatMovePlanExecutionConfirmMessage(plan) {
  const overwriteCount = Number(plan?.summary?.overwrite || 0);
  const overwriteText = overwriteCount > 0
    ? `\n\n警告：其中 ${overwriteCount} 项会永久删除现有目标文件，反向计划无法恢复原目标。`
    : "";
  return `即将通过 Creator AssetDB 移动 ${Number(plan?.summary?.ready || 0)} 项资源。${overwriteText}\n\n继续执行？`;
}

function formatMoveExecutionResultMessage(result = {}) {
  return `执行完成：移动成功 ${(result.moved || []).length} 项，失败 ${(result.failed || []).length} 项；创建目录 ${(result.createdDirectories || []).length} 个；删除空源目录 ${(result.deletedDirectories || []).length} 个，清理失败 ${(result.failedDirectories || []).length} 个。建议打开相关场景和 Prefab 回归引用。`;
}

function isCompleteAssetScanResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.entries) &&
    Array.isArray(result.issues) &&
    Array.isArray(result.typeStats) &&
    ["fileCount", "directoryCount", "totalSize", "emptyDirectoryCount", "ignoredIssueCount", "visibleIssueCount", "typeCount"].every((key) => Number.isFinite(Number(summary[key])))
  );
}

function isCompleteReferenceResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.targets) &&
    Array.isArray(result.references) &&
    ["targetCount", "uuidCount", "scannedFileCount", "referenceFileCount", "totalMatchCount"].every((key) => Number.isFinite(Number(summary[key])))
  );
}

function isCompleteNodeReferenceResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.targetNodes) &&
    Array.isArray(result.references) &&
    ["scannedFileCount", "targetFileCount", "targetNodeCount", "referenceFileCount", "referencePositionCount", "selectablePositionCount"].every((key) => Number.isFinite(Number(summary[key])))
  );
}

function isCompleteUnusedResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.candidates) &&
    Array.isArray(result.protectedExtensions) &&
    ["scannedCount", "reachableCount", "candidateCount", "candidateTotalSize", "protectedCount", "ignoredCount", "unresolvedReferenceCount"].every((key) => Number.isFinite(Number(summary[key])))
  );
}

function isCompleteResourcesRuntimeResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.resources) &&
    Array.isArray(result.staticCalls) &&
    Array.isArray(result.unusedResources) &&
    Array.isArray(result.missingCalls) &&
    Array.isArray(result.dynamicCalls) &&
    ["resourceCount", "usedResourceCount", "unusedResourceCount", "scannedCodeFileCount", "staticCallCount", "matchedCallCount", "missingCallCount", "dynamicCallCount"].every((key) => Number.isFinite(Number(summary[key])))
  );
}

function isCompletePackageSizeResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.directoryRanking) &&
    Array.isArray(result.typeRanking) &&
    Array.isArray(result.topFiles) &&
    Array.isArray(result.referencedTopFiles) &&
    ["topN", "fileCount", "totalSize", "directoryCount", "typeCount", "excludedMetaCount", "excludedMetaSize", "referencedFileCount", "referencedTotalSize", "unresolvedReferenceCount"].every((key) => Number.isFinite(Number(summary[key])))
  );
}

function isCompleteDirectoryConventionResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.mismatches) &&
    ["fileCount", "ruleCount", "matchedCount", "compliantCount", "mismatchCount", "unmatchedCount", "missingMetaCount"]
      .every((key) => Number.isFinite(Number(summary[key])))
  );
}

function isCompleteMaterialTextureResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.references) &&
    Array.isArray(result.materialExtensions) &&
    ["materialCount", "reachableMaterialCount", "unreachableMaterialCount", "textureReferenceCount", "resolvedReferenceCount", "reviewReferenceCount", "noTextureMaterialCount", "invalidMaterialCount"]
      .every((key) => Number.isFinite(Number(summary[key])))
  );
}

function isCompleteDuplicateAssetResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.sameNameGroups) &&
    Array.isArray(result.duplicateHashGroups) &&
    ["fileCount", "hashCandidateCount", "sameNameGroupCount", "sameNameFileCount", "duplicateHashGroupCount", "duplicateHashFileCount", "duplicateBytes"]
      .every((key) => Number.isFinite(Number(summary[key])))
  );
}

function isCompleteScenePrefabReferenceHealthResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.issues) &&
    Array.isArray(result.whitelist) &&
    Array.isArray(result.extensions) &&
    ["scannedFileCount", "referenceCount", "resolvedReferenceCount", "whitelistReferenceCount", "unresolvedReferenceCount", "unresolvedUuidCount", "affectedFileCount"]
      .every((key) => Number.isFinite(Number(summary[key])))
  );
}

function buildAssetScanResultState(result) {
  return {
    scanResourceEntries: Array.isArray(result?.entries) ? result.entries : [],
    scanIssues: Array.isArray(result?.issues) ? result.issues : [],
    scanTypeStats: Array.isArray(result?.typeStats) ? result.typeStats : [],
    scanReportSummary: result?.summary || null
  };
}

function buildClassifyScanResultState(result) {
  return {
    entries: Array.isArray(result?.entries) ? result.entries : [],
    directories: Array.isArray(result?.directories) ? result.directories : [],
    classifyScanSummary: result?.summary || null
  };
}

function buildRuntimeLogsResultState(result, fallbackLogs = []) {
  return {
    runtimeLogs: Array.isArray(result?.logs) ? result.logs : fallbackLogs
  };
}

function buildHistoryDetailResultState(result) {
  return {
    selectedHistoryDetail: result?.detail || null
  };
}

function buildReferenceResultState(result) {
  return {
    referenceTargets: Array.isArray(result?.targets) ? result.targets : [],
    referenceRows: Array.isArray(result?.references) ? result.references : [],
    referenceSummary: result?.summary || null
  };
}

function buildNodeReferenceResultState(result) {
  return {
    nodeReferenceTargets: Array.isArray(result?.targetNodes) ? result.targetNodes : [],
    nodeReferenceRows: Array.isArray(result?.references) ? result.references : [],
    nodeReferenceSummary: result?.summary || null
  };
}

function buildUnusedScanResultState(result) {
  return {
    unusedCandidates: Array.isArray(result?.candidates) ? result.candidates : [],
    unusedSummary: result?.summary || null
  };
}

function buildResourcesRuntimeResultState(result) {
  return {
    resourcesRuntimeResources: Array.isArray(result?.resources) ? result.resources : [],
    resourcesRuntimeStaticCalls: Array.isArray(result?.staticCalls) ? result.staticCalls : [],
    resourcesRuntimeUnused: Array.isArray(result?.unusedResources) ? result.unusedResources : [],
    resourcesRuntimeDynamicCalls: Array.isArray(result?.dynamicCalls) ? result.dynamicCalls : [],
    resourcesRuntimeSummary: result?.summary || null
  };
}

function buildPackageSizeResultState(result) {
  return {
    packageDirectoryRanking: Array.isArray(result?.directoryRanking) ? result.directoryRanking : [],
    packageTypeRanking: Array.isArray(result?.typeRanking) ? result.typeRanking : [],
    packageTopFiles: Array.isArray(result?.topFiles) ? result.topFiles : [],
    packageReferencedTopFiles: Array.isArray(result?.referencedTopFiles) ? result.referencedTopFiles : [],
    packageSizeSummary: result?.summary || null
  };
}

function buildDirectoryConventionResultState(result) {
  return {
    directoryConventionMismatches: Array.isArray(result?.mismatches) ? result.mismatches : [],
    directoryConventionSummary: result?.summary || null
  };
}

function buildMaterialTextureResultState(result) {
  return {
    materialTextureReferences: Array.isArray(result?.references) ? result.references : [],
    materialTextureSummary: result?.summary || null
  };
}

function buildDuplicateAssetResultState(result) {
  return {
    duplicateSameNameGroups: Array.isArray(result?.sameNameGroups) ? result.sameNameGroups : [],
    duplicateHashGroups: Array.isArray(result?.duplicateHashGroups) ? result.duplicateHashGroups : [],
    duplicateAssetSummary: result?.summary || null
  };
}

function buildScenePrefabReferenceHealthResultState(result) {
  return {
    scenePrefabReferenceIssues: Array.isArray(result?.issues) ? result.issues : [],
    scenePrefabReferenceSummary: result?.summary || null
  };
}

function buildSessionReportSnapshot(parts = {}, options = {}) {
  const modules = [];
  addSessionReportModule(modules, "asset-scan", "资源扫描", parts.scanReportSummary, {
    resources: parts.scanResourceEntries || [],
    issues: parts.scanIssues || [],
    typeStats: parts.scanTypeStats || []
  });
  addSessionReportModule(modules, "reference-check", "资源引用检查", parts.referenceSummary, {
    targets: parts.referenceTargets || [],
    references: parts.referenceRows || []
  });
  if (isSessionReportModuleEnabled(options, "scene-node-reference-check")) {
    addSessionReportModule(modules, "scene-node-reference-check", "场景节点引用检查", parts.nodeReferenceSummary, {
      targets: parts.nodeReferenceTargets || [],
      references: parts.nodeReferenceRows || []
    });
  }
  addSessionReportModule(modules, "scene-unused-assets", "未引用资源扫描", parts.unusedSummary, {
    candidates: parts.unusedCandidates || []
  });
  if (isSessionReportModuleEnabled(options, "resources-runtime-check")) {
    addSessionReportModule(modules, "resources-runtime-check", "resources 动态加载检查", parts.resourcesRuntimeSummary, {
      resources: parts.resourcesRuntimeResources || [],
      staticCalls: parts.resourcesRuntimeStaticCalls || [],
      unusedResources: parts.resourcesRuntimeUnused || [],
      dynamicCalls: parts.resourcesRuntimeDynamicCalls || []
    });
  }
  if (isSessionReportModuleEnabled(options, "package-size-report")) {
    addSessionReportModule(modules, "package-size-report", "包体贡献统计", parts.packageSizeSummary, {
      directoryRanking: parts.packageDirectoryRanking || [],
      typeRanking: parts.packageTypeRanking || [],
      topFiles: parts.packageTopFiles || [],
      referencedTopFiles: parts.packageReferencedTopFiles || []
    });
  }
  if (isSessionReportModuleEnabled(options, "directory-convention")) {
    addSessionReportModule(modules, "directory-convention", "目录规范检查", parts.directoryConventionSummary, {
      mismatches: parts.directoryConventionMismatches || []
    });
  }
  if (isSessionReportModuleEnabled(options, "material-textures")) {
    addSessionReportModule(modules, "material-textures", "材质贴图检查", parts.materialTextureSummary, {
      references: parts.materialTextureReferences || []
    });
  }
  if (isSessionReportModuleEnabled(options, "duplicate-assets")) {
    addSessionReportModule(modules, "duplicate-assets", "重复资源检查", parts.duplicateAssetSummary, {
      sameNameGroups: parts.duplicateSameNameGroups || [],
      duplicateHashGroups: parts.duplicateHashGroups || []
    });
  }
  if (isSessionReportModuleEnabled(options, "scene-prefab-reference-health")) {
    addSessionReportModule(modules, "scene-prefab-reference-health", "场景和 Prefab 引用健康", parts.scenePrefabReferenceSummary, {
      issues: parts.scenePrefabReferenceIssues || []
    });
  }
  const summarizeHistory = typeof options.summarizeHistory === "function"
    ? options.summarizeHistory
    : (item) => item;
  return {
    modules,
    currentPlan: sanitizeCurrentPlanForReport(parts.currentPlan),
    history: (Array.isArray(parts.history) ? parts.history : []).map(summarizeHistory),
    logs: Array.isArray(parts.runtimeLogs) ? parts.runtimeLogs : []
  };
}

module.exports = {
  buildOverviewState,
  buildSessionReportSnapshot,
  sanitizeCurrentPlanForReport,
  canExecuteMovePlan,
  getMovePlanExecutionBlockReason,
  formatMovePlanExecutionConfirmMessage,
  formatMoveExecutionResultMessage,
  buildAssetScanResultState,
  buildClassifyScanResultState,
  buildRuntimeLogsResultState,
  buildHistoryDetailResultState,
  buildReferenceResultState,
  buildNodeReferenceResultState,
  buildUnusedScanResultState,
  buildResourcesRuntimeResultState,
  buildPackageSizeResultState,
  buildDirectoryConventionResultState,
  buildMaterialTextureResultState,
  buildDuplicateAssetResultState,
  buildScenePrefabReferenceHealthResultState,
  isCompleteAssetScanResult,
  isCompleteReferenceResult,
  isCompleteNodeReferenceResult,
  isCompleteUnusedResult,
  isCompleteResourcesRuntimeResult,
  isCompletePackageSizeResult,
  isCompleteDirectoryConventionResult,
  isCompleteMaterialTextureResult,
  isCompleteDuplicateAssetResult,
  isCompleteScenePrefabReferenceHealthResult
};
