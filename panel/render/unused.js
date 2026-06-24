"use strict";

const {
  buildUnusedCandidateRows,
  buildUnusedDeleteRows,
  canExecuteUnusedDelete,
  filterUnusedCandidates,
  formatUnusedDeleteSummary,
  formatUnusedSummary
} = require("../unused");
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

function renderUnusedCandidates(panel, state, deps = {}) {
  const documentRef = getDocument(deps);
  const locate = deps.locate || (() => {});
  const onToggleCandidate = deps.onToggleCandidate || (() => {});
  const visible = filterUnusedCandidates(state.unusedCandidates, state.search, state.extensions);
  const selectedPaths = state.unusedSelectedPaths instanceof Set ? state.unusedSelectedPaths : new Set();
  const rows = buildUnusedCandidateRows(visible, selectedPaths);

  panel.$.unusedCandidateRows.innerHTML = "";
  setEmptyState(panel.$.unusedCandidateEmpty, rows.length > 0);
  panel.$.unusedSelectVisibleButton.disabled = rows.length === 0;
  panel.$.unusedClearSelectionButton.disabled = selectedPaths.size === 0;
  panel.$.unusedSummary.textContent = formatUnusedSummary(state.unusedSummary, rows.length);

  for (const item of rows) {
    const row = appendRow(panel.$.unusedCandidateRows, `
      <td class="check"><input type="checkbox"></td>
      <td class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</td>
      <td>${escapeHtml(item.extension || "-")}</td>
      <td>${escapeHtml(item.sizeText)}</td>
      <td class="warning">${escapeHtml(item.riskText)}</td>
      <td><button class="locate">定位</button></td>
    `, documentRef);
    const checkbox = row.querySelector("input");
    checkbox.checked = item.selected;
    checkbox.addEventListener("change", () => onToggleCandidate(item.path, checkbox.checked));
    row.querySelector(".locate").addEventListener("click", () => locate(item.locatePath));
  }

  return { visible };
}

function renderUnusedDeletePlan(panel, state, deps = {}) {
  const documentRef = getDocument(deps);
  const plan = state.unusedDeletePlan || null;
  const selectedCount = state.unusedSelectedPaths instanceof Set ? state.unusedSelectedPaths.size : safeNumber(state.selectedCount);
  const confirmed = Boolean(state.confirmed);
  const rows = buildUnusedDeleteRows(plan);

  panel.$.unusedDeleteRows.innerHTML = "";
  setEmptyState(panel.$.unusedDeleteEmpty, Boolean(plan));
  panel.$.unusedDeleteSummary.textContent = formatUnusedDeleteSummary(plan, selectedCount);
  panel.$.unusedDeleteExecuteButton.disabled = !canExecuteUnusedDelete(plan, confirmed);

  for (const item of rows) {
    appendRow(panel.$.unusedDeleteRows, `
      <td class="${escapeHtml(item.statusClass)}">${escapeHtml(item.statusText)}</td>
      <td class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</td>
      <td>${escapeHtml(item.extension || "-")}</td>
      <td>${escapeHtml(item.sizeText)}</td>
      <td>${escapeHtml(item.reason || "-")}</td>
    `, documentRef);
  }
}

module.exports = {
  renderUnusedCandidates,
  renderUnusedDeletePlan,
  _test: {
    setEmptyState
  }
};
