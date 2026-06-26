"use strict";

const {
  buildAssetScanResourceRows,
  buildReferenceRows,
  buildReferenceTargetRows,
  formatAssetScanSummary,
  formatReferenceSummary
} = require("../scan");
const { escapeHtml, safeNumber } = require("../format");

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

function renderAssetScanReport(panel, state, deps = {}) {
  const documentRef = getDocument(deps);
  const locate = deps.locate || (() => {});
  const checkReferenceForPath = deps.checkReferenceForPath || (() => {});
  panel.$.assetScanSummary.textContent = formatAssetScanSummary(state.scanReportSummary);
  renderAssetScanResources(panel, state.scanResourceEntries, documentRef, locate, checkReferenceForPath);
}

function renderAssetScanResources(panel, entries, documentRef, locate, checkReferenceForPath) {
  const rows = buildAssetScanResourceRows(entries);
  panel.$.assetScanResourceRows.innerHTML = "";
  setEmptyState(panel.$.assetScanResourceEmpty, rows.length > 0);
  for (const entry of rows) {
    const row = appendRow(panel.$.assetScanResourceRows, `
      <td class="path" title="${escapeHtml(entry.path)}">${escapeHtml(entry.path)}</td>
      <td>${escapeHtml(entry.extension || "-")}</td>
      <td>${escapeHtml(entry.sizeText)}</td>
      <td class="${escapeHtml(entry.statusClass)}">${escapeHtml(entry.statusText)}</td>
      <td><button class="locate">定位</button><button class="check-reference" ${entry.canCheckReference ? "" : "disabled"}>查引用</button></td>
    `, documentRef);
    row.querySelector(".locate").addEventListener("click", () => locate(entry.locatePath));
    if (entry.canCheckReference) {
      row.querySelector(".check-reference").addEventListener("click", () => checkReferenceForPath(entry.referencePath));
    }
  }
}

function renderReferences(panel, state, deps = {}) {
  const documentRef = getDocument(deps);
  const locate = deps.locate || (() => {});
  const checkParent = deps.checkParent || (() => {});
  const selectNode = deps.selectNode || (() => {});
  panel.$.referenceSummary.textContent = formatReferenceSummary(state.referenceSummary);
  renderReferenceTargets(panel, state.referenceTargets, documentRef, locate);
  renderReferenceRows(panel, state.referenceRows, documentRef, locate, checkParent, selectNode);
}

function renderReferenceTargets(panel, targets, documentRef, locate) {
  const rows = buildReferenceTargetRows(targets);
  panel.$.referenceTargetRows.innerHTML = "";
  setEmptyState(panel.$.referenceTargetEmpty, rows.length > 0);
  for (const target of rows) {
    const row = appendRow(panel.$.referenceTargetRows, `
      <td class="path" title="${escapeHtml(target.path)}">${escapeHtml(target.path)}</td>
      <td>${safeNumber(target.uuidCount)}</td>
      <td class="path" title="${escapeHtml(target.uuidsTitle)}">${escapeHtml(target.uuidsText)}</td>
      <td><button class="locate">定位</button></td>
    `, documentRef);
    row.querySelector(".locate").addEventListener("click", () => locate(target.locatePath));
  }
}

function renderReferenceRows(panel, references, documentRef, locate, checkParent, selectNode) {
  const rows = buildReferenceRows(references);
  panel.$.referenceRows.innerHTML = "";
  setEmptyState(panel.$.referenceEmpty, rows.length > 0);
  for (const item of rows) {
    const row = appendRow(panel.$.referenceRows, `
      <td class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</td>
      <td class="path" title="${escapeHtml(item.position)}">${escapeHtml(item.position)}</td>
      <td class="path" title="${escapeHtml(item.matchedUuid)}">${escapeHtml(item.matchedUuid)}</td>
      <td class="path" title="${escapeHtml(item.targetPathsTitle)}">${escapeHtml(item.targetPathsText)}</td>
      <td><button class="locate">定位资源</button> <button class="check-parent">查上级</button> <button class="select-node" ${item.selectable ? "" : "disabled"}>选中节点</button></td>
    `, documentRef);
    row.querySelector(".locate").addEventListener("click", () => locate(item.locatePath));
    row.querySelector(".check-parent").addEventListener("click", () => checkParent(item.parentReferencePath));
    row.querySelector(".select-node").addEventListener("click", () => selectNode(item.parentReferencePath, item.selectDetail));
  }
}

module.exports = {
  renderAssetScanReport,
  renderReferences,
  _test: {
    setEmptyState
  }
};
