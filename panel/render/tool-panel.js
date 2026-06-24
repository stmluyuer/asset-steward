"use strict";

const {
  buildToolPanelRows,
} = require("../tool-panel");
const { escapeHtml } = require("../format");

function getDocument(deps) {
  return deps?.document || globalThis.document;
}

function renderToolPanel(panel, modules, visibility, deps = {}) {
  const documentRef = getDocument(deps);
  const onVisibilityChange = deps.onVisibilityChange || (() => {});
  const rows = buildToolPanelRows(modules, visibility);

  panel.$.toolPanelRows.innerHTML = "";
  for (const item of rows) {
    const row = documentRef.createElement("label");
    row.className = "tool-panel-row";
    row.innerHTML = `
      <input type="checkbox" ${item.enabled ? "checked" : ""} data-tool-toggle="${escapeHtml(item.id)}">
      <span>${escapeHtml(item.title)}</span>
      <small>${escapeHtml(item.group)}</small>
    `;
    row.querySelector("input").addEventListener("change", (event) => onVisibilityChange(item.id, event.target.checked));
    panel.$.toolPanelRows.appendChild(row);
  }
}

function applyToolVisibility(modules, visibility, deps = {}) {
  const documentRef = getDocument(deps);
  for (const item of buildToolPanelRows(modules, visibility)) {
    documentRef.querySelectorAll(item.selector).forEach((element) => {
      element.classList.toggle("hidden", !item.enabled);
    });
  }
}

module.exports = {
  renderToolPanel,
  applyToolVisibility,
};
