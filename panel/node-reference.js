"use strict";

const { safeNumber } = require("./format");

function formatNodeReferenceSummary(summary) {
  if (!summary) {
    return "根据目标节点 ID 反查哪些组件属性引用了它；只报告，不修改场景。";
  }
  return `扫描 ${summary.scanDirectory || "assets"}：序列化文件 ${safeNumber(summary.scannedFileCount)} 个，匹配目标节点 ${safeNumber(summary.targetNodeCount)} 个/文件 ${safeNumber(summary.targetFileCount)} 个，找到引用文件 ${safeNumber(summary.referenceFileCount)} 个，引用组件 ${safeNumber(summary.referencePositionCount)} 条，可选中节点 ${safeNumber(summary.selectablePositionCount)} 条。`;
}

function buildNodeReferenceTargetRows(targets) {
  return (Array.isArray(targets) ? targets : []).map((item) => ({
    filePath: item.filePath,
    nodePath: item.nodePath || item.nodeName || "-",
    nodeUuid: item.nodeUuid,
    selectable: Boolean(item.selectable),
    locatePath: item.filePath,
    selectPath: item.filePath,
    selectDetail: item
  }));
}

function buildNodeReferenceRows(references) {
  const rows = [];
  for (const item of Array.isArray(references) ? references : []) {
    const details = item.references?.length ? item.references : [];
    for (const detail of details) {
      rows.push({
        path: item.path,
        nodePath: detail.nodePath || "未解析节点",
        componentType: detail.componentType || "未知组件",
        fieldPath: detail.fieldPath || "未知字段",
        targetNodePath: detail.targetNodePath || detail.targetNodeName || "-",
        selectable: Boolean(detail.selectable),
        targetSelectable: Boolean(detail.targetNodeUuid),
        locatePath: item.path,
        selectPath: item.path,
        selectDetail: detail,
        selectTargetDetail: {
          selectable: Boolean(detail.targetNodeUuid),
          nodeUuid: detail.targetNodeUuid,
          nodePath: detail.targetNodePath
        }
      });
    }
  }
  return rows;
}

function buildNodeReferenceCheckPayload(fields = {}) {
  return {
    nodeUuid: String(fields.nodeUuidInput?.value || "").trim(),
    directory: fields.directoryInput?.value || "",
    extensions: fields.extensionInput?.value || "",
    preferSelectedNode: true
  };
}

function syncNodeReferenceUuidInput(input, result) {
  const nodeUuid = String(result?.nodeUuid || "").trim();
  if (input && nodeUuid) {
    input.value = nodeUuid;
  }
}

module.exports = {
  formatNodeReferenceSummary,
  buildNodeReferenceTargetRows,
  buildNodeReferenceRows,
  buildNodeReferenceCheckPayload,
  syncNodeReferenceUuidInput
};
