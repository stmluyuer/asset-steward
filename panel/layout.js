"use strict";

const RESIZABLE_SPLIT_MIN_LEFT = 260;
const RESIZABLE_SPLIT_MIN_RIGHT = 260;
const RESIZABLE_SPLIT_MIN_TOP = 160;
const RESIZABLE_SPLIT_MIN_BOTTOM = 160;

function getTwoPanePresetLeftWidth(split, preset) {
  const available = Math.max(620, Number(split?.clientWidth || 0) - 28);
  if (preset === "left") {
    return Math.round(available * 0.68);
  }
  if (preset === "right") {
    return Math.round(available * 0.32);
  }
  return Math.round(available * 0.5);
}

function formatTwoPanePresetName(preset) {
  if (preset === "left") {
    return "最大化左侧";
  }
  if (preset === "right") {
    return "最大化右侧";
  }
  return "平铺";
}

function getPackageSizePresetColumns(grid, preset) {
  const available = Math.max(780, Number(grid?.clientWidth || 0) - 56);
  if (preset === "stats") {
    return {
      left: Math.round(available * 0.42),
      middle: Math.round(available * 0.28)
    };
  }
  if (preset === "referenced") {
    return {
      left: Math.round(available * 0.32),
      middle: Math.round(available * 0.24)
    };
  }
  return {
    left: Math.round(available * 0.36),
    middle: Math.round(available * 0.26)
  };
}

function getPackageSizePresetTopHeight(preset) {
  if (preset === "stats") {
    return 420;
  }
  if (preset === "referenced") {
    return 170;
  }
  return 260;
}

function formatPackageSizePresetName(preset) {
  if (preset === "stats") {
    return "最大化统计";
  }
  if (preset === "referenced") {
    return "最大化引用";
  }
  return "平铺";
}

function loadResizableLayoutState(storage, key) {
  try {
    const parsed = JSON.parse(storage?.getItem(key) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function saveResizableLayoutState(storage, key, state) {
  try {
    storage?.setItem(key, JSON.stringify(state || {}));
    return true;
  } catch (_error) {
    return false;
  }
}

function removeResizableLayoutState(storage, key) {
  try {
    storage?.removeItem(key);
    return true;
  } catch (_error) {
    return false;
  }
}

function getResizableStyleProperties(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { left: Number(value) };
  }
  const columns = value?.columns;
  if (!columns || typeof columns !== "object") {
    return {};
  }
  const properties = {};
  for (const [name, size] of Object.entries(columns)) {
    if (Number.isFinite(Number(size))) {
      properties[name] = Number(size);
    }
  }
  return properties;
}

function buildResizableStoredValue(currentValue, variableName, size, handleCount) {
  const roundedSize = Math.round(size);
  if (variableName === "left" && handleCount === 1) {
    return roundedSize;
  }
  const columns = currentValue?.columns && typeof currentValue.columns === "object"
    ? { ...currentValue.columns }
    : {};
  columns[variableName] = roundedSize;
  return { columns };
}

function getResizableSplitVariableName(dataset, handleIndex) {
  if (dataset?.resizeVariable) {
    return dataset.resizeVariable;
  }
  return ["left", "middle", "right"][handleIndex] || `column-${handleIndex + 1}`;
}

function getResizableSplitAxis(dataset) {
  return dataset?.resizeAxis === "y" ? "y" : "x";
}

function getResizeClientPosition(event, axis) {
  const touch = event?.touches?.[0] || event?.changedTouches?.[0];
  if (axis === "y") {
    return touch ? touch.clientY : event?.clientY;
  }
  return touch ? touch.clientX : event?.clientX;
}

function clampResizableSplitSize(options) {
  const axis = options?.axis === "y" ? "y" : "x";
  const clientPosition = Number(options?.clientPosition);
  if (!Number.isFinite(clientPosition)) {
    return NaN;
  }
  const paneRect = options?.paneRect || {};
  const nextPaneRect = options?.nextPaneRect || null;
  const splitRect = options?.splitRect || {};
  const minBefore = axis === "y"
    ? (options?.minTop || RESIZABLE_SPLIT_MIN_TOP)
    : (options?.minLeft || RESIZABLE_SPLIT_MIN_LEFT);
  const minAfter = axis === "y"
    ? (options?.minBottom || RESIZABLE_SPLIT_MIN_BOTTOM)
    : (options?.minRight || RESIZABLE_SPLIT_MIN_RIGHT);
  const start = axis === "y" ? Number(paneRect.top) : Number(paneRect.left);
  const fallbackEnd = axis === "y" ? Number(splitRect.bottom) : Number(splitRect.right);
  const nextEnd = nextPaneRect
    ? (axis === "y" ? Number(nextPaneRect.bottom) : Number(nextPaneRect.right))
    : fallbackEnd;
  if (!Number.isFinite(start) || !Number.isFinite(nextEnd)) {
    return NaN;
  }
  const maxSize = Math.max(minBefore, nextEnd - start - minAfter);
  return Math.min(
    Math.max(minBefore, clientPosition - start),
    maxSize
  );
}

module.exports = {
  RESIZABLE_SPLIT_MIN_LEFT,
  RESIZABLE_SPLIT_MIN_RIGHT,
  RESIZABLE_SPLIT_MIN_TOP,
  RESIZABLE_SPLIT_MIN_BOTTOM,
  getTwoPanePresetLeftWidth,
  formatTwoPanePresetName,
  getPackageSizePresetColumns,
  getPackageSizePresetTopHeight,
  formatPackageSizePresetName,
  loadResizableLayoutState,
  saveResizableLayoutState,
  removeResizableLayoutState,
  getResizableStyleProperties,
  buildResizableStoredValue,
  getResizableSplitVariableName,
  getResizableSplitAxis,
  getResizeClientPosition,
  clampResizableSplitSize
};
