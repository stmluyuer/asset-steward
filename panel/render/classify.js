"use strict";

const {
  buildClassifyAssetRows,
  buildRuleRows,
  buildPlanRows,
  formatPlanSummary,
} = require("../classify");
const { escapeHtml, safeNumber } = require("../format");

function getDocument(deps) {
  return deps?.document || globalThis.document;
}

function appendRow(target, tagName, html, documentRef) {
  const row = documentRef.createElement(tagName);
  row.innerHTML = html;
  target.appendChild(row);
  return row;
}

function renderClassifyAssets(panel, state, deps = {}) {
  const documentRef = getDocument(deps);
  const locate = deps.locate || (() => {});
  const onSelectionChange = deps.onSelectionChange || (() => {});
  const rows = buildClassifyAssetRows(state.entries, state.selectedPaths);

  panel.$.assetRows.innerHTML = "";
  panel.$.assetEmpty.style.display = rows.length ? "none" : "block";
  for (const entry of rows) {
    const row = appendRow(panel.$.assetRows, "tr", `
      <td class="check"><input type="checkbox" ${entry.selectable ? "" : "disabled"}></td>
      <td class="path" title="${escapeHtml(entry.path)}">${escapeHtml(entry.path)}</td>
      <td>${escapeHtml(entry.extension)}</td>
      <td>${escapeHtml(entry.sizeText)}</td>
      <td class="${escapeHtml(entry.statusClass)}">${escapeHtml(entry.statusText)}</td>
      <td><button class="locate">定位</button></td>
    `, documentRef);
    const checkbox = row.querySelector("input");
    checkbox.checked = entry.selected;
    checkbox.addEventListener("change", () => onSelectionChange(entry.path, checkbox.checked));
    row.querySelector(".locate").addEventListener("click", () => locate(entry.locatePath));
  }
}

function renderClassifyRules(panel, rules, deps = {}) {
  const documentRef = getDocument(deps);
  const onRuleEnabledChange = deps.onRuleEnabledChange || (() => {});
  const onRuleExtensionsChange = deps.onRuleExtensionsChange || (() => {});
  const onRuleKeywordsChange = deps.onRuleKeywordsChange || (() => {});
  const onRuleTargetChange = deps.onRuleTargetChange || (() => {});
  const onRuleRemove = deps.onRuleRemove || (() => {});

  panel.$.ruleRows.innerHTML = "";
  for (const item of buildRuleRows(rules)) {
    const row = appendRow(panel.$.ruleRows, "div", `
      <input class="enabled" type="checkbox" title="启用规则">
      <input class="extensions" value="${escapeHtml(item.extensionsText)}" placeholder=".prefab,.fbx" title="逗号分隔扩展名">
      <input class="keywords" value="${escapeHtml(item.keywordsText)}" placeholder="文件名关键词；留空为兜底" title="逗号分隔，忽略大小写，任一关键词命中即匹配">
      <input class="target" value="${escapeHtml(item.targetText)}" placeholder="assets/res/prefab" title="目标目录；自动分类执行时可自动创建">
      <button class="remove" title="删除规则">×</button>
    `, documentRef);
    row.className = "rule-row";
    const enabledInput = row.querySelector(".enabled");
    enabledInput.checked = item.enabled;
    enabledInput.addEventListener("change", (event) => onRuleEnabledChange(item.rule, event.target.checked));
    row.querySelector(".extensions").addEventListener("change", (event) => onRuleExtensionsChange(item.rule, event.target.value));
    row.querySelector(".keywords").addEventListener("change", (event) => onRuleKeywordsChange(item.rule, event.target.value));
    row.querySelector(".target").addEventListener("change", (event) => onRuleTargetChange(item.rule, event.target.value));
    row.querySelector(".remove").addEventListener("click", () => onRuleRemove(item.rule));
  }
}

function renderClassifyPlan(panel, plan, deps = {}) {
  const documentRef = getDocument(deps);
  const summary = plan?.summary || {};

  panel.$.planRows.innerHTML = "";
  panel.$.planSummary.textContent = formatPlanSummary(plan);
  if (!plan) {
    panel.$.executeButton.disabled = true;
    return;
  }

  for (const item of buildPlanRows(plan)) {
    appendRow(panel.$.planRows, "tr", `
      <td class="${escapeHtml(item.statusClass)}">${escapeHtml(item.statusText)}</td>
      <td>${escapeHtml(item.actionText)}</td>
      <td class="path" title="${escapeHtml(item.source)}">${escapeHtml(item.source)}</td>
      <td class="path" title="${escapeHtml(item.destination)}">${escapeHtml(item.destination)}</td>
      <td>${escapeHtml(item.reasonText)}</td>
    `, documentRef);
  }
  panel.$.executeButton.disabled = safeNumber(summary.ready) <= 0;
}

module.exports = {
  renderClassifyAssets,
  renderClassifyRules,
  renderClassifyPlan,
};
