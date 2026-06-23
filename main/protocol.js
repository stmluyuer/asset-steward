"use strict";

const PROTOCOL_VERSION = 1;

function normalizeWarnings(warnings) {
  if (!Array.isArray(warnings)) {
    return warnings ? [String(warnings)] : [];
  }
  return warnings.map((item) => String(item)).filter(Boolean);
}

function compatibleSuccess(payload, warnings = []) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return {
      ...payload,
      ok: true,
      protocolVersion: PROTOCOL_VERSION,
      warnings: normalizeWarnings(warnings.length ? warnings : payload.warnings)
    };
  }

  return {
    ok: true,
    protocolVersion: PROTOCOL_VERSION,
    warnings: normalizeWarnings(warnings),
    value: payload
  };
}

function compatibleError(error, code = "ERR_ASSET_STEWARD") {
  return {
    ok: false,
    protocolVersion: PROTOCOL_VERSION,
    error: {
      code,
      message: error?.message || String(error),
      stack: error?.stack || ""
    }
  };
}

module.exports = {
  PROTOCOL_VERSION,
  compatibleSuccess,
  compatibleError,
  normalizeWarnings
};
