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

function writeFile(relativePath, content = "") {
  const fullPath = Path.join(projectRoot, relativePath);
  Fs.mkdirSync(Path.dirname(fullPath), { recursive: true });
  Fs.writeFileSync(fullPath, content, "utf8");
  return fullPath;
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
