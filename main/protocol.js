"use strict";

const PROTOCOL_VERSION = 1;
const DEFAULT_ERROR_CODE = "ERR_ASSET_STEWARD";
const ERROR_CODES = {
  default: DEFAULT_ERROR_CODE,
  validation: "ERR_ASSET_STEWARD_VALIDATION",
  notFound: "ERR_ASSET_STEWARD_NOT_FOUND",
  conflict: "ERR_ASSET_STEWARD_CONFLICT",
  permission: "ERR_ASSET_STEWARD_PERMISSION",
  external: "ERR_ASSET_STEWARD_EXTERNAL"
};

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

function normalizeProtocolErrorCode(code) {
  const value = String(code || "").trim();
  return /^ERR_[A-Z0-9_]+$/.test(value) ? value : "";
}

function inferProtocolErrorCode(error, fallback = DEFAULT_ERROR_CODE) {
  const explicitCode = normalizeProtocolErrorCode(error?.code);
  if (explicitCode) {
    return explicitCode;
  }
  const fallbackCode = normalizeProtocolErrorCode(fallback);
  if (fallbackCode && fallbackCode !== DEFAULT_ERROR_CODE) {
    return fallbackCode;
  }
  if (error?.code === "ENOENT") {
    return ERROR_CODES.notFound;
  }
  if (error?.code === "EACCES" || error?.code === "EPERM") {
    return ERROR_CODES.permission;
  }

  const message = error?.message || String(error || "");
  if (/AssetDB|Editor\.Message|Creator|未暴露|重载项目失败|移动失败|删除失败/.test(message)) {
    return ERROR_CODES.external;
  }
  if (/已失效|重新预览|被占用|覆盖前|二次确认|拒绝|仍存在|校验失败/.test(message)) {
    return ERROR_CODES.conflict;
  }
  if (/不存在|未找到|找不到|缺少|没有有效|没有可用/.test(message)) {
    return ERROR_CODES.notFound;
  }
  if (/必须|请先|请选择|请输入|不支持|未知|非法|不允许|只支持|不要选择|不要直接输入|至少需要|无效/.test(message)) {
    return ERROR_CODES.validation;
  }
  return fallbackCode || DEFAULT_ERROR_CODE;
}

function compatibleError(error, code = DEFAULT_ERROR_CODE) {
  return {
    ok: false,
    protocolVersion: PROTOCOL_VERSION,
    error: {
      code: inferProtocolErrorCode(error, code),
      message: error?.message || String(error),
      stack: error?.stack || ""
    }
  };
}

module.exports = {
  PROTOCOL_VERSION,
  ERROR_CODES,
  compatibleSuccess,
  compatibleError,
  inferProtocolErrorCode,
  normalizeWarnings
};
