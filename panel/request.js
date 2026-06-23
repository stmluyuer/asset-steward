"use strict";

const PACKAGE_NAME = "asset-steward";

function createAssetStewardError(result) {
  const error = new Error(result?.error?.message || "Asset Steward request failed");
  error.code = result?.error?.code || "ERR_ASSET_STEWARD";
  error.detail = result?.error || null;
  return error;
}

async function requestMain(message, payload) {
  const result = await Editor.Message.request(PACKAGE_NAME, message, payload);
  if (result?.ok === false) {
    throw createAssetStewardError(result);
  }
  return result;
}

module.exports = {
  PACKAGE_NAME,
  createAssetStewardError,
  requestMain,
};
