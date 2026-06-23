"use strict";

const Fs = require("fs");
const Path = require("path");
const {
  normalizeRelativePath,
  toProjectPath,
  isInsideAssets,
  comparePath,
  walk,
  toRelativePath,
  statPath,
} = require("./path-utils");

const DEFAULT_CODE_SCAN_DIRECTORIES = ["assets/script", "assets/scripts"];
const CODE_EXTENSIONS = new Set([".ts", ".js"]);

function checkResourcesRuntime(payload) {
  const resourcesDirectory = normalizeResourcesDirectory(payload?.resourcesDirectory);
  const codeDirectories = normalizeCodeScanDirectories(payload?.codeDirectories);
  const resources = collectResourcesEntries(resourcesDirectory);
  const calls = collectResourcesRuntimeCalls(codeDirectories);
  const staticCalls = calls.filter((call) => call.kind === "static");
  const dynamicCalls = calls.filter((call) => call.kind === "dynamic");
  const usedResources = new Set();

  for (const call of staticCalls) {
    const matchedResources = resources.filter((resource) => resourceMatchesRuntimeCall(resource, call));
    call.matchedResources = matchedResources.map((resource) => resource.path);
    call.matchCount = matchedResources.length;
    call.status = matchedResources.length > 0 ? "matched" : "missing";
    for (const resource of matchedResources) {
      usedResources.add(resource.path);
    }
  }

  for (const resource of resources) {
    resource.used = usedResources.has(resource.path);
  }

  const unusedResources = resources.filter((resource) => !resource.used);
  const missingCalls = staticCalls.filter((call) => call.status === "missing");
  return {
    resources,
    staticCalls,
    unusedResources,
    missingCalls,
    dynamicCalls,
    summary: {
      resourcesDirectory,
      resourcesDirectoryExists: !!statPath(resourcesDirectory)?.isDirectory(),
      codeDirectories,
      resourceCount: resources.length,
      usedResourceCount: usedResources.size,
      unusedResourceCount: unusedResources.length,
      scannedCodeFileCount: calls.scannedCodeFileCount || 0,
      staticCallCount: staticCalls.length,
      matchedCallCount: staticCalls.length - missingCalls.length,
      missingCallCount: missingCalls.length,
      dynamicCallCount: dynamicCalls.length
    },
    warning: "结果只覆盖可静态识别的 resources.load/loadDir 调用；变量、字符串拼接、封装调用和其它 AssetManager 路径需要人工复核。"
  };
}

function normalizeResourcesDirectory(value) {
  const directory = normalizeRelativePath(value || "assets/resources") || "assets/resources";
  if (directory !== "assets/resources" && !directory.startsWith("assets/resources/")) {
    throw new Error(`resources 扫描目录必须位于 assets/resources 下：${directory}`);
  }
  const stat = statPath(directory);
  if (stat && !stat.isDirectory()) {
    throw new Error(`resources 扫描路径存在但不是目录：${directory}`);
  }
  return directory;
}

function normalizeCodeScanDirectories(value) {
  const rawValues = Array.isArray(value) ? value : String(value || "").split(/[\n,;]/);
  const requested = rawValues.map(normalizeRelativePath).filter(Boolean);
  const directories = [...new Set((requested.length > 0 ? requested : DEFAULT_CODE_SCAN_DIRECTORIES)
    .filter((directory) => statPath(directory)?.isDirectory()))].sort(comparePath);
  for (const directory of requested) {
    if (!isInsideAssets(directory)) {
      throw new Error(`代码扫描目录必须位于 assets 下：${directory}`);
    }
  }
  if (directories.length === 0) {
    throw new Error("未找到可扫描的代码目录，请确认 assets/script 或 assets/scripts 是否存在。");
  }
  return directories;
}

function collectResourcesEntries(resourcesDirectory) {
  const entries = [];
  walk(toProjectPath(resourcesDirectory), (fullPath, entry) => {
    if (!entry.isFile()) {
      return;
    }
    const path = toRelativePath(fullPath);
    if (path.toLowerCase().endsWith(".meta")) {
      return;
    }
    const relativeToResources = normalizeRelativePath(Path.relative(toProjectPath("assets/resources"), fullPath));
    const extension = Path.extname(relativeToResources).toLowerCase();
    entries.push({
      path,
      loadPath: normalizeRelativePath(extension ? relativeToResources.slice(0, -extension.length) : relativeToResources),
      extension: extension || "(无扩展名)",
      size: Fs.statSync(fullPath).size,
      used: false
    });
  });
  return entries.sort((left, right) => comparePath(left.path, right.path));
}

function collectResourcesRuntimeCalls(codeDirectories) {
  const calls = [];
  let scannedCodeFileCount = 0;
  for (const directory of codeDirectories) {
    walk(toProjectPath(directory), (fullPath, entry) => {
      if (!entry.isFile() || !CODE_EXTENSIONS.has(Path.extname(entry.name).toLowerCase())) {
        return;
      }
      scannedCodeFileCount++;
      const codePath = toRelativePath(fullPath);
      const text = Fs.readFileSync(fullPath, "utf8");
      calls.push(...extractResourcesRuntimeCalls(text, codePath));
    });
  }
  calls.scannedCodeFileCount = scannedCodeFileCount;
  return calls.sort((left, right) => comparePath(left.codePath, right.codePath) || left.line - right.line);
}

function extractResourcesRuntimeCalls(text, codePath) {
  const calls = [];
  const searchText = maskCommentsAndStrings(text);
  const pattern = /\bresources\s*\.\s*(loadDir|load)\s*\(/g;
  let match;
  while ((match = pattern.exec(searchText))) {
    const argument = readFirstCallArgument(text, pattern.lastIndex);
    if (!argument) {
      continue;
    }
    const expression = argument.text.trim();
    const staticPath = parseStaticStringExpression(expression);
    calls.push({
      kind: staticPath === null ? "dynamic" : "static",
      method: match[1],
      runtimePath: staticPath === null ? "" : normalizeRuntimeLoadPath(staticPath),
      expression,
      codePath,
      line: countTextLines(text, match.index),
      matchedResources: [],
      matchCount: 0,
      status: staticPath === null ? "dynamic" : "pending"
    });
  }
  return calls;
}

function maskCommentsAndStrings(text) {
  const chars = String(text || "").split("");
  let mode = "code";
  let quote = "";
  let escaped = false;
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index];
    const next = chars[index + 1];
    if (mode === "line-comment") {
      if (char === "\n") {
        mode = "code";
      } else {
        chars[index] = " ";
      }
      continue;
    }
    if (mode === "block-comment") {
      if (char === "*" && next === "/") {
        chars[index] = " ";
        chars[index + 1] = " ";
        index++;
        mode = "code";
      } else if (char !== "\n") {
        chars[index] = " ";
      }
      continue;
    }
    if (mode === "string") {
      if (char !== "\n") {
        chars[index] = " ";
      }
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        mode = "code";
        quote = "";
      }
      continue;
    }
    if (char === "/" && next === "/") {
      chars[index] = " ";
      chars[index + 1] = " ";
      index++;
      mode = "line-comment";
    } else if (char === "/" && next === "*") {
      chars[index] = " ";
      chars[index + 1] = " ";
      index++;
      mode = "block-comment";
    } else if (char === "'" || char === "\"" || char === "`") {
      chars[index] = " ";
      mode = "string";
      quote = char;
    }
  }
  return chars.join("");
}

function readFirstCallArgument(text, startIndex) {
  let quote = "";
  let escaped = false;
  let nestedDepth = 0;
  for (let index = startIndex; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      nestedDepth++;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      if (nestedDepth === 0) {
        return { text: text.slice(startIndex, index), endIndex: index };
      }
      nestedDepth--;
      continue;
    }
    if (char === "," && nestedDepth === 0) {
      return { text: text.slice(startIndex, index), endIndex: index };
    }
  }
  return null;
}

function parseStaticStringExpression(expression) {
  const value = String(expression || "").trim();
  if (value.length < 2) {
    return null;
  }
  const quote = value[0];
  if (!["'", "\"", "`"].includes(quote) || value[value.length - 1] !== quote) {
    return null;
  }
  const body = value.slice(1, -1);
  if (quote === "`" && body.includes("${")) {
    return null;
  }
  return body.replace(/\\([\\'"`])/g, "$1");
}

function normalizeRuntimeLoadPath(value) {
  return normalizeRelativePath(String(value || "").replace(/\.[^/.]+$/, ""));
}

function resourceMatchesRuntimeCall(resource, call) {
  const runtimePath = normalizeRuntimeLoadPath(call.runtimePath);
  if (call.method === "loadDir") {
    return !runtimePath || resource.loadPath === runtimePath || resource.loadPath.startsWith(`${runtimePath}/`);
  }
  return resource.loadPath === runtimePath
    || runtimePath === `${resource.loadPath}/spriteFrame`
    || runtimePath === `${resource.loadPath}/texture`;
}

function countTextLines(text, index) {
  return String(text || "").slice(0, index).split("\n").length;
}

module.exports = {
  checkResourcesRuntime,
  normalizeResourcesDirectory,
  normalizeCodeScanDirectories,
  collectResourcesEntries,
  collectResourcesRuntimeCalls,
  extractResourcesRuntimeCalls,
  maskCommentsAndStrings,
  readFirstCallArgument,
  parseStaticStringExpression,
  normalizeRuntimeLoadPath,
  resourceMatchesRuntimeCall,
  countTextLines,
};
