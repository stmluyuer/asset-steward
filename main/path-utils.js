"use strict";

const Fs = require("fs");
const Path = require("path");

function getProjectPath() {
  return global.Editor?.Project?.path || Path.resolve(__dirname, "../../..");
}

function normalizeRelativePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function toProjectPath(relativePath) {
  return Path.join(getProjectPath(), normalizeRelativePath(relativePath));
}

function toDbUrl(relativePath) {
  return `db://${normalizeRelativePath(relativePath)}`;
}

function isInsideAssets(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  return normalized === "assets" || normalized.startsWith("assets/");
}

function isStrictlyInside(parentPath, childPath) {
  return normalizeRelativePath(childPath).startsWith(`${normalizeRelativePath(parentPath)}/`);
}

function comparePath(left, right) {
  return String(left).localeCompare(String(right), "zh-CN");
}

function walk(root, visitor) {
  if (!Fs.existsSync(root)) {
    return;
  }

  for (const entry of Fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = Path.join(root, entry.name);
    visitor(fullPath, entry);
    if (entry.isDirectory()) {
      walk(fullPath, visitor);
    }
  }
}

function toRelativePath(fullPath) {
  return normalizeRelativePath(Path.relative(getProjectPath(), fullPath));
}

function statPath(relativePath) {
  return Fs.statSync(toProjectPath(relativePath), { throwIfNoEntry: false }) || null;
}

function pathExists(relativePath) {
  return !!statPath(relativePath);
}

function destinationOccupied(relativePath) {
  return pathExists(relativePath) || pathExists(`${relativePath}.meta`);
}

function hasMeta(relativePath) {
  return pathExists(`${relativePath}.meta`);
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(Fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    return fallback;
  }
}

function readJsonWithLegacy(primaryPath, legacyPath, fallback) {
  if (Fs.existsSync(primaryPath)) {
    return readJson(primaryPath, fallback);
  }
  if (legacyPath && Fs.existsSync(legacyPath)) {
    return readJson(legacyPath, fallback);
  }
  return fallback;
}

function writeJson(filePath, value) {
  Fs.mkdirSync(Path.dirname(filePath), { recursive: true });
  Fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

module.exports = {
  getProjectPath,
  normalizeRelativePath,
  toProjectPath,
  toDbUrl,
  isInsideAssets,
  isStrictlyInside,
  comparePath,
  walk,
  toRelativePath,
  statPath,
  pathExists,
  destinationOccupied,
  hasMeta,
  readJson,
  readJsonWithLegacy,
  writeJson,
};
