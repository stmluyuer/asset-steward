"use strict";

const Fs = require("fs");
const Path = require("path");
const {
  normalizeRelativePath,
  toProjectPath,
  isStrictlyInside,
  comparePath,
  walk,
  toRelativePath,
} = require("./path-utils");
const { loadProfile, sanitizeRules } = require("./profile");
const AssetScan = require("./asset-scan");
const ReferenceGraph = require("./reference-graph");
const MovePlan = require("./move-plan");
const UnusedDelete = require("./unused-delete");

const MATERIAL_EXTENSIONS = new Set([".material", ".mtl", ".pmtl"]);

function reportPackageSize(payload) {
  const scanDirectory = AssetScan.normalizeScanDirectory(payload?.directory || payload?.scanDirectory);
  const scene = ReferenceGraph.normalizeScenePath(payload?.scene);
  const includeMeta = payload?.includeMeta === true;
  const topN = normalizeTopN(payload?.topN);
  const files = [];
  const directoryStats = new Map();
  const typeStats = new Map();
  let excludedMetaCount = 0;
  let excludedMetaSize = 0;

  walk(toProjectPath(scanDirectory), (fullPath, entry) => {
    if (!entry.isFile()) {
      return;
    }
    const path = toRelativePath(fullPath);
    const size = Fs.statSync(fullPath).size;
    if (!includeMeta && path.toLowerCase().endsWith(".meta")) {
      excludedMetaCount++;
      excludedMetaSize += size;
      return;
    }

    const extension = Path.extname(path).toLowerCase() || "(无扩展名)";
    const file = { path, extension, size };
    files.push(file);
    addSizeStat(typeStats, extension, size);

    let directory = normalizeRelativePath(Path.dirname(path));
    while (directory && directory !== "." && directory !== scanDirectory && isStrictlyInside(scanDirectory, directory)) {
      addSizeStat(directoryStats, directory, size);
      directory = normalizeRelativePath(Path.dirname(directory));
    }
  });

  const directoryRanking = [...directoryStats.entries()]
    .map(([path, stat]) => ({ path, count: stat.count, totalSize: stat.totalSize }))
    .sort(sortSizeRanking);
  const typeRanking = [...typeStats.entries()]
    .map(([extension, stat]) => ({ extension, count: stat.count, totalSize: stat.totalSize }))
    .sort(sortSizeRanking);
  const topFiles = files.slice()
    .sort((left, right) => right.size - left.size || comparePath(left.path, right.path))
    .slice(0, topN);
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const reachableReport = buildReachableSizeReport(scene, scanDirectory, topN);
  return {
    directoryRanking,
    typeRanking,
    topFiles,
    referencedTopFiles: reachableReport.topFiles,
    summary: {
      scanDirectory,
      scene,
      includeMeta,
      topN,
      fileCount: files.length,
      totalSize,
      directoryCount: directoryRanking.length,
      typeCount: typeRanking.length,
      excludedMetaCount,
      excludedMetaSize,
      referencedFileCount: reachableReport.fileCount,
      referencedTotalSize: reachableReport.totalSize,
      unresolvedReferenceCount: reachableReport.unresolvedReferenceCount
    },
    warning: "主场景引用排行只依据序列化 UUID 依赖链；resources.load/loadDir 即使可静态识别也不计入。统计值为项目源资源磁盘体积，不等同于构建后包体。"
  };
}

function buildReachableSizeReport(scene, scanDirectory, topN) {
  const graph = ReferenceGraph.buildSerializedAssetGraph();
  const sceneAsset = graph.byPath.get(scene);
  if (!sceneAsset) {
    throw new Error(`主场景没有有效 UUID：${scene}`);
  }
  const reachable = ReferenceGraph.collectReachableAssetChains(sceneAsset, graph.byUuid);
  const files = [];
  let totalSize = 0;
  for (const asset of graph.assets) {
    if (asset.path === scene || !ReferenceGraph.isPathInDirectory(asset.path, scanDirectory) || !reachable.chains.has(asset.path)) {
      continue;
    }
    totalSize += asset.size;
    files.push({
      path: asset.path,
      extension: asset.extension,
      size: asset.size,
      chain: reachable.chains.get(asset.path)
    });
  }
  files.sort((left, right) => right.size - left.size || comparePath(left.path, right.path));
  return {
    fileCount: files.length,
    totalSize,
    topFiles: files.slice(0, topN),
    unresolvedReferenceCount: graph.unresolvedReferenceCount
  };
}

function normalizeTopN(value) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) {
    return 20;
  }
  return Math.min(200, Math.max(1, number));
}

function addSizeStat(stats, key, size) {
  const stat = stats.get(key) || { count: 0, totalSize: 0 };
  stat.count++;
  stat.totalSize += size;
  stats.set(key, stat);
}

function sortSizeRanking(left, right) {
  return right.totalSize - left.totalSize || right.count - left.count || comparePath(left.path || left.extension, right.path || right.extension);
}

function checkDirectoryConvention(payload) {
  const scanDirectory = AssetScan.normalizeScanDirectory(payload?.directory || payload?.scanDirectory || "assets/res");
  const cleanRules = sanitizeRules(payload?.rules || loadProfile().rules).filter((rule) => rule.enabled);
  for (const rule of cleanRules) {
    MovePlan.validateRuleTarget(rule.target);
  }

  const mismatches = [];
  let fileCount = 0;
  let matchedCount = 0;
  let compliantCount = 0;
  let unmatchedCount = 0;
  let missingMetaCount = 0;
  for (const entry of AssetScan.scanAssets({ directory: scanDirectory }).entries) {
    if (entry.kind !== "file") {
      continue;
    }
    fileCount++;
    const rule = cleanRules.find((item) => MovePlan.ruleMatchesSource(item, entry.path, Path.extname(entry.path).toLowerCase()));
    if (!rule) {
      unmatchedCount++;
      continue;
    }
    matchedCount++;
    const currentDirectory = normalizeRelativePath(Path.posix.dirname(entry.path));
    if (currentDirectory === rule.target) {
      compliantCount++;
      continue;
    }
    if (entry.missingMeta) {
      missingMetaCount++;
    }
    mismatches.push({
      path: entry.path,
      extension: entry.extension,
      size: entry.size,
      missingMeta: entry.missingMeta,
      currentDirectory,
      suggestedDirectory: rule.target,
      suggestedPath: normalizeRelativePath(`${rule.target}/${Path.basename(entry.path)}`),
      ruleId: rule.id
    });
  }
  mismatches.sort((left, right) => comparePath(left.suggestedDirectory, right.suggestedDirectory) || comparePath(left.path, right.path));
  return {
    mismatches,
    summary: {
      scanDirectory,
      fileCount,
      ruleCount: cleanRules.length,
      matchedCount,
      compliantCount,
      mismatchCount: mismatches.length,
      unmatchedCount,
      missingMetaCount
    },
    warning: "目录规范检查只依据当前自动分类规则的首个命中项。生成移动预览后仍需复核冲突、重命名、覆盖和缺少 meta 等风险。"
  };
}

function checkDuplicateAssets(payload) {
  const scanDirectory = AssetScan.normalizeScanDirectory(payload?.directory || payload?.scanDirectory || "assets/res");
  const files = [];
  walk(toProjectPath(scanDirectory), (fullPath, entry) => {
    if (!entry.isFile() || fullPath.toLowerCase().endsWith(".meta")) {
      return;
    }
    const path = toRelativePath(fullPath);
    if (UnusedDelete.UNUSED_IGNORED_FILES.has(Path.basename(path).toLowerCase())) {
      return;
    }
    const stat = Fs.statSync(fullPath);
    files.push({
      path,
      fullPath,
      name: Path.basename(path),
      extension: Path.extname(path).toLowerCase() || "(无扩展名)",
      size: stat.size
    });
  });

  const sameNameGroups = buildDuplicateGroups(
    files,
    (file) => file.name.toLowerCase(),
    (key, members) => ({
      key,
      name: members[0].name,
      members: toPublicDuplicateMembers(members)
    })
  );

  const sizeBuckets = groupItems(files, (file) => String(file.size));
  const hashCandidates = [...sizeBuckets.values()].filter((members) => members.length > 1).flat();
  for (const file of hashCandidates) {
    file.hash = UnusedDelete.hashFileSha256(file.fullPath);
  }
  const duplicateHashGroups = buildDuplicateGroups(
    hashCandidates,
    (file) => file.hash,
    (key, members) => ({
      key,
      hash: key,
      size: members[0].size,
      duplicateBytes: members[0].size * (members.length - 1),
      members: toPublicDuplicateMembers(members)
    })
  );
  const duplicateHashFileCount = duplicateHashGroups.reduce((total, group) => total + group.members.length, 0);
  const sameNameFileCount = sameNameGroups.reduce((total, group) => total + group.members.length, 0);
  const duplicateBytes = duplicateHashGroups.reduce((total, group) => total + group.duplicateBytes, 0);
  return {
    sameNameGroups,
    duplicateHashGroups,
    summary: {
      scanDirectory,
      fileCount: files.length,
      hashCandidateCount: hashCandidates.length,
      sameNameGroupCount: sameNameGroups.length,
      sameNameFileCount,
      duplicateHashGroupCount: duplicateHashGroups.length,
      duplicateHashFileCount,
      duplicateBytes
    },
    warning: "同名和相同 hash 仅表示需要人工复核，不代表资源可以删除。删除或替换前必须结合 UUID 引用、动态加载和玩法需求确认。"
  };
}

function groupItems(items, getKey) {
  const groups = new Map();
  for (const item of items) {
    const key = getKey(item);
    const members = groups.get(key) || [];
    members.push(item);
    groups.set(key, members);
  }
  return groups;
}

function buildDuplicateGroups(items, getKey, createGroup) {
  return [...groupItems(items, getKey).entries()]
    .filter(([, members]) => members.length > 1)
    .map(([key, members]) => createGroup(key, [...members].sort((left, right) => comparePath(left.path, right.path))))
    .sort((left, right) => right.members.length - left.members.length || comparePath(left.key, right.key));
}

function toPublicDuplicateMembers(members) {
  return members.map((file) => ({
    path: file.path,
    name: file.name,
    extension: file.extension,
    size: file.size
  }));
}

function checkMaterialTextures(payload) {
  const scene = ReferenceGraph.normalizeScenePath(payload?.scene);
  const scanDirectory = AssetScan.normalizeScanDirectory(payload?.directory || payload?.scanDirectory || "assets/res");
  const graph = ReferenceGraph.buildSerializedAssetGraph();
  const sceneAsset = graph.byPath.get(scene);
  if (!sceneAsset) {
    throw new Error(`主场景没有有效 UUID：${scene}`);
  }
  const reachable = ReferenceGraph.collectReachableAssetChains(sceneAsset, graph.byUuid).chains;
  const references = [];
  let materialCount = 0;
  let reachableMaterialCount = 0;
  let noTextureMaterialCount = 0;
  let invalidMaterialCount = 0;
  let resolvedReferenceCount = 0;
  let reviewReferenceCount = 0;

  walk(toProjectPath(scanDirectory), (fullPath, entry) => {
    if (!entry.isFile()) {
      return;
    }
    const materialPath = toRelativePath(fullPath);
    const materialExtension = Path.extname(materialPath).toLowerCase();
    if (!MATERIAL_EXTENSIONS.has(materialExtension)) {
      return;
    }
    materialCount++;
    const materialReachable = reachable.has(materialPath);
    if (materialReachable) {
      reachableMaterialCount++;
    }
    let material;
    try {
      material = JSON.parse(ReferenceGraph.readUtf8Text(fullPath));
    } catch (_error) {
      invalidMaterialCount++;
      references.push({
        materialPath,
        materialExtension,
        materialReachable,
        propertyPath: "-",
        uuid: "-",
        expectedType: "-",
        status: "invalid-material",
        texturePath: null
      });
      return;
    }
    const textureReferences = collectMaterialTextureReferences(material);
    if (textureReferences.length === 0) {
      noTextureMaterialCount++;
      return;
    }
    for (const reference of textureReferences) {
      const texture = graph.byUuid.get(reference.uuid);
      const status = texture ? "resolved" : "review";
      if (texture) {
        resolvedReferenceCount++;
      } else {
        reviewReferenceCount++;
      }
      references.push({
        materialPath,
        materialExtension,
        materialReachable,
        propertyPath: reference.propertyPath,
        uuid: reference.uuid,
        expectedType: reference.expectedType,
        status,
        texturePath: texture?.path || null
      });
    }
  });

  references.sort((left, right) => {
    const statusOrder = { "invalid-material": 0, review: 1, resolved: 2 };
    return (statusOrder[left.status] ?? 9) - (statusOrder[right.status] ?? 9)
      || comparePath(left.materialPath, right.materialPath)
      || comparePath(left.propertyPath, right.propertyPath)
      || comparePath(left.uuid, right.uuid);
  });
  return {
    references,
    materialExtensions: [...MATERIAL_EXTENSIONS].sort(comparePath),
    summary: {
      scene,
      scanDirectory,
      materialCount,
      reachableMaterialCount,
      unreachableMaterialCount: materialCount - reachableMaterialCount,
      textureReferenceCount: resolvedReferenceCount + reviewReferenceCount,
      resolvedReferenceCount,
      reviewReferenceCount,
      noTextureMaterialCount,
      invalidMaterialCount
    },
    warning: "无法在项目资源 UUID 图中解析的贴图引用统一标记为“待复核”，可能是引擎内置资源；检查只报告和定位，不自动修复材质。"
  };
}

function collectMaterialTextureReferences(material) {
  const references = [];
  collectMaterialTextureReferenceNodes(material, "", references);
  return references;
}

function collectMaterialTextureReferenceNodes(node, propertyPath, references) {
  if (!node || typeof node !== "object") {
    return;
  }
  if (
    typeof node.__uuid__ === "string"
    && typeof node.__expectedType__ === "string"
    && /(?:texture|spriteframe)/i.test(node.__expectedType__)
  ) {
    references.push({
      propertyPath: propertyPath || "(根节点)",
      uuid: node.__uuid__.toLowerCase(),
      expectedType: node.__expectedType__
    });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectMaterialTextureReferenceNodes(item, `${propertyPath}[${index}]`, references));
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    collectMaterialTextureReferenceNodes(value, propertyPath ? `${propertyPath}.${key}` : key, references);
  }
}

function checkScenePrefabReferenceHealth(payload) {
  const scanDirectory = AssetScan.normalizeScanDirectory(payload?.directory || payload?.scanDirectory || "assets");
  const extensions = ReferenceGraph.normalizeReferenceExtensions(payload?.extensions || ".scene,.prefab")
    .filter((extension) => extension === ".scene" || extension === ".prefab");
  if (extensions.length === 0) {
    throw new Error("文件类型至少需要包含 .scene 或 .prefab。");
  }
  const whitelist = ReferenceGraph.normalizeUuidWhitelist(payload?.whitelist);
  const graph = ReferenceGraph.buildSerializedAssetGraph();
  const issues = [];
  const unresolvedUuids = new Set();
  const affectedFiles = new Set();
  let scannedFileCount = 0;
  let referenceCount = 0;
  let resolvedReferenceCount = 0;
  let whitelistReferenceCount = 0;
  let unresolvedReferenceCount = 0;

  walk(toProjectPath(scanDirectory), (fullPath, entry) => {
    if (!entry.isFile()) {
      return;
    }
    const filePath = toRelativePath(fullPath);
    const extension = Path.extname(filePath).toLowerCase();
    if (!extensions.includes(extension)) {
      return;
    }
    scannedFileCount++;
    const counts = ReferenceGraph.countGraphUuidOccurrences(ReferenceGraph.readUtf8Text(fullPath));
    const fileAsset = graph.byPath.get(filePath);
    for (const [uuid, matchCount] of counts) {
      referenceCount += matchCount;
      if (fileAsset?.ownedUuids.has(uuid) || graph.byUuid.has(uuid)) {
        resolvedReferenceCount += matchCount;
        continue;
      }
      if (whitelist.has(uuid)) {
        whitelistReferenceCount += matchCount;
        continue;
      }
      unresolvedReferenceCount += matchCount;
      unresolvedUuids.add(uuid);
      affectedFiles.add(filePath);
      issues.push({
        filePath,
        extension,
        uuid,
        matchCount,
        status: "review"
      });
    }
  });
  issues.sort((left, right) => right.matchCount - left.matchCount || comparePath(left.filePath, right.filePath) || comparePath(left.uuid, right.uuid));
  return {
    issues,
    whitelist: [...whitelist].sort(comparePath),
    extensions,
    summary: {
      scanDirectory,
      scannedFileCount,
      referenceCount,
      resolvedReferenceCount,
      whitelistReferenceCount,
      unresolvedReferenceCount,
      unresolvedUuidCount: unresolvedUuids.size,
      affectedFileCount: affectedFiles.size
    },
    warning: "无法解析 UUID 统一标记为“待复核”，不直接判定资源丢失。部分引擎内置资源可在确认后加入白名单；检查只报告和定位，不自动修复场景或 Prefab。"
  };
}

module.exports = {
  MATERIAL_EXTENSIONS,
  reportPackageSize,
  buildReachableSizeReport,
  normalizeTopN,
  addSizeStat,
  sortSizeRanking,
  checkDirectoryConvention,
  checkDuplicateAssets,
  groupItems,
  buildDuplicateGroups,
  toPublicDuplicateMembers,
  checkMaterialTextures,
  collectMaterialTextureReferences,
  collectMaterialTextureReferenceNodes,
  checkScenePrefabReferenceHealth,
};
