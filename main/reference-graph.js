"use strict";

const Fs = require("fs");
const Path = require("path");
const {
  normalizeRelativePath,
  toProjectPath,
  isInsideAssets,
  isStrictlyInside,
  comparePath,
  walk,
  toRelativePath,
  statPath,
  pathExists,
  hasMeta,
} = require("./path-utils");
const { normalizeExtensions } = require("./profile");
const { normalizeScanDirectory } = require("./asset-scan");

const DEFAULT_REFERENCE_EXTENSIONS = [".scene", ".prefab", ".mtl", ".material", ".anim", ".effect"];
const DEFAULT_NODE_REFERENCE_EXTENSIONS = [".scene", ".prefab"];
const DEFAULT_CODE_SCAN_DIRECTORIES = ["assets/script", "assets/scripts"];
const CODE_EXTENSIONS = new Set([".ts", ".js"]);
const GRAPH_UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:@[0-9a-z_-]+)?/gi;
const GRAPH_TEXT_EXTENSIONS = new Set([
  ".anim",
  ".animgraph",
  ".chunk",
  ".effect",
  ".json",
  ".material",
  ".mtl",
  ".pmtl",
  ".prefab",
  ".scene",
  ".txt"
]);

let scriptTypeNameCache = null;

function clearScriptTypeNameCache() {
  scriptTypeNameCache = null;
}

function normalizeReferenceExtensions(value) {
  const extensions = normalizeExtensions(value);
  return extensions.length > 0 ? extensions : DEFAULT_REFERENCE_EXTENSIONS;
}

function checkReferences(payload) {
  const targetPaths = normalizeReferenceTargets(payload?.paths || payload?.path || payload?.targetPath);
  const scanDirectory = normalizeScanDirectory(payload?.directory || payload?.scanDirectory);
  const referenceExtensions = normalizeReferenceExtensions(payload?.extensions || payload?.referenceExtensions);
  const targetItems = targetPaths.map((path) => collectTargetUuids(path));
  const uuidToTargets = new Map();

  for (const target of targetItems) {
    for (const uuid of target.uuids) {
      const targets = uuidToTargets.get(uuid) || [];
      targets.push(target.path);
      uuidToTargets.set(uuid, targets);
    }
  }

  const references = [];
  let scannedFileCount = 0;
  let totalMatchCount = 0;
  walk(toProjectPath(scanDirectory), (fullPath, entry) => {
    if (!entry.isFile()) {
      return;
    }

    const relative = toRelativePath(fullPath);
    const extension = Path.extname(relative).toLowerCase();
    if (!referenceExtensions.includes(extension)) {
      return;
    }

    scannedFileCount++;
    const text = Fs.readFileSync(fullPath, "utf8");
    const matchedUuids = [];
    let matchCount = 0;
    for (const uuid of uuidToTargets.keys()) {
      const count = countTextOccurrences(text, uuid);
      if (count > 0) {
        matchedUuids.push(uuid);
        matchCount += count;
      }
    }
    if (matchCount > 0) {
      const details = collectSerializedReferenceDetails(text, extension, uuidToTargets);
      references.push({
        path: relative,
        extension,
        matchCount,
        matchedUuids,
        targetPaths: [...new Set(matchedUuids.flatMap((uuid) => uuidToTargets.get(uuid) || []))].sort(comparePath),
        details
      });
      totalMatchCount += matchCount;
    }
  });

  references.sort((left, right) => right.matchCount - left.matchCount || comparePath(left.path, right.path));
  const referencePositionCount = references.reduce((sum, item) => sum + item.details.length, 0);
  const selectablePositionCount = references.reduce(
    (sum, item) => sum + item.details.filter((detail) => detail.selectable).length,
    0
  );
  const uuidCount = targetItems.reduce((sum, item) => sum + item.uuidCount, 0);
  return {
    targets: targetItems,
    references,
    summary: {
      scanDirectory,
      targetCount: targetItems.length,
      uuidCount,
      scannedFileCount,
      referenceFileCount: references.length,
      totalMatchCount,
      referencePositionCount,
      selectablePositionCount,
      referenceExtensions
    },
    warning: references.length === 0
      ? "未找到静态 UUID 引用。此结果不能证明资源可删除，仍需结合动态加载和人工复核。"
      : "已找到静态 UUID 引用。删除、覆盖或移动前请复核引用方。"
  };
}

function collectSerializedReferenceDetails(text, extension, uuidToTargets) {
  if (extension !== ".scene" && extension !== ".prefab") {
    return [];
  }

  let objects;
  try {
    objects = JSON.parse(text);
  } catch (_error) {
    return [];
  }
  if (!Array.isArray(objects)) {
    return [];
  }

  const nodes = new Map();
  const objectToNode = new Map();
  objects.forEach((object, index) => {
    if (object?.__type__ !== "cc.Node") {
      return;
    }
    nodes.set(index, object);
    for (const component of object._components || []) {
      if (Number.isInteger(component?.__id__)) {
        objectToNode.set(component.__id__, index);
      }
    }
    if (Number.isInteger(object._prefab?.__id__)) {
      objectToNode.set(object._prefab.__id__, index);
    }
  });

  const nodePathCache = new Map();
  const details = [];
  objects.forEach((object, objectIndex) => {
    if (!object || typeof object !== "object") {
      return;
    }
    const nodeIndex = resolveReferenceNodeIndex(object, objectIndex, nodes, objectToNode);
    const node = nodes.get(nodeIndex);
    const nodePath = node ? buildSerializedNodePath(nodeIndex, nodes, nodePathCache, new Set()) : "";
    walkSerializedReferenceValues(object, "", (uuid, fieldPath) => {
      const targetPaths = uuidToTargets.get(uuid);
      if (!targetPaths) {
        return;
      }
      details.push({
        matchedUuid: uuid,
        targetPaths: [...targetPaths].sort(comparePath),
        objectIndex,
        fieldPath: normalizeReferenceFieldPath(fieldPath, object),
        componentType: resolveSerializedTypeName(object.__type__),
        componentTypeId: object.__type__ || "",
        nodeName: node?._name || "",
        nodePath,
        nodeUuid: typeof node?._id === "string" ? node._id : "",
        selectable: Boolean(node?._id)
      });
    });
  });

  return details.sort((left, right) =>
    comparePath(left.nodePath, right.nodePath)
    || comparePath(left.componentType, right.componentType)
    || comparePath(left.fieldPath, right.fieldPath)
    || comparePath(left.matchedUuid, right.matchedUuid)
  );
}

function checkNodeReferences(payload) {
  const nodeUuid = normalizeNodeReferenceUuid(payload?.nodeUuid || payload?.uuid);
  const scanDirectory = normalizeScanDirectory(payload?.directory || payload?.scanDirectory || "assets");
  const referenceExtensions = normalizeNodeReferenceExtensions(payload?.extensions || payload?.referenceExtensions);
  const references = [];
  const targetNodes = [];
  let scannedFileCount = 0;

  walk(toProjectPath(scanDirectory), (fullPath, entry) => {
    if (!entry.isFile()) {
      return;
    }

    const relative = toRelativePath(fullPath);
    const extension = Path.extname(relative).toLowerCase();
    if (!referenceExtensions.includes(extension)) {
      return;
    }

    scannedFileCount++;
    const text = Fs.readFileSync(fullPath, "utf8");
    const result = collectSerializedNodeReferenceDetails(text, extension, nodeUuid);
    if (result.targets.length > 0) {
      targetNodes.push(...result.targets.map((target) => ({ ...target, filePath: relative, extension })));
    }
    if (result.references.length > 0) {
      references.push({
        path: relative,
        extension,
        referenceCount: result.references.length,
        references: result.references
      });
    }
  });

  references.sort((left, right) => right.referenceCount - left.referenceCount || comparePath(left.path, right.path));
  const referencePositionCount = references.reduce((sum, item) => sum + item.referenceCount, 0);
  const selectablePositionCount = references.reduce(
    (sum, item) => sum + item.references.filter((detail) => detail.selectable).length,
    0
  );
  return {
    nodeUuid,
    targetNodes: targetNodes.sort((left, right) => comparePath(left.filePath, right.filePath) || comparePath(left.nodePath, right.nodePath)),
    references,
    summary: {
      scanDirectory,
      nodeUuid,
      scannedFileCount,
      targetFileCount: new Set(targetNodes.map((target) => target.filePath)).size,
      targetNodeCount: targetNodes.length,
      referenceFileCount: references.length,
      referencePositionCount,
      selectablePositionCount,
      referenceExtensions
    },
    warning: targetNodes.length === 0
      ? "扫描范围内没有找到该节点 ID。请确认已保存场景/Prefab，或缩小到正确的资源目录后重试。"
      : referencePositionCount === 0
        ? "已找到目标节点，但没有发现组件属性引用它。"
        : "已找到引用目标节点的组件。请打开对应场景或 Prefab 后按节点路径复核。"
  };
}

function collectSerializedNodeReferenceDetails(text, extension, nodeUuid) {
  if (extension !== ".scene" && extension !== ".prefab") {
    return { targets: [], references: [] };
  }

  let objects;
  try {
    objects = JSON.parse(text);
  } catch (_error) {
    return { targets: [], references: [] };
  }
  if (!Array.isArray(objects)) {
    return { targets: [], references: [] };
  }

  const nodes = new Map();
  const objectToNode = new Map();
  objects.forEach((object, index) => {
    if (object?.__type__ !== "cc.Node") {
      return;
    }
    nodes.set(index, object);
    for (const component of object._components || []) {
      if (Number.isInteger(component?.__id__)) {
        objectToNode.set(component.__id__, index);
      }
    }
    if (Number.isInteger(object._prefab?.__id__)) {
      objectToNode.set(object._prefab.__id__, index);
    }
  });

  const nodePathCache = new Map();
  const targetNodeIndexes = new Set();
  const targets = [];
  for (const [nodeIndex, node] of nodes) {
    if (String(node?._id || "") !== nodeUuid) {
      continue;
    }
    targetNodeIndexes.add(nodeIndex);
    targets.push({
      objectIndex: nodeIndex,
      nodeName: node._name || "",
      nodePath: buildSerializedNodePath(nodeIndex, nodes, nodePathCache, new Set()),
      nodeUuid: node._id || "",
      selectable: Boolean(node._id)
    });
  }

  if (targetNodeIndexes.size === 0) {
    return { targets, references: [] };
  }

  const references = [];
  objects.forEach((object, objectIndex) => {
    if (!isSerializedComponentLikeObject(object)) {
      return;
    }

    const ownerNodeIndex = resolveReferenceNodeIndex(object, objectIndex, nodes, objectToNode);
    const ownerNode = nodes.get(ownerNodeIndex);
    const ownerNodePath = ownerNode ? buildSerializedNodePath(ownerNodeIndex, nodes, nodePathCache, new Set()) : "";
    walkSerializedIdReferenceValues(object, "", (targetIndex, fieldPath) => {
      if (!targetNodeIndexes.has(targetIndex) || isComponentOwnerNodeField(fieldPath)) {
        return;
      }
      const targetNode = nodes.get(targetIndex);
      references.push({
        targetObjectIndex: targetIndex,
        targetNodeName: targetNode?._name || "",
        targetNodePath: targetNode ? buildSerializedNodePath(targetIndex, nodes, nodePathCache, new Set()) : "",
        targetNodeUuid: targetNode?._id || "",
        objectIndex,
        fieldPath: normalizeNodeReferenceFieldPath(fieldPath, object),
        componentType: resolveSerializedTypeName(object.__type__),
        componentTypeId: object.__type__ || "",
        nodeName: ownerNode?._name || "",
        nodePath: ownerNodePath,
        nodeUuid: typeof ownerNode?._id === "string" ? ownerNode._id : "",
        selectable: Boolean(ownerNode?._id)
      });
    });
  });

  references.sort((left, right) =>
    comparePath(left.nodePath, right.nodePath)
    || comparePath(left.componentType, right.componentType)
    || comparePath(left.fieldPath, right.fieldPath)
    || comparePath(left.targetNodePath, right.targetNodePath)
  );
  return { targets, references };
}

function isSerializedComponentLikeObject(object) {
  return Boolean(
    object
    && typeof object === "object"
    && typeof object.__type__ === "string"
    && object.__type__ !== "cc.Node"
    && (Number.isInteger(object._node?.__id__) || Number.isInteger(object.node?.__id__))
  );
}

function walkSerializedIdReferenceValues(value, path, onId) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (!Array.isArray(value) && Number.isInteger(value.__id__)) {
    onId(value.__id__, path ? `${path}.__id__` : "__id__");
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkSerializedIdReferenceValues(item, `${path}[${index}]`, onId));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "__id__") {
      continue;
    }
    walkSerializedIdReferenceValues(child, path ? `${path}.${key}` : key, onId);
  }
}

function isComponentOwnerNodeField(fieldPath) {
  return fieldPath === "_node.__id__" || fieldPath === "node.__id__";
}

function normalizeNodeReferenceFieldPath(path, object) {
  return normalizeReferenceFieldPath(String(path || "").replace(/\.__id__$/, ""), object);
}

function normalizeNodeReferenceUuid(value) {
  let nodeUuid = String(value || "").trim();
  if (!nodeUuid && typeof Editor !== "undefined") {
    const selected = Editor.Selection?.getSelected?.("node") || [];
    nodeUuid = String(selected[0] || "").trim();
  }
  if (!nodeUuid) {
    throw new Error("请先在场景中选中节点，或手动输入目标节点 ID。");
  }
  return nodeUuid;
}

function normalizeNodeReferenceExtensions(value) {
  const extensions = normalizeReferenceExtensions(value || DEFAULT_NODE_REFERENCE_EXTENSIONS.join(","))
    .filter((extension) => DEFAULT_NODE_REFERENCE_EXTENSIONS.includes(extension));
  if (extensions.length === 0) {
    throw new Error("节点引用检查只支持 .scene 和 .prefab。");
  }
  return extensions;
}

function walkSerializedReferenceValues(value, path, onUuid) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (!Array.isArray(value) && typeof value.__uuid__ === "string") {
    onUuid(value.__uuid__, path ? `${path}.__uuid__` : "__uuid__");
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkSerializedReferenceValues(item, `${path}[${index}]`, onUuid));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "__uuid__") {
      continue;
    }
    walkSerializedReferenceValues(child, path ? `${path}.${key}` : key, onUuid);
  }
}

function normalizeReferenceFieldPath(path, object) {
  if (object?.__type__ === "CCPropertyOverrideInfo" && path.startsWith("value") && Array.isArray(object.propertyPath)) {
    return object.propertyPath.reduce((result, segment) => {
      const value = String(segment);
      return /^\d+$/.test(value) ? `${result}[${value}]` : result ? `${result}.${value}` : value;
    }, "") || "value";
  }
  return String(path || "").replace(/\.__uuid__$/, "").replace(/^__uuid__$/, "(对象引用)");
}

function resolveSerializedTypeName(type) {
  const value = String(type || "");
  if (!value || value.startsWith("cc.") || typeof Editor === "undefined") {
    return value || "未知序列化对象";
  }
  try {
    const uuid = Editor.Utils.UUID.decompressUUID(value).toLowerCase();
    return getScriptTypeNames().get(uuid) || value;
  } catch (_error) {
    return value;
  }
}

function getScriptTypeNames() {
  if (scriptTypeNameCache) {
    return scriptTypeNameCache;
  }
  scriptTypeNameCache = new Map();
  for (const directory of DEFAULT_CODE_SCAN_DIRECTORIES) {
    if (!statPath(directory)?.isDirectory()) {
      continue;
    }
    walk(toProjectPath(directory), (fullPath, entry) => {
      if (!entry.isFile() || !CODE_EXTENSIONS.has(Path.extname(fullPath).toLowerCase())) {
        return;
      }
      const relative = toRelativePath(fullPath);
      const metaPath = `${relative}.meta`;
      if (!pathExists(metaPath)) {
        return;
      }
      const uuids = extractUuids(Fs.readFileSync(toProjectPath(metaPath), "utf8"));
      const typeName = Path.basename(relative, Path.extname(relative));
      for (const uuid of uuids) {
        scriptTypeNameCache.set(uuid.toLowerCase(), typeName);
      }
    });
  }
  return scriptTypeNameCache;
}

function resolveReferenceNodeIndex(object, objectIndex, nodes, objectToNode) {
  if (nodes.has(objectIndex)) {
    return objectIndex;
  }
  for (const key of ["_node", "node"]) {
    if (Number.isInteger(object?.[key]?.__id__) && nodes.has(object[key].__id__)) {
      return object[key].__id__;
    }
  }
  return objectToNode.get(objectIndex);
}

function buildSerializedNodePath(nodeIndex, nodes, cache, visiting) {
  if (cache.has(nodeIndex)) {
    return cache.get(nodeIndex);
  }
  if (visiting.has(nodeIndex)) {
    return nodes.get(nodeIndex)?._name || `节点#${nodeIndex}`;
  }
  visiting.add(nodeIndex);
  const node = nodes.get(nodeIndex);
  const name = node?._name || `节点#${nodeIndex}`;
  const parentIndex = node?._parent?.__id__;
  const path = Number.isInteger(parentIndex) && nodes.has(parentIndex)
    ? `${buildSerializedNodePath(parentIndex, nodes, cache, visiting)}/${name}`
    : name;
  visiting.delete(nodeIndex);
  cache.set(nodeIndex, path);
  return path;
}

function normalizeReferenceTargets(value) {
  const rawValues = Array.isArray(value) ? value : String(value || "").split(/[\n,;]/);
  const paths = [...new Set(rawValues.map(normalizeRelativePath).filter(Boolean))];
  if (paths.length === 0) {
    throw new Error("请先输入要检查的资源路径。");
  }

  for (const path of paths) {
    if (!isInsideAssets(path)) {
      throw new Error(`被检查资源必须位于 assets 下：${path}`);
    }
    if (path.toLowerCase().endsWith(".meta")) {
      throw new Error(`请输入资源路径，不要直接输入 .meta：${path}`);
    }
    if (!pathExists(path)) {
      throw new Error(`被检查资源不存在：${path}`);
    }
    if (!hasMeta(path)) {
      throw new Error(`被检查资源缺少 .meta，无法读取 UUID：${path}`);
    }
  }
  return paths.sort(comparePath);
}

function collectTargetUuids(path) {
  const metaPath = `${path}.meta`;
  const metaText = Fs.readFileSync(toProjectPath(metaPath), "utf8");
  const uuids = extractUuids(metaText);
  if (uuids.length === 0) {
    throw new Error(`资源 meta 中未找到 UUID：${metaPath}`);
  }

  return {
    path,
    metaPath,
    uuids,
    uuidCount: uuids.length
  };
}

function extractUuids(text) {
  const matches = String(text || "").match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
  return [...new Set(matches.map((uuid) => uuid.toLowerCase()))].sort(comparePath);
}

function countTextOccurrences(text, needle) {
  if (!needle) {
    return 0;
  }

  let count = 0;
  let index = 0;
  const lowerText = String(text || "").toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  while ((index = lowerText.indexOf(lowerNeedle, index)) >= 0) {
    count++;
    index += lowerNeedle.length;
  }
  return count;
}

function normalizeScenePath(value) {
  const scene = normalizeRelativePath(value || "assets/scene/main.scene");
  if (!isInsideAssets(scene) || Path.extname(scene).toLowerCase() !== ".scene" || !statPath(scene)?.isFile()) {
    throw new Error(`主场景必须是 assets 下存在的 .scene 文件：${scene}`);
  }
  if (!hasMeta(scene)) {
    throw new Error(`主场景缺少 .meta，无法构建依赖图：${scene}`);
  }
  return scene;
}

function buildSerializedAssetGraph() {
  const assets = [];
  const byPath = new Map();
  const byUuid = new Map();
  walk(toProjectPath("assets"), (fullPath, entry) => {
    if (!entry.isFile() || !fullPath.toLowerCase().endsWith(".meta")) {
      return;
    }
    const assetFullPath = fullPath.slice(0, -".meta".length);
    const assetStat = Fs.statSync(assetFullPath, { throwIfNoEntry: false });
    if (!assetStat?.isFile()) {
      return;
    }
    const path = toRelativePath(assetFullPath);
    const metaText = readUtf8Text(fullPath);
    const ownedUuids = collectOwnedGraphUuids(parseJsonObject(metaText));
    if (ownedUuids.size === 0) {
      return;
    }
    const dependencies = extractGraphUuids(metaText);
    if (GRAPH_TEXT_EXTENSIONS.has(Path.extname(path).toLowerCase())) {
      for (const uuid of extractGraphUuids(readUtf8Text(assetFullPath))) {
        dependencies.add(uuid);
      }
    }
    const asset = {
      path,
      extension: Path.extname(path).toLowerCase() || "(无扩展名)",
      size: assetStat.size,
      ownedUuids,
      dependencies
    };
    assets.push(asset);
    byPath.set(path, asset);
    for (const uuid of ownedUuids) {
      byUuid.set(uuid, asset);
    }
  });

  let unresolvedReferenceCount = 0;
  for (const asset of assets) {
    for (const uuid of asset.dependencies) {
      if (!asset.ownedUuids.has(uuid) && !byUuid.has(uuid)) {
        unresolvedReferenceCount++;
      }
    }
  }
  return { assets, byPath, byUuid, unresolvedReferenceCount };
}

function collectReachableAssetChains(rootAsset, byUuid) {
  const chains = new Map([[rootAsset.path, [rootAsset.path]]]);
  const pending = [rootAsset];
  while (pending.length > 0) {
    const asset = pending.shift();
    const parentChain = chains.get(asset.path);
    for (const uuid of asset.dependencies) {
      const dependency = byUuid.get(uuid);
      if (!dependency || chains.has(dependency.path)) {
        continue;
      }
      chains.set(dependency.path, [...parentChain, dependency.path]);
      pending.push(dependency);
    }
  }
  return { chains };
}

function readUtf8Text(filePath) {
  return Fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return {};
  }
}

function collectOwnedGraphUuids(meta) {
  const result = new Set();
  collectGraphMetaNodeUuids(meta, result);
  return result;
}

function collectGraphMetaNodeUuids(node, result) {
  if (!node || typeof node !== "object") {
    return;
  }
  if (typeof node.uuid === "string") {
    result.add(node.uuid.toLowerCase());
  }
  if (node.subMetas && typeof node.subMetas === "object") {
    for (const subMeta of Object.values(node.subMetas)) {
      collectGraphMetaNodeUuids(subMeta, result);
    }
  }
}

function extractGraphUuids(text) {
  const result = new Set();
  for (const match of String(text || "").matchAll(GRAPH_UUID_PATTERN)) {
    result.add(match[0].toLowerCase());
  }
  return result;
}

function isPathInDirectory(path, directory) {
  return path === directory || isStrictlyInside(directory, path);
}

function normalizeUuidWhitelist(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[\n,;]/);
  const result = new Set();
  for (const item of values) {
    for (const uuid of extractGraphUuids(String(item || ""))) {
      result.add(uuid);
    }
  }
  return result;
}

function countGraphUuidOccurrences(text) {
  const result = new Map();
  for (const uuid of extractGraphUuids(text)) {
    result.set(uuid, countTextOccurrences(text, uuid));
  }
  return result;
}

module.exports = {
  clearScriptTypeNameCache,
  normalizeReferenceExtensions,
  checkReferences,
  collectSerializedReferenceDetails,
  checkNodeReferences,
  collectSerializedNodeReferenceDetails,
  isSerializedComponentLikeObject,
  walkSerializedIdReferenceValues,
  normalizeNodeReferenceFieldPath,
  normalizeNodeReferenceUuid,
  normalizeNodeReferenceExtensions,
  walkSerializedReferenceValues,
  normalizeReferenceFieldPath,
  resolveSerializedTypeName,
  getScriptTypeNames,
  resolveReferenceNodeIndex,
  buildSerializedNodePath,
  normalizeReferenceTargets,
  collectTargetUuids,
  extractUuids,
  countTextOccurrences,
  normalizeScenePath,
  buildSerializedAssetGraph,
  collectReachableAssetChains,
  readUtf8Text,
  parseJsonObject,
  collectOwnedGraphUuids,
  collectGraphMetaNodeUuids,
  extractGraphUuids,
  isPathInDirectory,
  normalizeUuidWhitelist,
  countGraphUuidOccurrences,
};
