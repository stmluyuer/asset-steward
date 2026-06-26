"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const classify = require("../panel/classify");
const classifyRender = require("../panel/render/classify");
const format = require("../panel/format");
const health = require("../panel/health");
const healthRender = require("../panel/render/health");
const history = require("../panel/history");
const historyRender = require("../panel/render/history");
const layout = require("../panel/layout");
const nodeReference = require("../panel/node-reference");
const nodeReferenceRender = require("../panel/render/node-reference");
const overview = require("../panel/overview");
const overviewRender = require("../panel/render/overview");
const projectMaintenance = require("../panel/project-maintenance");
const scan = require("../panel/scan");
const scanRender = require("../panel/render/scan");
const state = require("../panel/state");
const toolPanel = require("../panel/tool-panel");
const toolPanelRender = require("../panel/render/tool-panel");
const unused = require("../panel/unused");
const unusedRender = require("../panel/render/unused");
const { createAssetStewardError, requestMain } = require("../panel/request");

function createFakeNode() {
  return {
    children: [],
    handlers: [],
    style: {},
    textContent: "",
    _innerHTML: "",
    set innerHTML(value) {
      this._innerHTML = String(value);
      if (value === "") {
        this.children = [];
      }
    },
    get innerHTML() {
      return this._innerHTML;
    },
    appendChild(child) {
      this.children.push(child);
    },
    querySelector(selector) {
      return {
        addEventListener: (event, handler) => {
          this.handlers.push({ selector, event, handler });
        }
      };
    }
  };
}

function createFakeDocument() {
  return {
    createElement: () => createFakeNode()
  };
}

test("panel format helpers keep display output stable", () => {
  assert.equal(format.safeNumber("12"), 12);
  assert.equal(format.safeNumber("nope"), 0);
  assert.deepEqual(format.normalizePanelExtensions("png, .JPG, png"), [".png", ".jpg"]);
  assert.equal(format.formatSize(1536), "1.5 KB");
  assert.equal(format.formatPercent(1, 4), "25.0%");
  assert.equal(format.formatUuidList(["a", "b", "c"]), "a, b 等 3 个");
  assert.equal(format.formatPathList(["assets/a.png", "assets/b.png"]), "assets/a.png 等 2 项");
  assert.equal(format.formatReferenceChain(["scene", "node", "component", "field", "target"]), "scene -> node -> ... -> target");
  assert.equal(format.escapeHtml("<button title=\"x&y\">"), "&lt;button title=&quot;x&amp;y&quot;&gt;");
});

test("panel format helpers keep status labels and classes stable", () => {
  assert.equal(format.formatAction("move"), "移动");
  assert.equal(format.formatAction("unknown"), "unknown");
  assert.equal(format.formatLogLevel("warning"), "警告");
  assert.equal(format.formatLogLevelClass("error"), "blocked");
  assert.equal(format.formatLogLevelClass("warning"), "warning");
  assert.equal(format.formatLogLevelClass("info"), "ready");
  assert.equal(format.formatRuntimeCallStatus({ kind: "dynamic" }), "动态待复核");
  assert.equal(format.formatRuntimeCallStatus({ kind: "static", status: "matched" }), "静态命中");
  assert.equal(format.formatRuntimeCallStatus({ kind: "static", status: "missing" }), "疑似缺失");
  assert.equal(format.formatRuntimeCallStatusClass({ kind: "dynamic" }), "warning");
  assert.equal(format.formatRuntimeCallStatusClass({ kind: "static", status: "matched" }), "ready");
  assert.equal(format.formatMaterialTextureStatus("invalid-material"), "材质无法解析");
  assert.equal(format.formatMaterialTextureStatusClass("invalid-material"), "blocked");
  assert.equal(format.formatMaterialTextureStatusClass("resolved"), "ready");
  assert.equal(format.formatShortHash("1234567890abcdef"), "1234567890ab...");
  assert.equal(format.formatShortHash(""), "-");
  assert.equal(format.formatUnusedDeleteBackupScope("scan-directory"), "整个扫描目录");
  assert.equal(format.formatUnusedDeleteBackupScope("selected"), "勾选候选和 .meta");
  assert.equal(format.formatIssueKind("missing-meta"), "缺失 meta");
  assert.equal(format.formatIssueSeverity("medium"), "中");
  assert.equal(format.formatIssueSeverityClass("high"), "blocked");
  assert.equal(format.formatIssueSeverityClass("medium"), "warning");
});

test("panel layout presets compute stable split sizes", () => {
  assert.equal(layout.getTwoPanePresetLeftWidth({ clientWidth: 1028 }, "tile"), 500);
  assert.equal(layout.getTwoPanePresetLeftWidth({ clientWidth: 1028 }, "left"), 680);
  assert.equal(layout.getTwoPanePresetLeftWidth({ clientWidth: 1028 }, "right"), 320);
  assert.equal(layout.getTwoPanePresetLeftWidth({ clientWidth: 100 }, "tile"), 310);
  assert.deepEqual(layout.getPackageSizePresetColumns({ clientWidth: 1256 }, "tile"), {
    left: 432,
    middle: 312
  });
  assert.deepEqual(layout.getPackageSizePresetColumns({ clientWidth: 1256 }, "stats"), {
    left: 504,
    middle: 336
  });
  assert.deepEqual(layout.getPackageSizePresetColumns({ clientWidth: 1256 }, "referenced"), {
    left: 384,
    middle: 288
  });
  assert.equal(layout.getPackageSizePresetTopHeight("stats"), 420);
  assert.equal(layout.getPackageSizePresetTopHeight("referenced"), 170);
  assert.equal(layout.formatTwoPanePresetName("right"), "最大化右侧");
  assert.equal(layout.formatPackageSizePresetName("stats"), "最大化统计");
  assert.deepEqual(layout.getResizableStyleProperties(320), { left: 320 });
  assert.deepEqual(layout.getResizableStyleProperties({ columns: { left: "300", middle: 220, bad: "x" } }), {
    left: 300,
    middle: 220
  });
  assert.deepEqual(layout.buildResizableStoredValue(null, "left", 320.4, 1), 320);
  assert.deepEqual(layout.buildResizableStoredValue({ columns: { left: 300 } }, "middle", 220.6, 2), {
    columns: {
      left: 300,
      middle: 221
    }
  });
  assert.equal(layout.getResizableSplitVariableName({}, 1), "middle");
  assert.equal(layout.getResizableSplitVariableName({ resizeVariable: "top" }, 2), "top");
  assert.equal(layout.getResizableSplitAxis({ resizeAxis: "y" }), "y");
  assert.equal(layout.getResizeClientPosition({ touches: [{ clientX: 12, clientY: 34 }] }, "y"), 34);
  assert.equal(layout.clampResizableSplitSize({
    axis: "x",
    clientPosition: 900,
    paneRect: { left: 100 },
    nextPaneRect: { right: 1000 },
    minLeft: 260,
    minRight: 260
  }), 640);
  assert.equal(layout.clampResizableSplitSize({
    axis: "y",
    clientPosition: 120,
    paneRect: { top: 50 },
    splitRect: { bottom: 600 },
    minTop: 160,
    minBottom: 160
  }), 160);
  const storage = {
    value: "",
    getItem: () => storage.value,
    setItem: (_key, value) => {
      storage.value = value;
    },
    removeItem: () => {
      storage.value = "";
    }
  };
  assert.equal(layout.saveResizableLayoutState(storage, "layout", { a: 1 }), true);
  assert.deepEqual(layout.loadResizableLayoutState(storage, "layout"), { a: 1 });
  storage.value = "{";
  assert.deepEqual(layout.loadResizableLayoutState(storage, "layout"), {});
  assert.equal(layout.removeResizableLayoutState(storage, "layout"), true);
});

test("panel state helpers build overview snapshots from shared state", () => {
  const overviewState = state.buildOverviewState({
    scanReportSummary: { missingMetaCount: 1 },
    unusedSummary: { candidateCount: 2 },
    currentPlan: { summary: { ready: 1 } },
    history: [{ id: "history-1" }],
    runtimeLogs: [{ level: "warning" }],
    ignored: "value"
  });

  assert.deepEqual(Object.keys(overviewState), [
    "classifyScanSummary",
    "scanReportSummary",
    "unusedSummary",
    "resourcesRuntimeSummary",
    "packageSizeSummary",
    "directoryConventionSummary",
    "materialTextureSummary",
    "duplicateAssetSummary",
    "scenePrefabReferenceSummary",
    "currentPlan",
    "unusedDeletePlan",
    "history",
    "runtimeLogs"
  ]);
  assert.deepEqual(overviewState.scanReportSummary, { missingMetaCount: 1 });
  assert.deepEqual(overviewState.unusedSummary, { candidateCount: 2 });
  assert.deepEqual(overviewState.currentPlan, { summary: { ready: 1 } });
  assert.deepEqual(overviewState.history, [{ id: "history-1" }]);
  assert.deepEqual(overviewState.runtimeLogs, [{ level: "warning" }]);
  assert.equal(overviewState.classifyScanSummary, null);
  assert.equal(overviewState.unusedDeletePlan, null);
  assert.deepEqual(state.buildOverviewState({ history: "bad", runtimeLogs: null }).history, []);
});

test("panel state helpers build session report snapshots", () => {
  const snapshot = state.buildSessionReportSnapshot({
    scanReportSummary: { missingMetaCount: 1 },
    scanResourceEntries: [{ path: "assets/a.png" }],
    resourcesRuntimeSummary: { unusedResourceCount: 2 },
    resourcesRuntimeResources: [{ path: "assets/resources/a.png" }],
    packageSizeSummary: { totalSize: 1024 },
    currentPlan: {
      token: "secret-token",
      summary: { ready: 1 }
    },
    history: [{ id: "h1", movedCount: 2 }],
    runtimeLogs: [{ level: "info" }]
  }, {
    isToolEnabled: (id) => id !== "package-size-report",
    summarizeHistory: (item) => ({ id: item.id })
  });

  assert.deepEqual(snapshot.modules.map((item) => item.id), [
    "asset-scan",
    "resources-runtime-check"
  ]);
  assert.deepEqual(snapshot.modules[0], {
    id: "asset-scan",
    title: "资源扫描",
    summary: { missingMetaCount: 1 },
    data: {
      resources: [{ path: "assets/a.png" }],
      issues: [],
      typeStats: []
    }
  });
  assert.deepEqual(snapshot.currentPlan, {
    summary: { ready: 1 }
  });
  assert.equal(Object.hasOwn(snapshot.currentPlan, "token"), false);
  assert.deepEqual(snapshot.history, [{ id: "h1" }]);
  assert.deepEqual(snapshot.logs, [{ level: "info" }]);
});

test("panel state helpers normalize asset scan result state", () => {
  const result = {
    entries: [{ path: "assets/a.png" }],
    issues: [{ type: "missing-meta" }],
    typeStats: [{ extension: ".png" }],
    summary: { fileCount: 1 }
  };

  assert.deepEqual(state.buildAssetScanResultState(result), {
    scanResourceEntries: result.entries,
    scanIssues: result.issues,
    scanTypeStats: result.typeStats,
    scanReportSummary: result.summary
  });
  assert.deepEqual(state.buildAssetScanResultState({
    entries: null,
    issues: "bad",
    typeStats: {},
    summary: null
  }), {
    scanResourceEntries: [],
    scanIssues: [],
    scanTypeStats: [],
    scanReportSummary: null
  });
});

test("panel project maintenance helpers keep cache cleanup messages stable", () => {
  assert.equal(projectMaintenance.formatProjectCacheReloadStrategyText("assetdb-refresh"), "刷新 AssetDB，并在必要时手动重新打开项目");
  assert.equal(projectMaintenance.formatProjectCacheReloadStrategyText("editor-reload"), "执行编辑器级项目重载/重启；如果当前 Creator API 不支持，将返回错误");
  assert.equal(projectMaintenance.formatProjectCacheCleanConfirmMessage("assetdb-refresh").includes("library 和 temp"), true);
  assert.deepEqual(projectMaintenance.buildProjectCacheCleanRequest("editor-reload"), {
    directories: ["library", "temp"],
    confirmed: true,
    reloadStrategy: "editor-reload"
  });
  assert.equal(projectMaintenance.formatProjectCacheCleanSummary({
    summary: {
      deleted: 2,
      skipped: 1,
      failed: 0,
      deletedSize: 1536
    },
    refresh: {
      manualHint: "请重新打开项目。"
    }
  }, {
    safeNumber: format.safeNumber,
    formatSize: format.formatSize
  }), "缓存清理完成：删除 2 个目录，跳过 1 个，失败 0 个；释放约 1.5 KB。请重新打开项目。");
  assert.deepEqual(JSON.parse(projectMaintenance.buildProjectCacheCleanLogDetail({
    deleted: ["library"],
    skipped: ["temp"],
    failed: [],
    refresh: { strategy: "assetdb-refresh" }
  })), {
    deleted: ["library"],
    skipped: ["temp"],
    failed: [],
    refresh: { strategy: "assetdb-refresh" }
  });
});

test("panel state helpers normalize classify scan result state", () => {
  const result = {
    entries: [{ path: "assets/a.png" }],
    directories: ["assets/res"],
    summary: { visibleCount: 1 }
  };

  assert.deepEqual(state.buildClassifyScanResultState(result), {
    entries: result.entries,
    directories: result.directories,
    classifyScanSummary: result.summary
  });
  assert.deepEqual(state.buildClassifyScanResultState({
    entries: null,
    directories: "bad",
    summary: null
  }), {
    entries: [],
    directories: [],
    classifyScanSummary: null
  });
});

test("panel state helpers normalize runtime logs result state", () => {
  const logs = [{ level: "info" }];
  const fallbackLogs = [{ level: "warning" }];

  assert.deepEqual(state.buildRuntimeLogsResultState({ logs }), {
    runtimeLogs: logs
  });
  assert.deepEqual(state.buildRuntimeLogsResultState({ logs: null }), {
    runtimeLogs: []
  });
  assert.deepEqual(state.buildRuntimeLogsResultState({ logs: "bad" }, fallbackLogs), {
    runtimeLogs: fallbackLogs
  });
});

test("panel state helpers normalize history detail result state", () => {
  const detail = { id: "h1", warning: "legacy detail" };

  assert.deepEqual(state.buildHistoryDetailResultState({ detail }), {
    selectedHistoryDetail: detail
  });
  assert.deepEqual(state.buildHistoryDetailResultState({ detail: null }), {
    selectedHistoryDetail: null
  });
  assert.deepEqual(state.buildHistoryDetailResultState(), {
    selectedHistoryDetail: null
  });
});

test("panel state helpers normalize reference result state", () => {
  const result = {
    targets: [{ path: "assets/a.png" }],
    references: [{ file: "assets/main.scene" }],
    summary: { totalMatchCount: 1 }
  };

  assert.deepEqual(state.buildReferenceResultState(result), {
    referenceTargets: result.targets,
    referenceRows: result.references,
    referenceSummary: result.summary
  });
  assert.deepEqual(state.buildReferenceResultState({
    targets: null,
    references: "bad",
    summary: null
  }), {
    referenceTargets: [],
    referenceRows: [],
    referenceSummary: null
  });
});

test("panel state helpers normalize node reference result state", () => {
  const result = {
    targetNodes: [{ uuid: "node-1" }],
    references: [{ file: "assets/main.scene" }],
    summary: { referenceFileCount: 1 }
  };

  assert.deepEqual(state.buildNodeReferenceResultState(result), {
    nodeReferenceTargets: result.targetNodes,
    nodeReferenceRows: result.references,
    nodeReferenceSummary: result.summary
  });
  assert.deepEqual(state.buildNodeReferenceResultState({
    targetNodes: null,
    references: "bad",
    summary: null
  }), {
    nodeReferenceTargets: [],
    nodeReferenceRows: [],
    nodeReferenceSummary: null
  });
});

test("panel state helpers normalize unused scan result state", () => {
  const result = {
    candidates: [{ path: "assets/unused.png" }],
    summary: { candidateCount: 1 }
  };

  assert.deepEqual(state.buildUnusedScanResultState(result), {
    unusedCandidates: result.candidates,
    unusedSummary: result.summary
  });
  assert.deepEqual(state.buildUnusedScanResultState({
    candidates: "bad",
    summary: null
  }), {
    unusedCandidates: [],
    unusedSummary: null
  });
});

test("panel state helpers normalize resources runtime result state", () => {
  const result = {
    resources: [{ path: "assets/resources/a.png" }],
    staticCalls: [{ path: "a" }],
    unusedResources: [{ path: "assets/resources/unused.png" }],
    dynamicCalls: [{ expression: "name" }],
    summary: { resourceCount: 1 }
  };

  assert.deepEqual(state.buildResourcesRuntimeResultState(result), {
    resourcesRuntimeResources: result.resources,
    resourcesRuntimeStaticCalls: result.staticCalls,
    resourcesRuntimeUnused: result.unusedResources,
    resourcesRuntimeDynamicCalls: result.dynamicCalls,
    resourcesRuntimeSummary: result.summary
  });
  assert.deepEqual(state.buildResourcesRuntimeResultState({
    resources: null,
    staticCalls: "bad",
    unusedResources: {},
    dynamicCalls: false,
    summary: null
  }), {
    resourcesRuntimeResources: [],
    resourcesRuntimeStaticCalls: [],
    resourcesRuntimeUnused: [],
    resourcesRuntimeDynamicCalls: [],
    resourcesRuntimeSummary: null
  });
});

test("panel state helpers normalize package size result state", () => {
  const result = {
    directoryRanking: [{ directory: "assets/res" }],
    typeRanking: [{ extension: ".png" }],
    topFiles: [{ path: "assets/a.png" }],
    referencedTopFiles: [{ path: "assets/b.png" }],
    summary: { totalSize: 1 }
  };

  assert.deepEqual(state.buildPackageSizeResultState(result), {
    packageDirectoryRanking: result.directoryRanking,
    packageTypeRanking: result.typeRanking,
    packageTopFiles: result.topFiles,
    packageReferencedTopFiles: result.referencedTopFiles,
    packageSizeSummary: result.summary
  });
  assert.deepEqual(state.buildPackageSizeResultState({
    directoryRanking: null,
    typeRanking: "bad",
    topFiles: {},
    referencedTopFiles: false,
    summary: null
  }), {
    packageDirectoryRanking: [],
    packageTypeRanking: [],
    packageTopFiles: [],
    packageReferencedTopFiles: [],
    packageSizeSummary: null
  });
});

test("panel state helpers normalize directory convention result state", () => {
  const result = {
    mismatches: [{ path: "assets/raw" }],
    summary: { mismatchCount: 1 }
  };

  assert.deepEqual(state.buildDirectoryConventionResultState(result), {
    directoryConventionMismatches: result.mismatches,
    directoryConventionSummary: result.summary
  });
  assert.deepEqual(state.buildDirectoryConventionResultState({
    mismatches: null,
    summary: null
  }), {
    directoryConventionMismatches: [],
    directoryConventionSummary: null
  });
});

test("panel state helpers normalize material texture result state", () => {
  const result = {
    references: [{ materialPath: "assets/mat/fish.mtl" }],
    summary: { reviewReferenceCount: 1 }
  };

  assert.deepEqual(state.buildMaterialTextureResultState(result), {
    materialTextureReferences: result.references,
    materialTextureSummary: result.summary
  });
  assert.deepEqual(state.buildMaterialTextureResultState({
    references: null,
    summary: null
  }), {
    materialTextureReferences: [],
    materialTextureSummary: null
  });
});

test("panel state helpers normalize duplicate asset result state", () => {
  const result = {
    sameNameGroups: [{ name: "fish.png" }],
    duplicateHashGroups: [{ hash: "abc" }],
    summary: { duplicateHashGroupCount: 1 }
  };

  assert.deepEqual(state.buildDuplicateAssetResultState(result), {
    duplicateSameNameGroups: result.sameNameGroups,
    duplicateHashGroups: result.duplicateHashGroups,
    duplicateAssetSummary: result.summary
  });
  assert.deepEqual(state.buildDuplicateAssetResultState({
    sameNameGroups: null,
    duplicateHashGroups: "bad",
    summary: null
  }), {
    duplicateSameNameGroups: [],
    duplicateHashGroups: [],
    duplicateAssetSummary: null
  });
});

test("panel state helpers normalize scene prefab reference health result state", () => {
  const result = {
    issues: [{ path: "assets/scene/main.scene" }],
    summary: { unresolvedCount: 1 }
  };

  assert.deepEqual(state.buildScenePrefabReferenceHealthResultState(result), {
    scenePrefabReferenceIssues: result.issues,
    scenePrefabReferenceSummary: result.summary
  });
  assert.deepEqual(state.buildScenePrefabReferenceHealthResultState({
    issues: null,
    summary: null
  }), {
    scenePrefabReferenceIssues: [],
    scenePrefabReferenceSummary: null
  });
});

test("panel state helpers check move plan executability", () => {
  assert.equal(state.canExecuteMovePlan(null), false);
  assert.equal(state.canExecuteMovePlan({ summary: { ready: 0 } }), false);
  assert.equal(state.canExecuteMovePlan({ summary: { ready: "0" } }), false);
  assert.equal(state.canExecuteMovePlan({ summary: { ready: 1 } }), true);
  assert.equal(state.canExecuteMovePlan({ summary: { ready: "2" } }), true);
});

test("panel state helpers explain move plan execution blockers", () => {
  assert.equal(state.getMovePlanExecutionBlockReason(null, true), "请先生成移动预览。");
  assert.equal(
    state.getMovePlanExecutionBlockReason({ token: "t", requiresBackupConfirmation: true }, false),
    "当前计划包含覆盖项，必须先备份项目并勾选确认。"
  );
  assert.equal(
    state.getMovePlanExecutionBlockReason({ token: "t", requiresBackupConfirmation: true }, true),
    ""
  );
  assert.equal(
    state.getMovePlanExecutionBlockReason({ token: "t", requiresBackupConfirmation: false }, false),
    ""
  );
});

test("panel state helpers format move plan execution confirmation", () => {
  assert.equal(
    state.formatMovePlanExecutionConfirmMessage({ summary: { ready: 3, overwrite: 0 } }),
    "即将通过 Creator AssetDB 移动 3 项资源。\n\n继续执行？"
  );
  assert.equal(
    state.formatMovePlanExecutionConfirmMessage({ summary: { ready: 2, overwrite: 1 } }),
    "即将通过 Creator AssetDB 移动 2 项资源。\n\n警告：其中 1 项会永久删除现有目标文件，反向计划无法恢复原目标。\n\n继续执行？"
  );
});

test("panel state helpers format move execution result summary", () => {
  assert.equal(
    state.formatMoveExecutionResultMessage({
      moved: [{}, {}],
      failed: [{}],
      createdDirectories: [{}],
      deletedDirectories: [{}, {}],
      failedDirectories: [{}]
    }),
    "执行完成：移动成功 2 项，失败 1 项；创建目录 1 个；删除空源目录 2 个，清理失败 1 个。建议打开相关场景和 Prefab 回归引用。"
  );
});

test("panel state helpers validate complete asset scan results", () => {
  const result = {
    entries: [],
    issues: [],
    typeStats: [],
    summary: {
      fileCount: 1,
      directoryCount: 2,
      totalSize: 3,
      emptyDirectoryCount: 4,
      ignoredIssueCount: 5,
      visibleIssueCount: 6,
      typeCount: 7
    }
  };

  assert.equal(state.isCompleteAssetScanResult(result), true);
  assert.equal(state.isCompleteAssetScanResult({ ...result, entries: null }), false);
  assert.equal(state.isCompleteAssetScanResult({
    ...result,
    summary: {
      ...result.summary,
      typeCount: "bad"
    }
  }), false);
});

test("panel state helpers validate complete reference results", () => {
  const result = {
    targets: [],
    references: [],
    summary: {
      targetCount: 1,
      uuidCount: 2,
      scannedFileCount: 3,
      referenceFileCount: 4,
      totalMatchCount: 5
    }
  };

  assert.equal(state.isCompleteReferenceResult(result), true);
  assert.equal(state.isCompleteReferenceResult({ ...result, targets: null }), false);
  assert.equal(state.isCompleteReferenceResult({
    ...result,
    summary: {
      ...result.summary,
      totalMatchCount: "bad"
    }
  }), false);
});

test("panel state helpers validate complete node reference results", () => {
  const result = {
    targetNodes: [],
    references: [],
    summary: {
      scannedFileCount: 1,
      targetFileCount: 2,
      targetNodeCount: 3,
      referenceFileCount: 4,
      referencePositionCount: 5,
      selectablePositionCount: 6
    }
  };

  assert.equal(state.isCompleteNodeReferenceResult(result), true);
  assert.equal(state.isCompleteNodeReferenceResult({ ...result, targetNodes: null }), false);
  assert.equal(state.isCompleteNodeReferenceResult({
    ...result,
    summary: {
      ...result.summary,
      selectablePositionCount: "bad"
    }
  }), false);
});

test("panel state helpers validate complete unused scan results", () => {
  const result = {
    candidates: [],
    protectedExtensions: [],
    summary: {
      scannedCount: 1,
      reachableCount: 2,
      candidateCount: 3,
      candidateTotalSize: 4,
      protectedCount: 5,
      ignoredCount: 6,
      unresolvedReferenceCount: 7
    }
  };

  assert.equal(state.isCompleteUnusedResult(result), true);
  assert.equal(state.isCompleteUnusedResult({ ...result, protectedExtensions: null }), false);
  assert.equal(state.isCompleteUnusedResult({
    ...result,
    summary: {
      ...result.summary,
      unresolvedReferenceCount: "bad"
    }
  }), false);
});

test("panel state helpers validate complete resources runtime results", () => {
  const result = {
    resources: [],
    staticCalls: [],
    unusedResources: [],
    missingCalls: [],
    dynamicCalls: [],
    summary: {
      resourceCount: 1,
      usedResourceCount: 2,
      unusedResourceCount: 3,
      scannedCodeFileCount: 4,
      staticCallCount: 5,
      matchedCallCount: 6,
      missingCallCount: 7,
      dynamicCallCount: 8
    }
  };

  assert.equal(state.isCompleteResourcesRuntimeResult(result), true);
  assert.equal(state.isCompleteResourcesRuntimeResult({ ...result, staticCalls: null }), false);
  assert.equal(state.isCompleteResourcesRuntimeResult({
    ...result,
    summary: {
      ...result.summary,
      dynamicCallCount: "bad"
    }
  }), false);
});

test("panel state helpers validate complete package size results", () => {
  const result = {
    directoryRanking: [],
    typeRanking: [],
    topFiles: [],
    referencedTopFiles: [],
    summary: {
      topN: 1,
      fileCount: 2,
      totalSize: 3,
      directoryCount: 4,
      typeCount: 5,
      excludedMetaCount: 6,
      excludedMetaSize: 7,
      referencedFileCount: 8,
      referencedTotalSize: 9,
      unresolvedReferenceCount: 10
    }
  };

  assert.equal(state.isCompletePackageSizeResult(result), true);
  assert.equal(state.isCompletePackageSizeResult({ ...result, referencedTopFiles: null }), false);
  assert.equal(state.isCompletePackageSizeResult({
    ...result,
    summary: {
      ...result.summary,
      unresolvedReferenceCount: "bad"
    }
  }), false);
});

test("panel state helpers validate complete directory convention results", () => {
  const result = {
    mismatches: [],
    summary: {
      fileCount: 1,
      ruleCount: 2,
      matchedCount: 3,
      compliantCount: 4,
      mismatchCount: 5,
      unmatchedCount: 6,
      missingMetaCount: 7
    }
  };

  assert.equal(state.isCompleteDirectoryConventionResult(result), true);
  assert.equal(state.isCompleteDirectoryConventionResult({ ...result, mismatches: null }), false);
  assert.equal(state.isCompleteDirectoryConventionResult({
    ...result,
    summary: {
      ...result.summary,
      missingMetaCount: "bad"
    }
  }), false);
});

test("panel state helpers validate complete material texture results", () => {
  const result = {
    references: [],
    materialExtensions: [],
    summary: {
      materialCount: 1,
      reachableMaterialCount: 2,
      unreachableMaterialCount: 3,
      textureReferenceCount: 4,
      resolvedReferenceCount: 5,
      reviewReferenceCount: 6,
      noTextureMaterialCount: 7,
      invalidMaterialCount: 8
    }
  };

  assert.equal(state.isCompleteMaterialTextureResult(result), true);
  assert.equal(state.isCompleteMaterialTextureResult({ ...result, materialExtensions: null }), false);
  assert.equal(state.isCompleteMaterialTextureResult({
    ...result,
    summary: {
      ...result.summary,
      invalidMaterialCount: "bad"
    }
  }), false);
});

test("panel state helpers validate complete duplicate asset results", () => {
  const result = {
    sameNameGroups: [],
    duplicateHashGroups: [],
    summary: {
      fileCount: 1,
      hashCandidateCount: 2,
      sameNameGroupCount: 3,
      sameNameFileCount: 4,
      duplicateHashGroupCount: 5,
      duplicateHashFileCount: 6,
      duplicateBytes: 7
    }
  };

  assert.equal(state.isCompleteDuplicateAssetResult(result), true);
  assert.equal(state.isCompleteDuplicateAssetResult({ ...result, duplicateHashGroups: null }), false);
  assert.equal(state.isCompleteDuplicateAssetResult({
    ...result,
    summary: {
      ...result.summary,
      duplicateBytes: "bad"
    }
  }), false);
});

test("panel state helpers validate complete scene prefab reference health results", () => {
  const result = {
    issues: [],
    whitelist: [],
    extensions: [],
    summary: {
      scannedFileCount: 1,
      referenceCount: 2,
      resolvedReferenceCount: 3,
      whitelistReferenceCount: 4,
      unresolvedReferenceCount: 5,
      unresolvedUuidCount: 6,
      affectedFileCount: 7
    }
  };

  assert.equal(state.isCompleteScenePrefabReferenceHealthResult(result), true);
  assert.equal(state.isCompleteScenePrefabReferenceHealthResult({ ...result, whitelist: null }), false);
  assert.equal(state.isCompleteScenePrefabReferenceHealthResult({
    ...result,
    summary: {
      ...result.summary,
      affectedFileCount: "bad"
    }
  }), false);
});

test("panel overview helpers sort risks and build cross-session snapshots", () => {
  const risks = overview.sortOverviewItems([
    { severity: "ready", score: 999, title: "low" },
    { severity: "blocked", score: 10, title: "blocked-low" },
    { severity: "blocked", score: 20, title: "blocked-high" },
    { severity: "warning", score: 200, title: "warning" }
  ]);

  assert.deepEqual(risks.map((item) => item.title), ["blocked-high", "blocked-low", "warning", "low"]);
  assert.deepEqual(overview.buildOverviewSnapshot(risks, 3, new Date("2026-06-23T00:00:00.000Z")), {
    updatedAt: "2026-06-23T00:00:00.000Z",
    knownModules: 3,
    riskCount: 4,
    blockedCount: 2,
    warningCount: 1,
    topRiskTitle: "blocked-high",
    topRiskScore: 20
  });
  assert.equal(
    overview.formatOverviewSummary(risks, 3),
    "已汇总 3 个已运行模块；当前风险分组 4 类，其中需优先处理 2 类、待复核 1 类。"
  );
  assert.equal(
    overview.formatOverviewSnapshotSummary(null, null, 0),
    "暂无跨会话风险快照。"
  );
  assert.equal(
    overview.formatOverviewSnapshotSummary(null, {
      updatedAt: "2026-06-23T00:00:00.000Z",
      knownModules: 3,
      riskCount: 4,
      blockedCount: 2,
      warningCount: 1,
      topRiskTitle: "blocked-high",
      topRiskScore: 20
    }, 0, {
      formatDate: () => "2026-06-23"
    }),
    "上次快照 2026-06-23：模块 3 个，风险 4 类，优先 2 类，待复核 1 类，最高风险：blocked-high（20）。"
  );
  assert.deepEqual(overview.buildOverviewListRows([{ severity: "blocked", title: "A", detail: "B", score: 12 }]), [{
    item: { severity: "blocked", title: "A", detail: "B", score: 12 },
    severity: "blocked",
    title: "A",
    detail: "B",
    actionLabel: "查看",
    scoreText: "风险 12"
  }]);
  const storage = {
    value: "",
    getItem: () => storage.value,
    setItem: (_key, value) => {
      storage.value = value;
    }
  };
  assert.equal(overview.saveOverviewSnapshot(storage, "snapshot", { knownModules: 1 }), true);
  assert.deepEqual(overview.loadOverviewSnapshot(storage, "snapshot"), { knownModules: 1 });
  storage.getItem = () => "{";
  assert.equal(overview.loadOverviewSnapshot(storage, "snapshot"), null);
});

test("panel overview builds risks, next steps, and operation models from state", () => {
  const state = {
    scanReportSummary: {
      missingMetaCount: 2,
      orphanMetaCount: 1,
      emptyDirectoryCount: 1
    },
    unusedSummary: {
      candidateCount: 4,
      candidateTotalSize: 1536,
      unresolvedReferenceCount: 0
    },
    resourcesRuntimeSummary: {
      unusedResourceCount: 3,
      missingCallCount: 1,
      dynamicCallCount: 2
    },
    packageSizeSummary: {
      unresolvedReferenceCount: 2,
      referencedTotalSize: 4096
    },
    currentPlan: {
      summary: {
        ready: 3,
        blocked: 1,
        overwrite: 0
      }
    },
    unusedDeletePlan: {
      summary: {
        ready: 2,
        blocked: 1
      }
    },
    history: [{
      createdAt: "2026-06-23T00:00:00.000Z",
      kind: "move",
      movedCount: 5,
      failedCount: 1,
      cleanupFailedCount: 0
    }],
    runtimeLogs: [
      { level: "info" },
      { level: "warning" },
      { level: "error" }
    ]
  };

  const risks = overview.sortOverviewItems(overview.buildOverviewRisks(state, {
    formatSize: (value) => `${value} B`
  }));
  const nextSteps = overview.buildOverviewNextSteps(risks, state);
  const operations = overview.buildOverviewOperations(state, {
    formatDate: () => "2026-06-23"
  });

  assert.equal(overview.countKnownOverviewModules(state), 4);
  assert.deepEqual(risks.map((item) => item.title), [
    "资源结构异常",
    "resources 动态加载风险",
    "包体引用链未完全解析",
    "未引用候选"
  ]);
  assert.equal(risks.find((item) => item.title === "未引用候选").detail.includes("1536 B"), true);
  assert.equal(risks.find((item) => item.title === "resources 动态加载风险").tab, "resources-runtime");
  assert.equal(risks.find((item) => item.title === "包体引用链未完全解析").tab, "package-size");
  assert.equal(nextSteps[0].title, "优先处理：资源结构异常");
  assert.equal(nextSteps.some((item) => item.title === "补场景/Prefab 引用健康"), true);
  assert.equal(nextSteps.find((item) => item.title === "补场景/Prefab 引用健康").tab, "scene-prefab-health");
  assert.deepEqual(operations.map((item) => item.title), [
    "未引用删除预览待确认",
    "移动计划待处理",
    "最近执行",
    "运行日志有告警"
  ]);
  assert.equal(operations.find((item) => item.title === "最近执行").detail.includes("2026-06-23"), true);
});

test("panel overview renderer fills summary, rows, and action handlers", () => {
  const documentRef = createFakeDocument();
  const actions = [];
  const panel = {
    $: {
      overviewSummary: createFakeNode(),
      overviewSnapshotSummary: createFakeNode(),
      overviewRiskRows: createFakeNode(),
      overviewRiskEmpty: createFakeNode(),
      overviewNextStepRows: createFakeNode(),
      overviewOperationRows: createFakeNode()
    }
  };
  const risk = {
    severity: "blocked",
    score: 20,
    title: "资源结构异常",
    detail: "缺失 meta",
    actionLabel: "查看扫描"
  };

  overviewRender.renderOverview(panel, {
    risks: [risk],
    nextSteps: [],
    operations: [{ title: "暂无移动计划", detail: "空", tab: "classify" }],
    knownModules: 1,
    currentSnapshot: {
      updatedAt: "2026-06-23T00:00:00.000Z",
      knownModules: 1,
      riskCount: 1,
      blockedCount: 1,
      warningCount: 0,
      topRiskTitle: "资源结构异常",
      topRiskScore: 20
    },
    previousSnapshot: null
  }, {
    document: documentRef,
    formatDate: () => "2026-06-23",
    onAction: (item) => actions.push(item.title)
  });

  assert.equal(panel.$.overviewSummary.textContent, "已汇总 1 个已运行模块；当前风险分组 1 类，其中需优先处理 1 类、待复核 0 类。");
  assert.equal(panel.$.overviewSnapshotSummary.textContent.includes("当前快照 2026-06-23"), true);
  assert.equal(panel.$.overviewRiskEmpty.style.display, "none");
  assert.equal(panel.$.overviewRiskRows.children.length, 1);
  assert.equal(panel.$.overviewRiskRows.children[0].innerHTML.includes("风险 20"), true);
  panel.$.overviewRiskRows.children[0].handlers[0].handler();
  assert.deepEqual(actions, ["资源结构异常"]);
});

test("panel classify helpers build asset, rule, and plan models", () => {
  const selectedPaths = new Set(["assets/res/fish.png"]);

  assert.equal(classify.formatClassifyScanSummary({
    visibleCount: 3,
    missingMetaCount: 1,
    orphanMetaCount: 2
  }, selectedPaths.size), "当前显示 3 项；全项目缺少 meta 1 项；孤立 meta 2 项；已选择 1 项。");

  assert.deepEqual(classify.buildClassifyAssetRows([{
    path: "assets/res/fish.png",
    extension: ".png",
    kind: "asset",
    size: 1536,
    selectable: true,
    missingMeta: true
  }], selectedPaths), [{
    path: "assets/res/fish.png",
    extension: ".png",
    sizeText: "1.5 KB",
    selectable: true,
    selected: true,
    statusClass: "warning",
    statusText: "缺少 meta",
    locatePath: "assets/res/fish.png"
  }]);

  const rule = {
    enabled: false,
    extensions: [".png", ".jpg"],
    nameKeywords: ["fish"],
    target: "assets/res/image"
  };
  assert.deepEqual(classify.buildRuleRows([rule]), [{
    rule,
    enabled: false,
    extensionsText: ".png,.jpg",
    keywordsText: "fish",
    targetText: "assets/res/image"
  }]);
  assert.deepEqual([...classify.filterSelectedPathsByEntries(new Set([
    "assets/res/fish.png",
    "assets/res/old.png"
  ]), [{
    path: "assets/res/fish.png"
  }])], [
    "assets/res/fish.png"
  ]);
  assert.deepEqual([...classify.filterSelectedPathsByEntries(null, null)], []);
  assert.deepEqual([...classify.selectVisibleClassifyEntries(selectedPaths, [{
    path: "assets/res/fish.png",
    selectable: true
  }, {
    path: "assets/res/rock.png",
    selectable: true
  }, {
    path: "assets/res/missing.png",
    selectable: false
  }])], [
    "assets/res/fish.png",
    "assets/res/rock.png"
  ]);
  assert.deepEqual([...classify.clearClassifySelection()], []);
  assert.deepEqual([...classify.toggleClassifySelection(selectedPaths, "assets/res/rock.png", true)], [
    "assets/res/fish.png",
    "assets/res/rock.png"
  ]);
  assert.deepEqual([...classify.toggleClassifySelection(selectedPaths, "assets/res/fish.png", false)], []);

  const plan = {
    summary: {
      total: 2,
      ready: 1,
      blocked: 1,
      renamed: 0,
      overwrite: 0,
      createDirectory: 1
    },
    items: [{
      status: "ready",
      action: "move",
      source: "assets/a.png",
      destination: "assets/res/a.png",
      reason: "manual"
    }]
  };
  assert.equal(classify.formatPlanSummary(plan), "共 2 项；可执行 1 项；阻止 1 项；自动重命名 0 项；覆盖 0 项；将创建目录 1 个。");
  assert.deepEqual(classify.buildPlanRows(plan), [{
    statusClass: "ready",
    statusText: "可执行",
    actionText: "移动",
    source: "assets/a.png",
    destination: "assets/res/a.png",
    reasonText: "manual"
  }]);
});

test("panel classify renderer wires assets, rules, and plan controls", () => {
  const documentRef = createFakeDocument();
  const located = [];
  const selected = [];
  const changed = [];
  const removed = [];
  const panel = {
    $: {
      assetRows: createFakeNode(),
      assetEmpty: createFakeNode(),
      ruleRows: createFakeNode(),
      planRows: createFakeNode(),
      planSummary: createFakeNode(),
      executeButton: createFakeNode()
    }
  };

  classifyRender.renderClassifyAssets(panel, {
    entries: [{
      path: "assets/res/fish.png",
      extension: ".png",
      kind: "asset",
      size: 1536,
      selectable: true,
      missingMeta: false
    }],
    selectedPaths: new Set(["assets/res/fish.png"])
  }, {
    document: documentRef,
    locate: (path) => located.push(path),
    onSelectionChange: (path, checked) => selected.push({ path, checked })
  });
  assert.equal(panel.$.assetEmpty.style.display, "none");
  assert.equal(panel.$.assetRows.children.length, 1);
  panel.$.assetRows.children[0].handlers[0].handler();
  panel.$.assetRows.children[0].handlers[1].handler();
  assert.deepEqual(selected, [{ path: "assets/res/fish.png", checked: true }]);
  assert.deepEqual(located, ["assets/res/fish.png"]);

  const rule = {
    enabled: true,
    extensions: [".png"],
    nameKeywords: [],
    target: "assets/res/image"
  };
  classifyRender.renderClassifyRules(panel, [rule], {
    document: documentRef,
    onRuleEnabledChange: (item, checked) => changed.push(["enabled", item, checked]),
    onRuleExtensionsChange: (item, value) => changed.push(["extensions", item, value]),
    onRuleKeywordsChange: (item, value) => changed.push(["keywords", item, value]),
    onRuleTargetChange: (item, value) => changed.push(["target", item, value]),
    onRuleRemove: (item) => removed.push(item)
  });
  assert.equal(panel.$.ruleRows.children.length, 1);
  panel.$.ruleRows.children[0].handlers[1].handler({ target: { value: ".jpg" } });
  panel.$.ruleRows.children[0].handlers[4].handler();
  assert.deepEqual(changed, [["extensions", rule, ".jpg"]]);
  assert.deepEqual(removed, [rule]);

  classifyRender.renderClassifyPlan(panel, null, { document: documentRef });
  assert.equal(panel.$.executeButton.disabled, true);
  classifyRender.renderClassifyPlan(panel, {
    summary: {
      total: 1,
      ready: 1,
      blocked: 0,
      renamed: 0,
      overwrite: 0,
      createDirectory: 0
    },
    items: [{
      status: "ready",
      action: "move",
      source: "assets/a.png",
      destination: "assets/res/a.png"
    }]
  }, { document: documentRef });
  assert.equal(panel.$.executeButton.disabled, false);
  assert.equal(panel.$.planRows.children.length, 1);
  assert.equal(panel.$.planSummary.textContent, "共 1 项；可执行 1 项；阻止 0 项；自动重命名 0 项；覆盖 0 项；将创建目录 0 个。");
});

test("panel tool panel helpers normalize visibility and row models", () => {
  const modules = [
    { id: "scan", title: "资源扫描", group: "基础", selector: "[data-tool-module=\"scan\"]" },
    { id: "health", title: "健康检查", group: "风险", selector: "[data-tool-module=\"health\"]" }
  ];

  assert.deepEqual(toolPanel.normalizeToolVisibility({ scan: false, stale: false }, modules), {
    scan: false,
    health: true
  });
  assert.equal(toolPanel.isToolVisible({ scan: false }, "scan"), false);
  assert.equal(toolPanel.isToolVisible({ scan: false }, "health"), true);
  assert.deepEqual(toolPanel.buildAllToolsVisibility(modules), {
    scan: true,
    health: true
  });
  assert.deepEqual(toolPanel.buildToolPanelRows(modules, { scan: false }), [{
    id: "scan",
    title: "资源扫描",
    group: "基础",
    selector: "[data-tool-module=\"scan\"]",
    enabled: false
  }, {
    id: "health",
    title: "健康检查",
    group: "风险",
    selector: "[data-tool-module=\"health\"]",
    enabled: true
  }]);
  assert.equal(toolPanel.getToolTitle("missing", modules), "missing");
});

test("panel tool panel exposes seven independent check pages", () => {
  assert.deepEqual(toolPanel.TOOL_PANEL_MODULES.map((item) => item.id), [
    "scene-node-reference-check",
    "resources-runtime-check",
    "package-size-report",
    "directory-convention",
    "material-textures",
    "duplicate-assets",
    "scene-prefab-reference-health"
  ]);
  assert.equal(toolPanel.TOOL_PANEL_MODULES.every((item) => item.group === "独立功能"), true);
});

test("panel tool panel renderer fills rows and applies hidden classes", () => {
  const documentRef = createFakeDocument();
  const changed = [];
  const modules = [
    { id: "scan", title: "资源扫描", group: "基础", selector: "[data-tool-module=\"scan\"]" },
    { id: "health", title: "健康检查", group: "风险", selector: "[data-tool-module=\"health\"]" }
  ];
  const panel = {
    $: {
      toolPanelRows: createFakeNode()
    }
  };

  toolPanelRender.renderToolPanel(panel, modules, { scan: false, health: true }, {
    document: documentRef,
    onVisibilityChange: (id, enabled) => changed.push({ id, enabled })
  });
  assert.equal(panel.$.toolPanelRows.children.length, 2);
  assert.equal(panel.$.toolPanelRows.children[0].innerHTML.includes("资源扫描"), true);
  panel.$.toolPanelRows.children[0].handlers[0].handler({ target: { checked: true } });
  assert.deepEqual(changed, [{ id: "scan", enabled: true }]);

  const scanNode = createFakeNode();
  scanNode.classList = {
    hidden: false,
    toggle: (_className, enabled) => {
      scanNode.classList.hidden = enabled;
    }
  };
  const healthNode = createFakeNode();
  healthNode.classList = {
    hidden: false,
    toggle: (_className, enabled) => {
      healthNode.classList.hidden = enabled;
    }
  };
  const unusedDocument = {
    querySelectorAll: () => {
      throw new Error("applyToolVisibility should use the provided panel root");
    }
  };
  const panelRoot = {
    querySelectorAll: (selector) => selector.includes("scan") ? [scanNode] : [healthNode]
  };
  toolPanelRender.applyToolVisibility(modules, { scan: false, health: true }, {
    document: unusedDocument,
    root: panelRoot
  });
  assert.equal(scanNode.classList.hidden, true);
  assert.equal(healthNode.classList.hidden, false);
});

test("panel health helpers build resources and package row models", () => {
  assert.equal(health.formatResourcesRuntimeSummary({
    resourceCount: 3,
    scannedCodeFileCount: 2,
    staticCallCount: 4,
    missingCallCount: 1,
    dynamicCallCount: 1,
    unusedResourceCount: 2,
    resourcesDirectoryExists: false,
    resourcesDirectory: "assets/missing-resources"
  }), "扫描 resources 资源 3 项、代码文件 2 个；静态调用 4 项，其中疑似缺失 1 项；动态调用 1 项；疑似未加载资源 2 项；assets/missing-resources 当前不存在。");

  assert.deepEqual(health.buildResourcesCallRows([{
    kind: "static",
    status: "matched",
    method: "load",
    runtimePath: "fish/icon",
    codePath: "assets/scripts/B.ts",
    line: 9,
    matchCount: 1
  }], [{
    kind: "dynamic",
    method: "loadDir",
    expression: "dynamicPath",
    codePath: "assets/scripts/A.ts",
    line: 2,
    matchCount: 0
  }]).map((row) => `${row.statusText}:${row.codeLocation}:${row.displayPath}`), [
    "动态待复核:assets/scripts/A.ts:2:dynamicPath",
    "静态命中:assets/scripts/B.ts:9:fish/icon"
  ]);

  assert.equal(health.formatPackageSizeSummary({
    scanDirectory: "assets/res",
    fileCount: 2,
    totalSize: 2048,
    directoryCount: 1,
    typeCount: 1,
    topN: 20,
    referencedFileCount: 1,
    referencedTotalSize: 1024,
    unresolvedReferenceCount: 0,
    includeMeta: false,
    excludedMetaCount: 3,
    excludedMetaSize: 300
  }), "扫描 assets/res：文件 2 项，总大小 2.0 KB，子目录 1 个，类型 1 类，Top 20；主场景递归可达 1 项（1.0 KB），未解析 UUID 0 个；排除 .meta 3 项（300 B）。");

  assert.deepEqual(health.buildPackageReferencedTopFileRows([{
    path: "assets/res/big.png",
    extension: ".png",
    size: 2048,
    chain: ["scene", "node", "component", "field", "target"]
  }]), [{
    path: "assets/res/big.png",
    extension: ".png",
    sizeText: "2.0 KB",
    chainText: "scene -> node -> component -> field -> target",
    chainDisplay: "scene -> node -> ... -> target",
    locatePath: "assets/res/big.png"
  }]);
});

test("panel health helpers build convention, material, duplicate, and reference rows", () => {
  assert.equal(health.formatDirectoryConventionSummary({
    scanDirectory: "assets/res",
    fileCount: 4,
    ruleCount: 2,
    matchedCount: 3,
    compliantCount: 1,
    mismatchCount: 2,
    unmatchedCount: 1,
    missingMetaCount: 1
  }), "扫描 assets/res：文件 4 项，启用规则 2 条；命中 3 项，目录正确 1 项，不符合 2 项，未命中 1 项，缺少 meta 1 项。");
  assert.deepEqual(health.buildDirectoryConventionRows([{
    path: "assets/source/wrong.png",
    extension: ".png",
    currentDirectory: "assets/source",
    suggestedDirectory: "assets/res/image",
    ruleId: "image",
    missingMeta: true
  }])[0], {
    path: "assets/source/wrong.png",
    extension: ".png",
    currentDirectory: "assets/source",
    suggestedDirectory: "assets/res/image",
    ruleId: "image",
    statusClass: "blocked",
    statusText: "缺少 meta",
    locatePath: "assets/source/wrong.png"
  });

  assert.equal(health.buildMaterialTextureRows([{
    status: "invalid-material",
    materialReachable: false,
    materialPath: "assets/res/mat.mtl",
    propertyPath: "albedo",
    uuid: "texture-uuid",
    texturePath: ""
  }])[0].statusText, "材质无法解析");
  assert.deepEqual(health.buildDuplicateGroupRows([{
    key: "0123456789abcdef",
    hash: "0123456789abcdef",
    members: [{
      path: "assets/res/a.png",
      extension: ".png",
      size: 1536
    }]
  }], "hash")[0], {
    groupTitle: "0123456789abcdef",
    groupKey: "0123456789ab...",
    memberCount: 1,
    path: "assets/res/a.png",
    extension: ".png",
    sizeText: "1.5 KB",
    locatePath: "assets/res/a.png"
  });
  assert.deepEqual(health.buildScenePrefabReferenceHealthRows([{
    filePath: "assets/scene/main.scene",
    extension: ".scene",
    uuid: "missing-uuid",
    matchCount: 2
  }])[0], {
    statusClass: "warning",
    statusText: "待复核",
    filePath: "assets/scene/main.scene",
    extension: ".scene",
    uuid: "missing-uuid",
    matchCount: 2,
    locatePath: "assets/scene/main.scene"
  });
});

test("panel health renderers fill rows, empty states, and locate handlers", () => {
  const documentRef = createFakeDocument();
  const located = [];
  const panel = {
    $: {
      resourcesRuntimeSummary: createFakeNode(),
      resourcesUnusedRows: createFakeNode(),
      resourcesUnusedEmpty: createFakeNode(),
      resourcesCallRows: createFakeNode(),
      resourcesCallEmpty: createFakeNode(),
      resourcesAllRows: createFakeNode(),
      resourcesAllEmpty: createFakeNode(),
      directoryConventionRows: createFakeNode(),
      directoryConventionEmpty: createFakeNode(),
      directoryConventionPreviewButton: createFakeNode(),
      directoryConventionSummary: createFakeNode(),
      materialTextureRows: createFakeNode(),
      materialTextureEmpty: createFakeNode(),
      materialTextureSummary: createFakeNode()
    }
  };

  healthRender.renderResourcesRuntime(panel, {
    resourcesRuntimeSummary: {
      resourceCount: 1,
      scannedCodeFileCount: 1,
      staticCallCount: 1,
      missingCallCount: 0,
      dynamicCallCount: 1,
      unusedResourceCount: 1
    },
    resourcesRuntimeUnused: [{
      path: "assets/resources/unused.png",
      loadPath: "unused",
      extension: ".png",
      size: 1024
    }],
    resourcesRuntimeStaticCalls: [],
    resourcesRuntimeDynamicCalls: [{
      kind: "dynamic",
      method: "load",
      expression: "dynamicPath",
      codePath: "assets/scripts/Loader.ts",
      line: 7,
      matchCount: 0
    }],
    resourcesRuntimeResources: []
  }, {
    document: documentRef,
    locate: (path) => located.push(path)
  });

  assert.match(panel.$.resourcesRuntimeSummary.textContent, /扫描 resources 资源 1 项/);
  assert.equal(panel.$.resourcesUnusedRows.children.length, 1);
  assert.equal(panel.$.resourcesUnusedEmpty.style.display, "none");
  assert.equal(panel.$.resourcesCallRows.children[0].innerHTML.includes("动态待复核"), true);
  panel.$.resourcesCallRows.children[0].handlers[0].handler();
  assert.deepEqual(located, ["assets/scripts/Loader.ts"]);

  healthRender.renderDirectoryConvention(panel, {
    directoryConventionMismatches: [],
    directoryConventionSummary: null
  }, {
    document: documentRef,
    locate: (path) => located.push(path)
  });
  assert.equal(panel.$.directoryConventionEmpty.style.display, "block");
  assert.equal(panel.$.directoryConventionPreviewButton.disabled, true);

  healthRender.renderMaterialTextures(panel, {
    materialTextureSummary: null,
    materialTextureReferences: [{
      status: "resolved",
      materialReachable: true,
      materialPath: "assets/res/mat.mtl",
      propertyPath: "albedo",
      uuid: "texture-uuid",
      texturePath: "assets/res/texture.png"
    }]
  }, {
    document: documentRef,
    locate: (path) => located.push(path)
  });
  assert.equal(panel.$.materialTextureRows.children.length, 1);
  assert.equal(panel.$.materialTextureRows.children[0].handlers.length, 2);
  panel.$.materialTextureRows.children[0].handlers[1].handler();
  assert.equal(located.at(-1), "assets/res/texture.png");
});

test("panel history helpers build summaries, options, logs, and report text", () => {
  const detail = {
    createdAt: "2026-06-23T00:00:00.000Z",
    kind: "reverse",
    mode: "history",
    conflictPolicy: "rename",
    movedCount: 2,
    failedCount: 1,
    cleanupFailedCount: 1,
    hasOverwrite: true,
    deletedDirectories: ["assets/a", "assets/b"],
    failedMovesPersisted: true,
    failedMoves: [{}],
    failedDirectoriesPersisted: false,
    moves: [{
      action: "overwrite",
      source: "assets/a.png",
      destination: "assets/b.png",
      overwrittenTargetRecoverable: false
    }]
  };

  assert.deepEqual(history.buildHistoryOptions([{
    id: "h1",
    createdAt: "2026-06-23T00:00:00.000Z",
    kind: "move",
    movedCount: 3,
    hasOverwrite: true
  }], {
    formatDate: () => "date"
  }), [{
    value: "h1",
    text: "date | 移动 3 项 | 含覆盖"
  }]);
  assert.equal(history.formatHistoryDetailSummary(detail, {
    formatDate: () => "date"
  }), "date：反向 / history / rename；成功 2 项，失败 1 项，含覆盖 是。失败明细 1 项已持久化。");
  assert.equal(history.formatHistoryCleanupSummary(detail), "删除空源目录 2 个：assets/a 等 2 项；清理失败 1 个（失败明细未持久化。）。");
  assert.deepEqual(history.buildHistoryMoveRows(detail), [{
    actionText: "覆盖后移动",
    source: "assets/a.png",
    destination: "assets/b.png",
    recoverableClass: "warning",
    recoverableText: "否"
  }]);
  assert.deepEqual(history.buildLogRows([{
    time: "old",
    level: "info",
    message: "first"
  }, {
    time: "new",
    level: "error",
    message: "second",
    detail: "stack"
  }], {
    formatDate: (value) => value.toUpperCase()
  }).map((item) => `${item.timeText}:${item.levelClass}:${item.message}`), [
    "NEW:blocked:second",
    "OLD:ready:first"
  ]);
  assert.deepEqual(history.toHistorySummary({
    id: "h1",
    createdAt: "date",
    kind: "move",
    mode: "manual",
    conflictPolicy: "skip",
    movedCount: 1,
    failedCount: 0,
    hasOverwrite: false,
    deletedDirectories: ["assets/a"],
    cleanupFailedCount: 0
  }), {
    id: "h1",
    createdAt: "date",
    kind: "move",
    mode: "manual",
    conflictPolicy: "skip",
    movedCount: 1,
    failedCount: 0,
    hasOverwrite: false,
    deletedDirectoryCount: 1,
    cleanupFailedCount: 0
  });
  assert.equal(history.formatExportSessionReportSummary({
    moduleCount: 2,
    markdownPath: "reports/a.md",
    jsonPath: "reports/a.json"
  }), "已导出 2 个已运行模块：reports/a.md、reports/a.json");
});

test("panel history renderers fill select, detail rows, and logs", () => {
  const documentRef = createFakeDocument();
  const panel = {
    $: {
      historySelect: createFakeNode(),
      historyDetailRows: createFakeNode(),
      historyDetailEmpty: createFakeNode(),
      historyDetailSummary: createFakeNode(),
      historyCleanupSummary: createFakeNode(),
      logRows: createFakeNode(),
      logEmpty: createFakeNode()
    }
  };

  historyRender.renderHistory(panel, [{
    id: "h1",
    createdAt: "2026-06-23T00:00:00.000Z",
    kind: "reverse",
    movedCount: 4,
    hasOverwrite: false
  }], {
    document: documentRef,
    formatDate: () => "date"
  });
  assert.equal(panel.$.historySelect.children.length, 1);
  assert.equal(panel.$.historySelect.children[0].value, "h1");
  assert.equal(panel.$.historySelect.children[0].textContent, "date | 反向 4 项");

  historyRender.renderHistoryDetail(panel, {
    createdAt: "2026-06-23T00:00:00.000Z",
    kind: "move",
    mode: "manual",
    conflictPolicy: "skip",
    movedCount: 1,
    failedCount: 0,
    cleanupFailedCount: 0,
    hasOverwrite: false,
    deletedDirectories: [],
    failedMovesPersisted: false,
    failedDirectoriesPersisted: false,
    moves: [{
      action: "move",
      source: "assets/a.png",
      destination: "assets/b.png",
      overwrittenTargetRecoverable: true
    }]
  }, {
    document: documentRef,
    formatDate: () => "date"
  });
  assert.equal(panel.$.historyDetailEmpty.style.display, "none");
  assert.match(panel.$.historyDetailSummary.textContent, /date：移动/);
  assert.equal(panel.$.historyDetailRows.children[0].innerHTML.includes("assets/a.png"), true);

  historyRender.renderLogs(panel, [{
    time: "2026-06-23T00:00:00.000Z",
    level: "warning",
    message: "<warning>",
    detail: "detail"
  }], {
    document: documentRef,
    formatDate: () => "date"
  });
  assert.equal(panel.$.logEmpty.style.display, "none");
  assert.equal(panel.$.logRows.children[0].innerHTML.includes("&lt;warning&gt;"), true);
});

test("panel unused helpers filter candidates and build delete models", () => {
  const candidates = [{
    path: "assets/res/fish.png",
    extension: ".png",
    size: 1536
  }, {
    path: "assets/res/audio/bgm.mp3",
    extension: ".mp3",
    size: 2048
  }];

  assert.deepEqual(unused.filterUnusedCandidates(candidates, "fish", ".png").map((item) => item.path), [
    "assets/res/fish.png"
  ]);
  assert.equal(unused.formatUnusedSummary({
    scene: "assets/scene/main.scene",
    scanDirectory: "assets/res",
    scannedCount: 10,
    reachableCount: 6,
    candidateCount: 2,
    candidateTotalSize: 3584,
    protectedCount: 1,
    unresolvedReferenceCount: 3
  }, 1), "主场景 assets/scene/main.scene，扫描 assets/res：纳入判断 10 项，可达 6 项，候选 2 项（3.5 KB），保护 1 项，未解析 UUID 3 个；当前筛选显示 1 项。");
  assert.deepEqual(unused.buildUnusedCandidateRows(candidates, new Set(["assets/res/fish.png"]))[0], {
    selected: true,
    path: "assets/res/fish.png",
    extension: ".png",
    sizeText: "1.5 KB",
    riskText: "动态加载与运行时引用未知",
    locatePath: "assets/res/fish.png"
  });

  const plan = {
    summary: {
      total: 2,
      ready: 1,
      blocked: 1,
      totalSize: 1536,
      backupScope: "scan-directory"
    },
    items: [{
      status: "ready",
      path: "assets/res/fish.png",
      extension: ".png",
      size: 1536
    }, {
      status: "blocked",
      path: "assets/res/used.png",
      extension: ".png",
      size: 512,
      reason: "仍被引用"
    }]
  };
  assert.equal(unused.formatUnusedDeleteSummary(plan, 2), "删除预览：共 2 项，可删除 1 项，阻止 1 项，资源体积 1.5 KB；备份范围 整个扫描目录。");
  assert.deepEqual(unused.buildUnusedDeleteRows(plan).map((item) => `${item.statusText}:${item.reason}`), [
    "可删除:-",
    "已阻止:仍被引用"
  ]);
  assert.equal(unused.canExecuteUnusedDelete(plan, true), true);
  assert.equal(unused.canExecuteUnusedDelete(plan, false), false);
});

test("panel unused renderers fill candidate and delete plan rows", () => {
  const documentRef = createFakeDocument();
  const located = [];
  const toggled = [];
  const panel = {
    $: {
      unusedCandidateRows: createFakeNode(),
      unusedCandidateEmpty: createFakeNode(),
      unusedSelectVisibleButton: createFakeNode(),
      unusedClearSelectionButton: createFakeNode(),
      unusedSummary: createFakeNode(),
      unusedDeleteRows: createFakeNode(),
      unusedDeleteEmpty: createFakeNode(),
      unusedDeleteSummary: createFakeNode(),
      unusedDeleteExecuteButton: createFakeNode()
    }
  };

  unusedRender.renderUnusedCandidates(panel, {
    unusedCandidates: [{
      path: "assets/res/fish.png",
      extension: ".png",
      size: 1536
    }, {
      path: "assets/res/bgm.mp3",
      extension: ".mp3",
      size: 2048
    }],
    unusedSelectedPaths: new Set(["assets/res/fish.png"]),
    unusedSummary: null,
    search: "fish",
    extensions: ".png"
  }, {
    document: documentRef,
    locate: (path) => located.push(path),
    onToggleCandidate: (path, checked) => toggled.push({ path, checked })
  });

  assert.equal(panel.$.unusedCandidateRows.children.length, 1);
  assert.equal(panel.$.unusedCandidateEmpty.style.display, "none");
  assert.equal(panel.$.unusedSelectVisibleButton.disabled, false);
  assert.equal(panel.$.unusedClearSelectionButton.disabled, false);
  panel.$.unusedCandidateRows.children[0].handlers[0].handler();
  panel.$.unusedCandidateRows.children[0].handlers[1].handler();
  assert.deepEqual(toggled, [{ path: "assets/res/fish.png", checked: true }]);
  assert.deepEqual(located, ["assets/res/fish.png"]);

  unusedRender.renderUnusedDeletePlan(panel, {
    unusedSelectedPaths: new Set(["assets/res/fish.png"]),
    confirmed: true,
    unusedDeletePlan: {
      summary: {
        total: 1,
        ready: 1,
        blocked: 0,
        totalSize: 1536,
        backupScope: "selected"
      },
      items: [{
        status: "ready",
        path: "assets/res/fish.png",
        extension: ".png",
        size: 1536
      }]
    }
  }, {
    document: documentRef
  });
  assert.equal(panel.$.unusedDeleteRows.children.length, 1);
  assert.equal(panel.$.unusedDeleteEmpty.style.display, "none");
  assert.equal(panel.$.unusedDeleteExecuteButton.disabled, false);
  assert.match(panel.$.unusedDeleteSummary.textContent, /可删除 1 项/);
});

test("panel scan helpers build asset scan and reference row models", () => {
  assert.equal(scan.formatAssetScanSummary({
    scanDirectory: "assets/res",
    fileCount: 3,
    directoryCount: 2,
    totalSize: 2048,
    missingMetaCount: 1,
    orphanMetaCount: 2,
    emptyDirectoryCount: 1,
    ignoredIssueCount: 1,
    visibleIssueCount: 2,
    typeCount: 3
  }), "扫描 assets/res：文件 3 项，目录 2 项，总大小 2.0 KB；缺失 meta 1 项，孤立 meta 2 项，空目录 1 项，已忽略异常 1 项。");

  assert.deepEqual(scan.buildAssetScanResourceRows([{
    path: "assets/res/fish.png",
    extension: ".png",
    kind: "file",
    size: 1536,
    selectable: true,
    missingMeta: false
  }, {
    path: "assets/res/missing.png",
    extension: ".png",
    kind: "file",
    size: 100,
    selectable: true,
    missingMeta: true
  }]).map((item) => `${item.statusText}:${item.canCheckReference}:${item.sizeText}`), [
    "正常:true:1.5 KB",
    "缺少 meta:false:100 B"
  ]);
  assert.deepEqual(scan.buildAssetScanIssueRows([{
    severity: "high",
    kind: "missing-meta",
    path: "assets/res/missing.png",
    extension: ".png",
    size: 100,
    locatable: true
  }])[0], {
    severityClass: "blocked",
    severityText: "高",
    kindText: "缺失 meta",
    path: "assets/res/missing.png",
    extension: ".png",
    sizeText: "100 B",
    locatable: true,
    locateLabel: "定位",
    locatePath: "assets/res/missing.png"
  });

  assert.equal(scan.formatReferenceSummary({
    scanDirectory: "assets",
    targetCount: 1,
    uuidCount: 2,
    scannedFileCount: 3,
    referenceFileCount: 1,
    totalMatchCount: 4,
    referencePositionCount: 2,
    selectablePositionCount: 1
  }), "扫描 assets：目标 1 项，UUID 2 个，扫描序列化文件 3 个，找到引用方 1 个，命中 4 次，解析位置 2 条，可选中节点 1 条。");
  assert.deepEqual(scan.buildReferenceRows([{
    path: "assets/scene/main.scene",
    matchCount: 2,
    matchedUuids: ["uuid-a", "uuid-b"],
    targetPaths: ["assets/res/a.png", "assets/res/b.png"],
    details: [{
      nodePath: "Canvas/Fish",
      componentType: "cc.Sprite",
      fieldPath: "spriteFrame",
      matchedUuid: "uuid-a",
      targetPaths: ["assets/res/a.png"],
      selectable: true,
      nodeUuid: "node-uuid"
    }]
  }])[0], {
    path: "assets/scene/main.scene",
    position: "Canvas/Fish | cc.Sprite | spriteFrame",
    matchedUuid: "uuid-a",
    targetPathsTitle: "assets/res/a.png",
    targetPathsText: "assets/res/a.png",
    selectable: true,
    locatePath: "assets/scene/main.scene",
    parentReferencePath: "assets/scene/main.scene",
    selectDetail: {
      nodePath: "Canvas/Fish",
      componentType: "cc.Sprite",
      fieldPath: "spriteFrame",
      matchedUuid: "uuid-a",
      targetPaths: ["assets/res/a.png"],
      selectable: true,
      nodeUuid: "node-uuid"
    }
  });
});

test("panel scan renderers fill scan and reference tables", () => {
  const documentRef = createFakeDocument();
  const located = [];
  const checked = [];
  const selected = [];
  const panel = {
    $: {
      assetScanSummary: createFakeNode(),
      assetScanResourceRows: createFakeNode(),
      assetScanResourceEmpty: createFakeNode(),
      referenceSummary: createFakeNode(),
      referenceTargetRows: createFakeNode(),
      referenceTargetEmpty: createFakeNode(),
      referenceRows: createFakeNode(),
      referenceEmpty: createFakeNode()
    }
  };

  scanRender.renderAssetScanReport(panel, {
    scanReportSummary: null,
    scanResourceEntries: [{
      path: "assets/res/fish.png",
      extension: ".png",
      kind: "file",
      size: 1536,
      selectable: true,
      missingMeta: false
    }],
    scanIssues: [{
      severity: "medium",
      kind: "empty-directory",
      path: "assets/empty",
      extension: "",
      size: 0,
      locatable: true
    }],
    scanTypeStats: [{
      extension: ".png",
      count: 1,
      totalSize: 1536
    }]
  }, {
    document: documentRef,
    locate: (path) => located.push(path),
    checkReferenceForPath: (path) => checked.push(path)
  });

  assert.equal(panel.$.assetScanResourceRows.children.length, 1);
  panel.$.assetScanResourceRows.children[0].handlers[0].handler();
  panel.$.assetScanResourceRows.children[0].handlers[1].handler();
  assert.deepEqual(located, ["assets/res/fish.png"]);
  assert.deepEqual(checked, ["assets/res/fish.png"]);

  scanRender.renderReferences(panel, {
    referenceSummary: null,
    referenceTargets: [{
      path: "assets/res/fish.png",
      uuidCount: 1,
      uuids: ["uuid-a"]
    }],
    referenceRows: [{
      path: "assets/scene/main.scene",
      matchCount: 1,
      matchedUuids: ["uuid-a"],
      targetPaths: ["assets/res/fish.png"],
      details: [{
        nodePath: "Canvas/Fish",
        componentType: "cc.Sprite",
        fieldPath: "spriteFrame",
        matchedUuid: "uuid-a",
        targetPaths: ["assets/res/fish.png"],
        selectable: true,
        nodeUuid: "node-uuid"
      }]
    }]
  }, {
    document: documentRef,
    locate: (path) => located.push(path),
    checkParent: (path) => checked.push(path),
    selectNode: (path, detail) => selected.push({ path, nodeUuid: detail.nodeUuid })
  });
  assert.equal(panel.$.referenceTargetRows.children.length, 1);
  assert.equal(panel.$.referenceRows.children[0].innerHTML.includes("Canvas/Fish"), true);
  panel.$.referenceRows.children[0].handlers[0].handler();
  panel.$.referenceRows.children[0].handlers[1].handler();
  panel.$.referenceRows.children[0].handlers[2].handler();
  assert.equal(located.at(-1), "assets/scene/main.scene");
  assert.equal(checked.at(-1), "assets/scene/main.scene");
  assert.deepEqual(selected, [{ path: "assets/scene/main.scene", nodeUuid: "node-uuid" }]);
});

test("panel node reference helpers build target and reference rows", () => {
  const nodeUuidInput = { value: "old-node" };
  assert.deepEqual(nodeReference.buildNodeReferenceCheckPayload({
    nodeUuidInput,
    directoryInput: { value: "assets/scene" },
    extensionInput: { value: ".scene" }
  }), {
    nodeUuid: "old-node",
    directory: "assets/scene",
    extensions: ".scene",
    preferSelectedNode: true
  });
  nodeReference.syncNodeReferenceUuidInput(nodeUuidInput, { nodeUuid: "new-node" });
  assert.equal(nodeUuidInput.value, "new-node");

  assert.equal(nodeReference.formatNodeReferenceSummary({
    scanDirectory: "assets",
    scannedFileCount: 3,
    targetNodeCount: 2,
    targetFileCount: 1,
    referenceFileCount: 1,
    referencePositionCount: 4,
    selectablePositionCount: 2
  }), "扫描 assets：序列化文件 3 个，匹配目标节点 2 个/文件 1 个，找到引用文件 1 个，引用组件 4 条，可选中节点 2 条。");

  assert.deepEqual(nodeReference.buildNodeReferenceTargetRows([{
    filePath: "assets/scene/main.scene",
    nodePath: "Canvas/Fish",
    nodeUuid: "node-uuid",
    selectable: true
  }])[0], {
    filePath: "assets/scene/main.scene",
    nodePath: "Canvas/Fish",
    nodeUuid: "node-uuid",
    selectable: true,
    locatePath: "assets/scene/main.scene",
    selectPath: "assets/scene/main.scene",
    selectDetail: {
      filePath: "assets/scene/main.scene",
      nodePath: "Canvas/Fish",
      nodeUuid: "node-uuid",
      selectable: true
    }
  });
  assert.deepEqual(nodeReference.buildNodeReferenceRows([{
    path: "assets/prefab/fish.prefab",
    references: [{
      nodePath: "Root/Sprite",
      componentType: "cc.Sprite",
      fieldPath: "target",
      targetNodePath: "Canvas/Fish",
      selectable: true,
      nodeUuid: "ref-node",
      targetNodeUuid: "target-node"
    }]
  }])[0], {
    path: "assets/prefab/fish.prefab",
    nodePath: "Root/Sprite",
    componentType: "cc.Sprite",
    fieldPath: "target",
    targetNodePath: "Canvas/Fish",
    selectable: true,
    targetSelectable: true,
    locatePath: "assets/prefab/fish.prefab",
    selectPath: "assets/prefab/fish.prefab",
    selectDetail: {
      nodePath: "Root/Sprite",
      componentType: "cc.Sprite",
      fieldPath: "target",
      targetNodePath: "Canvas/Fish",
      selectable: true,
      nodeUuid: "ref-node",
      targetNodeUuid: "target-node"
    },
    selectTargetDetail: {
      selectable: true,
      nodeUuid: "target-node",
      nodePath: "Canvas/Fish"
    }
  });
});

test("panel node reference renderer fills target and component rows", () => {
  const documentRef = createFakeDocument();
  const located = [];
  const selected = [];
  const panel = {
    $: {
      nodeReferenceSummary: createFakeNode(),
      nodeReferenceTargetRows: createFakeNode(),
      nodeReferenceTargetEmpty: createFakeNode(),
      nodeReferenceRows: createFakeNode(),
      nodeReferenceEmpty: createFakeNode()
    }
  };

  nodeReferenceRender.renderNodeReferences(panel, {
    nodeReferenceSummary: null,
    nodeReferenceTargets: [{
      filePath: "assets/scene/main.scene",
      nodePath: "Canvas/Fish",
      nodeUuid: "node-uuid",
      selectable: true
    }],
    nodeReferenceRows: [{
      path: "assets/prefab/fish.prefab",
      references: [{
        nodePath: "Root/Sprite",
        componentType: "cc.Sprite",
        fieldPath: "target",
        targetNodePath: "Canvas/Fish",
        selectable: true,
        nodeUuid: "ref-node",
        targetNodeUuid: "target-node"
      }]
    }]
  }, {
    document: documentRef,
    locate: (path) => located.push(path),
    selectNode: (path, detail) => selected.push({ path, nodeUuid: detail.nodeUuid })
  });

  assert.equal(panel.$.nodeReferenceSummary.textContent, "根据目标节点 ID 反查哪些组件属性引用了它；只报告，不修改场景。");
  assert.equal(panel.$.nodeReferenceTargetRows.children.length, 1);
  assert.equal(panel.$.nodeReferenceRows.children.length, 1);
  panel.$.nodeReferenceTargetRows.children[0].handlers[0].handler();
  panel.$.nodeReferenceTargetRows.children[0].handlers[1].handler();
  panel.$.nodeReferenceRows.children[0].handlers[1].handler();
  panel.$.nodeReferenceRows.children[0].handlers[2].handler();
  assert.deepEqual(located, ["assets/scene/main.scene"]);
  assert.deepEqual(selected, [
    { path: "assets/scene/main.scene", nodeUuid: "node-uuid" },
    { path: "assets/prefab/fish.prefab", nodeUuid: "ref-node" },
    { path: "assets/prefab/fish.prefab", nodeUuid: "target-node" }
  ]);
});

test("panel request converts compatible protocol errors into thrown errors", async () => {
  const oldEditor = global.Editor;
  global.Editor = {
    Message: {
      request: async (packageName, message, payload) => {
        assert.equal(packageName, "asset-steward");
        assert.equal(message, "scan-assets");
        assert.deepEqual(payload, { directory: "assets" });
        return {
          ok: false,
          error: {
            code: "ERR_TEST",
            message: "failed by test",
            detail: { reason: "unit" }
          }
        };
      }
    }
  };

  await assert.rejects(
    () => requestMain("scan-assets", { directory: "assets" }),
    (error) => {
      assert.equal(error.message, "failed by test");
      assert.equal(error.code, "ERR_TEST");
      assert.deepEqual(error.detail.detail, { reason: "unit" });
      return true;
    }
  );

  global.Editor = oldEditor;
});

test("panel request returns legacy successful payloads unchanged", async () => {
  const oldEditor = global.Editor;
  global.Editor = {
    Message: {
      request: async () => ({ value: 42 })
    }
  };

  assert.deepEqual(await requestMain("load-state"), { value: 42 });
  global.Editor = oldEditor;
});

test("createAssetStewardError fills fallback protocol error fields", () => {
  const error = createAssetStewardError({ ok: false });

  assert.equal(error.message, "Asset Steward request failed");
  assert.equal(error.code, "ERR_ASSET_STEWARD");
  assert.equal(error.detail, null);
});
