"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const format = require("../panel/format");
const { createAssetStewardError, requestMain } = require("../panel/request");

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
