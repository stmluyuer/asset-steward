"use strict";

const TOOL_PANEL_MODULES = [
  { id: "scene-node-reference-check", title: "场景节点引用检查", group: "独立功能", selector: '[data-tool-module="scene-node-reference-check"]' },
  { id: "resources-runtime-check", title: "resources 动态加载检查", group: "独立功能", selector: '[data-tool-module="resources-runtime-check"]' },
  { id: "package-size-report", title: "包体贡献统计", group: "独立功能", selector: '[data-tool-module="package-size-report"]' },
  { id: "directory-convention", title: "目录规范检查", group: "独立功能", selector: '[data-tool-module="directory-convention"]' },
  { id: "material-textures", title: "材质贴图检查", group: "独立功能", selector: '[data-tool-module="material-textures"]' },
  { id: "duplicate-assets", title: "重复资源检查", group: "独立功能", selector: '[data-tool-module="duplicate-assets"]' },
  { id: "scene-prefab-reference-health", title: "场景和 Prefab 引用健康", group: "独立功能", selector: '[data-tool-module="scene-prefab-reference-health"]' }
];

function normalizeToolVisibility(value, modules = TOOL_PANEL_MODULES) {
  const source = value && typeof value === "object" ? value : {};
  const visibility = {};
  for (const module of modules) {
    visibility[module.id] = source[module.id] !== false;
  }
  return visibility;
}

function isToolVisible(visibility, id) {
  return !visibility || visibility[id] !== false;
}

function buildAllToolsVisibility(modules = TOOL_PANEL_MODULES) {
  const visibility = {};
  for (const module of modules) {
    visibility[module.id] = true;
  }
  return normalizeToolVisibility(visibility, modules);
}

function buildToolPanelRows(modules = TOOL_PANEL_MODULES, visibility = {}) {
  return modules.map((module) => ({
    id: module.id,
    title: module.title,
    group: module.group,
    selector: module.selector,
    enabled: isToolVisible(visibility, module.id),
  }));
}

function getToolTitle(id, modules = TOOL_PANEL_MODULES) {
  return modules.find((module) => module.id === id)?.title || id;
}

module.exports = {
  TOOL_PANEL_MODULES,
  normalizeToolVisibility,
  isToolVisible,
  buildAllToolsVisibility,
  buildToolPanelRows,
  getToolTitle,
};
