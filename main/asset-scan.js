"use strict";

const Fs = require("fs");
const Path = require("path");
const {
  normalizeRelativePath,
  toProjectPath,
  isInsideAssets,
  comparePath,
  walk,
  toRelativePath,
  statPath,
  pathExists,
  hasMeta,
} = require("./path-utils");
const { normalizeExtensions } = require("./profile");

const PROTECTED_CLEANUP_DIRECTORIES = new Set([
  "assets/res",
  "assets/resources",
  "assets/scene",
  "assets/script"
]);

function normalizeScanDirectory(value) {
  const directory = normalizeRelativePath(value || "assets") || "assets";
  if (!isInsideAssets(directory)) {
    throw new Error(`扫描目录必须位于 assets 下：${directory}`);
  }
  if (!statPath(directory)?.isDirectory()) {
    throw new Error(`扫描目录不存在或不是目录：${directory}`);
  }
  return directory;
}

function scanAssets(options) {
  const search = String(options?.search || "").trim().toLowerCase();
  const extensionFilter = normalizeExtensions(options?.extensions);
  const scanDirectory = normalizeScanDirectory(options?.directory || options?.scanDirectory);
  const scanRoot = toProjectPath(scanDirectory);
  const entries = [];
  const directories = [scanDirectory];
  const issueItems = [];
  const typeStatsByExtension = new Map();
  const directoryPaths = [scanDirectory];
  let missingMetaCount = 0;
  let orphanMetaCount = 0;
  let emptyDirectoryCount = 0;
  let fileCount = 0;
  let directoryCount = 1;
  let totalSize = 0;

  walk(scanRoot, (fullPath, entry) => {
    const relative = toRelativePath(fullPath);
    if (entry.isFile() && relative.toLowerCase().endsWith(".meta")) {
      const owner = relative.slice(0, -".meta".length);
      if (!pathExists(owner)) {
        orphanMetaCount++;
        const ownerExtension = Path.extname(owner).toLowerCase();
        if (matchesScanFilters(relative, false, ownerExtension, search, extensionFilter)) {
          issueItems.push({
            kind: "orphan-meta",
            severity: "medium",
            path: relative,
            ownerPath: owner,
            extension: ownerExtension || "(无扩展名)",
            size: Fs.statSync(fullPath).size,
            locatable: false
          });
        }
      }
      return;
    }

    const isDirectory = entry.isDirectory();
    if (isDirectory) {
      directories.push(relative);
      directoryPaths.push(relative);
      directoryCount++;
    }

    const extension = isDirectory ? "" : Path.extname(entry.name).toLowerCase();
    const size = isDirectory ? 0 : Fs.statSync(fullPath).size;
    if (!isDirectory) {
      fileCount++;
      totalSize += size;
      if (matchesScanFilters(relative, false, extension, search, extensionFilter)) {
        const statKey = extension || "(无扩展名)";
        const stat = typeStatsByExtension.get(statKey) || { extension: statKey, count: 0, totalSize: 0 };
        stat.count++;
        stat.totalSize += size;
        typeStatsByExtension.set(statKey, stat);
      }
    }

    const missingMeta = !hasMeta(relative);
    if (missingMeta) {
      missingMetaCount++;
      if (matchesScanFilters(relative, isDirectory, extension, search, extensionFilter)) {
        issueItems.push({
          kind: "missing-meta",
          severity: "high",
          path: relative,
          ownerPath: relative,
          extension: isDirectory ? "(目录)" : extension || "(无扩展名)",
          size,
          locatable: true
        });
      }
    }

    if (search && !relative.toLowerCase().includes(search)) {
      return;
    }
    if (!isDirectory && extensionFilter.length > 0 && !extensionFilter.includes(extension)) {
      return;
    }

    entries.push({
      path: relative,
      name: entry.name,
      kind: isDirectory ? "directory" : "file",
      extension: isDirectory ? "(目录)" : extension || "(无扩展名)",
      size,
      missingMeta,
      selectable: relative !== "assets"
    });
  });

  for (const directory of directoryPaths) {
    if (directory === "assets" || PROTECTED_CLEANUP_DIRECTORIES.has(directory)) {
      continue;
    }
    if (isReportEmptyDirectory(directory)) {
      emptyDirectoryCount++;
      if (matchesScanFilters(directory, true, "", search, extensionFilter)) {
        issueItems.push({
          kind: "empty-directory",
          severity: "low",
          path: directory,
          ownerPath: directory,
          extension: "(目录)",
          size: 0,
          locatable: true
        });
      }
    }
  }

  entries.sort((left, right) => comparePath(left.path, right.path));
  directories.sort(comparePath);
  issueItems.sort((left, right) => comparePath(left.path, right.path));
  const typeStats = [...typeStatsByExtension.values()]
    .sort((left, right) => right.count - left.count || comparePath(left.extension, right.extension));
  return {
    entries,
    directories,
    issues: issueItems,
    typeStats,
    summary: {
      scanDirectory,
      visibleCount: entries.length,
      fileCount,
      directoryCount,
      totalSize,
      missingMetaCount,
      orphanMetaCount,
      emptyDirectoryCount,
      visibleIssueCount: issueItems.length,
      typeCount: typeStats.length
    }
  };
}

function matchesScanFilters(relativePath, isDirectory, extension, search, extensionFilter) {
  if (search && !relativePath.toLowerCase().includes(search)) {
    return false;
  }
  if (!isDirectory && extensionFilter.length > 0 && !extensionFilter.includes(extension)) {
    return false;
  }
  if (isDirectory && extensionFilter.length > 0) {
    return false;
  }
  return true;
}

function isReportEmptyDirectory(directory) {
  const stat = statPath(directory);
  if (!stat?.isDirectory()) {
    return false;
  }

  const entries = Fs.readdirSync(toProjectPath(directory));
  if (entries.length === 0) {
    return true;
  }

  const ownMetaName = `${Path.basename(directory)}.meta`;
  return entries.every((name) => name === ownMetaName);
}

module.exports = {
  PROTECTED_CLEANUP_DIRECTORIES,
  normalizeScanDirectory,
  scanAssets,
  matchesScanFilters,
  isReportEmptyDirectory,
};
