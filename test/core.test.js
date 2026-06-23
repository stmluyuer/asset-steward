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
const { compatibleSuccess } = require("../main/protocol");
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
  assert.equal(result.error.code, "ERR_ASSET_STEWARD");
  assert.match(result.error.message, /assets/);
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
