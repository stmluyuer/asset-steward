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
const movePlan = require("../main/move-plan");

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

test("extracted main modules expose stable pure helpers", () => {
  assert.equal(pathUtils.normalizeRelativePath("\\assets\\res\\fish.png\\"), "assets/res/fish.png");
  assert.equal(pathUtils.toDbUrl("assets/res/fish.png"), "db://assets/res/fish.png");
  assert.deepEqual(profile.normalizeExtensions("png, .JPG, png"), [".png", ".jpg"]);
  assert.deepEqual(profile.normalizeKeywords("UI, ui, 按钮"), ["ui", "按钮"]);
  assert.equal(movePlan.ruleMatchesSource({
    extensions: [".png"],
    nameKeywords: ["fish"]
  }, "assets/res/fish.png"), true);
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
