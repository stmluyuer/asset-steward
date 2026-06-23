"use strict";

const Fs = require("fs");
const {
  normalizeRelativePath,
  toProjectPath,
  readJsonWithLegacy,
  writeJson,
} = require("./path-utils");

const PACKAGE_NAME = "asset-steward";
const PROFILE_RELATIVE = "profiles/asset-steward.json";
const LOG_RELATIVE = "profiles/asset-steward.logs.json";
const LEGACY_PROFILE_RELATIVE = "profiles/project-asset-mover.json";
const LEGACY_LOG_RELATIVE = "profiles/project-asset-mover.logs.json";
const PROFILE_VERSION = 2;
const MAX_HISTORY = 30;
const MAX_LOGS = 200;
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

function getProfilePath() {
  return toProjectPath(PROFILE_RELATIVE);
}

function getLogPath() {
  return toProjectPath(LOG_RELATIVE);
}

function getLegacyProfilePath() {
  return toProjectPath(LEGACY_PROFILE_RELATIVE);
}

function getLegacyLogPath() {
  return toProjectPath(LEGACY_LOG_RELATIVE);
}

function defaultProfile() {
  return {
    version: PROFILE_VERSION,
    rules: defaultRules(),
    history: []
  };
}

function defaultRules() {
  return [
    { id: "prefab", enabled: true, extensions: [".prefab"], nameKeywords: [], target: "assets/res/prefab" },
    { id: "audio", enabled: true, extensions: [".mp3", ".wav", ".ogg"], nameKeywords: [], target: "assets/res/audio" },
    { id: "model", enabled: true, extensions: [".fbx", ".gltf", ".glb"], nameKeywords: [], target: "assets/res/model" },
    { id: "image-ui", enabled: true, extensions: IMAGE_EXTENSIONS, nameKeywords: ["ui", "icon", "button", "btn", "joystick", "progress", "topic", "guide", "hud", "arrow", "coin", "gold", "sell", "按钮", "金币"], target: "assets/res/image/ui" },
    { id: "image-vfx", enabled: true, extensions: IMAGE_EXTENSIONS, nameKeywords: ["effect", "vfx", "fx", "glow", "particle", "ripple", "noise", "mask", "line", "lizi", "circle", "spark", "splash", "光", "圈", "特效"], target: "assets/res/image/vfx" },
    { id: "image-environment", enabled: true, extensions: IMAGE_EXTENSIONS, nameKeywords: ["water", "floor", "ground", "sky", "sea", "terrain", "track", "海", "地面", "天空"], target: "assets/res/image/environment" },
    { id: "image-model", enabled: true, extensions: IMAGE_EXTENSIONS, nameKeywords: ["_d", "_n", "_a", "_c", "albedo", "normal", "rough", "metal", "occlusion", "_ao"], target: "assets/res/image/model" },
    { id: "image-other", enabled: true, extensions: IMAGE_EXTENSIONS, nameKeywords: [], target: "assets/res/image/other" },
    { id: "effect-chunk", enabled: true, extensions: [".effect", ".chunk"], nameKeywords: [], target: "assets/res/effects" },
    { id: "material", enabled: true, extensions: [".mtl"], nameKeywords: [], target: "assets/res/material" }
  ];
}

function loadProfile() {
  const profilePath = getProfilePath();
  const rawProfile = readJsonWithLegacy(profilePath, getLegacyProfilePath(), defaultProfile());
  const profile = migrateProfile(rawProfile);
  if (Number(rawProfile?.version) < PROFILE_VERSION || !Fs.existsSync(profilePath)) {
    saveProfile(profile);
  }
  return {
    version: PROFILE_VERSION,
    rules: sanitizeRules(profile.rules),
    history: Array.isArray(profile.history) ? profile.history.slice(0, MAX_HISTORY) : []
  };
}

function saveProfile(profile) {
  writeJson(getProfilePath(), {
    version: PROFILE_VERSION,
    rules: sanitizeRules(profile.rules),
    history: Array.isArray(profile.history) ? profile.history.slice(0, MAX_HISTORY) : []
  });
}

function migrateProfile(profile) {
  if (Number(profile?.version) >= PROFILE_VERSION) {
    return profile;
  }

  const oldRules = sanitizeRules(profile?.rules);
  const defaults = defaultRules();
  const defaultIds = new Set(defaults.map((rule) => rule.id));
  const preservedIds = new Set(["prefab", "audio", "model"]);
  const oldById = new Map(oldRules.map((rule) => [rule.id, rule]));
  const migratedDefaults = defaults.map((rule) => preservedIds.has(rule.id) && oldById.has(rule.id) ? oldById.get(rule.id) : rule);
  const customRules = oldRules.filter((rule) => rule.id !== "image" && !defaultIds.has(rule.id));
  return {
    version: PROFILE_VERSION,
    rules: [...migratedDefaults, ...customRules],
    history: Array.isArray(profile?.history) ? profile.history : []
  };
}

function loadState() {
  const profile = loadProfile();
  return {
    rules: profile.rules,
    history: profile.history,
    profilePath: PROFILE_RELATIVE
  };
}

function getHistoryDetail(payload) {
  const historyId = String(payload?.historyId || "").trim();
  if (!historyId) {
    throw new Error("缺少移动历史 ID。");
  }
  const entry = loadProfile().history.find((item) => item.id === historyId);
  if (!entry) {
    throw new Error("未找到指定移动历史，可能已超过最近 30 条保留范围。");
  }
  const moves = Array.isArray(entry.moves) ? entry.moves.map((move) => ({
    source: normalizeRelativePath(move.source),
    destination: normalizeRelativePath(move.destination),
    action: String(move.action || ""),
    overwrittenTargetRecoverable: move.overwrittenTargetRecoverable !== false
  })) : [];
  const deletedDirectories = Array.isArray(entry.deletedDirectories)
    ? entry.deletedDirectories.map(normalizeRelativePath)
    : [];
  const failedMoves = Array.isArray(entry.failedMoves) ? entry.failedMoves.map((move) => ({
    source: normalizeRelativePath(move.source),
    destination: normalizeRelativePath(move.destination),
    message: String(move.message || "")
  })) : [];
  const failedDirectories = Array.isArray(entry.failedDirectories) ? entry.failedDirectories.map((item) => ({
    path: normalizeRelativePath(item.path),
    message: String(item.message || "")
  })) : [];
  return {
    detail: {
      id: entry.id,
      createdAt: entry.createdAt,
      kind: entry.kind,
      mode: entry.mode,
      conflictPolicy: entry.conflictPolicy,
      movedCount: Number(entry.movedCount) || moves.length,
      failedCount: Number(entry.failedCount) || 0,
      hasOverwrite: entry.hasOverwrite === true,
      deletedDirectories,
      cleanupFailedCount: Number(entry.cleanupFailedCount) || 0,
      failedMoves,
      failedDirectories,
      moves,
      failedMovesPersisted: Array.isArray(entry.failedMoves),
      failedDirectoriesPersisted: Array.isArray(entry.failedDirectories),
      warning: Array.isArray(entry.failedMoves) || Array.isArray(entry.failedDirectories)
        ? "历史记录已包含本次执行的失败明细；反向计划仍需重新预览并人工复核。"
        : "历史记录只持久化成功移动项、覆盖风险和空目录清理摘要；执行失败项和清理失败明细需查看当次执行日志。反向计划仍需重新预览并人工复核。"
    }
  };
}

function getLogs() {
  const data = readJsonWithLegacy(getLogPath(), getLegacyLogPath(), { logs: [] });
  return {
    logs: Array.isArray(data.logs) ? data.logs.slice(-MAX_LOGS) : [],
    logPath: LOG_RELATIVE
  };
}

function appendLog(payload) {
  const level = ["info", "warning", "error"].includes(payload?.level) ? payload.level : "info";
  const message = String(payload?.message || "").trim();
  if (!message) {
    return getLogs();
  }

  const data = getLogs();
  data.logs.push({
    time: new Date().toISOString(),
    level,
    message,
    detail: payload?.detail ? String(payload.detail) : ""
  });
  data.logs = data.logs.slice(-MAX_LOGS);
  writeJson(getLogPath(), { logs: data.logs });

  const output = `[${PACKAGE_NAME}] ${message}`;
  if (level === "error") {
    console.error(output);
  } else if (level === "warning") {
    console.warn(output);
  } else {
    console.log(output);
  }

  return data;
}

function clearLogs() {
  writeJson(getLogPath(), { logs: [] });
  return { logs: [], logPath: LOG_RELATIVE };
}

function sanitizeRules(rules) {
  if (!Array.isArray(rules)) {
    return [];
  }

  return rules.map((rule, index) => ({
    id: String(rule?.id || `rule-${index + 1}`),
    enabled: rule?.enabled !== false,
    extensions: normalizeExtensions(rule?.extensions),
    nameKeywords: normalizeKeywords(rule?.nameKeywords),
    target: normalizeRelativePath(rule?.target)
  }));
}

function normalizeExtensions(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean)
    .map((item) => item.startsWith(".") ? item : `.${item}`))];
}

function normalizeKeywords(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
}

function saveRules(rules) {
  const profile = loadProfile();
  profile.rules = sanitizeRules(rules);
  saveProfile(profile);
  return { rules: profile.rules, profilePath: PROFILE_RELATIVE };
}

module.exports = {
  PROFILE_RELATIVE,
  LOG_RELATIVE,
  loadProfile,
  saveProfile,
  migrateProfile,
  loadState,
  getHistoryDetail,
  getLogs,
  appendLog,
  clearLogs,
  sanitizeRules,
  normalizeExtensions,
  normalizeKeywords,
  saveRules,
};
