"use strict";

const {
  formatResourcesRuntimeSummary,
  buildResourcesUnusedRows,
  buildResourcesCallRows,
  buildResourcesAllRows,
  formatPackageSizeSummary,
  buildPackageDirectoryRows,
  buildPackageTypeRows,
  buildPackageTopFileRows,
  buildPackageReferencedTopFileRows,
  formatDirectoryConventionSummary,
  buildDirectoryConventionRows,
  formatMaterialTextureSummary,
  buildMaterialTextureRows,
  formatDuplicateAssetSummary,
  buildDuplicateGroupRows,
  formatScenePrefabReferenceHealthSummary,
  buildScenePrefabReferenceHealthRows
} = require("../health");
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

function renderResourcesRuntime(panel, state, deps = {}) {
  const documentRef = getDocument(deps);
  const locate = deps.locate || (() => {});
  panel.$.resourcesRuntimeSummary.textContent = formatResourcesRuntimeSummary(state.resourcesRuntimeSummary);
  renderResourcesUnused(panel, state.resourcesRuntimeUnused, documentRef, locate);
  renderResourcesCalls(panel, state.resourcesRuntimeStaticCalls, state.resourcesRuntimeDynamicCalls, documentRef, locate);
  renderResourcesAll(panel, state.resourcesRuntimeResources, documentRef, locate);
}

function renderResourcesUnused(panel, resources, documentRef, locate) {
  panel.$.resourcesUnusedRows.innerHTML = "";
  setEmptyState(panel.$.resourcesUnusedEmpty, Array.isArray(resources) && resources.length > 0);
  for (const resource of buildResourcesUnusedRows(resources)) {
    const row = appendRow(panel.$.resourcesUnusedRows, `
      <td class="path" title="${escapeHtml(resource.path)}">${escapeHtml(resource.path)}</td>
      <td class="path" title="${escapeHtml(resource.loadPath)}">${escapeHtml(resource.loadPath)}</td>
      <td>${escapeHtml(resource.extension || "-")}</td>
      <td>${escapeHtml(resource.sizeText)}</td>
      <td><button class="locate">定位</button></td>
    `, documentRef);
    row.querySelector(".locate").addEventListener("click", () => locate(resource.locatePath));
  }
}

function renderResourcesCalls(panel, staticCalls, dynamicCalls, documentRef, locate) {
  const calls = buildResourcesCallRows(staticCalls, dynamicCalls);
  panel.$.resourcesCallRows.innerHTML = "";
  setEmptyState(panel.$.resourcesCallEmpty, calls.length > 0);
  for (const call of calls) {
    const row = appendRow(panel.$.resourcesCallRows, `
      <td class="${escapeHtml(call.statusClass)}">${escapeHtml(call.statusText)}</td>
      <td>${escapeHtml(call.method || "-")}</td>
      <td class="path" title="${escapeHtml(call.displayTitle || "")}">${escapeHtml(call.displayPath)}</td>
      <td class="path" title="${escapeHtml(call.codeLocation)}">${escapeHtml(call.codeLocation)}</td>
      <td>${safeNumber(call.matchCount)}</td>
      <td><button class="locate">定位代码</button></td>
    `, documentRef);
    row.querySelector(".locate").addEventListener("click", () => locate(call.locatePath));
  }
}

function renderResourcesAll(panel, resources, documentRef, locate) {
  panel.$.resourcesAllRows.innerHTML = "";
  setEmptyState(panel.$.resourcesAllEmpty, Array.isArray(resources) && resources.length > 0);
  for (const resource of buildResourcesAllRows(resources)) {
    const row = appendRow(panel.$.resourcesAllRows, `
      <td class="${escapeHtml(resource.statusClass)}">${escapeHtml(resource.statusText)}</td>
      <td class="path" title="${escapeHtml(resource.path)}">${escapeHtml(resource.path)}</td>
      <td class="path" title="${escapeHtml(resource.loadPath)}">${escapeHtml(resource.loadPath)}</td>
      <td>${escapeHtml(resource.extension || "-")}</td>
      <td>${escapeHtml(resource.sizeText)}</td>
      <td><button class="locate">定位</button></td>
    `, documentRef);
    row.querySelector(".locate").addEventListener("click", () => locate(resource.locatePath));
  }
}

function renderPackageSize(panel, state, deps = {}) {
  const documentRef = getDocument(deps);
  const locate = deps.locate || (() => {});
  const totalSize = state.packageSizeSummary?.totalSize;
  panel.$.packageSizeSummary.textContent = formatPackageSizeSummary(state.packageSizeSummary);
  renderPackageDirectoryRanking(panel, buildPackageDirectoryRows(state.packageDirectoryRanking, totalSize), documentRef, locate);
  renderPackageTypeRanking(panel, buildPackageTypeRows(state.packageTypeRanking, totalSize), documentRef);
  renderPackageTopFiles(panel, buildPackageTopFileRows(state.packageTopFiles, totalSize), documentRef, locate);
  renderPackageReferencedTopFiles(panel, buildPackageReferencedTopFileRows(state.packageReferencedTopFiles), documentRef, locate);
}

function renderPackageDirectoryRanking(panel, rows, documentRef, locate) {
  panel.$.packageDirectoryRows.innerHTML = "";
  setEmptyState(panel.$.packageDirectoryEmpty, rows.length > 0);
  for (const item of rows) {
    const row = appendRow(panel.$.packageDirectoryRows, `
      <td class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</td>
      <td>${safeNumber(item.count)}</td>
      <td>${escapeHtml(item.totalSizeText)}</td>
      <td>${escapeHtml(item.percentText)}</td>
      <td><button class="locate">定位</button></td>
    `, documentRef);
    row.querySelector(".locate").addEventListener("click", () => locate(item.locatePath));
  }
}

function renderPackageTypeRanking(panel, rows, documentRef) {
  panel.$.packageTypeRows.innerHTML = "";
  setEmptyState(panel.$.packageTypeEmpty, rows.length > 0);
  for (const item of rows) {
    appendRow(panel.$.packageTypeRows, `
      <td>${escapeHtml(item.extension || "-")}</td>
      <td>${safeNumber(item.count)}</td>
      <td>${escapeHtml(item.totalSizeText)}</td>
      <td>${escapeHtml(item.percentText)}</td>
    `, documentRef);
  }
}

function renderPackageTopFiles(panel, rows, documentRef, locate) {
  panel.$.packageTopFileRows.innerHTML = "";
  setEmptyState(panel.$.packageTopFileEmpty, rows.length > 0);
  for (const item of rows) {
    const row = appendRow(panel.$.packageTopFileRows, `
      <td class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</td>
      <td>${escapeHtml(item.extension || "-")}</td>
      <td>${escapeHtml(item.sizeText)}</td>
      <td>${escapeHtml(item.percentText)}</td>
      <td><button class="locate">定位</button></td>
    `, documentRef);
    row.querySelector(".locate").addEventListener("click", () => locate(item.locatePath));
  }
}

function renderPackageReferencedTopFiles(panel, rows, documentRef, locate) {
  panel.$.packageReferencedFileRows.innerHTML = "";
  setEmptyState(panel.$.packageReferencedFileEmpty, rows.length > 0);
  for (const item of rows) {
    const row = appendRow(panel.$.packageReferencedFileRows, `
      <td class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</td>
      <td>${escapeHtml(item.extension || "-")}</td>
      <td>${escapeHtml(item.sizeText)}</td>
      <td class="reference-chain" title="${escapeHtml(item.chainText)}">${escapeHtml(item.chainDisplay)}</td>
      <td><button class="locate">定位</button></td>
    `, documentRef);
    row.querySelector(".locate").addEventListener("click", () => locate(item.locatePath));
  }
}

function renderDirectoryConvention(panel, state, deps = {}) {
  const documentRef = getDocument(deps);
  const locate = deps.locate || (() => {});
  const rows = buildDirectoryConventionRows(state.directoryConventionMismatches);
  panel.$.directoryConventionRows.innerHTML = "";
  setEmptyState(panel.$.directoryConventionEmpty, rows.length > 0);
  panel.$.directoryConventionPreviewButton.disabled = rows.length === 0;
  panel.$.directoryConventionSummary.textContent = formatDirectoryConventionSummary(state.directoryConventionSummary);
  for (const item of rows) {
    const row = appendRow(panel.$.directoryConventionRows, `
      <td class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</td>
      <td>${escapeHtml(item.extension || "-")}</td>
      <td class="path" title="${escapeHtml(item.currentDirectory)}">${escapeHtml(item.currentDirectory)}</td>
      <td class="path" title="${escapeHtml(item.suggestedDirectory)}">${escapeHtml(item.suggestedDirectory)}</td>
      <td>${escapeHtml(item.ruleId || "-")}</td>
      <td class="${escapeHtml(item.statusClass)}">${escapeHtml(item.statusText)}</td>
      <td><button class="locate">定位</button></td>
    `, documentRef);
    row.querySelector(".locate").addEventListener("click", () => locate(item.locatePath));
  }
}

function renderMaterialTextures(panel, state, deps = {}) {
  const documentRef = getDocument(deps);
  const locate = deps.locate || (() => {});
  const rows = buildMaterialTextureRows(state.materialTextureReferences);
  panel.$.materialTextureRows.innerHTML = "";
  setEmptyState(panel.$.materialTextureEmpty, rows.length > 0);
  panel.$.materialTextureSummary.textContent = formatMaterialTextureSummary(state.materialTextureSummary);
  for (const item of rows) {
    const row = appendRow(panel.$.materialTextureRows, `
      <td class="${escapeHtml(item.statusClass)}">${escapeHtml(item.statusText)}</td>
      <td class="${escapeHtml(item.materialReachableClass)}">${escapeHtml(item.materialReachableText)}</td>
      <td class="path" title="${escapeHtml(item.materialPath)}">${escapeHtml(item.materialPath)}</td>
      <td class="path" title="${escapeHtml(item.propertyPath || "-")}">${escapeHtml(item.propertyPath || "-")}</td>
      <td class="path" title="${escapeHtml(item.uuid || "-")}">${escapeHtml(item.uuid || "-")}</td>
      <td class="path" title="${escapeHtml(item.texturePath || "-")}">${escapeHtml(item.texturePath || "-")}</td>
      <td><button class="locate-material">定位材质</button> <button class="locate-texture" ${item.textureLocatePath ? "" : "disabled"}>定位贴图</button></td>
    `, documentRef);
    row.querySelector(".locate-material").addEventListener("click", () => locate(item.materialLocatePath));
    if (item.textureLocatePath) {
      row.querySelector(".locate-texture").addEventListener("click", () => locate(item.textureLocatePath));
    }
  }
}

function renderDuplicateAssets(panel, state, deps = {}) {
  const documentRef = getDocument(deps);
  const locate = deps.locate || (() => {});
  const sameNameRows = buildDuplicateGroupRows(state.duplicateSameNameGroups, "name");
  const hashRows = buildDuplicateGroupRows(state.duplicateHashGroups, "hash");
  panel.$.duplicateSameNameRows.innerHTML = "";
  panel.$.duplicateHashRows.innerHTML = "";
  setEmptyState(panel.$.duplicateSameNameEmpty, sameNameRows.length > 0);
  setEmptyState(panel.$.duplicateHashEmpty, hashRows.length > 0);
  panel.$.duplicateAssetSummary.textContent = formatDuplicateAssetSummary(state.duplicateAssetSummary);
  renderDuplicateGroupRows(panel.$.duplicateSameNameRows, sameNameRows, documentRef, locate);
  renderDuplicateGroupRows(panel.$.duplicateHashRows, hashRows, documentRef, locate);
}

function renderDuplicateGroupRows(target, rows, documentRef, locate) {
  for (const item of rows) {
    const row = appendRow(target, `
      <td class="path" title="${escapeHtml(item.groupTitle)}">${escapeHtml(item.groupKey)}</td>
      <td>${safeNumber(item.memberCount)}</td>
      <td class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</td>
      <td>${escapeHtml(item.extension || "-")}</td>
      <td>${escapeHtml(item.sizeText)}</td>
      <td><button class="locate">定位</button></td>
    `, documentRef);
    row.querySelector(".locate").addEventListener("click", () => locate(item.locatePath));
  }
}

function renderScenePrefabReferenceHealth(panel, state, deps = {}) {
  const documentRef = getDocument(deps);
  const locate = deps.locate || (() => {});
  const rows = buildScenePrefabReferenceHealthRows(state.scenePrefabReferenceIssues);
  panel.$.scenePrefabHealthRows.innerHTML = "";
  setEmptyState(panel.$.scenePrefabHealthEmpty, rows.length > 0);
  panel.$.scenePrefabHealthSummary.textContent = formatScenePrefabReferenceHealthSummary(state.scenePrefabReferenceSummary);
  for (const item of rows) {
    const row = appendRow(panel.$.scenePrefabHealthRows, `
      <td class="${escapeHtml(item.statusClass)}">${escapeHtml(item.statusText)}</td>
      <td class="path" title="${escapeHtml(item.filePath)}">${escapeHtml(item.filePath)}</td>
      <td>${escapeHtml(item.extension || "-")}</td>
      <td class="path" title="${escapeHtml(item.uuid || "-")}">${escapeHtml(item.uuid || "-")}</td>
      <td>${safeNumber(item.matchCount)}</td>
      <td><button class="locate">定位</button></td>
    `, documentRef);
    row.querySelector(".locate").addEventListener("click", () => locate(item.locatePath));
  }
}

module.exports = {
  renderResourcesRuntime,
  renderPackageSize,
  renderDirectoryConvention,
  renderMaterialTextures,
  renderDuplicateAssets,
  renderScenePrefabReferenceHealth,
  _test: {
    setEmptyState
  }
};
