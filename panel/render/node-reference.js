"use strict";

const {
  buildNodeReferenceRows,
  buildNodeReferenceTargetRows,
  formatNodeReferenceSummary
} = require("../node-reference");
const { escapeHtml } = require("../format");

function getDocument(deps) {
  return deps?.document || globalThis.document;
}

function setEmptyState(emptyNode, hasRows) {
  emptyNode.style.display = hasRows ? "none" : "block";
}

function appendRow(target, html, documentRef) {
  const row = documentRef.createElement("tr");
  row.innerHTML = html;
  target.appendChild(row);
  return row;
}

function renderNodeReferences(panel, state, deps = {}) {
  const documentRef = getDocument(deps);
  const locate = deps.locate || (() => {});
  const selectNode = deps.selectNode || (() => {});
  panel.$.nodeReferenceSummary.textContent = formatNodeReferenceSummary(state.nodeReferenceSummary);
  renderNodeReferenceTargets(panel, state.nodeReferenceTargets, documentRef, locate, selectNode);
  renderNodeReferenceRows(panel, state.nodeReferenceRows, documentRef, locate, selectNode);
}

function renderNodeReferenceTargets(panel, targets, documentRef, locate, selectNode) {
  const rows = buildNodeReferenceTargetRows(targets);
  panel.$.nodeReferenceTargetRows.innerHTML = "";
  setEmptyState(panel.$.nodeReferenceTargetEmpty, rows.length > 0);
  for (const item of rows) {
    const row = appendRow(panel.$.nodeReferenceTargetRows, `
      <td class="path" title="${escapeHtml(item.filePath)}">${escapeHtml(item.filePath)}</td>
      <td class="path" title="${escapeHtml(item.nodePath)}">${escapeHtml(item.nodePath)}</td>
      <td class="path" title="${escapeHtml(item.nodeUuid)}">${escapeHtml(item.nodeUuid)}</td>
      <td><button class="locate">定位资源</button> <button class="select-node" ${item.selectable ? "" : "disabled"}>选中节点</button></td>
    `, documentRef);
    row.querySelector(".locate").addEventListener("click", () => locate(item.locatePath));
    row.querySelector(".select-node").addEventListener("click", () => selectNode(item.selectPath, item.selectDetail));
  }
}

function renderNodeReferenceRows(panel, references, documentRef, locate, selectNode) {
  const rows = buildNodeReferenceRows(references);
  panel.$.nodeReferenceRows.innerHTML = "";
  setEmptyState(panel.$.nodeReferenceEmpty, rows.length > 0);
  for (const item of rows) {
    const row = appendRow(panel.$.nodeReferenceRows, `
      <td class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</td>
      <td class="path" title="${escapeHtml(item.nodePath)}">${escapeHtml(item.nodePath)}</td>
      <td class="path" title="${escapeHtml(item.componentType)}">${escapeHtml(item.componentType)}</td>
      <td class="path" title="${escapeHtml(item.fieldPath)}">${escapeHtml(item.fieldPath)}</td>
      <td class="path" title="${escapeHtml(item.targetNodePath)}">${escapeHtml(item.targetNodePath)}</td>
      <td><button class="locate">定位资源</button> <button class="select-node" ${item.selectable ? "" : "disabled"}>选中引用节点</button> <button class="select-target" ${item.targetSelectable ? "" : "disabled"}>选中目标</button></td>
    `, documentRef);
    row.querySelector(".locate").addEventListener("click", () => locate(item.locatePath));
    row.querySelector(".select-node").addEventListener("click", () => selectNode(item.selectPath, item.selectDetail));
    row.querySelector(".select-target").addEventListener("click", () => selectNode(item.selectPath, item.selectTargetDetail));
  }
}

module.exports = {
  renderNodeReferences,
  _test: {
    setEmptyState
  }
};
