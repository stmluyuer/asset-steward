"use strict";

const assert = require("node:assert/strict");
const Crypto = require("node:crypto");
const Fs = require("node:fs");
const Path = require("node:path");
const test = require("node:test");

const fixtureRoot = Path.join(__dirname, "..", "TestExtensions");
Fs.mkdirSync(fixtureRoot, { recursive: true });
const projectRoot = Fs.mkdtempSync(Path.join(fixtureRoot, "core-"));

global.Editor = {
  Project: { path: projectRoot },
  Message: {
    request: async () => {
      throw new Error("Editor.Message.request is not available in unit tests");
    },
    send: () => {}
  },
  Panel: { open: () => {} },
  Selection: { select: () => {} }
};

const extension = require("../main.js");
const core = extension._test;
const { compatibleSuccess, compatibleError, inferProtocolErrorCode, ERROR_CODES } = require("../main/protocol");
const pathUtils = require("../main/path-utils");
const profile = require("../main/profile");
const assetScan = require("../main/asset-scan");
const referenceGraph = require("../main/reference-graph");
const runtimeResources = require("../main/runtime-resources");
const movePlan = require("../main/move-plan");
const healthChecks = require("../main/health-checks");

function writeFile(relativePath, content = "") {
  const fullPath = Path.join(projectRoot, relativePath);
  Fs.mkdirSync(Path.dirname(fullPath), { recursive: true });
  Fs.writeFileSync(fullPath, content, "utf8");
  return fullPath;
}

function writeJson(relativePath, value) {
  return writeFile(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function resetDirectory(relativePath) {
  Fs.rmSync(Path.join(projectRoot, relativePath), { recursive: true, force: true });
}

function writeAsset(relativePath, content = "asset") {
  const fullPath = writeFile(relativePath, content);
  writeFile(`${relativePath}.meta`, JSON.stringify({
    uuid: Crypto.randomUUID()
  }));
  return fullPath;
}

function writeDirectoryAsset(relativePath) {
  Fs.mkdirSync(Path.join(projectRoot, relativePath), { recursive: true });
  writeFile(`${relativePath}.meta`, JSON.stringify({
    uuid: Crypto.randomUUID()
  }));
}

test("compatibleSuccess keeps legacy fields and adds protocol metadata", () => {
  const result = compatibleSuccess({ answer: 42 }, ["check"]);

  assert.equal(result.answer, 42);
  assert.equal(result.ok, true);
  assert.equal(result.protocolVersion, 1);
  assert.deepEqual(result.warnings, ["check"]);
});

test("main methods return compatible protocol errors without throwing", () => {
  const result = extension.methods.scanAssets({ directory: "../outside" });

  assert.equal(result.ok, false);
  assert.equal(result.protocolVersion, 1);
  assert.equal(result.error.code, ERROR_CODES.validation);
  assert.match(result.error.message, /assets/);
});

test("protocol errors infer stable error codes while preserving compatibility", () => {
  assert.equal(inferProtocolErrorCode(new Error("资源不存在，可能已经移动或删除。")), ERROR_CODES.notFound);
  assert.equal(inferProtocolErrorCode(new Error("移动计划已失效，请重新预览。")), ERROR_CODES.conflict);
  assert.equal(inferProtocolErrorCode(new Error("当前 Creator 未暴露可用的项目重载/重启接口。")), ERROR_CODES.external);
  assert.equal(inferProtocolErrorCode({ code: "EPERM", message: "permission denied" }), ERROR_CODES.permission);
  assert.equal(inferProtocolErrorCode({ code: "ERR_CUSTOM", message: "custom" }), "ERR_CUSTOM");

  const result = compatibleError(new Error("请先勾选要删除的未引用候选。"));
  assert.equal(result.ok, false);
  assert.equal(result.protocolVersion, 1);
  assert.equal(result.error.code, ERROR_CODES.validation);
  assert.match(result.error.message, /请先/);
});

test("loadState and getLogs read legacy project-asset-mover files", () => {
  resetDirectory("profiles");
  writeJson("profiles/project-asset-mover.json", {
    version: 1,
    rules: [{
      id: "audio",
      enabled: false,
      extensions: ["mp3"],
      nameKeywords: ["bgm"],
      target: "assets/legacy/audio"
    }],
    history: [{
      id: "legacy-history",
      createdAt: "2026-06-23T00:00:00.000Z",
      moves: []
    }]
  });
  writeJson("profiles/project-asset-mover.logs.json", {
    logs: [{
      time: "2026-06-23T00:00:00.000Z",
      level: "info",
      message: "legacy log"
    }]
  });

  const state = extension.methods.loadState();
  const logs = extension.methods.getLogs();

  assert.equal(state.ok, true);
  assert.equal(state.profilePath, "profiles/asset-steward.json");
  assert.equal(state.history[0].id, "legacy-history");
  assert.equal(state.rules.find((rule) => rule.id === "audio").target, "assets/legacy/audio");
  assert.ok(Fs.existsSync(Path.join(projectRoot, "profiles/asset-steward.json")));
  assert.equal(logs.ok, true);
  assert.equal(logs.logPath, "profiles/asset-steward.logs.json");
  assert.equal(logs.logs[0].message, "legacy log");
});

test("profile state trims history and logs to the panel retention window", () => {
  resetDirectory("profiles");
  writeJson("profiles/asset-steward.json", {
    version: 2,
    rules: [],
    history: Array.from({ length: 31 }, (_, index) => ({
      id: `history-${index}`,
      createdAt: `2026-06-23T00:${String(index).padStart(2, "0")}:00.000Z`,
      moves: []
    }))
  });
  writeJson("profiles/asset-steward.logs.json", {
    logs: Array.from({ length: 205 }, (_, index) => ({
      time: `2026-06-23T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
      level: "info",
      message: `log-${index}`
    }))
  });

  const state = extension.methods.loadState();
  const logs = extension.methods.getLogs();

  assert.equal(state.ok, true);
  assert.equal(state.history.length, 30);
  assert.equal(state.history[0].id, "history-0");
  assert.equal(state.history[29].id, "history-29");
  assert.equal(logs.ok, true);
  assert.equal(logs.logs.length, 200);
  assert.equal(logs.logs[0].message, "log-5");
  assert.equal(logs.logs[199].message, "log-204");
});

test("history detail preserves persisted failure details and legacy warnings", () => {
  resetDirectory("profiles");
  writeJson("profiles/asset-steward.json", {
    version: 2,
    rules: [],
    history: [{
      id: "new-history",
      createdAt: "2026-06-23T00:00:00.000Z",
      kind: "move",
      mode: "manual",
      conflictPolicy: "skip",
      movedCount: 1,
      failedCount: 1,
      cleanupFailedCount: 1,
      hasOverwrite: false,
      moves: [{
        source: "assets\\source\\fish.png",
        destination: "assets\\dest\\fish.png",
        action: "move"
      }],
      deletedDirectories: ["assets\\source"],
      failedMoves: [{
        source: "assets\\source\\missing.png",
        destination: "assets\\dest\\missing.png",
        message: "AssetDB move failed"
      }],
      failedDirectories: [{
        path: "assets\\source\\locked",
        message: "directory locked"
      }]
    }, {
      id: "legacy-history",
      createdAt: "2026-06-22T00:00:00.000Z",
      moves: [{
        source: "assets/old/a.png",
        destination: "assets/new/a.png",
        action: "move"
      }]
    }]
  });

  const current = extension.methods.getHistoryDetail({ historyId: "new-history" });
  const legacy = extension.methods.getHistoryDetail({ historyId: "legacy-history" });

  assert.equal(current.ok, true);
  assert.equal(current.detail.failedMovesPersisted, true);
  assert.equal(current.detail.failedDirectoriesPersisted, true);
  assert.equal(current.detail.moves[0].source, "assets/source/fish.png");
  assert.equal(current.detail.failedMoves[0].destination, "assets/dest/missing.png");
  assert.equal(current.detail.failedDirectories[0].path, "assets/source/locked");
  assert.match(current.detail.warning, /已包含本次执行的失败明细/);
  assert.equal(legacy.ok, true);
  assert.equal(legacy.detail.failedMovesPersisted, false);
  assert.equal(legacy.detail.failedDirectoriesPersisted, false);
  assert.match(legacy.detail.warning, /只持久化成功移动项/);
});

test("tool visibility persists in project profile", () => {
  resetDirectory("profiles");

  const saved = extension.methods.saveToolVisibility({
    toolVisibility: {
      "resources-runtime-check": false,
      "package-size-report": true
    }
  });
  const state = extension.methods.loadState();

  assert.equal(saved.ok, true);
  assert.equal(saved.toolVisibility["resources-runtime-check"], false);
  assert.equal(saved.toolVisibility["package-size-report"], true);
  assert.deepEqual(state.toolVisibility, saved.toolVisibility);
  assert.deepEqual(profile.sanitizeToolVisibility({
    "resources-runtime-check": false,
    "": false,
    "package-size-report": "yes"
  }), {
    "resources-runtime-check": false,
    "package-size-report": true
  });
});

test("extracted main modules expose stable pure helpers", () => {
  assert.equal(pathUtils.normalizeRelativePath("\\assets\\res\\fish.png\\"), "assets/res/fish.png");
  assert.equal(pathUtils.toDbUrl("assets/res/fish.png"), "db://assets/res/fish.png");
  assert.deepEqual(profile.normalizeExtensions("png, .JPG, png"), [".png", ".jpg"]);
  assert.deepEqual(profile.normalizeKeywords("UI, ui, 按钮"), ["ui", "按钮"]);
  assert.equal(assetScan.matchesScanFilters("assets/res/fish.png", false, ".png", "", [".png"]), true);
  assert.deepEqual([...referenceGraph.extractGraphUuids("11111111-1111-4111-8111-111111111111@f9941")], ["11111111-1111-4111-8111-111111111111@f9941"]);
  assert.equal(runtimeResources.parseStaticStringExpression("'fish/icon'"), "fish/icon");
  assert.equal(runtimeResources.resourceMatchesRuntimeCall({
    loadPath: "fish/icon"
  }, {
    method: "load",
    runtimePath: "fish/icon/spriteFrame"
  }), true);
  assert.equal(movePlan.ruleMatchesSource({
    extensions: [".png"],
    nameKeywords: ["fish"]
  }, "assets/res/fish.png"), true);
  assert.equal(healthChecks.normalizeTopN(500), 200);
  assert.deepEqual(healthChecks.collectMaterialTextureReferences({
    albedo: {
      __uuid__: "11111111-1111-4111-8111-111111111111",
      __expectedType__: "cc.Texture2D"
    }
  }), [{
    propertyPath: "albedo",
    uuid: "11111111-1111-4111-8111-111111111111",
    expectedType: "cc.Texture2D"
  }]);
  assert.deepEqual(movePlan.canonicalizeSelectedPaths([
    "assets/res",
    "assets/res/fish.png",
    "assets/scene/main.scene"
  ]), ["assets/res", "assets/scene/main.scene"]);
});

test("manual move plan remains compatible with existing preview fields", () => {
  writeDirectoryAsset("assets");
  writeDirectoryAsset("assets/source");
  writeDirectoryAsset("assets/dest");
  writeAsset("assets/source/fish.png", "fish");

  const plan = core.buildMovePlan({
    mode: "manual",
    paths: ["assets/source/fish.png"],
    targetDirectory: "assets/dest",
    conflictPolicy: "skip"
  });

  assert.equal(plan.publicResult.summary.total, 1);
  assert.equal(plan.publicResult.summary.ready, 1);
  assert.equal(plan.publicResult.items[0].source, "assets/source/fish.png");
  assert.equal(plan.publicResult.items[0].destination, "assets/dest/fish.png");
});

test("asset scan ignores configured issue paths like .gitkeep", () => {
  resetDirectory("assets/ignore-scan");
  writeDirectoryAsset("assets/ignore-scan");
  writeFile("assets/ignore-scan/.gitkeep", "");
  writeFile("assets/ignore-scan/real-missing.txt", "needs meta");

  const result = assetScan.scanAssets({
    directory: "assets/ignore-scan",
    issueIgnorePatterns: ".gitkeep"
  });

  assert.equal(result.summary.missingMetaCount, 1);
  assert.equal(result.summary.ignoredIssueCount, 1);
  assert.deepEqual(result.issues.map((item) => item.path), ["assets/ignore-scan/real-missing.txt"]);
  assert.equal(result.entries.find((item) => item.path.endsWith("/.gitkeep")).issueIgnored, true);
  assert.deepEqual(assetScan.normalizeIssueIgnorePatterns(" .gitkeep, keep.txt "), [".gitkeep", "keep.txt"]);
  assert.deepEqual(assetScan.normalizeIssueIgnorePatterns(""), []);
});

test("reference check keeps legacy details and target paths fields", () => {
  const uuid = "11111111-1111-4111-8111-111111111111";
  writeFile("assets/reference/target.png", "target");
  writeJson("assets/reference/target.png.meta", { uuid });
  writeJson("assets/reference/holder.prefab", [{
    __type__: "cc.Node",
    _name: "Root",
    _id: "node-root",
    _components: [{ __id__: 1 }]
  }, {
    __type__: "cc.Sprite",
    _node: { __id__: 0 },
    spriteFrame: { __uuid__: uuid }
  }]);
  writeJson("assets/reference/holder.prefab.meta", { uuid: "22222222-2222-4222-8222-222222222222" });

  const result = core.checkReferences({
    paths: ["assets/reference/target.png"],
    directory: "assets/reference",
    extensions: ".prefab"
  });

  assert.equal(result.references.length, 1);
  assert.deepEqual(result.references[0].matchedUuids, [uuid]);
  assert.deepEqual(result.references[0].targetPaths, ["assets/reference/target.png"]);
  assert.equal(result.references[0].details[0].matchedUuid, uuid);
  assert.equal(result.references[0].details[0].nodePath, "Root");
});

test("selected asset path resolves current asset selection for reference checks", async () => {
  writeAsset("assets/reference/selected.png", "selected");

  const originalGetSelected = global.Editor.Selection.getSelected;
  const originalRequest = global.Editor.Message.request;
  global.Editor.Selection.getSelected = (type) => type === "asset" ? ["selected-uuid"] : [];
  global.Editor.Message.request = async (channel, message, uuid) => {
    assert.equal(channel, "asset-db");
    assert.equal(message, "query-asset-info");
    assert.equal(uuid, "selected-uuid");
    return { url: "db://assets/reference/selected.png" };
  };

  try {
    const result = await core.getSelectedAssetPath();
    assert.deepEqual(result, { path: "assets/reference/selected.png" });
    assert.equal(core.normalizeAssetPathCandidate("db://assets/reference/selected.png"), "assets/reference/selected.png");
  } finally {
    global.Editor.Selection.getSelected = originalGetSelected;
    global.Editor.Message.request = originalRequest;
  }
});

test("node reference check can prefer current node selection over typed id", () => {
  resetDirectory("assets/node-reference-selection");
  writeJson("assets/node-reference-selection/main.scene", [{
    __type__: "cc.Node",
    _name: "Old",
    _id: "old-node",
    _components: []
  }, {
    __type__: "cc.Node",
    _name: "New",
    _id: "new-node",
    _components: []
  }]);

  const originalGetSelected = global.Editor.Selection.getSelected;
  global.Editor.Selection.getSelected = (type) => type === "node" ? ["new-node"] : [];

  try {
    const result = core.checkNodeReferences({
      nodeUuid: "old-node",
      directory: "assets/node-reference-selection",
      extensions: ".scene",
      preferSelectedNode: true
    });

    assert.equal(result.nodeUuid, "new-node");
    assert.deepEqual(result.targetNodes.map((item) => item.nodeUuid), ["new-node"]);
    assert.equal(result.targetNodes[0].nodePath, "New");
  } finally {
    global.Editor.Selection.getSelected = originalGetSelected;
  }
});

test("unused delete backup manifest records hashes and execution audit", () => {
  writeDirectoryAsset("assets/res");
  writeAsset("assets/res/unused.png", "unused-content");

  const plan = {
    backupScope: "selected",
    scene: "assets/scene/main.scene",
    scanDirectory: "assets/res",
    items: [{
      path: "assets/res/unused.png",
      extension: ".png",
      size: Fs.statSync(Path.join(projectRoot, "assets/res/unused.png")).size,
      status: "ready"
    }]
  };

  const backup = core.createUnusedDeleteBackup(plan);
  const manifest = JSON.parse(Fs.readFileSync(Path.join(projectRoot, backup.manifestPath), "utf8"));

  assert.equal(manifest.copiedFiles.length, 2);
  assert.ok(manifest.copiedFiles.every((item) => /^[a-f0-9]{64}$/.test(item.sha256)));

  const auditPath = core.writeUnusedDeleteExecutionAudit(backup, {
    deleted: [{ path: "assets/res/unused.png", size: plan.items[0].size }],
    failed: []
  });
  const audit = JSON.parse(Fs.readFileSync(Path.join(projectRoot, auditPath), "utf8"));

  assert.equal(audit.deleted.length, 1);
  assert.equal(audit.failed.length, 0);
  assert.equal(audit.manifestPath, backup.manifestPath);
});

test("unused delete execution uses AssetDB delete and writes audit", async () => {
  resetDirectory("assets/delete-execute");
  resetDirectory("assets/delete-scene");
  writeDirectoryAsset("assets/delete-execute");
  writeDirectoryAsset("assets/delete-scene");
  writeAsset("assets/delete-execute/unused.png", "unused-content");
  writeJson("assets/delete-scene/main.scene", []);
  writeJson("assets/delete-scene/main.scene.meta", {
    uuid: "33333333-3333-4333-8333-333333333333"
  });

  const originalRequest = global.Editor.Message.request;
  global.Editor.Message.request = async (channel, message, dbUrl) => {
    assert.equal(channel, "asset-db");
    assert.equal(message, "delete-asset");
    const relativePath = String(dbUrl).replace(/^db:\/\//, "");
    Fs.rmSync(Path.join(projectRoot, relativePath), { force: true });
    Fs.rmSync(Path.join(projectRoot, `${relativePath}.meta`), { force: true });
    return true;
  };

  try {
    const preview = extension.methods.previewUnusedDelete({
      scene: "assets/delete-scene/main.scene",
      directory: "assets/delete-execute",
      paths: ["assets/delete-execute/unused.png"]
    });

    assert.equal(preview.ok, true);
    assert.equal(preview.summary.ready, 1);

    const execution = await extension.methods.executeUnusedDelete({
      token: preview.token,
      confirmed: true
    });

    assert.equal(execution.ok, true);
    assert.equal(execution.deleted.length, 1);
    assert.equal(execution.failed.length, 0);
    assert.equal(Fs.existsSync(Path.join(projectRoot, "assets/delete-execute/unused.png")), false);
    assert.equal(Fs.existsSync(Path.join(projectRoot, execution.backup.manifestPath)), true);
    assert.equal(Fs.existsSync(Path.join(projectRoot, execution.auditPath)), true);
  } finally {
    global.Editor.Message.request = originalRequest;
  }
});

test("project cache cleanup deletes only confirmed library and temp directories", async () => {
  resetDirectory("library");
  resetDirectory("temp");
  writeFile("library/imports/cache.txt", "library-cache");
  writeFile("temp/build/cache.txt", "temp-cache");
  writeFile("assets/keep.txt", "keep");

  await assert.rejects(
    () => core.cleanProjectCache({ directories: ["library", "temp"] }),
    /确认/
  );
  assert.throws(
    () => core.normalizeCacheDirectories(["library", "local"]),
    /只支持 library 和 temp/
  );

  const result = await extension.methods.cleanProjectCache({
    directories: ["library", "temp"],
    confirmed: true,
    reloadStrategy: "refresh-only"
  });

  assert.equal(result.ok, true);
  assert.equal(result.reloadStrategy, "refresh-only");
  assert.equal(result.summary.deleted, 2);
  assert.equal(result.summary.failed, 0);
  assert.equal(Fs.existsSync(Path.join(projectRoot, "library")), false);
  assert.equal(Fs.existsSync(Path.join(projectRoot, "temp")), false);
  assert.equal(Fs.existsSync(Path.join(projectRoot, "assets/keep.txt")), true);
  assert.throws(
    () => core.resolveProjectCacheDirectory("../outside"),
    /不允许清理|非法缓存目录/
  );
});

test("project cache cleanup supports editor reload strategy", async () => {
  resetDirectory("library");
  resetDirectory("temp");
  writeFile("library/cache.txt", "library-cache");
  writeFile("temp/cache.txt", "temp-cache");

  const originalReload = global.Editor.Project.reload;
  let reloadCount = 0;
  global.Editor.Project.reload = async () => {
    reloadCount += 1;
  };

  try {
    const result = await extension.methods.cleanProjectCache({
      directories: ["library", "temp"],
      confirmed: true,
      reloadStrategy: "editor-reload"
    });

    assert.equal(result.ok, true);
    assert.equal(result.reloadStrategy, "editor-reload");
    assert.equal(result.refresh.refreshed, true);
    assert.equal(result.refresh.attempts[0].action, "Editor.Project.reload");
    assert.equal(reloadCount, 1);
    assert.equal(Fs.existsSync(Path.join(projectRoot, "library")), false);
    assert.equal(Fs.existsSync(Path.join(projectRoot, "temp")), false);
  } finally {
    global.Editor.Project.reload = originalReload;
  }
});

test("project cache cleanup reports unsupported editor reload strategy", async () => {
  resetDirectory("library");
  resetDirectory("temp");

  const result = await extension.methods.cleanProjectCache({
    directories: ["library", "temp"],
    confirmed: true,
    reloadStrategy: "editor-reload"
  });

  assert.equal(result.ok, false);
  assert.match(result.error.message, /未暴露可用的项目重载/);
  assert.throws(
    () => core.normalizeReloadStrategy("restart-now"),
    /未知项目重载策略/
  );
});

test("package size report clamps topN, excludes meta, and reports scene reachable files", () => {
  resetDirectory("assets/health-package");
  resetDirectory("assets/health-scene");
  const sceneUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const textureUuid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const unresolvedUuid = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  writeDirectoryAsset("assets/health-package");
  writeDirectoryAsset("assets/health-package/nested");
  writeJson("assets/health-scene/main.scene", [{
    __type__: "cc.SceneAsset",
    texture: { __uuid__: textureUuid },
    missing: { __uuid__: unresolvedUuid }
  }]);
  writeJson("assets/health-scene/main.scene.meta", { uuid: sceneUuid });
  writeFile("assets/health-package/nested/reachable.png", "reachable-content");
  writeJson("assets/health-package/nested/reachable.png.meta", { uuid: textureUuid });
  writeAsset("assets/health-package/other.txt", "other");

  const result = healthChecks.reportPackageSize({
    directory: "assets/health-package",
    scene: "assets/health-scene/main.scene",
    topN: 500,
    includeMeta: false
  });

  assert.equal(result.summary.topN, 200);
  assert.equal(result.summary.fileCount, 2);
  assert.equal(result.summary.excludedMetaCount, 3);
  assert.equal(result.summary.referencedFileCount, 1);
  assert.equal(result.referencedTopFiles[0].path, "assets/health-package/nested/reachable.png");
  assert.ok(result.summary.unresolvedReferenceCount >= 1);
  assert.equal(result.typeRanking.find((item) => item.extension === ".png").count, 1);
  assert.equal(result.directoryRanking[0].path, "assets/health-package/nested");
});

test("directory convention reports mismatches and missing meta without changing files", () => {
  resetDirectory("assets/health-directory");
  writeDirectoryAsset("assets/health-directory");
  writeDirectoryAsset("assets/health-directory/texture");
  writeDirectoryAsset("assets/health-directory/source");
  writeDirectoryAsset("assets/health-directory/missing");
  writeAsset("assets/health-directory/texture/good.png", "good");
  writeAsset("assets/health-directory/source/wrong.png", "wrong");
  writeFile("assets/health-directory/missing/no-meta.png", "missing-meta");

  const result = healthChecks.checkDirectoryConvention({
    directory: "assets/health-directory",
    rules: [{
      id: "png-to-texture",
      enabled: true,
      extensions: [".png"],
      nameKeywords: [],
      target: "assets/health-directory/texture"
    }]
  });

  assert.equal(result.summary.fileCount, 3);
  assert.equal(result.summary.matchedCount, 3);
  assert.equal(result.summary.compliantCount, 1);
  assert.equal(result.summary.mismatchCount, 2);
  assert.equal(result.summary.missingMetaCount, 1);
  assert.deepEqual(result.mismatches.map((item) => item.path), [
    "assets/health-directory/missing/no-meta.png",
    "assets/health-directory/source/wrong.png"
  ]);
  assert.equal(result.mismatches[0].missingMeta, true);
  assert.equal(result.mismatches[0].suggestedPath, "assets/health-directory/texture/no-meta.png");
  assert.equal(Fs.existsSync(Path.join(projectRoot, "assets/health-directory/source/wrong.png")), true);
});

test("scene prefab reference health separates resolved, whitelisted, and unresolved UUIDs", () => {
  resetDirectory("assets/health-reference");
  const sceneUuid = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const prefabUuid = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const resolvedUuid = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const whitelistedUuid = "11111111-2222-4333-8444-555555555555";
  const unresolvedUuid = "66666666-7777-4888-8999-aaaaaaaaaaaa";
  writeDirectoryAsset("assets/health-reference");
  writeFile("assets/health-reference/resolved.png", "resolved");
  writeJson("assets/health-reference/resolved.png.meta", { uuid: resolvedUuid });
  writeJson("assets/health-reference/main.scene", [{
    __type__: "cc.SceneAsset",
    resolved: { __uuid__: resolvedUuid },
    builtIn: { __uuid__: whitelistedUuid },
    missingA: { __uuid__: unresolvedUuid },
    missingB: { __uuid__: unresolvedUuid }
  }]);
  writeJson("assets/health-reference/main.scene.meta", { uuid: sceneUuid });
  writeJson("assets/health-reference/holder.prefab", [{
    __type__: "cc.Prefab",
    missing: { __uuid__: unresolvedUuid }
  }]);
  writeJson("assets/health-reference/holder.prefab.meta", { uuid: prefabUuid });
  writeFile("assets/health-reference/ignored.txt", unresolvedUuid);

  const result = healthChecks.checkScenePrefabReferenceHealth({
    directory: "assets/health-reference",
    extensions: ".scene,.prefab,.txt",
    whitelist: whitelistedUuid
  });

  assert.deepEqual(result.extensions, [".scene", ".prefab"]);
  assert.equal(result.summary.scannedFileCount, 2);
  assert.equal(result.summary.resolvedReferenceCount, 1);
  assert.equal(result.summary.whitelistReferenceCount, 1);
  assert.equal(result.summary.unresolvedReferenceCount, 3);
  assert.equal(result.summary.unresolvedUuidCount, 1);
  assert.equal(result.summary.affectedFileCount, 2);
  assert.deepEqual(result.issues.map((item) => `${item.filePath}:${item.matchCount}`), [
    "assets/health-reference/main.scene:2",
    "assets/health-reference/holder.prefab:1"
  ]);
});

test("resources runtime check separates matched, missing, dynamic, and unused resources", () => {
  resetDirectory("assets/resources");
  resetDirectory("assets/scripts");
  writeDirectoryAsset("assets/resources");
  writeDirectoryAsset("assets/scripts");
  writeAsset("assets/resources/fish/icon.png", "icon");
  writeAsset("assets/resources/fish/group/item.txt", "group-item");
  writeAsset("assets/resources/unused.png", "unused");
  writeFile("assets/scripts/Loader.ts", `
    // resources.load("comment/ignored")
    const fake = "resources.load('string/ignored')";
    resources.load("fish/icon", SpriteFrame, () => {});
    resources.load("fish/icon/spriteFrame", SpriteFrame, () => {});
    resources.loadDir("fish/group", TextAsset, () => {});
    resources.load("missing/path", Prefab, () => {});
    resources.load(dynamicPath, Prefab, () => {});
  `);

  const result = runtimeResources.checkResourcesRuntime({
    resourcesDirectory: "assets/resources",
    codeDirectories: "assets/scripts"
  });

  assert.equal(result.summary.resourceCount, 3);
  assert.equal(result.summary.staticCallCount, 4);
  assert.equal(result.summary.matchedCallCount, 3);
  assert.equal(result.summary.missingCallCount, 1);
  assert.equal(result.summary.dynamicCallCount, 1);
  assert.deepEqual(result.missingCalls.map((call) => call.runtimePath), ["missing/path"]);
  assert.deepEqual(result.dynamicCalls.map((call) => call.expression), ["dynamicPath"]);
  assert.deepEqual(result.unusedResources.map((resource) => resource.path), ["assets/resources/unused.png"]);
});

test("serialized asset graph follows subMeta UUID dependencies across assets", () => {
  resetDirectory("assets/graph-chain");
  const sceneUuid = "12121212-1212-4212-8212-121212121212";
  const prefabUuid = "23232323-2323-4232-8232-232323232323";
  const textureUuid = "34343434-3434-4343-8434-343434343434";
  const spriteFrameUuid = "45454545-4545-4454-8454-454545454545";
  writeDirectoryAsset("assets/graph-chain");
  writeJson("assets/graph-chain/main.scene", [{
    __type__: "cc.SceneAsset",
    prefab: { __uuid__: prefabUuid }
  }]);
  writeJson("assets/graph-chain/main.scene.meta", { uuid: sceneUuid });
  writeJson("assets/graph-chain/holder.prefab", [{
    __type__: "cc.Prefab",
    spriteFrame: { __uuid__: spriteFrameUuid }
  }]);
  writeJson("assets/graph-chain/holder.prefab.meta", { uuid: prefabUuid });
  writeFile("assets/graph-chain/sheet.png", "texture");
  writeJson("assets/graph-chain/sheet.png.meta", {
    uuid: textureUuid,
    subMetas: {
      spriteFrame: { uuid: spriteFrameUuid }
    }
  });

  const graph = referenceGraph.buildSerializedAssetGraph();
  const sceneAsset = graph.byPath.get("assets/graph-chain/main.scene");
  const reachable = referenceGraph.collectReachableAssetChains(sceneAsset, graph.byUuid);

  assert.equal(graph.byUuid.get(spriteFrameUuid).path, "assets/graph-chain/sheet.png");
  assert.deepEqual(reachable.chains.get("assets/graph-chain/sheet.png"), [
    "assets/graph-chain/main.scene",
    "assets/graph-chain/holder.prefab",
    "assets/graph-chain/sheet.png"
  ]);
});

test("session report export removes execution tokens from json and markdown", () => {
  resetDirectory("reports");

  const result = core.exportSessionReport({
    snapshot: {
      modules: [{
        id: "sample",
        title: "Sample",
        summary: { total: 1 },
        data: {
          nested: {
            token: "module-secret-token",
            value: 1
          }
        }
      }],
      currentPlan: {
        token: "plan-secret-token",
        summary: { ready: 1 },
        items: [{
          path: "assets/res/fish.png",
          token: "item-secret-token"
        }]
      },
      logs: []
    }
  });

  const jsonText = Fs.readFileSync(Path.join(projectRoot, result.jsonPath), "utf8");
  const markdownText = Fs.readFileSync(Path.join(projectRoot, result.markdownPath), "utf8");
  const report = JSON.parse(jsonText);

  assert.equal(report.currentPlan.token, undefined);
  assert.equal(report.currentPlan.items[0].token, undefined);
  assert.equal(report.modules[0].data.nested.token, undefined);
  assert.doesNotMatch(jsonText, /secret-token/);
  assert.doesNotMatch(markdownText, /secret-token/);
});
