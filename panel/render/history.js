"use strict";

const {
  buildHistoryOptions,
  formatHistoryDetailSummary,
  formatHistoryCleanupSummary,
  buildHistoryMoveRows,
  buildLogRows
} = require("../history");
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

function renderHistory(panel, history, deps = {}) {
  const documentRef = getDocument(deps);
  panel.$.historySelect.innerHTML = "";
  for (const item of buildHistoryOptions(history, deps)) {
    const option = documentRef.createElement("option");
    option.value = item.value;
    option.textContent = item.text;
    panel.$.historySelect.appendChild(option);
  }
}

function renderHistoryDetail(panel, detail, deps = {}) {
  const documentRef = getDocument(deps);
  const rows = buildHistoryMoveRows(detail);
  panel.$.historyDetailRows.innerHTML = "";
  setEmptyState(panel.$.historyDetailEmpty, rows.length > 0);
  panel.$.historyDetailSummary.textContent = formatHistoryDetailSummary(detail, deps);
  panel.$.historyCleanupSummary.textContent = formatHistoryCleanupSummary(detail);
  for (const move of rows) {
    appendRow(panel.$.historyDetailRows, `
      <td>${escapeHtml(move.actionText)}</td>
      <td class="path" title="${escapeHtml(move.source)}">${escapeHtml(move.source)}</td>
      <td class="path" title="${escapeHtml(move.destination)}">${escapeHtml(move.destination)}</td>
      <td class="${escapeHtml(move.recoverableClass)}">${escapeHtml(move.recoverableText)}</td>
    `, documentRef);
  }
}

function renderLogs(panel, logs, deps = {}) {
  const documentRef = getDocument(deps);
  const rows = buildLogRows(logs, deps);
  panel.$.logRows.innerHTML = "";
  setEmptyState(panel.$.logEmpty, rows.length > 0);
  for (const log of rows) {
    appendRow(panel.$.logRows, `
      <td>${escapeHtml(log.timeText)}</td>
      <td class="${escapeHtml(log.levelClass)}">${escapeHtml(log.levelText)}</td>
      <td title="${escapeHtml(log.detail || "")}">${escapeHtml(log.message || "")}</td>
    `, documentRef);
  }
}

module.exports = {
  renderHistory,
  renderHistoryDetail,
  renderLogs,
  _test: {
    setEmptyState
  }
};
