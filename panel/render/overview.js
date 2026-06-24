"use strict";

const {
  buildOverviewListRows,
  formatOverviewSummary,
  formatOverviewSnapshotSummary,
} = require("../overview");
const { escapeHtml } = require("../format");

function getDocument(deps) {
  return deps?.document || globalThis.document;
}

function renderOverview(panel, model, deps = {}) {
  panel.$.overviewSummary.textContent = formatOverviewSummary(model.risks, model.knownModules);
  panel.$.overviewSnapshotSummary.textContent = formatOverviewSnapshotSummary(
    model.currentSnapshot,
    model.previousSnapshot,
    model.knownModules,
    deps
  );
  renderOverviewList(panel.$.overviewRiskRows, model.risks, deps);
  panel.$.overviewRiskEmpty.style.display = model.risks?.length ? "none" : "block";
  renderOverviewList(panel.$.overviewNextStepRows, model.nextSteps, deps);
  renderOverviewList(panel.$.overviewOperationRows, model.operations, deps);
}

function renderOverviewList(target, items, deps = {}) {
  const documentRef = getDocument(deps);
  const onAction = deps.onAction || (() => {});
  target.innerHTML = "";
  for (const rowModel of buildOverviewListRows(items)) {
    const row = documentRef.createElement("div");
    row.className = `overview-row ${rowModel.severity}`;
    const scoreText = rowModel.scoreText ? `<span class="overview-score">${escapeHtml(rowModel.scoreText)}</span>` : "";
    row.innerHTML = `
      <strong>${escapeHtml(rowModel.title)}${scoreText}</strong>
      <button>${escapeHtml(rowModel.actionLabel)}</button>
      <p>${escapeHtml(rowModel.detail)}</p>
    `;
    row.querySelector("button").addEventListener("click", () => onAction(rowModel.item));
    target.appendChild(row);
  }
}

module.exports = {
  renderOverview,
  renderOverviewList,
};
