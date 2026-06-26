"use strict";

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildOverviewSnapshot(risks, knownModules, now = new Date()) {
  const items = Array.isArray(risks) ? risks : [];
  return {
    updatedAt: now.toISOString(),
    knownModules,
    riskCount: items.length,
    blockedCount: items.filter((item) => item.severity === "blocked").length,
    warningCount: items.filter((item) => item.severity === "warning").length,
    topRiskTitle: items[0]?.title || "",
    topRiskScore: safeNumber(items[0]?.score)
  };
}

function formatOverviewSummary(risks, knownModules) {
  const items = Array.isArray(risks) ? risks : [];
  const warningCount = items.filter((item) => item.severity === "warning").length;
  const blockedCount = items.filter((item) => item.severity === "blocked").length;
  return `已汇总 ${safeNumber(knownModules)} 个已运行模块；当前风险分组 ${items.length} 类，其中需优先处理 ${blockedCount} 类、待复核 ${warningCount} 类。`;
}

function formatOverviewSnapshotSummary(currentSnapshot, previousSnapshot, knownModules, formatters = {}) {
  const formatDate = typeof formatters.formatDate === "function" ? formatters.formatDate : String;
  const snapshot = safeNumber(knownModules) > 0 ? currentSnapshot : previousSnapshot;
  if (!snapshot?.updatedAt) {
    return "暂无跨会话风险快照。";
  }
  const prefix = safeNumber(knownModules) > 0 ? "当前快照" : "上次快照";
  const topRiskText = snapshot.topRiskTitle ? `，最高风险：${snapshot.topRiskTitle}（${safeNumber(snapshot.topRiskScore)}）` : "";
  return `${prefix} ${formatDate(snapshot.updatedAt)}：模块 ${safeNumber(snapshot.knownModules)} 个，风险 ${safeNumber(snapshot.riskCount)} 类，优先 ${safeNumber(snapshot.blockedCount)} 类，待复核 ${safeNumber(snapshot.warningCount)} 类${topRiskText}。`;
}

function buildOverviewListRows(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    item,
    severity: item.severity || "ready",
    title: item.title || "",
    detail: item.detail || "",
    actionLabel: item.actionLabel || "查看",
    scoreText: Number.isFinite(Number(item.score)) ? `风险 ${safeNumber(item.score)}` : "",
  }));
}

function loadOverviewSnapshot(storage, key) {
  try {
    const parsed = JSON.parse(storage?.getItem(key) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function saveOverviewSnapshot(storage, key, snapshot) {
  try {
    storage?.setItem(key, JSON.stringify(snapshot));
    return true;
  } catch (_error) {
    return false;
  }
}

function sortOverviewItems(items) {
  const severityWeight = { blocked: 3, warning: 2, ready: 1 };
  return (Array.isArray(items) ? items : []).slice().sort((left, right) => {
    return (severityWeight[right.severity] || 0) - (severityWeight[left.severity] || 0)
      || safeNumber(right.score) - safeNumber(left.score)
      || String(left.title).localeCompare(String(right.title), "zh-CN");
  });
}

function countKnownOverviewModules(state) {
  return [
    state?.scanReportSummary,
    state?.unusedSummary,
    state?.resourcesRuntimeSummary,
    state?.packageSizeSummary,
    state?.directoryConventionSummary,
    state?.materialTextureSummary,
    state?.duplicateAssetSummary,
    state?.scenePrefabReferenceSummary
  ].filter(Boolean).length;
}

function buildOverviewRisks(state, formatters = {}) {
  const risks = [];
  const formatSize = typeof formatters.formatSize === "function" ? formatters.formatSize : String;
  const scanSummary = state?.scanReportSummary || state?.classifyScanSummary;
  const missingMetaCount = safeNumber(scanSummary?.missingMetaCount);
  const orphanMetaCount = safeNumber(scanSummary?.orphanMetaCount);
  const emptyDirectoryCount = safeNumber(scanSummary?.emptyDirectoryCount);
  if (missingMetaCount || orphanMetaCount || emptyDirectoryCount) {
    risks.push({
      severity: missingMetaCount ? "blocked" : "warning",
      score: 90 + missingMetaCount * 4 + orphanMetaCount * 2 + emptyDirectoryCount,
      title: "资源结构异常",
      detail: `缺失 meta ${missingMetaCount} 项，孤立 meta ${orphanMetaCount} 项，空目录 ${emptyDirectoryCount} 项。移动和删除前建议先复核这些基础异常。`,
      actionLabel: "查看扫描",
      tab: "scan"
    });
  }
  if (state?.unusedSummary) {
    const candidateCount = safeNumber(state.unusedSummary.candidateCount);
    const unresolvedCount = safeNumber(state.unusedSummary.unresolvedReferenceCount);
    if (candidateCount || unresolvedCount) {
      risks.push({
        severity: unresolvedCount ? "warning" : "ready",
        score: 35 + candidateCount + unresolvedCount * 6,
        title: "未引用候选",
        detail: `候选 ${candidateCount} 项（${formatSize(state.unusedSummary.candidateTotalSize || 0)}），未解析 UUID ${unresolvedCount} 个。候选不等于可删，需要复核动态加载。`,
        actionLabel: "查看候选",
        tab: "unused"
      });
    }
  }
  if (state?.resourcesRuntimeSummary) {
    const unusedCount = safeNumber(state.resourcesRuntimeSummary.unusedResourceCount);
    const missingCallCount = safeNumber(state.resourcesRuntimeSummary.missingCallCount);
    const dynamicCallCount = safeNumber(state.resourcesRuntimeSummary.dynamicCallCount);
    if (unusedCount || missingCallCount || dynamicCallCount) {
      risks.push({
        severity: missingCallCount ? "blocked" : "warning",
        score: 70 + missingCallCount * 10 + dynamicCallCount * 4 + unusedCount,
        title: "resources 动态加载风险",
        detail: `疑似未加载资源 ${unusedCount} 项，疑似缺失路径 ${missingCallCount} 项，动态调用 ${dynamicCallCount} 项。`,
        actionLabel: "查看 resources",
        tab: "resources-runtime",
        selector: "#resourcesRuntimeTab"
      });
    }
  }
  if (state?.directoryConventionSummary) {
    const mismatchCount = safeNumber(state.directoryConventionSummary.mismatchCount);
    const missingMetaCountInDirectory = safeNumber(state.directoryConventionSummary.missingMetaCount);
    if (mismatchCount || missingMetaCountInDirectory) {
      risks.push({
        severity: missingMetaCountInDirectory ? "blocked" : "warning",
        score: 55 + missingMetaCountInDirectory * 8 + mismatchCount * 2,
        title: "目录规范不一致",
        detail: `目录不符合 ${mismatchCount} 项，缺失 meta ${missingMetaCountInDirectory} 项。可转成自动分类移动预览。`,
        actionLabel: "查看目录规范",
        tab: "directory-convention",
        selector: "#directoryConventionTab"
      });
    }
  }
  if (state?.duplicateAssetSummary) {
    const sameNameGroupCount = safeNumber(state.duplicateAssetSummary.sameNameGroupCount);
    const duplicateHashGroupCount = safeNumber(state.duplicateAssetSummary.duplicateHashGroupCount);
    if (sameNameGroupCount || duplicateHashGroupCount) {
      risks.push({
        severity: duplicateHashGroupCount ? "warning" : "ready",
        score: 25 + duplicateHashGroupCount * 8 + sameNameGroupCount * 3,
        title: "重复资源",
        detail: `同名 ${sameNameGroupCount} 组，重复内容 ${duplicateHashGroupCount} 组，理论可减少 ${formatSize(state.duplicateAssetSummary.duplicateBytes || 0)}。`,
        actionLabel: "查看重复",
        tab: "duplicate-assets",
        selector: "#duplicateAssetsTab"
      });
    }
  }
  if (state?.materialTextureSummary) {
    const reviewCount = safeNumber(state.materialTextureSummary.reviewReferenceCount);
    const invalidCount = safeNumber(state.materialTextureSummary.invalidMaterialCount);
    const noTextureCount = safeNumber(state.materialTextureSummary.noTextureMaterialCount);
    if (reviewCount || invalidCount || noTextureCount) {
      risks.push({
        severity: invalidCount ? "blocked" : "warning",
        score: 50 + invalidCount * 10 + reviewCount * 3 + noTextureCount,
        title: "材质贴图待复核",
        detail: `待复核贴图引用 ${reviewCount} 条，无法解析材质 ${invalidCount} 个，无贴图引用材质 ${noTextureCount} 个。`,
        actionLabel: "查看材质",
        tab: "material-textures",
        selector: "#materialTexturesTab"
      });
    }
  }
  if (state?.scenePrefabReferenceSummary) {
    const unresolvedCount = safeNumber(state.scenePrefabReferenceSummary.unresolvedReferenceCount);
    const affectedFileCount = safeNumber(state.scenePrefabReferenceSummary.affectedFileCount);
    if (unresolvedCount || affectedFileCount) {
      risks.push({
        severity: unresolvedCount ? "blocked" : "ready",
        score: 75 + unresolvedCount * 8 + affectedFileCount * 3,
        title: "场景/Prefab 引用健康",
        detail: `待复核 UUID 引用 ${unresolvedCount} 次，涉及文件 ${affectedFileCount} 个。`,
        actionLabel: "查看引用健康",
        tab: "scene-prefab-health",
        selector: "#scenePrefabHealthTab"
      });
    }
  }
  if (state?.packageSizeSummary?.unresolvedReferenceCount) {
    risks.push({
      severity: "warning",
      score: 45 + safeNumber(state.packageSizeSummary.unresolvedReferenceCount) * 4,
      title: "包体引用链未完全解析",
      detail: `包体统计中未解析 UUID ${safeNumber(state.packageSizeSummary.unresolvedReferenceCount)} 个，主场景递归可达体积 ${formatSize(state.packageSizeSummary.referencedTotalSize || 0)}。`,
      actionLabel: "查看包体",
      tab: "package-size",
      selector: "#packageSizeTab"
    });
  }
  return risks;
}

function buildOverviewNextSteps(risks, state) {
  const steps = [];
  if (!state?.scanReportSummary) {
    steps.push({
      severity: "warning",
      score: 60,
      title: "先跑资源扫描",
      detail: "总览会先依赖资源扫描来识别缺失 meta、孤立 meta、空目录和资源状态。",
      actionLabel: "扫描资源",
      tab: "scan",
      run: "asset-scan"
    });
  }
  const firstBlocked = (Array.isArray(risks) ? risks : []).find((item) => item.severity === "blocked");
  if (firstBlocked) {
    steps.push({
      ...firstBlocked,
      score: safeNumber(firstBlocked.score) + 10,
      title: `优先处理：${firstBlocked.title}`
    });
  }
  if (!state?.scenePrefabReferenceSummary) {
    steps.push({
      severity: "warning",
      score: 58,
      title: "补场景/Prefab 引用健康",
      detail: "在移动、删除或压包前，建议先检查无法解析的序列化 UUID 引用。",
      actionLabel: "运行引用健康检查",
      tab: "scene-prefab-health",
      selector: "#scenePrefabHealthTab",
      run: "health-checks"
    });
  }
  if (!state?.packageSizeSummary) {
    steps.push({
      severity: "ready",
      score: 35,
      title: "补包体贡献统计",
      detail: "统计源资源体积和主场景递归引用大文件，便于定位后续优化优先级。",
      actionLabel: "打开包体统计",
      tab: "package-size",
      selector: "#packageSizeTab",
      run: "health-checks"
    });
  }
  if (steps.length === 0) {
    steps.push({
      severity: "ready",
      score: 20,
      title: "导出当前报告",
      detail: "当前已运行模块较完整，可以导出会话报告留存风险和操作状态。",
      actionLabel: "导出报告",
      tab: "history",
      run: "export-report"
    });
  }
  return sortOverviewItems(steps).slice(0, 4);
}

function buildOverviewOperations(state, formatters = {}) {
  const operations = [];
  const formatDate = typeof formatters.formatDate === "function" ? formatters.formatDate : String;
  if (state?.currentPlan) {
    const summary = state.currentPlan.summary || {};
    operations.push({
      severity: safeNumber(summary.blocked) || safeNumber(summary.overwrite) ? "blocked" : "warning",
      score: 65 + safeNumber(summary.blocked) * 8 + safeNumber(summary.overwrite) * 6,
      title: "移动计划待处理",
      detail: `可执行 ${safeNumber(summary.ready)} 项，阻止 ${safeNumber(summary.blocked)} 项，覆盖 ${safeNumber(summary.overwrite)} 项。执行前需要确认备份和冲突策略。`,
      actionLabel: "查看计划",
      tab: "classify"
    });
  } else {
    operations.push({
      severity: "ready",
      score: 10,
      title: "暂无移动计划",
      detail: "当前没有待执行的移动预览计划。",
      actionLabel: "自动分类",
      tab: "classify"
    });
  }
  if (state?.unusedDeletePlan) {
    const summary = state.unusedDeletePlan.summary || {};
    operations.push({
      severity: "blocked",
      score: 80 + safeNumber(summary.ready) * 2 + safeNumber(summary.blocked) * 5,
      title: "未引用删除预览待确认",
      detail: `可删除 ${safeNumber(summary.ready)} 项，阻止 ${safeNumber(summary.blocked)} 项；执行前必须人工复核动态加载风险。`,
      actionLabel: "查看删除预览",
      tab: "unused"
    });
  } else {
    operations.push({
      severity: "ready",
      score: 10,
      title: "暂无删除预览",
      detail: "未引用删除没有待执行计划；删除能力仍要求先备份再通过 AssetDB 执行。",
      actionLabel: "未引用资源",
      tab: "unused"
    });
  }
  const latestHistory = state?.history?.[0];
  if (latestHistory) {
    operations.push({
      severity: latestHistory.failedCount || latestHistory.cleanupFailedCount ? "warning" : "ready",
      score: latestHistory.failedCount || latestHistory.cleanupFailedCount ? 45 + safeNumber(latestHistory.failedCount) * 5 + safeNumber(latestHistory.cleanupFailedCount) * 3 : 15,
      title: "最近执行",
      detail: `${formatDate(latestHistory.createdAt)}：${latestHistory.kind === "reverse" ? "反向" : "移动"} ${safeNumber(latestHistory.movedCount)} 项，失败 ${safeNumber(latestHistory.failedCount)} 项，清理失败 ${safeNumber(latestHistory.cleanupFailedCount)} 项。`,
      actionLabel: "查看历史",
      tab: "history"
    });
  }
  const logWarningCount = Array.isArray(state?.runtimeLogs)
    ? state.runtimeLogs.filter((item) => item.level === "warning" || item.level === "error").length
    : 0;
  if (logWarningCount) {
    operations.push({
      severity: "warning",
      score: 35 + logWarningCount * 3,
      title: "运行日志有告警",
      detail: `当前会话 warning/error 日志 ${logWarningCount} 条，建议交付前快速复核。`,
      actionLabel: "查看日志",
      tab: "history",
      selector: ".log-panel"
    });
  }
  return sortOverviewItems(operations);
}

module.exports = {
  buildOverviewSnapshot,
  formatOverviewSummary,
  formatOverviewSnapshotSummary,
  buildOverviewListRows,
  loadOverviewSnapshot,
  saveOverviewSnapshot,
  countKnownOverviewModules,
  buildOverviewRisks,
  buildOverviewNextSteps,
  buildOverviewOperations,
  sortOverviewItems
};
