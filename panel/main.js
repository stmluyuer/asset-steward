"use strict";

const { requestMain } = require("./request");
const {
  buildOverviewSnapshot,
  loadOverviewSnapshot,
  saveOverviewSnapshot,
  countKnownOverviewModules,
  buildOverviewRisks: buildOverviewRisksFromState,
  buildOverviewNextSteps: buildOverviewNextStepsFromState,
  buildOverviewOperations: buildOverviewOperationsFromState,
  sortOverviewItems,
} = require("./overview");
const {
  renderOverview: renderOverviewView,
} = require("./render/overview");
const {
  buildAssetScanResultState,
  buildClassifyScanResultState,
  buildDirectoryConventionResultState,
  buildDuplicateAssetResultState,
  buildHistoryDetailResultState,
  buildMaterialTextureResultState,
  buildNodeReferenceResultState,
  buildOverviewState,
  buildPackageSizeResultState,
  buildReferenceResultState,
  buildResourcesRuntimeResultState,
  buildRuntimeLogsResultState,
  buildScenePrefabReferenceHealthResultState,
  buildSessionReportSnapshot: buildSessionReportSnapshotFromState,
  buildUnusedScanResultState,
  formatMoveExecutionResultMessage,
  canExecuteMovePlan,
  formatMovePlanExecutionConfirmMessage,
  getMovePlanExecutionBlockReason,
  isCompleteAssetScanResult,
  isCompleteDirectoryConventionResult,
  isCompleteDuplicateAssetResult,
  isCompleteMaterialTextureResult,
  isCompleteNodeReferenceResult,
  isCompletePackageSizeResult,
  isCompleteReferenceResult,
  isCompleteResourcesRuntimeResult,
  isCompleteScenePrefabReferenceHealthResult,
  isCompleteUnusedResult,
} = require("./state");
const {
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
  getResizableSplitVariableName: getResizableSplitVariableNameFromIndex,
  getResizableSplitAxis: getResizableSplitAxisFromDataset,
  getResizeClientPosition,
  clampResizableSplitSize,
} = require("./layout");
const {
  renderResourcesRuntime: renderResourcesRuntimeView,
  renderPackageSize: renderPackageSizeView,
  renderDirectoryConvention: renderDirectoryConventionView,
  renderMaterialTextures: renderMaterialTexturesView,
  renderDuplicateAssets: renderDuplicateAssetsView,
  renderScenePrefabReferenceHealth: renderScenePrefabReferenceHealthView,
} = require("./render/health");
const {
  formatExportSessionReportSummary,
  toHistorySummary,
} = require("./history");
const {
  filterUnusedCandidates,
} = require("./unused");
const {
  renderHistory: renderHistoryView,
  renderHistoryDetail: renderHistoryDetailView,
  renderLogs: renderLogsView,
} = require("./render/history");
const {
  renderUnusedCandidates: renderUnusedCandidatesView,
  renderUnusedDeletePlan: renderUnusedDeletePlanView,
} = require("./render/unused");
const {
  renderAssetScanReport: renderAssetScanReportView,
  renderReferences: renderReferencesView,
} = require("./render/scan");
const {
  renderNodeReferences: renderNodeReferencesView,
} = require("./render/node-reference");
const {
  buildNodeReferenceCheckPayload,
  syncNodeReferenceUuidInput,
} = require("./node-reference");
const {
  clearClassifySelection,
  filterSelectedPathsByEntries,
  formatClassifyScanSummary,
  selectVisibleClassifyEntries,
  toggleClassifySelection,
} = require("./classify");
const {
  renderClassifyAssets: renderClassifyAssetsView,
  renderClassifyRules: renderClassifyRulesView,
  renderClassifyPlan: renderClassifyPlanView,
} = require("./render/classify");
const {
  TOOL_PANEL_MODULES,
  normalizeToolVisibility,
  isToolVisible,
  buildAllToolsVisibility,
  getToolTitle,
} = require("./tool-panel");
const {
  renderToolPanel: renderToolPanelView,
  applyToolVisibility: applyToolVisibilityView,
} = require("./render/tool-panel");
const {
  safeNumber,
  formatUnusedDeleteBackupScope,
  formatSize,
  formatDate,
} = require("./format");

let entries = [];
let directories = [];
let selectedPaths = new Set();
let rules = [];
let history = [];
let classifyScanSummary = null;
let currentPlan = null;
let scanResourceEntries = [];
let scanIssues = [];
let scanTypeStats = [];
let scanReportSummary = null;
let referenceTargets = [];
let referenceRows = [];
let referenceSummary = null;
let nodeReferenceTargets = [];
let nodeReferenceRows = [];
let nodeReferenceSummary = null;
let runtimeLogs = [];
let selectedHistoryDetail = null;
let resourcesRuntimeResources = [];
let resourcesRuntimeStaticCalls = [];
let resourcesRuntimeUnused = [];
let resourcesRuntimeDynamicCalls = [];
let resourcesRuntimeSummary = null;
let packageDirectoryRanking = [];
let packageTypeRanking = [];
let packageTopFiles = [];
let packageReferencedTopFiles = [];
let packageSizeSummary = null;
let directoryConventionMismatches = [];
let directoryConventionSummary = null;
let duplicateSameNameGroups = [];
let duplicateHashGroups = [];
let duplicateAssetSummary = null;
let materialTextureReferences = [];
let materialTextureSummary = null;
let scenePrefabReferenceIssues = [];
let scenePrefabReferenceSummary = null;
let unusedCandidates = [];
let unusedSummary = null;
let unusedSelectedPaths = new Set();
let unusedDeletePlan = null;
let toolVisibility = {};
let overviewSnapshot = null;

const RESIZABLE_SPLIT_STORAGE_KEY = "asset-steward.resizableSplits.v1";
const OVERVIEW_SNAPSHOT_STORAGE_KEY = "asset-steward.overviewSnapshot.v1";

exports.template = `
<section class="root">
  <header class="toolbox-header">
    <div class="toolbox-title-row">
      <div>
        <h2>项目资源管家</h2>
        <p>资源扫描、自动分类、未引用资源、健康检查和历史报告的治理入口。</p>
      </div>
      <div class="toolbox-actions">
        <button id="resetResizableLayoutButton" title="恢复所有分栏宽度">重置布局</button>
        <button id="toolPanelToggleButton">工具面板</button>
      </div>
    </div>
    <section id="toolPanel" class="tool-panel hidden">
      <header class="tool-panel-header">
        <h3>功能开关</h3>
        <button id="toolPanelEnableAllButton">全部开启</button>
      </header>
      <div id="toolPanelRows" class="tool-panel-rows"></div>
      <div class="hint">关闭后对应功能页和顶部 Tab 会一起隐藏，配置保存到项目 profile。</div>
    </section>
    <nav id="tabBar" class="tab-bar">
      <button class="tab-button active" data-tab="overview">总览</button>
      <button class="tab-button" data-tab="scan">资源扫描</button>
      <button class="tab-button" data-tab="classify">自动分类</button>
      <button class="tab-button" data-tab="unused">未引用资源</button>
      <button class="tab-button" data-tab="node-reference" data-tool-module="scene-node-reference-check">节点引用</button>
      <button class="tab-button" data-tab="resources-runtime" data-tool-module="resources-runtime-check">resources 加载</button>
      <button class="tab-button" data-tab="package-size" data-tool-module="package-size-report">包体统计</button>
      <button class="tab-button" data-tab="directory-convention" data-tool-module="directory-convention">目录规范</button>
      <button class="tab-button" data-tab="material-textures" data-tool-module="material-textures">材质贴图</button>
      <button class="tab-button" data-tab="duplicate-assets" data-tool-module="duplicate-assets">重复资源</button>
      <button class="tab-button" data-tab="scene-prefab-health" data-tool-module="scene-prefab-reference-health">场景引用</button>
      <button class="tab-button" data-tab="history">历史与报告</button>
    </nav>
  </header>

  <section id="overviewTab" class="tab-page active overview-tab">
    <section class="overview-hero">
      <div>
        <h3>风险总览</h3>
        <div id="overviewSummary" class="summary">正在读取项目状态...</div>
        <div id="overviewSnapshotSummary" class="hint">暂无跨会话风险快照。</div>
      </div>
      <div class="overview-actions">
        <button id="overviewRunScanButton">扫描资源</button>
        <button id="overviewRunHealthButton">一键健康检查</button>
        <button id="overviewExportReportButton">导出报告</button>
      </div>
    </section>
    <div class="overview-grid">
      <section class="asset-section">
        <h3>风险分组</h3>
        <div id="overviewRiskRows" class="overview-list"></div>
        <div id="overviewRiskEmpty" class="empty">暂无已知风险。运行资源扫描和健康检查后会汇总到这里。</div>
      </section>
      <section class="asset-section">
        <h3>推荐下一步</h3>
        <div id="overviewNextStepRows" class="overview-list"></div>
      </section>
      <section class="asset-section">
        <h3>危险操作状态</h3>
        <div id="overviewOperationRows" class="overview-list"></div>
      </section>
    </div>
  </section>

  <section id="scanTab" class="tab-page">
    <header class="toolbar">
      <label><span>搜索路径</span><input id="assetScanSearchInput" placeholder="例如 prefab / Fish"></label>
      <label><span>扩展名</span><input id="assetScanExtensionInput" placeholder=".prefab,.fbx"></label>
      <label><span>扫描目录</span><input id="assetScanDirectoryInput" value="assets" placeholder="assets 或 assets/res"></label>
      <label><span>异常忽略</span><input id="assetScanIssueIgnoreInput" value=".gitkeep" placeholder=".gitkeep；多个用逗号分隔"></label>
      <button id="assetScanButton">扫描资源</button>
    </header>

    <div class="summary" id="assetScanSummary">尚未扫描。第一版只预览异常和统计，不删除、不修复、不创建目录。</div>

    <section class="asset-section scan-resource-section">
      <h3>资源列表</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>资源路径</th><th>类型</th><th>大小</th><th>状态</th><th>操作</th></tr></thead>
          <tbody id="assetScanResourceRows"></tbody>
        </table>
        <div id="assetScanResourceEmpty" class="empty">点击“扫描资源”后，可在这里直接对资源执行“查引用”。</div>
      </div>
    </section>

    <div class="scan-workspace resizable-split" data-resize-id="scan-issues">
      <section class="asset-section">
        <h3>异常列表</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>风险</th><th>异常</th><th>路径</th><th>类型</th><th>大小</th><th>操作</th></tr></thead>
            <tbody id="assetScanIssueRows"></tbody>
          </table>
          <div id="assetScanIssueEmpty" class="empty">点击“扫描资源”读取缺失 meta、孤立 meta 和空目录。</div>
        </div>
      </section>
      <div class="resize-handle" data-resize-handle title="拖拽调整宽度"></div>

      <section class="asset-section">
        <h3>类型统计</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>类型</th><th>数量</th><th>总大小</th></tr></thead>
            <tbody id="assetScanTypeRows"></tbody>
          </table>
          <div id="assetScanTypeEmpty" class="empty">扫描后显示按扩展名统计的文件数量和体积。</div>
        </div>
      </section>
    </div>

    <section class="reference-section">
      <h3>资源引用检查</h3>
      <header class="toolbar">
        <label class="wide-field"><span>被检查资源</span><input id="referenceTargetInput" placeholder="assets/res/prefab/Prefab_Player.prefab；多个用逗号分隔"></label>
        <label><span>扫描目录</span><input id="referenceDirectoryInput" value="assets" placeholder="assets"></label>
        <label><span>引用类型</span><input id="referenceExtensionInput" value=".scene,.prefab,.mtl,.material,.anim,.effect"></label>
        <button id="referenceSelectedAssetButton">定位资源查引用</button>
        <button id="referenceCheckButton">检查引用</button>
      </header>
      <div class="summary" id="referenceSummary">静态搜索目标资源 UUID。未找到引用不等于可删除，还需要人工复核动态加载。</div>
      <div class="reference-workspace resizable-split" data-resize-id="reference">
        <section class="asset-section">
          <h3>目标 UUID</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>资源路径</th><th>UUID 数</th><th>UUID</th><th>操作</th></tr></thead>
              <tbody id="referenceTargetRows"></tbody>
            </table>
            <div id="referenceTargetEmpty" class="empty">输入资源路径后点击“检查引用”。</div>
          </div>
        </section>
        <div class="resize-handle" data-resize-handle title="拖拽调整宽度"></div>
        <section class="asset-section">
          <h3>引用方</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>引用文件</th><th>引用位置</th><th>命中 UUID</th><th>关联目标</th><th>操作</th></tr></thead>
              <tbody id="referenceRows"></tbody>
            </table>
            <div id="referenceEmpty" class="empty">找到引用后会列出引用方文件。</div>
          </div>
        </section>
      </div>
    </section>
  </section>

  <section id="classifyTab" class="tab-page">
    <header class="toolbar">
      <label><span>搜索路径</span><input id="searchInput" placeholder="例如 prefab / Fish"></label>
      <label><span>扩展名</span><input id="extensionInput" placeholder=".prefab,.fbx"></label>
      <button id="scanButton">扫描 assets</button>
      <button id="selectVisibleButton">全选当前结果</button>
      <button id="clearSelectionButton">清空选择</button>
    </header>

    <div class="summary" id="scanSummary">尚未扫描。</div>

    <div class="workspace resizable-split" data-resize-id="classify">
      <section class="asset-section">
        <h3>资源列表</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th class="check">选</th><th>资源路径</th><th>类型</th><th>大小</th><th>状态</th><th>操作</th></tr></thead>
            <tbody id="assetRows"></tbody>
          </table>
          <div id="assetEmpty" class="empty">点击“扫描 assets”读取项目资源。</div>
        </div>
      </section>
      <div class="resize-handle" data-resize-handle title="拖拽调整宽度"></div>

      <aside class="settings">
        <h3>移动设置</h3>
        <label><span>模式</span>
          <select id="modeSelect">
            <option value="manual">手动移动到统一目录</option>
            <option value="rules">按扩展名和文件名自动分类</option>
          </select>
        </label>
        <label id="targetDirectoryLabel"><span>目标目录</span><select id="targetDirectorySelect"></select></label>
        <label id="ruleScopeLabel" class="hidden"><span>规则范围</span>
          <select id="ruleScopeSelect">
            <option value="all">全部扫描资源</option>
            <option value="selected">仅勾选资源</option>
          </select>
        </label>
        <label><span>冲突策略</span>
          <select id="conflictPolicySelect">
            <option value="skip">跳过冲突项</option>
            <option value="rename">自动重命名</option>
            <option value="overwrite">覆盖目标文件</option>
          </select>
        </label>
        <button id="previewButton" class="primary">生成移动预览</button>
        <label class="backup"><input id="backupConfirmed" type="checkbox">已备份项目，允许执行覆盖项</label>
        <label class="cleanup"><input id="cleanupEmptyDirectories" type="checkbox" checked>移动后删除本次产生的空源目录</label>
        <button id="executeButton" class="danger" disabled>执行当前预览计划</button>

        <h3>自动分类规则</h3>
        <div class="rule-actions">
          <button id="addRuleButton">新增规则</button>
          <button id="saveRulesButton">保存规则</button>
        </div>
        <div id="ruleRows" class="rule-list"></div>
      </aside>
    </div>

    <section class="plan-section">
      <h3>计划预览</h3>
      <div class="plan-summary" id="planSummary">尚未生成计划。</div>
      <div class="table-wrap plan-table">
        <table>
          <thead><tr><th>状态</th><th>操作</th><th>源路径</th><th>目标路径</th><th>说明</th></tr></thead>
          <tbody id="planRows"></tbody>
        </table>
      </div>
    </section>
  </section>

  <section id="unusedTab" class="tab-page">
    <section class="unused-scan-panel">
      <h3>场景未引用资源候选</h3>
      <header class="toolbar">
        <label class="wide-field"><span>主场景</span><input id="unusedSceneInput" value="assets/scene/main.scene"></label>
        <label><span>扫描目录</span><input id="unusedDirectoryInput" value="assets/res"></label>
        <label><span>搜索</span><input id="unusedSearchInput" placeholder="路径关键字"></label>
        <label><span>扩展名</span><input id="unusedExtensionInput" placeholder=".png,.fbx"></label>
        <button id="unusedScanButton">扫描候选</button>
        <button id="unusedSelectVisibleButton" disabled>全选当前筛选</button>
        <button id="unusedClearSelectionButton" disabled>清空选择</button>
      </header>
      <div class="summary" id="unusedSummary">只展示和定位候选，不提供删除。脚本与 Shader Chunk 强制保护，动态加载需要人工复核。</div>
      <div class="table-wrap unused-candidate-table">
        <table>
          <thead><tr><th class="check">选</th><th>候选资源</th><th>类型</th><th>大小</th><th>风险说明</th><th>操作</th></tr></thead>
          <tbody id="unusedCandidateRows"></tbody>
        </table>
        <div id="unusedCandidateEmpty" class="empty">扫描后显示未从主场景 UUID 依赖图到达的资源候选。</div>
      </div>
    </section>
    <section class="unused-delete-panel">
      <h3>未引用删除候选</h3>
      <header class="toolbar">
        <label><span>备份范围</span><select id="unusedDeleteBackupScopeSelect">
          <option value="selected">仅备份勾选候选和 .meta</option>
          <option value="scan-directory">备份整个扫描目录</option>
        </select></label>
        <button id="unusedDeletePreviewButton">生成删除预览</button>
        <label class="backup"><input id="unusedDeleteConfirmedInput" type="checkbox">已人工复核动态加载风险，允许工具先备份再删除</label>
        <button id="unusedDeleteExecuteButton" class="danger" disabled>执行备份并删除</button>
      </header>
      <div class="summary" id="unusedDeleteSummary">默认不选中任何候选；执行前会重新校验候选并创建备份，备份成功后才通过 AssetDB 删除。</div>
      <div class="table-wrap unused-delete-table">
        <table>
          <thead><tr><th>状态</th><th>候选资源</th><th>类型</th><th>大小</th><th>说明</th></tr></thead>
          <tbody id="unusedDeleteRows"></tbody>
        </table>
        <div id="unusedDeleteEmpty" class="empty">勾选候选后生成删除预览。</div>
      </div>
    </section>
  </section>

  <section id="nodeReferenceTab" class="tab-page tool-tab-page" data-tool-module="scene-node-reference-check">
    <section class="node-reference-panel">
      <div class="panel-title-row">
        <h3>场景节点引用检查</h3>
        <div class="layout-actions">
          <button id="nodeReferenceTileLayoutButton" title="恢复节点引用的平铺布局">平铺</button>
          <button id="nodeReferenceMaxLeftButton" title="放大目标节点列表">最大化目标</button>
          <button id="nodeReferenceMaxRightButton" title="放大引用组件列表">最大化引用</button>
        </div>
      </div>
      <header class="toolbar">
        <label class="wide-field"><span>节点 ID</span><input id="nodeReferenceUuidInput" placeholder="留空时使用当前选中节点"></label>
        <label><span>扫描目录</span><input id="nodeReferenceDirectoryInput" value="assets"></label>
        <label><span>文件类型</span><input id="nodeReferenceExtensionInput" value=".scene,.prefab"></label>
        <button id="nodeReferenceCheckButton">检查节点引用</button>
      </header>
      <div class="summary" id="nodeReferenceSummary">根据目标节点 ID 反查哪些组件属性引用了它；只报告，不修改场景。</div>
      <div class="node-reference-grid resizable-split" data-resize-id="node-reference">
        <section class="asset-section">
          <h3>目标节点</h3>
          <div class="table-wrap node-reference-table">
            <table>
              <thead><tr><th>文件</th><th>节点路径</th><th>节点 ID</th><th>操作</th></tr></thead>
              <tbody id="nodeReferenceTargetRows"></tbody>
            </table>
            <div id="nodeReferenceTargetEmpty" class="empty">检查后显示扫描范围内匹配的目标节点。</div>
          </div>
        </section>
        <div class="resize-handle" data-resize-handle title="拖拽调整宽度"></div>
        <section class="asset-section">
          <h3>引用组件</h3>
          <div class="table-wrap node-reference-table">
            <table>
              <thead><tr><th>文件</th><th>组件节点位置</th><th>组件</th><th>字段</th><th>目标节点</th><th>操作</th></tr></thead>
              <tbody id="nodeReferenceRows"></tbody>
            </table>
            <div id="nodeReferenceEmpty" class="empty">找到引用后显示组件所在节点路径、组件类型和字段。</div>
          </div>
        </section>
      </div>
    </section>
  </section>

  <section id="resourcesRuntimeTab" class="tab-page tool-tab-page" data-tool-module="resources-runtime-check">
    <section class="resources-runtime-panel">
      <div class="panel-title-row">
        <h3>resources 动态加载检查</h3>
        <div class="layout-actions">
          <button id="resourcesRuntimeTileLayoutButton" title="恢复 resources 检查的平铺布局">平铺</button>
          <button id="resourcesRuntimeMaxLeftButton" title="放大疑似未加载资源列表">最大化资源</button>
          <button id="resourcesRuntimeMaxRightButton" title="放大加载调用列表">最大化调用</button>
        </div>
      </div>
      <header class="toolbar">
        <label class="wide-field"><span>代码扫描目录</span><input id="resourcesCodeDirectoriesInput" value="assets/script,assets/scripts"></label>
        <label class="wide-field"><span>resources 目录</span><input id="resourcesDirectoryInput" value="assets/resources"></label>
        <button id="resourcesRuntimeCheckButton">运行检查</button>
      </header>
      <div class="summary" id="resourcesRuntimeSummary">只静态检查 resources.load/loadDir；变量、拼接路径和封装调用需要人工复核。</div>
      <div class="resources-runtime-grid resizable-split" data-resize-id="resources-runtime">
        <section class="asset-section">
          <h3>疑似未加载资源</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>资源路径</th><th>加载路径</th><th>类型</th><th>大小</th><th>操作</th></tr></thead>
              <tbody id="resourcesUnusedRows"></tbody>
            </table>
            <div id="resourcesUnusedEmpty" class="empty">运行检查后显示未被静态路径命中的 resources 资源。</div>
          </div>
        </section>
        <div class="resize-handle" data-resize-handle title="拖拽调整宽度"></div>
        <section class="asset-section">
          <h3>加载调用</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>状态</th><th>方法</th><th>加载路径/表达式</th><th>代码位置</th><th>匹配资源</th><th>操作</th></tr></thead>
              <tbody id="resourcesCallRows"></tbody>
            </table>
            <div id="resourcesCallEmpty" class="empty">运行检查后显示静态路径、疑似缺失路径和动态调用。</div>
          </div>
        </section>
      </div>
      <details class="resources-all-details">
        <summary>全部 resources 资源</summary>
        <div class="table-wrap resources-all-table">
          <table>
            <thead><tr><th>状态</th><th>资源路径</th><th>加载路径</th><th>类型</th><th>大小</th><th>操作</th></tr></thead>
            <tbody id="resourcesAllRows"></tbody>
          </table>
          <div id="resourcesAllEmpty" class="empty">当前 resources 目录没有普通资源，或尚未运行检查。</div>
        </div>
      </details>
    </section>
  </section>

  <section id="packageSizeTab" class="tab-page tool-tab-page" data-tool-module="package-size-report">
    <section class="package-size-panel resizable-panel" data-resize-id="package-size-panel">
      <div class="panel-title-row">
        <h3>包体贡献统计</h3>
        <div class="layout-actions">
          <button id="packageSizeTileLayoutButton" title="恢复包体统计的平铺布局">平铺</button>
          <button id="packageSizeMaxStatsButton" title="放大目录、类型和大文件三栏">最大化统计</button>
          <button id="packageSizeMaxReferencedButton" title="放大主场景递归引用大文件列表">最大化引用</button>
        </div>
      </div>
      <header class="toolbar">
        <label><span>扫描目录</span><input id="packageSizeDirectoryInput" value="assets"></label>
        <label class="wide-field"><span>主场景</span><input id="packageSizeSceneInput" value="assets/scene/main.scene"></label>
        <label><span>Top 文件数</span><input id="packageSizeTopNInput" type="number" min="1" max="200" value="20"></label>
        <label class="inline-check"><input id="packageSizeIncludeMetaInput" type="checkbox"><span>包含 .meta</span></label>
        <button id="packageSizeReportButton">统计体积</button>
      </header>
      <div class="summary" id="packageSizeSummary">统计项目源资源磁盘体积，不等同于最终构建包体。</div>
      <div class="package-size-grid resizable-split" data-resize-id="package-size">
        <section class="asset-section">
          <h3>目录递归大小排行</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>目录</th><th>文件数</th><th>总大小</th><th>占比</th><th>操作</th></tr></thead>
              <tbody id="packageDirectoryRows"></tbody>
            </table>
            <div id="packageDirectoryEmpty" class="empty">统计后显示扫描目录下所有子目录的递归大小。</div>
          </div>
        </section>
        <div class="resize-handle" data-resize-handle title="拖拽调整宽度"></div>
        <section class="asset-section">
          <h3>类型大小排行</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>类型</th><th>文件数</th><th>总大小</th><th>占比</th></tr></thead>
              <tbody id="packageTypeRows"></tbody>
            </table>
            <div id="packageTypeEmpty" class="empty">统计后显示扩展名大小排行。</div>
          </div>
        </section>
        <div class="resize-handle" data-resize-handle title="拖拽调整宽度"></div>
        <section class="asset-section">
          <h3>Top 大文件</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>资源路径</th><th>类型</th><th>大小</th><th>占比</th><th>操作</th></tr></thead>
              <tbody id="packageTopFileRows"></tbody>
            </table>
            <div id="packageTopFileEmpty" class="empty">统计后显示体积最大的文件。</div>
          </div>
        </section>
      </div>
      <div class="resize-handle resize-handle-vertical" data-resize-handle data-resize-axis="y" data-resize-variable="top" title="拖拽调整高度"></div>
      <section class="referenced-size-section">
        <h3>Top 主场景递归引用大文件</h3>
        <p class="hint">只统计从主场景沿序列化 UUID 依赖链递归可达的资源；resources.load/loadDir 即使可静态识别也不计入。</p>
        <div class="table-wrap referenced-size-table">
          <table>
            <thead><tr><th>资源路径</th><th>类型</th><th>大小</th><th>引用链</th><th>操作</th></tr></thead>
            <tbody id="packageReferencedFileRows"></tbody>
          </table>
          <div id="packageReferencedFileEmpty" class="empty">统计后显示主场景递归可达的大文件及一条引用链。</div>
        </div>
      </section>
    </section>
  </section>

  <section id="directoryConventionTab" class="tab-page tool-tab-page" data-tool-module="directory-convention">
    <section class="directory-convention-panel">
      <h3>目录规范检查</h3>
      <header class="toolbar">
        <label><span>扫描目录</span><input id="directoryConventionInput" value="assets/res"></label>
        <button id="directoryConventionCheckButton">检查目录规范</button>
        <button id="directoryConventionPreviewButton" class="primary" disabled>生成移动预览</button>
      </header>
      <div class="summary" id="directoryConventionSummary">复用当前自动分类规则，只报告首个命中规则下目录不符合的资源。</div>
      <div class="table-wrap directory-convention-table">
        <table>
          <thead><tr><th>资源路径</th><th>类型</th><th>当前目录</th><th>建议目录</th><th>命中规则</th><th>状态</th><th>操作</th></tr></thead>
          <tbody id="directoryConventionRows"></tbody>
        </table>
        <div id="directoryConventionEmpty" class="empty">检查后显示目录不符合当前自动分类规则的资源。</div>
      </div>
    </section>
  </section>

  <section id="materialTexturesTab" class="tab-page tool-tab-page" data-tool-module="material-textures">
    <section class="material-texture-panel">
      <h3>材质贴图检查</h3>
      <header class="toolbar">
        <label><span>扫描目录</span><input id="materialTextureDirectoryInput" value="assets/res"></label>
        <label class="wide-field"><span>主场景</span><input id="materialTextureSceneInput" value="assets/scene/main.scene"></label>
        <button id="materialTextureCheckButton">检查材质贴图</button>
      </header>
      <div class="summary" id="materialTextureSummary">扫描 .mtl/.material/.pmtl；无法解析的贴图 UUID 标记为待复核，不自动修复。</div>
      <div class="table-wrap material-texture-table">
        <table>
          <thead><tr><th>状态</th><th>主场景可达</th><th>材质</th><th>属性</th><th>贴图 UUID</th><th>贴图资源</th><th>操作</th></tr></thead>
          <tbody id="materialTextureRows"></tbody>
        </table>
        <div id="materialTextureEmpty" class="empty">检查后同时显示正常材质贴图关系和待复核项。</div>
      </div>
    </section>
  </section>

  <section id="duplicateAssetsTab" class="tab-page tool-tab-page" data-tool-module="duplicate-assets">
    <section class="duplicate-asset-panel">
      <div class="panel-title-row">
        <h3>重复资源检查</h3>
        <div class="layout-actions">
          <button id="duplicateAssetTileLayoutButton" title="恢复重复资源检查的平铺布局">平铺</button>
          <button id="duplicateAssetMaxLeftButton" title="放大同名资源列表">最大化同名</button>
          <button id="duplicateAssetMaxRightButton" title="放大重复内容列表">最大化内容</button>
        </div>
      </div>
      <header class="toolbar">
        <label><span>扫描目录</span><input id="duplicateAssetDirectoryInput" value="assets/res"></label>
        <button id="duplicateAssetCheckButton">检查重复资源</button>
      </header>
      <div class="summary" id="duplicateAssetSummary">检查不同目录同名资源和 SHA-256 相同内容；只报告和定位，不自动删除。</div>
      <div class="duplicate-asset-grid resizable-split" data-resize-id="duplicate-assets">
        <section class="asset-section">
          <h3>同名资源组</h3>
          <div class="table-wrap duplicate-asset-table">
            <table>
              <thead><tr><th>组</th><th>组内数量</th><th>资源路径</th><th>类型</th><th>大小</th><th>操作</th></tr></thead>
              <tbody id="duplicateSameNameRows"></tbody>
            </table>
            <div id="duplicateSameNameEmpty" class="empty">检查后显示不同目录下的同名资源。</div>
          </div>
        </section>
        <div class="resize-handle" data-resize-handle title="拖拽调整宽度"></div>
        <section class="asset-section">
          <h3>重复内容组</h3>
          <div class="table-wrap duplicate-asset-table">
            <table>
              <thead><tr><th>Hash</th><th>组内数量</th><th>资源路径</th><th>类型</th><th>大小</th><th>操作</th></tr></thead>
              <tbody id="duplicateHashRows"></tbody>
            </table>
            <div id="duplicateHashEmpty" class="empty">检查后显示 SHA-256 相同的重复内容资源。</div>
          </div>
        </section>
      </div>
    </section>
  </section>

  <section id="scenePrefabHealthTab" class="tab-page tool-tab-page" data-tool-module="scene-prefab-reference-health">
    <section class="scene-prefab-health-panel">
      <h3>场景和 Prefab 引用健康</h3>
      <header class="toolbar">
        <label><span>扫描目录</span><input id="scenePrefabHealthDirectoryInput" value="assets"></label>
        <label><span>文件类型</span><input id="scenePrefabHealthExtensionInput" value=".scene,.prefab"></label>
        <label class="wide-field"><span>UUID 白名单</span><input id="scenePrefabHealthWhitelistInput" placeholder="逗号或换行分隔，精确匹配完整 UUID"></label>
        <button id="scenePrefabHealthCheckButton">检查引用健康</button>
      </header>
      <div class="summary" id="scenePrefabHealthSummary">无法解析 UUID 标记为待复核；白名单精确匹配，只报告和定位，不自动修复。</div>
      <div class="table-wrap scene-prefab-health-table">
        <table>
          <thead><tr><th>状态</th><th>文件</th><th>类型</th><th>无法解析 UUID</th><th>命中次数</th><th>操作</th></tr></thead>
          <tbody id="scenePrefabHealthRows"></tbody>
        </table>
        <div id="scenePrefabHealthEmpty" class="empty">检查后显示无法在项目资源 UUID 图中解析且未命中白名单的引用。</div>
      </div>
    </section>
  </section>

  <section id="historyTab" class="tab-page">
    <section class="history-panel">
      <h3>移动历史与反向计划</h3>
      <label><span>历史记录</span><select id="historySelect"></select></label>
      <button id="historyDetailButton">查看详情</button>
      <button id="reverseButton">生成反向移动预览</button>
      <p class="hint">反向计划不会恢复覆盖前的原目标文件，执行前仍需人工复核。</p>
      <p class="hint">反向计划会显示在“自动分类”页的计划预览中，确认后可执行。</p>
      <div class="summary" id="historyDetailSummary">选择一条移动历史后查看完整已移动项和清理结果。</div>
      <div class="table-wrap history-detail-table">
        <table>
          <thead><tr><th>动作</th><th>源路径</th><th>目标路径</th><th>覆盖可恢复</th></tr></thead>
          <tbody id="historyDetailRows"></tbody>
        </table>
        <div id="historyDetailEmpty" class="empty">暂无历史详情。</div>
      </div>
      <details class="history-cleanup-details">
        <summary>空目录清理结果</summary>
        <div id="historyCleanupSummary" class="summary">暂无清理结果。</div>
      </details>
    </section>
    <section class="history-panel report-panel">
      <h3>会话报告导出</h3>
      <div class="rule-actions">
        <button id="exportSessionReportButton" class="primary">导出 Markdown + JSON</button>
      </div>
      <div class="summary" id="exportSessionReportSummary">导出当前面板会话中已运行模块的最近结果、当前移动计划、历史摘要和日志。</div>
    </section>
    <section class="history-panel maintenance-panel">
      <h3>项目维护</h3>
      <label><span>重载方式</span><select id="projectCacheReloadStrategySelect">
        <option value="refresh-only">2A：刷新资源，必要时手动重开</option>
        <option value="editor-reload">2B：执行编辑器级重载/重启</option>
      </select></label>
      <div class="rule-actions">
        <button id="projectCacheCleanButton" class="danger">清理 library/temp</button>
      </div>
      <div class="summary" id="projectCacheCleanSummary">删除项目根目录下的 library 和 temp 缓存目录，然后按所选方式刷新或重载项目；执行前请先关闭预览和构建任务。</div>
    </section>
    <section class="history-panel log-panel">
      <h3>运行日志</h3>
      <div class="rule-actions">
        <button id="clearLogButton">清空日志</button>
      </div>
      <div class="table-wrap log-table">
        <table>
          <thead><tr><th>时间</th><th>级别</th><th>内容</th></tr></thead>
          <tbody id="logRows"></tbody>
        </table>
        <div id="logEmpty" class="empty">暂无日志。扫描 warning、引用检查 warning 和执行失败会记录在这里。</div>
      </div>
    </section>
  </section>

  <footer id="statusText">移动前建议提交或备份项目。</footer>
</section>
`;

exports.style = `
.root { box-sizing: border-box; color: #ddd; display: flex; flex-direction: column; font-size: 12px; height: 100%; padding: 10px; }
.toolbox-header { border-bottom: 1px solid #444; margin-bottom: 10px; padding-bottom: 8px; }
.toolbox-title-row { align-items: flex-start; display: flex; gap: 12px; justify-content: space-between; }
.toolbox-actions { align-items: center; display: flex; flex: 0 0 auto; gap: 6px; }
.toolbox-header h2 { color: #f2f2f2; font-size: 16px; margin: 0 0 4px; }
.toolbox-header p { color: #aaa; margin: 0 0 8px; }
.tool-panel { background: #242424; border: 1px solid #444; margin: 8px 0; padding: 8px; }
.tool-panel-header { align-items: center; display: flex; justify-content: space-between; margin-bottom: 6px; }
.tool-panel-header h3 { color: #eee; font-size: 13px; margin: 0; }
.tool-panel-rows { display: grid; gap: 6px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.tool-panel-row { align-items: center; border: 1px solid #3b3b3b; display: flex; gap: 7px; min-height: 28px; padding: 4px 6px; }
.tool-panel-row input { height: auto; }
.tool-panel-row span { color: #ddd; }
.tool-panel-row small { color: #999; margin-left: auto; }
.tab-bar { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; }
.tab-button.active { background: #315273; border-color: #4b7ba7; color: #fff; }
.tab-page { display: none; flex: 1; min-height: 0; }
.tab-page.active { display: flex; flex-direction: column; }
.toolbar, .rule-actions { align-items: center; display: flex; gap: 8px; }
.toolbar { margin-bottom: 8px; }
label { align-items: center; display: flex; gap: 6px; }
input, select { background: #2f2f2f; border: 1px solid #555; box-sizing: border-box; color: #eee; height: 25px; }
input { padding: 0 6px; }
select { min-width: 190px; }
button { background: #3d3d3d; border: 1px solid #666; color: #eee; cursor: pointer; min-height: 25px; padding: 0 10px; }
button:hover { border-color: #fd942b; }
button:disabled { cursor: default; opacity: .45; }
.primary { background: #315273; border-color: #4b7ba7; }
.danger { background: #653333; border-color: #9b4c4c; }
.summary, .plan-summary { color: #bcdcff; min-height: 20px; padding: 4px 0; }
.overview-tab { gap: 10px; overflow: auto; }
.overview-hero { align-items: center; background: #242424; border: 1px solid #444; display: flex; gap: 12px; justify-content: space-between; padding: 12px; }
.overview-hero h3 { color: #f2f2f2; font-size: 15px; margin: 0 0 4px; }
.overview-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.overview-grid { display: grid; flex: 1; gap: 10px; grid-template-columns: minmax(320px, 1.1fr) minmax(280px, .9fr) minmax(280px, .9fr); min-height: 0; }
.overview-list { display: flex; flex-direction: column; gap: 8px; overflow: auto; }
.overview-row { border: 1px solid #3b3b3b; background: #202020; display: grid; gap: 5px; grid-template-columns: 1fr auto; padding: 8px; }
.overview-row strong { color: #f2f2f2; font-size: 13px; }
.overview-row p { color: #bdbdbd; grid-column: 1 / span 2; line-height: 1.45; margin: 0; white-space: normal; }
.overview-row button { align-self: start; grid-column: 2; grid-row: 1; }
.overview-score { color: #ffcf7a; font-size: 11px; margin-left: 6px; }
.overview-row.warning { border-color: #8a6838; color: inherit; }
.overview-row.blocked { border-color: #9b4c4c; color: inherit; }
.overview-row.ready { border-color: #4f7d54; color: inherit; }
.workspace { display: grid; flex: 1; gap: 10px; grid-template-columns: var(--split-left, minmax(560px, 1fr)) 8px minmax(280px, 360px); min-height: 260px; }
.scan-workspace { display: grid; flex: 1; gap: 10px; grid-template-columns: var(--split-left, minmax(560px, 1fr)) 8px minmax(280px, 360px); min-height: 0; }
.scan-resource-section { flex: 0 0 180px; margin-bottom: 10px; }
.reference-section { border: 1px solid #444; box-sizing: border-box; flex: 0 0 255px; margin-top: 10px; min-height: 0; padding: 8px; }
.reference-section > h3 { color: #eee; font-size: 13px; margin: 0 0 8px; }
.reference-workspace { display: grid; gap: 10px; grid-template-columns: var(--split-left, minmax(420px, 1fr)) 8px minmax(420px, 1.2fr); height: 170px; min-height: 0; }
.wide-field input { width: 360px; }
.asset-section, .settings, .plan-section { border: 1px solid #444; box-sizing: border-box; min-height: 0; padding: 8px; }
.asset-section { display: flex; flex-direction: column; }
.settings { overflow: auto; }
.settings > label { justify-content: space-between; margin-bottom: 7px; }
.settings > button { margin-bottom: 7px; width: 100%; }
.settings h3, .asset-section h3, .plan-section h3 { color: #eee; font-size: 13px; margin: 0 0 8px; }
.settings h3:not(:first-child) { border-top: 1px solid #444; margin-top: 10px; padding-top: 10px; }
.table-wrap { border: 1px solid #3b3b3b; flex: 1; overflow: auto; position: relative; }
table { border-collapse: collapse; min-width: 100%; }
th, td { border-bottom: 1px solid #383838; padding: 5px 6px; text-align: left; white-space: nowrap; }
th { background: #252525; position: sticky; top: 0; z-index: 1; }
.check { text-align: center; width: 34px; }
.path { max-width: 520px; overflow: hidden; text-overflow: ellipsis; }
.warning { color: #ffcf7a; }
.ready { color: #a7e7ad; }
.blocked { color: #ff9b9b; }
.empty { color: #999; padding: 22px; text-align: center; }
.rule-actions { margin-bottom: 6px; }
.rule-list { max-height: 210px; overflow: auto; }
.rule-row { align-items: center; border-bottom: 1px solid #3b3b3b; display: grid; gap: 4px; grid-template-columns: 22px 1fr 28px; grid-template-rows: repeat(3, 25px); padding: 5px 0; }
.rule-row input { min-width: 0; width: 100%; }
.rule-row .enabled { grid-column: 1; grid-row: 1 / span 3; }
.rule-row .extensions { grid-column: 2; grid-row: 1; }
.rule-row .keywords { grid-column: 2; grid-row: 2; }
.rule-row .target { grid-column: 2; grid-row: 3; }
.rule-row button { grid-column: 3; grid-row: 1 / span 3; padding: 0; width: 28px; }
.backup { color: #ffcf7a; justify-content: flex-start !important; }
.backup input, .cleanup input { height: auto; }
.cleanup { color: #bcdcff; justify-content: flex-start !important; }
.hint { color: #aaa; line-height: 1.5; margin: 4px 0; }
.hidden { display: none !important; }
.plan-section { flex: 0 0 230px; margin-top: 10px; overflow: hidden; }
.plan-table { height: 160px; }
.feature-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.feature-card, .history-panel, .node-reference-panel, .resources-runtime-panel, .package-size-panel, .directory-convention-panel, .material-texture-panel, .duplicate-asset-panel, .scene-prefab-health-panel, .unused-scan-panel, .unused-delete-panel { border: 1px solid #444; background: #242424; padding: 12px; }
.feature-card h3, .history-panel h3, .node-reference-panel h3, .resources-runtime-panel h3, .package-size-panel h3, .directory-convention-panel h3, .material-texture-panel h3, .duplicate-asset-panel h3, .scene-prefab-health-panel h3, .unused-scan-panel h3, .unused-delete-panel h3 { color: #f2f2f2; font-size: 14px; margin: 0 0 8px; }
.feature-card p { color: #bdbdbd; line-height: 1.6; margin: 0; }
.warning-card { border-color: #8a6838; }
.panel-title-row { align-items: center; display: flex; gap: 10px; justify-content: space-between; margin-bottom: 8px; }
.panel-title-row h3 { margin: 0 !important; }
.layout-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.layout-actions button { min-height: 23px; padding: 0 8px; }
.resources-runtime-panel { flex: 0 0 auto; margin-bottom: 10px; }
.resources-runtime-grid { display: grid; gap: 10px; grid-template-columns: var(--split-left, minmax(360px, .9fr)) 8px minmax(420px, 1.4fr); height: 250px; }
.resources-all-details { margin-top: 10px; }
.resources-all-details summary { color: #bcdcff; cursor: pointer; }
.resources-all-table { height: 180px; margin-top: 8px; }
.package-size-panel { flex: 0 0 auto; margin-bottom: 10px; }
.package-size-grid { display: grid; gap: 10px; grid-template-columns: var(--split-left, minmax(360px, 1fr)) 8px var(--split-middle, minmax(280px, .75fr)) 8px minmax(420px, 1.2fr); height: var(--split-top, 260px); }
.referenced-size-section { border: 1px solid #444; margin-top: 10px; padding: 8px; }
.referenced-size-table { height: 230px; }
.reference-chain { max-width: 720px; white-space: normal; }
.directory-convention-panel { flex: 0 0 auto; margin-bottom: 10px; }
.directory-convention-table { height: 270px; }
.material-texture-panel { flex: 0 0 auto; margin-bottom: 10px; }
.material-texture-table { height: 320px; }
.duplicate-asset-panel { flex: 0 0 auto; margin-bottom: 10px; }
.duplicate-asset-grid { display: grid; gap: 10px; grid-template-columns: var(--split-left, 1fr) 8px 1fr; height: 340px; }
.duplicate-asset-table { height: 300px; }
.scene-prefab-health-panel { flex: 0 0 auto; margin-bottom: 10px; }
.scene-prefab-health-table { height: 320px; }
#unusedTab { overflow: auto; }
.unused-scan-panel { display: flex; flex: 0 0 auto; flex-direction: column; margin-bottom: 10px; min-height: 0; }
.unused-candidate-table { flex: 0 0 330px; min-height: 0; }
.unused-delete-panel { flex: 0 0 auto; margin-bottom: 10px; }
.unused-delete-panel .toolbar { flex-wrap: wrap; }
.unused-delete-table { flex: 0 0 180px; height: 180px; }
.inline-check input { height: auto; }
.tool-tab-page { overflow: auto; }
.node-reference-panel { flex: 0 0 auto; margin-bottom: 10px; }
.node-reference-grid { display: grid; gap: 10px; grid-template-columns: var(--split-left, minmax(360px, .9fr)) 8px minmax(420px, 1.4fr); height: 260px; }
.node-reference-table { height: 220px; }
.history-panel { max-width: 720px; }
.history-panel label { justify-content: space-between; margin-bottom: 8px; }
.history-panel button { margin-bottom: 8px; }
.history-detail-table { height: 220px; margin-top: 8px; }
.history-cleanup-details summary { color: #bcdcff; cursor: pointer; }
.report-panel, .maintenance-panel { margin-top: 10px; max-width: none; }
.log-panel { margin-top: 10px; max-width: none; }
.log-table { height: 220px; }
.resize-handle { align-self: stretch; background: #343434; border-left: 1px solid #4a4a4a; border-right: 1px solid #242424; cursor: col-resize; min-height: 100%; touch-action: none; user-select: none; }
.resize-handle:hover, .resize-handle.dragging { background: #4b7ba7; border-left-color: #6da2cf; }
.resize-handle-vertical { border-left: 0; border-right: 0; border-top: 1px solid #4a4a4a; border-bottom: 1px solid #242424; cursor: row-resize; height: 8px; margin-top: 10px; min-height: 8px; }
.resizable-split > .asset-section, .resizable-split > .settings { min-width: 0; }
body.resizing-split { cursor: col-resize; user-select: none; }
body.resizing-split-y { cursor: row-resize; user-select: none; }
footer { color: #ffcf7a; min-height: 22px; padding-top: 7px; }
`;

exports.$ = {
  resetResizableLayoutButton: "#resetResizableLayoutButton",
  toolPanelToggleButton: "#toolPanelToggleButton",
  toolPanelEnableAllButton: "#toolPanelEnableAllButton",
  toolPanel: "#toolPanel",
  toolPanelRows: "#toolPanelRows",
  overviewTab: "#overviewTab",
  overviewSummary: "#overviewSummary",
  overviewSnapshotSummary: "#overviewSnapshotSummary",
  overviewRiskRows: "#overviewRiskRows",
  overviewRiskEmpty: "#overviewRiskEmpty",
  overviewNextStepRows: "#overviewNextStepRows",
  overviewOperationRows: "#overviewOperationRows",
  overviewRunScanButton: "#overviewRunScanButton",
  overviewRunHealthButton: "#overviewRunHealthButton",
  overviewExportReportButton: "#overviewExportReportButton",
  tabBar: "#tabBar",
  scanTab: "#scanTab",
  classifyTab: "#classifyTab",
  unusedTab: "#unusedTab",
  nodeReferenceTab: "#nodeReferenceTab",
  resourcesRuntimeTab: "#resourcesRuntimeTab",
  packageSizeTab: "#packageSizeTab",
  directoryConventionTab: "#directoryConventionTab",
  materialTexturesTab: "#materialTexturesTab",
  duplicateAssetsTab: "#duplicateAssetsTab",
  scenePrefabHealthTab: "#scenePrefabHealthTab",
  historyTab: "#historyTab",
  assetScanSearchInput: "#assetScanSearchInput",
  assetScanExtensionInput: "#assetScanExtensionInput",
  assetScanDirectoryInput: "#assetScanDirectoryInput",
  assetScanIssueIgnoreInput: "#assetScanIssueIgnoreInput",
  assetScanButton: "#assetScanButton",
  assetScanSummary: "#assetScanSummary",
  assetScanResourceRows: "#assetScanResourceRows",
  assetScanResourceEmpty: "#assetScanResourceEmpty",
  assetScanIssueRows: "#assetScanIssueRows",
  assetScanIssueEmpty: "#assetScanIssueEmpty",
  assetScanTypeRows: "#assetScanTypeRows",
  assetScanTypeEmpty: "#assetScanTypeEmpty",
  referenceTargetInput: "#referenceTargetInput",
  referenceDirectoryInput: "#referenceDirectoryInput",
  referenceExtensionInput: "#referenceExtensionInput",
  referenceSelectedAssetButton: "#referenceSelectedAssetButton",
  referenceCheckButton: "#referenceCheckButton",
  referenceSummary: "#referenceSummary",
  referenceTargetRows: "#referenceTargetRows",
  referenceTargetEmpty: "#referenceTargetEmpty",
  referenceRows: "#referenceRows",
  referenceEmpty: "#referenceEmpty",
  nodeReferenceUuidInput: "#nodeReferenceUuidInput",
  nodeReferenceDirectoryInput: "#nodeReferenceDirectoryInput",
  nodeReferenceExtensionInput: "#nodeReferenceExtensionInput",
  nodeReferenceCheckButton: "#nodeReferenceCheckButton",
  nodeReferenceTileLayoutButton: "#nodeReferenceTileLayoutButton",
  nodeReferenceMaxLeftButton: "#nodeReferenceMaxLeftButton",
  nodeReferenceMaxRightButton: "#nodeReferenceMaxRightButton",
  nodeReferenceSummary: "#nodeReferenceSummary",
  nodeReferenceTargetRows: "#nodeReferenceTargetRows",
  nodeReferenceTargetEmpty: "#nodeReferenceTargetEmpty",
  nodeReferenceRows: "#nodeReferenceRows",
  nodeReferenceEmpty: "#nodeReferenceEmpty",
  unusedSceneInput: "#unusedSceneInput",
  unusedDirectoryInput: "#unusedDirectoryInput",
  unusedSearchInput: "#unusedSearchInput",
  unusedExtensionInput: "#unusedExtensionInput",
  unusedScanButton: "#unusedScanButton",
  unusedSelectVisibleButton: "#unusedSelectVisibleButton",
  unusedClearSelectionButton: "#unusedClearSelectionButton",
  unusedSummary: "#unusedSummary",
  unusedCandidateRows: "#unusedCandidateRows",
  unusedCandidateEmpty: "#unusedCandidateEmpty",
  unusedDeleteBackupScopeSelect: "#unusedDeleteBackupScopeSelect",
  unusedDeletePreviewButton: "#unusedDeletePreviewButton",
  unusedDeleteConfirmedInput: "#unusedDeleteConfirmedInput",
  unusedDeleteExecuteButton: "#unusedDeleteExecuteButton",
  unusedDeleteSummary: "#unusedDeleteSummary",
  unusedDeleteRows: "#unusedDeleteRows",
  unusedDeleteEmpty: "#unusedDeleteEmpty",
  resourcesCodeDirectoriesInput: "#resourcesCodeDirectoriesInput",
  resourcesDirectoryInput: "#resourcesDirectoryInput",
  resourcesRuntimeCheckButton: "#resourcesRuntimeCheckButton",
  resourcesRuntimeTileLayoutButton: "#resourcesRuntimeTileLayoutButton",
  resourcesRuntimeMaxLeftButton: "#resourcesRuntimeMaxLeftButton",
  resourcesRuntimeMaxRightButton: "#resourcesRuntimeMaxRightButton",
  resourcesRuntimeSummary: "#resourcesRuntimeSummary",
  resourcesUnusedRows: "#resourcesUnusedRows",
  resourcesUnusedEmpty: "#resourcesUnusedEmpty",
  resourcesCallRows: "#resourcesCallRows",
  resourcesCallEmpty: "#resourcesCallEmpty",
  resourcesAllRows: "#resourcesAllRows",
  resourcesAllEmpty: "#resourcesAllEmpty",
  packageSizeDirectoryInput: "#packageSizeDirectoryInput",
  packageSizeSceneInput: "#packageSizeSceneInput",
  packageSizeTopNInput: "#packageSizeTopNInput",
  packageSizeIncludeMetaInput: "#packageSizeIncludeMetaInput",
  packageSizeReportButton: "#packageSizeReportButton",
  packageSizeTileLayoutButton: "#packageSizeTileLayoutButton",
  packageSizeMaxStatsButton: "#packageSizeMaxStatsButton",
  packageSizeMaxReferencedButton: "#packageSizeMaxReferencedButton",
  packageSizeSummary: "#packageSizeSummary",
  packageDirectoryRows: "#packageDirectoryRows",
  packageDirectoryEmpty: "#packageDirectoryEmpty",
  packageTypeRows: "#packageTypeRows",
  packageTypeEmpty: "#packageTypeEmpty",
  packageTopFileRows: "#packageTopFileRows",
  packageTopFileEmpty: "#packageTopFileEmpty",
  packageReferencedFileRows: "#packageReferencedFileRows",
  packageReferencedFileEmpty: "#packageReferencedFileEmpty",
  directoryConventionInput: "#directoryConventionInput",
  directoryConventionCheckButton: "#directoryConventionCheckButton",
  directoryConventionPreviewButton: "#directoryConventionPreviewButton",
  directoryConventionSummary: "#directoryConventionSummary",
  directoryConventionRows: "#directoryConventionRows",
  directoryConventionEmpty: "#directoryConventionEmpty",
  materialTextureDirectoryInput: "#materialTextureDirectoryInput",
  materialTextureSceneInput: "#materialTextureSceneInput",
  materialTextureCheckButton: "#materialTextureCheckButton",
  materialTextureSummary: "#materialTextureSummary",
  materialTextureRows: "#materialTextureRows",
  materialTextureEmpty: "#materialTextureEmpty",
  duplicateAssetDirectoryInput: "#duplicateAssetDirectoryInput",
  duplicateAssetCheckButton: "#duplicateAssetCheckButton",
  duplicateAssetTileLayoutButton: "#duplicateAssetTileLayoutButton",
  duplicateAssetMaxLeftButton: "#duplicateAssetMaxLeftButton",
  duplicateAssetMaxRightButton: "#duplicateAssetMaxRightButton",
  duplicateAssetSummary: "#duplicateAssetSummary",
  duplicateSameNameRows: "#duplicateSameNameRows",
  duplicateSameNameEmpty: "#duplicateSameNameEmpty",
  duplicateHashRows: "#duplicateHashRows",
  duplicateHashEmpty: "#duplicateHashEmpty",
  scenePrefabHealthDirectoryInput: "#scenePrefabHealthDirectoryInput",
  scenePrefabHealthExtensionInput: "#scenePrefabHealthExtensionInput",
  scenePrefabHealthWhitelistInput: "#scenePrefabHealthWhitelistInput",
  scenePrefabHealthCheckButton: "#scenePrefabHealthCheckButton",
  scenePrefabHealthSummary: "#scenePrefabHealthSummary",
  scenePrefabHealthRows: "#scenePrefabHealthRows",
  scenePrefabHealthEmpty: "#scenePrefabHealthEmpty",
  exportSessionReportButton: "#exportSessionReportButton",
  exportSessionReportSummary: "#exportSessionReportSummary",
  projectCacheReloadStrategySelect: "#projectCacheReloadStrategySelect",
  projectCacheCleanButton: "#projectCacheCleanButton",
  projectCacheCleanSummary: "#projectCacheCleanSummary",
  searchInput: "#searchInput",
  extensionInput: "#extensionInput",
  scanButton: "#scanButton",
  selectVisibleButton: "#selectVisibleButton",
  clearSelectionButton: "#clearSelectionButton",
  scanSummary: "#scanSummary",
  assetRows: "#assetRows",
  assetEmpty: "#assetEmpty",
  modeSelect: "#modeSelect",
  targetDirectoryLabel: "#targetDirectoryLabel",
  targetDirectorySelect: "#targetDirectorySelect",
  ruleScopeLabel: "#ruleScopeLabel",
  ruleScopeSelect: "#ruleScopeSelect",
  conflictPolicySelect: "#conflictPolicySelect",
  previewButton: "#previewButton",
  backupConfirmed: "#backupConfirmed",
  cleanupEmptyDirectories: "#cleanupEmptyDirectories",
  executeButton: "#executeButton",
  addRuleButton: "#addRuleButton",
  saveRulesButton: "#saveRulesButton",
  ruleRows: "#ruleRows",
  historySelect: "#historySelect",
  historyDetailButton: "#historyDetailButton",
  historyDetailSummary: "#historyDetailSummary",
  historyDetailRows: "#historyDetailRows",
  historyDetailEmpty: "#historyDetailEmpty",
  historyCleanupSummary: "#historyCleanupSummary",
  reverseButton: "#reverseButton",
  clearLogButton: "#clearLogButton",
  logRows: "#logRows",
  logEmpty: "#logEmpty",
  planSummary: "#planSummary",
  planRows: "#planRows",
  statusText: "#statusText"
};

exports.ready = async function () {
  const panel = this;
  panel.$.tabBar.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => activateTab(panel, button.dataset.tab));
  });
  initializeResizableSplits();
  panel.$.resetResizableLayoutButton.addEventListener("click", () => resetResizableLayout(panel));
  panel.$.toolPanelToggleButton.addEventListener("click", () => toggleToolPanel(panel));
  panel.$.toolPanelEnableAllButton.addEventListener("click", () => enableAllTools(panel));
  panel.$.overviewRunScanButton.addEventListener("click", () => {
    activateTab(panel, "scan");
    scanAssetReport(panel);
  });
  panel.$.overviewRunHealthButton.addEventListener("click", () => runOverviewHealthChecks(panel));
  panel.$.overviewExportReportButton.addEventListener("click", () => {
    activateTab(panel, "history");
    exportSessionReport(panel);
  });
  panel.$.assetScanButton.addEventListener("click", () => scanAssetReport(panel));
  panel.$.referenceSelectedAssetButton.addEventListener("click", () => checkReferenceForSelectedAsset(panel));
  panel.$.referenceCheckButton.addEventListener("click", () => checkReferences(panel));
  panel.$.nodeReferenceCheckButton.addEventListener("click", () => checkNodeReferences(panel));
  panel.$.nodeReferenceTileLayoutButton.addEventListener("click", () => applyTwoPaneLayoutPreset(panel, "node-reference", "tile", "节点引用"));
  panel.$.nodeReferenceMaxLeftButton.addEventListener("click", () => applyTwoPaneLayoutPreset(panel, "node-reference", "left", "节点引用"));
  panel.$.nodeReferenceMaxRightButton.addEventListener("click", () => applyTwoPaneLayoutPreset(panel, "node-reference", "right", "节点引用"));
  panel.$.unusedScanButton.addEventListener("click", () => scanUnusedAssets(panel));
  panel.$.unusedSearchInput.addEventListener("input", () => renderUnusedCandidates(panel));
  panel.$.unusedExtensionInput.addEventListener("input", () => renderUnusedCandidates(panel));
  panel.$.unusedSelectVisibleButton.addEventListener("click", () => selectVisibleUnusedCandidates(panel));
  panel.$.unusedClearSelectionButton.addEventListener("click", () => clearUnusedSelection(panel));
  panel.$.unusedDeletePreviewButton.addEventListener("click", () => previewUnusedDelete(panel));
  panel.$.unusedDeleteExecuteButton.addEventListener("click", () => executeUnusedDelete(panel));
  panel.$.unusedDeleteConfirmedInput.addEventListener("change", () => renderUnusedDeletePlan(panel));
  panel.$.resourcesRuntimeCheckButton.addEventListener("click", () => checkResourcesRuntime(panel));
  panel.$.resourcesRuntimeTileLayoutButton.addEventListener("click", () => applyTwoPaneLayoutPreset(panel, "resources-runtime", "tile", "resources 检查"));
  panel.$.resourcesRuntimeMaxLeftButton.addEventListener("click", () => applyTwoPaneLayoutPreset(panel, "resources-runtime", "left", "resources 检查"));
  panel.$.resourcesRuntimeMaxRightButton.addEventListener("click", () => applyTwoPaneLayoutPreset(panel, "resources-runtime", "right", "resources 检查"));
  panel.$.packageSizeReportButton.addEventListener("click", () => reportPackageSize(panel));
  panel.$.packageSizeTileLayoutButton.addEventListener("click", () => applyPackageSizeLayoutPreset(panel, "tile"));
  panel.$.packageSizeMaxStatsButton.addEventListener("click", () => applyPackageSizeLayoutPreset(panel, "stats"));
  panel.$.packageSizeMaxReferencedButton.addEventListener("click", () => applyPackageSizeLayoutPreset(panel, "referenced"));
  panel.$.directoryConventionCheckButton.addEventListener("click", () => checkDirectoryConvention(panel));
  panel.$.directoryConventionPreviewButton.addEventListener("click", () => previewDirectoryConvention(panel));
  panel.$.materialTextureCheckButton.addEventListener("click", () => checkMaterialTextures(panel));
  panel.$.duplicateAssetCheckButton.addEventListener("click", () => checkDuplicateAssets(panel));
  panel.$.duplicateAssetTileLayoutButton.addEventListener("click", () => applyTwoPaneLayoutPreset(panel, "duplicate-assets", "tile", "重复资源检查"));
  panel.$.duplicateAssetMaxLeftButton.addEventListener("click", () => applyTwoPaneLayoutPreset(panel, "duplicate-assets", "left", "重复资源检查"));
  panel.$.duplicateAssetMaxRightButton.addEventListener("click", () => applyTwoPaneLayoutPreset(panel, "duplicate-assets", "right", "重复资源检查"));
  panel.$.scenePrefabHealthCheckButton.addEventListener("click", () => checkScenePrefabReferenceHealth(panel));
  panel.$.scanButton.addEventListener("click", () => scan(panel));
  panel.$.selectVisibleButton.addEventListener("click", () => selectVisible(panel));
  panel.$.clearSelectionButton.addEventListener("click", () => clearSelection(panel));
  panel.$.modeSelect.addEventListener("change", () => updateMode(panel));
  panel.$.previewButton.addEventListener("click", () => preview(panel));
  panel.$.executeButton.addEventListener("click", () => execute(panel));
  panel.$.addRuleButton.addEventListener("click", () => addRule(panel));
  panel.$.saveRulesButton.addEventListener("click", () => saveRules(panel));
  panel.$.historyDetailButton.addEventListener("click", () => loadHistoryDetail(panel));
  panel.$.reverseButton.addEventListener("click", () => previewReverse(panel));
  panel.$.clearLogButton.addEventListener("click", () => clearLogs(panel));
  panel.$.exportSessionReportButton.addEventListener("click", () => exportSessionReport(panel));
  panel.$.projectCacheCleanButton.addEventListener("click", () => cleanProjectCache(panel));
  overviewSnapshot = loadOverviewSnapshot(localStorage, OVERVIEW_SNAPSHOT_STORAGE_KEY);
  await loadState(panel);
  await loadLogs(panel);
  await scan(panel);
  renderOverview(panel);
};

function activateTab(panel, tabName) {
  const tabs = {
    overview: panel.$.overviewTab,
    scan: panel.$.scanTab,
    classify: panel.$.classifyTab,
    unused: panel.$.unusedTab,
    "node-reference": panel.$.nodeReferenceTab,
    "resources-runtime": panel.$.resourcesRuntimeTab,
    "package-size": panel.$.packageSizeTab,
    "directory-convention": panel.$.directoryConventionTab,
    "material-textures": panel.$.materialTexturesTab,
    "duplicate-assets": panel.$.duplicateAssetsTab,
    "scene-prefab-health": panel.$.scenePrefabHealthTab,
    history: panel.$.historyTab,
  };
  for (const [name, tab] of Object.entries(tabs)) {
    tab.classList.toggle("active", name === tabName);
  }
  panel.$.tabBar.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });
  if (tabName === "overview") {
    renderOverview(panel);
  }
}

function renderOverview(panel) {
  const overviewState = getOverviewState();
  const risks = sortOverviewItems(buildOverviewRisksFromState(overviewState, { formatSize }));
  const nextSteps = buildOverviewNextStepsFromState(risks, overviewState);
  const operations = buildOverviewOperationsFromState(overviewState, { formatDate });
  const knownModules = countKnownOverviewModules(overviewState);
  const currentSnapshot = buildOverviewSnapshot(risks, knownModules);
  if (knownModules > 0) {
    overviewSnapshot = currentSnapshot;
    saveOverviewSnapshot(localStorage, OVERVIEW_SNAPSHOT_STORAGE_KEY, currentSnapshot);
  }
  renderOverviewView(panel, {
    risks,
    nextSteps,
    operations,
    knownModules,
    currentSnapshot,
    previousSnapshot: overviewSnapshot,
  }, {
    formatDate,
    onAction: (item) => handleOverviewAction(panel, item),
  });
}

function getOverviewState() {
  return buildOverviewState({
    classifyScanSummary,
    scanReportSummary,
    unusedSummary,
    resourcesRuntimeSummary,
    packageSizeSummary,
    directoryConventionSummary,
    materialTextureSummary,
    duplicateAssetSummary,
    scenePrefabReferenceSummary,
    currentPlan,
    unusedDeletePlan,
    history,
    runtimeLogs
  });
}

function handleOverviewAction(panel, item) {
  if (item.run === "asset-scan") {
    activateTab(panel, "scan");
    scanAssetReport(panel);
    return;
  }
  if (item.run === "export-report") {
    activateTab(panel, "history");
    exportSessionReport(panel);
    return;
  }
  if (item.run === "health-checks") {
    runOverviewHealthChecks(panel);
    return;
  }
  activateTab(panel, item.tab || "overview");
  if (item.selector) {
    const target = document.querySelector(item.selector);
    target?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }
}

async function runOverviewHealthChecks(panel) {
  const tasks = [];
  if (isToolEnabled("resources-runtime-check")) {
    tasks.push(["resources 动态加载检查", "resources-runtime", () => checkResourcesRuntime(panel)]);
  }
  if (isToolEnabled("package-size-report")) {
    tasks.push(["包体贡献统计", "package-size", () => reportPackageSize(panel)]);
  }
  if (isToolEnabled("scene-prefab-reference-health")) {
    tasks.push(["场景和 Prefab 引用健康", "scene-prefab-health", () => checkScenePrefabReferenceHealth(panel)]);
  }
  if (tasks.length === 0) {
    setStatus(panel, "当前没有启用可从总览一键运行的健康检查模块。");
    return;
  }
  await addLog(panel, "info", `总览一键健康检查开始：${tasks.map(([name]) => name).join("、")}`);
  for (const [name, tab, run] of tasks) {
    activateTab(panel, tab);
    setStatus(panel, `总览一键健康检查：正在运行 ${name}...`);
    await run();
  }
  activateTab(panel, "overview");
  renderOverview(panel);
  setStatus(panel, "总览一键健康检查已完成。");
}

function isToolEnabled(id) {
  return isToolVisible(toolVisibility, id);
}

function toggleToolPanel(panel) {
  panel.$.toolPanel.classList.toggle("hidden");
}

function renderToolPanel(panel) {
  renderToolPanelView(panel, TOOL_PANEL_MODULES, toolVisibility, {
    onVisibilityChange: (id, enabled) => updateToolVisibility(panel, id, enabled),
  });
}

function applyToolVisibility(panel) {
  applyToolVisibilityView(TOOL_PANEL_MODULES, toolVisibility);
  const activeButton = panel.$.tabBar.querySelector(".tab-button.active");
  if (activeButton?.classList.contains("hidden")) {
    activateTab(panel, "overview");
  }
}

async function updateToolVisibility(panel, id, enabled) {
  toolVisibility = normalizeToolVisibility({
    ...toolVisibility,
    [id]: enabled
  });
  renderToolPanel(panel);
  applyToolVisibility(panel);
  try {
    const result = await requestMain("save-tool-visibility", { toolVisibility });
    toolVisibility = normalizeToolVisibility(result.toolVisibility);
    renderToolPanel(panel);
    applyToolVisibility(panel);
    setStatus(panel, `工具面板已保存：${getToolTitle(id)} ${enabled ? "开启" : "关闭"}。`);
  } catch (error) {
    setStatus(panel, `保存工具面板失败：${error.message}`);
  }
}

async function enableAllTools(panel) {
  toolVisibility = buildAllToolsVisibility(TOOL_PANEL_MODULES);
  renderToolPanel(panel);
  applyToolVisibility(panel);
  try {
    const result = await requestMain("save-tool-visibility", { toolVisibility });
    toolVisibility = normalizeToolVisibility(result.toolVisibility);
    renderToolPanel(panel);
    applyToolVisibility(panel);
    setStatus(panel, "工具面板已全部开启。");
  } catch (error) {
    setStatus(panel, `保存工具面板失败：${error.message}`);
  }
}

function initializeResizableSplits() {
  const saved = loadResizableSplitState();
  for (const split of document.querySelectorAll("[data-resize-id]")) {
    const resizeId = split.dataset.resizeId;
    applyResizableSplitState(split, saved[resizeId]);
    for (const handle of split.querySelectorAll("[data-resize-handle]")) {
      if (handle.closest("[data-resize-id]") !== split) {
        continue;
      }
      handle.addEventListener("mousedown", (event) => startResizableSplitDrag(split, handle, event, "mouse"));
      handle.addEventListener("touchstart", (event) => startResizableSplitDrag(split, handle, event, "touch"), { passive: false });
    }
  }
}

function loadResizableSplitState() {
  return loadResizableLayoutState(localStorage, RESIZABLE_SPLIT_STORAGE_KEY);
}

function applyResizableSplitState(split, value) {
  for (const [name, size] of Object.entries(getResizableStyleProperties(value))) {
    split.style.setProperty(`--split-${name}`, `${size}px`);
  }
}

function saveResizableSplitValue(resizeId, value) {
  if (!resizeId) {
    return;
  }
  const state = loadResizableSplitState();
  state[resizeId] = value;
  saveResizableLayoutState(localStorage, RESIZABLE_SPLIT_STORAGE_KEY, state);
}

function saveResizableSplitWidth(split, handle, width) {
  const resizeId = split.dataset.resizeId || "";
  if (!resizeId) {
    return;
  }
  const variableName = getResizableSplitVariableName(split, handle);
  const current = loadResizableSplitState()[resizeId];
  const handleCount = split.querySelectorAll("[data-resize-handle]").length;
  saveResizableSplitValue(resizeId, buildResizableStoredValue(current, variableName, width, handleCount));
}

function resetResizableLayout(panel) {
  removeResizableLayoutState(localStorage, RESIZABLE_SPLIT_STORAGE_KEY);
  for (const split of document.querySelectorAll("[data-resize-id]")) {
    split.style.removeProperty("--split-left");
    split.style.removeProperty("--split-middle");
    split.style.removeProperty("--split-right");
    split.style.removeProperty("--split-top");
    split.style.removeProperty("--split-bottom");
  }
  setStatus(panel, "分栏布局已重置。");
}

function applyTwoPaneLayoutPreset(panel, resizeId, preset, title) {
  const split = document.querySelector(`[data-resize-id="${resizeId}"]`);
  if (!split) {
    setStatus(panel, `${title}布局区域尚未加载。`);
    return;
  }
  const width = getTwoPanePresetLeftWidth(split, preset);
  split.style.setProperty("--split-left", `${width}px`);
  saveResizableSplitValue(resizeId, Math.round(width));
  setStatus(panel, `${title}布局已切换为${formatTwoPanePresetName(preset)}。`);
}

function applyPackageSizeLayoutPreset(panel, preset) {
  const grid = document.querySelector('[data-resize-id="package-size"]');
  const container = document.querySelector('[data-resize-id="package-size-panel"]');
  if (!grid || !container) {
    setStatus(panel, "包体统计布局区域尚未加载。");
    return;
  }

  const columns = getPackageSizePresetColumns(grid, preset);
  const top = getPackageSizePresetTopHeight(preset);
  grid.style.setProperty("--split-left", `${columns.left}px`);
  grid.style.setProperty("--split-middle", `${columns.middle}px`);
  container.style.setProperty("--split-top", `${top}px`);
  saveResizableSplitValue("package-size", { columns });
  saveResizableSplitValue("package-size-panel", { columns: { top } });
  setStatus(panel, `包体统计布局已切换为${formatPackageSizePresetName(preset)}。`);
}

function startResizableSplitDrag(split, handle, event, mode) {
  if (mode !== "touch" && event.button !== 0) {
    return;
  }
  event.preventDefault();
  const previousPane = handle.previousElementSibling;
  if (!previousPane) {
    return;
  }
  handle.classList.add("dragging");
  const axis = getResizableSplitAxis(handle);
  document.body?.classList.add(axis === "y" ? "resizing-split-y" : "resizing-split");

  const move = (moveEvent) => {
    moveEvent.preventDefault?.();
    const size = getResizableSplitSize(split, handle, previousPane, moveEvent);
    if (Number.isFinite(size)) {
      split.style.setProperty(`--split-${getResizableSplitVariableName(split, handle)}`, `${size}px`);
    }
  };
  const up = () => {
    const variableName = getResizableSplitVariableName(split, handle);
    const current = parseFloat(split.style.getPropertyValue(`--split-${variableName}`));
    if (Number.isFinite(current)) {
      saveResizableSplitWidth(split, handle, current);
    }
    handle.classList.remove("dragging");
    document.body?.classList.remove("resizing-split");
    document.body?.classList.remove("resizing-split-y");
    removeResizableSplitDragListeners(mode, move, up);
  };

  addResizableSplitDragListeners(mode, move, up);
  move(event);
}

function getResizableSplitSize(split, handle, previousPane, event) {
  const axis = getResizableSplitAxis(handle);
  return clampResizableSplitSize({
    axis,
    clientPosition: getResizeClientPosition(event, axis),
    paneRect: previousPane.getBoundingClientRect(),
    nextPaneRect: handle.nextElementSibling?.getBoundingClientRect(),
    splitRect: split.getBoundingClientRect(),
    minLeft: RESIZABLE_SPLIT_MIN_LEFT,
    minRight: RESIZABLE_SPLIT_MIN_RIGHT,
    minTop: RESIZABLE_SPLIT_MIN_TOP,
    minBottom: RESIZABLE_SPLIT_MIN_BOTTOM,
  });
}

function getResizableSplitAxis(handle) {
  return getResizableSplitAxisFromDataset(handle.dataset);
}

function getResizableSplitVariableName(split, handle) {
  const handleIndex = [...split.querySelectorAll("[data-resize-handle]")].indexOf(handle);
  return getResizableSplitVariableNameFromIndex(handle.dataset, handleIndex);
}

function addResizableSplitDragListeners(mode, move, up) {
  if (mode === "touch") {
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", up);
    document.addEventListener("touchcancel", up);
    return;
  }
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
}

function removeResizableSplitDragListeners(mode, move, up) {
  if (mode === "touch") {
    document.removeEventListener("touchmove", move);
    document.removeEventListener("touchend", up);
    document.removeEventListener("touchcancel", up);
    return;
  }
  document.removeEventListener("mousemove", move);
  document.removeEventListener("mouseup", up);
}

async function loadState(panel) {
  try {
    const state = await requestMain("load-state");
    rules = state.rules || [];
    history = state.history || [];
    toolVisibility = normalizeToolVisibility(state.toolVisibility);
    ({ selectedHistoryDetail } = buildHistoryDetailResultState());
    renderToolPanel(panel);
    applyToolVisibility(panel);
    renderRules(panel);
    renderHistory(panel);
    renderHistoryDetail(panel);
    renderOverview(panel);
  } catch (error) {
    setStatus(panel, `读取规则和历史失败：${error.message}`);
  }
}

async function loadLogs(panel) {
  try {
    const result = await requestMain("get-logs");
    ({ runtimeLogs } = buildRuntimeLogsResultState(result));
    renderLogs(panel);
  } catch (error) {
    runtimeLogs = [{
      time: new Date().toISOString(),
      level: "error",
      message: `读取日志失败：${error.message}`,
      detail: ""
    }];
    renderLogs(panel);
  }
}

async function exportSessionReport(panel) {
  setBusy(panel, true);
  setStatus(panel, "正在导出当前会话报告...");
  try {
    const snapshot = buildSessionReportSnapshot();
    const result = await requestMain("export-session-report", {
      snapshot
    });
    panel.$.exportSessionReportSummary.textContent = formatExportSessionReportSummary(result);
    await addLog(panel, "info", `会话报告已导出：${result.markdownPath}、${result.jsonPath}`);
    setStatus(panel, `会话报告已导出到 ${result.reportDirectory}`);
  } catch (error) {
    await addLog(panel, "error", `会话报告导出失败：${error.message}`);
    setStatus(panel, `会话报告导出失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

function buildSessionReportSnapshot() {
  return buildSessionReportSnapshotFromState({
    scanReportSummary,
    scanResourceEntries,
    scanIssues,
    scanTypeStats,
    referenceSummary,
    referenceTargets,
    referenceRows,
    nodeReferenceSummary,
    nodeReferenceTargets,
    nodeReferenceRows,
    unusedSummary,
    unusedCandidates,
    resourcesRuntimeSummary,
    resourcesRuntimeResources,
    resourcesRuntimeStaticCalls,
    resourcesRuntimeUnused,
    resourcesRuntimeDynamicCalls,
    packageSizeSummary,
    packageDirectoryRanking,
    packageTypeRanking,
    packageTopFiles,
    packageReferencedTopFiles,
    directoryConventionSummary,
    directoryConventionMismatches,
    materialTextureSummary,
    materialTextureReferences,
    duplicateAssetSummary,
    duplicateSameNameGroups,
    duplicateHashGroups,
    scenePrefabReferenceSummary,
    scenePrefabReferenceIssues,
    currentPlan,
    history,
    runtimeLogs
  }, {
    isToolEnabled,
    summarizeHistory: toHistorySummary
  });
}

async function loadHistoryDetail(panel) {
  const historyId = panel.$.historySelect.value;
  if (!historyId) {
    ({ selectedHistoryDetail } = buildHistoryDetailResultState());
    renderHistoryDetail(panel);
    setStatus(panel, "没有可查看的移动历史。");
    return;
  }
  setBusy(panel, true);
  setStatus(panel, "正在读取移动历史详情...");
  try {
    const result = await requestMain("get-history-detail", { historyId });
    ({ selectedHistoryDetail } = buildHistoryDetailResultState(result));
    renderHistoryDetail(panel);
    setStatus(panel, selectedHistoryDetail?.warning || "移动历史详情已加载。");
  } catch (error) {
    ({ selectedHistoryDetail } = buildHistoryDetailResultState());
    renderHistoryDetail(panel);
    setStatus(panel, `读取移动历史详情失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

function renderHistoryDetail(panel) {
  renderHistoryDetailView(panel, selectedHistoryDetail, { document, formatDate });
}

async function addLog(panel, level, message, detail = "") {
  const log = {
    time: new Date().toISOString(),
    level,
    message,
    detail
  };
  runtimeLogs.push(log);
  runtimeLogs = runtimeLogs.slice(-200);
  renderLogs(panel);

  try {
    const result = await requestMain("append-log", log);
    ({ runtimeLogs } = buildRuntimeLogsResultState(result, runtimeLogs));
    renderLogs(panel);
  } catch (error) {
    runtimeLogs.push({
      time: new Date().toISOString(),
      level: "error",
      message: `写入日志失败：${error.message}`,
      detail: ""
    });
    runtimeLogs = runtimeLogs.slice(-200);
    renderLogs(panel);
  }
}

async function clearLogs(panel) {
  try {
    const result = await requestMain("clear-logs");
    ({ runtimeLogs } = buildRuntimeLogsResultState(result));
    renderLogs(panel);
    setStatus(panel, "运行日志已清空。");
  } catch (error) {
    setStatus(panel, `清空日志失败：${error.message}`);
  }
}

async function cleanProjectCache(panel) {
  const reloadStrategy = panel.$.projectCacheReloadStrategySelect.value;
  const reloadText = reloadStrategy === "editor-reload"
    ? "执行编辑器级项目重载/重启；如果当前 Creator API 不支持，将返回错误"
    : "刷新 AssetDB，并在必要时手动重新打开项目";
  if (!window.confirm(`即将删除项目根目录下的 library 和 temp 缓存目录，并${reloadText}。\n\n该操作不可撤销，建议先关闭预览、构建和正在运行的任务。\n\n继续执行？`)) {
    return;
  }

  setBusy(panel, true);
  setStatus(panel, "正在清理 library/temp...");
  try {
    const result = await requestMain("clean-project-cache", {
      directories: ["library", "temp"],
      confirmed: true,
      reloadStrategy
    });
    const summary = result.summary || {};
    const refreshHint = result.refresh?.manualHint || "请根据 Creator 状态手动重新打开项目。";
    const message = `缓存清理完成：删除 ${safeNumber(summary.deleted)} 个目录，跳过 ${safeNumber(summary.skipped)} 个，失败 ${safeNumber(summary.failed)} 个；释放约 ${formatSize(summary.deletedSize || 0)}。${refreshHint}`;
    panel.$.projectCacheCleanSummary.textContent = message;
    await addLog(panel, summary.failed ? "warning" : "info", message, JSON.stringify({
      deleted: result.deleted,
      skipped: result.skipped,
      failed: result.failed,
      refresh: result.refresh
    }, null, 2));
    setStatus(panel, message);
  } catch (error) {
    const message = `缓存清理失败：${error.message}`;
    await addLog(panel, "error", message);
    panel.$.projectCacheCleanSummary.textContent = message;
    setStatus(panel, message);
  } finally {
    setBusy(panel, false);
  }
}

function renderLogs(panel) {
  renderLogsView(panel, runtimeLogs, { document, formatDate });
  renderOverview(panel);
}

async function scanAssetReport(panel) {
  setBusy(panel, true);
  setStatus(panel, "正在扫描资源异常和类型统计...");
  try {
    const result = await requestMain("scan-assets", {
      search: panel.$.assetScanSearchInput.value,
      extensions: panel.$.assetScanExtensionInput.value,
      directory: panel.$.assetScanDirectoryInput.value,
      issueIgnorePatterns: panel.$.assetScanIssueIgnoreInput.value
    });
    ({
      scanResourceEntries,
      scanIssues,
      scanTypeStats,
      scanReportSummary
    } = buildAssetScanResultState(result));
    if (!isCompleteAssetScanResult(result)) {
      const message = "资源扫描接口返回旧结构或字段不完整。请在扩展管理器重载 asset-steward 后重新打开面板。";
      await addLog(panel, "warning", message, JSON.stringify(result?.summary || {}, null, 2));
      ({
        scanResourceEntries,
        scanIssues,
        scanTypeStats,
        scanReportSummary
      } = buildAssetScanResultState());
      renderAssetScanReport(panel);
      setStatus(panel, message);
      return;
    }
    renderAssetScanReport(panel);
    const summary = scanReportSummary;
    const hasIssue = summary.missingMetaCount || summary.orphanMetaCount || summary.emptyDirectoryCount;
    if (hasIssue) {
      await addLog(panel, "warning", `资源扫描发现异常：缺失 meta ${summary.missingMetaCount} 项，孤立 meta ${summary.orphanMetaCount} 项，空目录 ${summary.emptyDirectoryCount} 项。`);
    }
    setStatus(panel, hasIssue
      ? "扫描完成。请优先复核缺失 meta；本页不会直接修复或删除资源。"
      : "扫描完成，当前范围未发现 meta 异常或空目录。");
  } catch (error) {
    ({
      scanResourceEntries,
      scanIssues,
      scanTypeStats,
      scanReportSummary
    } = buildAssetScanResultState());
    renderAssetScanReport(panel);
    await addLog(panel, "error", `资源扫描失败：${error.message}`);
    setStatus(panel, `资源扫描失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

function renderAssetScanReport(panel) {
  renderAssetScanReportView(panel, {
    scanResourceEntries,
    scanIssues,
    scanTypeStats,
    scanReportSummary
  }, {
    document,
    locate: (path) => locate(panel, path),
    checkReferenceForPath: (path) => checkReferenceForPath(panel, path)
  });
  renderOverview(panel);
}

async function checkReferences(panel) {
  setBusy(panel, true);
  setStatus(panel, "正在静态搜索资源 UUID 引用...");
  try {
    const result = await requestMain("check-references", {
      path: panel.$.referenceTargetInput.value,
      directory: panel.$.referenceDirectoryInput.value,
      extensions: panel.$.referenceExtensionInput.value
    });
    ({
      referenceTargets,
      referenceRows,
      referenceSummary
    } = buildReferenceResultState(result));
    if (!isCompleteReferenceResult(result)) {
      const message = "引用检查接口返回旧结构或字段不完整。请重载 asset-steward 后重新检查。";
      await addLog(panel, "warning", message, JSON.stringify(result?.summary || {}, null, 2));
      ({
        referenceTargets,
        referenceRows,
        referenceSummary
      } = buildReferenceResultState());
      renderReferences(panel);
      setStatus(panel, message);
      return;
    }
    renderReferences(panel);
    if (result.warning) {
      await addLog(panel, result.references?.length ? "info" : "warning", result.warning);
    }
    setStatus(panel, result.warning || "引用检查完成。");
  } catch (error) {
    ({
      referenceTargets,
      referenceRows,
      referenceSummary
    } = buildReferenceResultState());
    renderReferences(panel);
    await addLog(panel, "error", `引用检查失败：${error.message}`);
    setStatus(panel, `引用检查失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

async function checkReferenceForPath(panel, path) {
  panel.$.referenceTargetInput.value = path;
  if (!panel.$.referenceDirectoryInput.value) {
    panel.$.referenceDirectoryInput.value = panel.$.assetScanDirectoryInput.value || "assets";
  }
  await checkReferences(panel);
}

async function checkReferenceForSelectedAsset(panel) {
  setBusy(panel, true);
  setStatus(panel, "正在读取当前选中资源...");
  try {
    const result = await requestMain("get-selected-asset-path");
    panel.$.referenceTargetInput.value = result.path;
    if (!panel.$.referenceDirectoryInput.value) {
      panel.$.referenceDirectoryInput.value = panel.$.assetScanDirectoryInput.value || "assets";
    }
  } catch (error) {
    setStatus(panel, `读取选中资源失败：${error.message}`);
    return;
  } finally {
    setBusy(panel, false);
  }

  await checkReferences(panel);
}

function renderReferences(panel) {
  renderReferencesView(panel, {
    referenceTargets,
    referenceRows,
    referenceSummary
  }, {
    document,
    locate: (path) => locate(panel, path),
    checkParent: (path) => checkReferenceForPath(panel, path),
    selectNode: (path, detail) => selectReferenceNode(panel, path, detail)
  });
  renderOverview(panel);
}

async function selectReferenceNode(panel, path, detail) {
  if (!detail?.selectable || !detail.nodeUuid) {
    setStatus(panel, "该引用位置没有稳定节点 ID，只能定位引用资源。");
    return;
  }
  try {
    await requestMain("select-reference-node", {
      path,
      nodeUuid: detail.nodeUuid,
      nodePath: detail.nodePath
    });
    setStatus(panel, `已选中当前打开资源中的节点：${detail.nodePath || detail.nodeUuid}`);
  } catch (error) {
    setStatus(panel, `选中节点失败：${error.message}`);
  }
}

async function checkNodeReferences(panel) {
  setBusy(panel, true);
  setStatus(panel, "正在检查场景节点被哪些组件引用...");
  try {
    const result = await requestMain("check-node-references", buildNodeReferenceCheckPayload({
      nodeUuidInput: panel.$.nodeReferenceUuidInput,
      directoryInput: panel.$.nodeReferenceDirectoryInput,
      extensionInput: panel.$.nodeReferenceExtensionInput
    }));
    ({
      nodeReferenceTargets,
      nodeReferenceRows,
      nodeReferenceSummary
    } = buildNodeReferenceResultState(result));
    if (!isCompleteNodeReferenceResult(result)) {
      const message = "节点引用检查接口返回旧结构或字段不完整。请重载 asset-steward 后重新检查。";
      resetNodeReferenceResult();
      renderNodeReferences(panel);
      await addLog(panel, "warning", message, JSON.stringify(result?.summary || {}, null, 2));
      setStatus(panel, message);
      return;
    }
    syncNodeReferenceUuidInput(panel.$.nodeReferenceUuidInput, result);
    renderNodeReferences(panel);
    await addLog(panel, nodeReferenceRows.length ? "info" : "warning", result.warning || "节点引用检查完成。");
    setStatus(panel, result.warning || "节点引用检查完成。");
  } catch (error) {
    resetNodeReferenceResult();
    renderNodeReferences(panel);
    await addLog(panel, "error", `节点引用检查失败：${error.message}`);
    setStatus(panel, `节点引用检查失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

function resetNodeReferenceResult() {
  ({
    nodeReferenceTargets,
    nodeReferenceRows,
    nodeReferenceSummary
  } = buildNodeReferenceResultState());
}

function renderNodeReferences(panel) {
  renderNodeReferencesView(panel, {
    nodeReferenceTargets,
    nodeReferenceRows,
    nodeReferenceSummary
  }, {
    document,
    locate: (path) => locate(panel, path),
    selectNode: (path, detail) => selectReferenceNode(panel, path, detail)
  });
  renderOverview(panel);
}

async function scanUnusedAssets(panel) {
  setBusy(panel, true);
  setStatus(panel, "正在从主场景递归依赖图扫描未引用候选...");
  try {
    const result = await requestMain("scan-unused-assets", {
      scene: panel.$.unusedSceneInput.value,
      directory: panel.$.unusedDirectoryInput.value
    });
    ({
      unusedCandidates,
      unusedSummary
    } = buildUnusedScanResultState(result));
    unusedSelectedPaths = new Set();
    unusedDeletePlan = null;
    if (!isCompleteUnusedResult(result)) {
      const message = "未引用资源扫描接口返回旧结构或字段不完整。请重载 asset-steward 后重新扫描。";
      resetUnusedResult();
      renderUnusedCandidates(panel);
      await addLog(panel, "warning", message, JSON.stringify(result?.summary || {}, null, 2));
      setStatus(panel, message);
      return;
    }
    renderUnusedCandidates(panel);
    await addLog(panel, unusedCandidates.length ? "warning" : "info", result.warning || "未引用资源扫描完成。");
    setStatus(panel, result.warning || "未引用资源扫描完成。");
  } catch (error) {
    resetUnusedResult();
    renderUnusedCandidates(panel);
    await addLog(panel, "error", `未引用资源扫描失败：${error.message}`);
    setStatus(panel, `未引用资源扫描失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

function resetUnusedResult() {
  ({
    unusedCandidates,
    unusedSummary
  } = buildUnusedScanResultState());
  unusedSelectedPaths = new Set();
  unusedDeletePlan = null;
}

function getVisibleUnusedCandidates(panel) {
  return filterUnusedCandidates(
    unusedCandidates,
    panel.$.unusedSearchInput.value,
    panel.$.unusedExtensionInput.value
  );
}

function selectVisibleUnusedCandidates(panel) {
  const visible = getVisibleUnusedCandidates(panel);
  for (const item of visible) {
    unusedSelectedPaths.add(item.path);
  }
  unusedDeletePlan = null;
  renderUnusedCandidates(panel);
  setStatus(panel, `已全选当前筛选候选 ${visible.length} 项。`);
}

function clearUnusedSelection(panel) {
  const count = unusedSelectedPaths.size;
  unusedSelectedPaths = new Set();
  unusedDeletePlan = null;
  panel.$.unusedDeleteConfirmedInput.checked = false;
  renderUnusedCandidates(panel);
  setStatus(panel, `已清空未引用候选选择 ${count} 项。`);
}

function renderUnusedCandidates(panel) {
  renderUnusedCandidatesView(panel, {
    unusedCandidates,
    unusedSelectedPaths,
    unusedSummary,
    search: panel.$.unusedSearchInput.value,
    extensions: panel.$.unusedExtensionInput.value
  }, {
    document,
    locate: (path) => locate(panel, path),
    onToggleCandidate: (path, checked) => {
      checked ? unusedSelectedPaths.add(path) : unusedSelectedPaths.delete(path);
      unusedDeletePlan = null;
      panel.$.unusedClearSelectionButton.disabled = unusedSelectedPaths.size === 0;
      renderUnusedDeletePlan(panel);
    }
  });
  renderUnusedDeletePlan(panel);
  renderOverview(panel);
}

async function previewUnusedDelete(panel) {
  setBusy(panel, true);
  setStatus(panel, "正在重新校验未引用候选并生成删除预览...");
  try {
    unusedDeletePlan = await requestMain("preview-unused-delete", {
      scene: panel.$.unusedSceneInput.value,
      directory: panel.$.unusedDirectoryInput.value,
      backupScope: panel.$.unusedDeleteBackupScopeSelect.value,
      paths: [...unusedSelectedPaths]
    });
    panel.$.unusedDeleteConfirmedInput.checked = false;
    renderUnusedDeletePlan(panel);
    setStatus(panel, unusedDeletePlan.warning || "未引用删除预览已生成。");
  } catch (error) {
    unusedDeletePlan = null;
    renderUnusedDeletePlan(panel);
    await addLog(panel, "error", `未引用删除预览失败：${error.message}`);
    setStatus(panel, `未引用删除预览失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

function renderUnusedDeletePlan(panel) {
  renderUnusedDeletePlanView(panel, {
    unusedDeletePlan,
    unusedSelectedPaths,
    confirmed: panel.$.unusedDeleteConfirmedInput.checked
  }, { document });
  renderOverview(panel);
}

async function executeUnusedDelete(panel) {
  if (!unusedDeletePlan?.token) {
    setStatus(panel, "请先生成未引用删除预览。");
    return;
  }
  if (!panel.$.unusedDeleteConfirmedInput.checked) {
    setStatus(panel, "执行前必须勾选风险确认。");
    return;
  }
  const ready = safeNumber(unusedDeletePlan.summary?.ready);
  const backupScope = formatUnusedDeleteBackupScope(unusedDeletePlan.summary?.backupScope);
  if (!window.confirm(`即将先创建备份，然后通过 Creator AssetDB 删除 ${ready} 项未引用候选。\n备份范围：${backupScope}\n\n继续执行？`)) {
    return;
  }
  setBusy(panel, true);
  setStatus(panel, "正在创建备份并删除未引用候选...");
  try {
    const result = await requestMain("execute-unused-delete", {
      token: unusedDeletePlan.token,
      confirmed: true
    });
    const message = `未引用删除完成：备份 ${result.backup.fileCount} 个文件到 ${result.backup.backupDirectory}；删除成功 ${result.deleted.length} 项，失败 ${result.failed.length} 项；审计 ${result.auditPath || "-"}。`;
    await addLog(panel, result.failed.length ? "warning" : "info", message, JSON.stringify(result, null, 2));
    unusedDeletePlan = null;
    unusedSelectedPaths = new Set();
    panel.$.unusedDeleteConfirmedInput.checked = false;
    await scanUnusedAssets(panel);
    setStatus(panel, message);
  } catch (error) {
    await addLog(panel, "error", `未引用删除执行失败：${error.message}`);
    setStatus(panel, `未引用删除执行失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

async function checkResourcesRuntime(panel) {
  setBusy(panel, true);
  setStatus(panel, "正在对照 resources 资源和代码静态加载路径...");
  try {
    const result = await requestMain("check-resources-runtime", {
      codeDirectories: panel.$.resourcesCodeDirectoriesInput.value,
      resourcesDirectory: panel.$.resourcesDirectoryInput.value
    });
    ({
      resourcesRuntimeResources,
      resourcesRuntimeStaticCalls,
      resourcesRuntimeUnused,
      resourcesRuntimeDynamicCalls,
      resourcesRuntimeSummary
    } = buildResourcesRuntimeResultState(result));
    if (!isCompleteResourcesRuntimeResult(result)) {
      const message = "resources 动态加载检查接口返回旧结构或字段不完整。请重载 asset-steward 后重新检查。";
      resetResourcesRuntimeResult();
      renderResourcesRuntime(panel);
      await addLog(panel, "warning", message, JSON.stringify(result?.summary || {}, null, 2));
      setStatus(panel, message);
      return;
    }
    renderResourcesRuntime(panel);
    const summary = resourcesRuntimeSummary;
    const hasWarning = summary.unusedResourceCount || summary.missingCallCount || summary.dynamicCallCount;
    if (hasWarning) {
      await addLog(panel, "warning", `resources 检查完成：疑似未加载资源 ${summary.unusedResourceCount} 项，疑似缺失路径 ${summary.missingCallCount} 项，动态调用 ${summary.dynamicCallCount} 项。`);
    }
    setStatus(panel, hasWarning
      ? "resources 检查完成。结果只覆盖静态路径，请人工复核动态调用和封装加载逻辑。"
      : "resources 检查完成，当前静态检查范围未发现风险项。");
  } catch (error) {
    resetResourcesRuntimeResult();
    renderResourcesRuntime(panel);
    await addLog(panel, "error", `resources 动态加载检查失败：${error.message}`);
    setStatus(panel, `resources 动态加载检查失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

function resetResourcesRuntimeResult() {
  ({
    resourcesRuntimeResources,
    resourcesRuntimeStaticCalls,
    resourcesRuntimeUnused,
    resourcesRuntimeDynamicCalls,
    resourcesRuntimeSummary
  } = buildResourcesRuntimeResultState());
}

function createHealthRenderDeps(panel) {
  return {
    document,
    locate: (path) => locate(panel, path)
  };
}

function renderResourcesRuntime(panel) {
  renderResourcesRuntimeView(panel, {
    resourcesRuntimeResources,
    resourcesRuntimeStaticCalls,
    resourcesRuntimeUnused,
    resourcesRuntimeDynamicCalls,
    resourcesRuntimeSummary
  }, createHealthRenderDeps(panel));
  renderOverview(panel);
}

async function reportPackageSize(panel) {
  setBusy(panel, true);
  setStatus(panel, "正在统计源资源体积贡献...");
  try {
    const result = await requestMain("report-package-size", {
      directory: panel.$.packageSizeDirectoryInput.value,
      scene: panel.$.packageSizeSceneInput.value,
      topN: panel.$.packageSizeTopNInput.value,
      includeMeta: panel.$.packageSizeIncludeMetaInput.checked
    });
    ({
      packageDirectoryRanking,
      packageTypeRanking,
      packageTopFiles,
      packageReferencedTopFiles,
      packageSizeSummary
    } = buildPackageSizeResultState(result));
    if (!isCompletePackageSizeResult(result)) {
      const message = "包体贡献统计接口返回旧结构或字段不完整。请重载 asset-steward 后重新统计。";
      resetPackageSizeResult();
      renderPackageSize(panel);
      await addLog(panel, "warning", message, JSON.stringify(result?.summary || {}, null, 2));
      setStatus(panel, message);
      return;
    }
    renderPackageSize(panel);
    setStatus(panel, result.warning || "包体贡献统计完成。");
  } catch (error) {
    resetPackageSizeResult();
    renderPackageSize(panel);
    await addLog(panel, "error", `包体贡献统计失败：${error.message}`);
    setStatus(panel, `包体贡献统计失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

function resetPackageSizeResult() {
  ({
    packageDirectoryRanking,
    packageTypeRanking,
    packageTopFiles,
    packageReferencedTopFiles,
    packageSizeSummary
  } = buildPackageSizeResultState());
}

function renderPackageSize(panel) {
  renderPackageSizeView(panel, {
    packageDirectoryRanking,
    packageTypeRanking,
    packageTopFiles,
    packageReferencedTopFiles,
    packageSizeSummary
  }, createHealthRenderDeps(panel));
  renderOverview(panel);
}

async function checkDirectoryConvention(panel) {
  setBusy(panel, true);
  setStatus(panel, "正在按当前自动分类规则检查目录规范...");
  try {
    const result = await requestMain("check-directory-convention", {
      directory: panel.$.directoryConventionInput.value,
      rules
    });
    ({
      directoryConventionMismatches,
      directoryConventionSummary
    } = buildDirectoryConventionResultState(result));
    if (!isCompleteDirectoryConventionResult(result)) {
      const message = "目录规范检查接口返回旧结构或字段不完整。请重载 asset-steward 后重新检查。";
      resetDirectoryConventionResult();
      renderDirectoryConvention(panel);
      await addLog(panel, "warning", message, JSON.stringify(result?.summary || {}, null, 2));
      setStatus(panel, message);
      return;
    }
    renderDirectoryConvention(panel);
    setStatus(panel, result.warning || "目录规范检查完成。");
  } catch (error) {
    resetDirectoryConventionResult();
    renderDirectoryConvention(panel);
    await addLog(panel, "error", `目录规范检查失败：${error.message}`);
    setStatus(panel, `目录规范检查失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

function resetDirectoryConventionResult() {
  ({
    directoryConventionMismatches,
    directoryConventionSummary
  } = buildDirectoryConventionResultState());
}

function renderDirectoryConvention(panel) {
  renderDirectoryConventionView(panel, {
    directoryConventionMismatches,
    directoryConventionSummary
  }, createHealthRenderDeps(panel));
  renderOverview(panel);
}

async function previewDirectoryConvention(panel) {
  if (directoryConventionMismatches.length === 0) {
    setStatus(panel, "当前没有可生成移动预览的目录不符合项。");
    return;
  }
  setBusy(panel, true);
  setStatus(panel, "正在把目录规范建议转换为移动预览...");
  try {
    panel.$.modeSelect.value = "rules";
    panel.$.ruleScopeSelect.value = "selected";
    selectedPaths = new Set(directoryConventionMismatches.map((item) => item.path));
    panel.$.backupConfirmed.checked = false;
    updateMode(panel);
    currentPlan = await requestMain("preview-moves", {
      mode: "rules",
      paths: [...selectedPaths],
      ruleScope: "selected",
      conflictPolicy: panel.$.conflictPolicySelect.value,
      rules
    });
    renderAssets(panel);
    renderPlan(panel);
    activateTab(panel, "classify");
    setStatus(panel, currentPlan.warning);
  } catch (error) {
    invalidatePlan(panel);
    setStatus(panel, `生成目录规范移动预览失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

async function checkMaterialTextures(panel) {
  setBusy(panel, true);
  setStatus(panel, "正在检查材质贴图 UUID 关系...");
  try {
    const result = await requestMain("check-material-textures", {
      directory: panel.$.materialTextureDirectoryInput.value,
      scene: panel.$.materialTextureSceneInput.value
    });
    ({
      materialTextureReferences,
      materialTextureSummary
    } = buildMaterialTextureResultState(result));
    if (!isCompleteMaterialTextureResult(result)) {
      const message = "材质贴图检查接口返回旧结构或字段不完整。请重载 asset-steward 后重新检查。";
      resetMaterialTextureResult();
      renderMaterialTextures(panel);
      await addLog(panel, "warning", message, JSON.stringify(result?.summary || {}, null, 2));
      setStatus(panel, message);
      return;
    }
    renderMaterialTextures(panel);
    await addLog(panel, materialTextureSummary.reviewReferenceCount || materialTextureSummary.invalidMaterialCount ? "warning" : "info", result.warning || "材质贴图检查完成。");
    setStatus(panel, result.warning || "材质贴图检查完成。");
  } catch (error) {
    resetMaterialTextureResult();
    renderMaterialTextures(panel);
    await addLog(panel, "error", `材质贴图检查失败：${error.message}`);
    setStatus(panel, `材质贴图检查失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

function resetMaterialTextureResult() {
  ({
    materialTextureReferences,
    materialTextureSummary
  } = buildMaterialTextureResultState());
}

function renderMaterialTextures(panel) {
  renderMaterialTexturesView(panel, {
    materialTextureReferences,
    materialTextureSummary
  }, createHealthRenderDeps(panel));
  renderOverview(panel);
}

async function checkDuplicateAssets(panel) {
  setBusy(panel, true);
  setStatus(panel, "正在检查同名资源和重复内容...");
  try {
    const result = await requestMain("check-duplicate-assets", {
      directory: panel.$.duplicateAssetDirectoryInput.value
    });
    ({
      duplicateSameNameGroups,
      duplicateHashGroups,
      duplicateAssetSummary
    } = buildDuplicateAssetResultState(result));
    if (!isCompleteDuplicateAssetResult(result)) {
      const message = "重复资源检查接口返回旧结构或字段不完整。请重载 asset-steward 后重新检查。";
      resetDuplicateAssetResult();
      renderDuplicateAssets(panel);
      await addLog(panel, "warning", message, JSON.stringify(result?.summary || {}, null, 2));
      setStatus(panel, message);
      return;
    }
    renderDuplicateAssets(panel);
    const hasDuplicates = duplicateAssetSummary.sameNameGroupCount || duplicateAssetSummary.duplicateHashGroupCount;
    await addLog(panel, hasDuplicates ? "warning" : "info", result.warning || "重复资源检查完成。");
    setStatus(panel, result.warning || "重复资源检查完成。");
  } catch (error) {
    resetDuplicateAssetResult();
    renderDuplicateAssets(panel);
    await addLog(panel, "error", `重复资源检查失败：${error.message}`);
    setStatus(panel, `重复资源检查失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

function resetDuplicateAssetResult() {
  ({
    duplicateSameNameGroups,
    duplicateHashGroups,
    duplicateAssetSummary
  } = buildDuplicateAssetResultState());
}

function renderDuplicateAssets(panel) {
  renderDuplicateAssetsView(panel, {
    duplicateSameNameGroups,
    duplicateHashGroups,
    duplicateAssetSummary
  }, createHealthRenderDeps(panel));
  renderOverview(panel);
}

async function checkScenePrefabReferenceHealth(panel) {
  setBusy(panel, true);
  setStatus(panel, "正在检查场景和 Prefab UUID 引用...");
  try {
    const result = await requestMain("check-scene-prefab-reference-health", {
      directory: panel.$.scenePrefabHealthDirectoryInput.value,
      extensions: panel.$.scenePrefabHealthExtensionInput.value,
      whitelist: panel.$.scenePrefabHealthWhitelistInput.value
    });
    ({
      scenePrefabReferenceIssues,
      scenePrefabReferenceSummary
    } = buildScenePrefabReferenceHealthResultState(result));
    if (!isCompleteScenePrefabReferenceHealthResult(result)) {
      const message = "场景和 Prefab 引用健康接口返回旧结构或字段不完整。请重载 asset-steward 后重新检查。";
      resetScenePrefabReferenceHealthResult();
      renderScenePrefabReferenceHealth(panel);
      await addLog(panel, "warning", message, JSON.stringify(result?.summary || {}, null, 2));
      setStatus(panel, message);
      return;
    }
    renderScenePrefabReferenceHealth(panel);
    await addLog(panel, scenePrefabReferenceIssues.length ? "warning" : "info", result.warning || "场景和 Prefab 引用健康检查完成。");
    setStatus(panel, result.warning || "场景和 Prefab 引用健康检查完成。");
  } catch (error) {
    resetScenePrefabReferenceHealthResult();
    renderScenePrefabReferenceHealth(panel);
    await addLog(panel, "error", `场景和 Prefab 引用健康检查失败：${error.message}`);
    setStatus(panel, `场景和 Prefab 引用健康检查失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

function resetScenePrefabReferenceHealthResult() {
  ({
    scenePrefabReferenceIssues,
    scenePrefabReferenceSummary
  } = buildScenePrefabReferenceHealthResultState());
}

function renderScenePrefabReferenceHealth(panel) {
  renderScenePrefabReferenceHealthView(panel, {
    scenePrefabReferenceIssues,
    scenePrefabReferenceSummary
  }, createHealthRenderDeps(panel));
  renderOverview(panel);
}

async function scan(panel) {
  setBusy(panel, true);
  invalidatePlan(panel);
  setStatus(panel, "正在扫描 assets...");
  try {
    const result = await requestMain("scan-assets", {
      search: panel.$.searchInput.value,
      extensions: panel.$.extensionInput.value
    });
    ({
      entries,
      directories,
      classifyScanSummary
    } = buildClassifyScanResultState(result));
    selectedPaths = filterSelectedPathsByEntries(selectedPaths, entries);
    fillDirectories(panel);
    renderAssets(panel);
    const summary = classifyScanSummary;
    if (!summary || !Number.isFinite(Number(summary.visibleCount))) {
      await addLog(panel, "warning", "自动分类扫描接口返回字段不完整，请重载扩展后重试。");
      throw new Error("扫描结果字段不完整，请重载扩展。");
    }
    panel.$.scanSummary.textContent = formatClassifyScanSummary(summary, selectedPaths.size);
    renderOverview(panel);
    setStatus(panel, summary.missingMetaCount || summary.orphanMetaCount
      ? "检测到 meta 异常，相关资源会被阻止移动，请先人工处理。"
      : "扫描完成。选择资源后生成移动预览。");
  } catch (error) {
    ({
      entries,
      directories,
      classifyScanSummary
    } = buildClassifyScanResultState());
    renderAssets(panel);
    renderOverview(panel);
    await addLog(panel, "error", `自动分类扫描失败：${error.message}`);
    setStatus(panel, `扫描失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

function fillDirectories(panel) {
  const previous = panel.$.targetDirectorySelect.value;
  panel.$.targetDirectorySelect.innerHTML = "";
  for (const directory of directories) {
    const option = document.createElement("option");
    option.value = directory;
    option.textContent = directory;
    panel.$.targetDirectorySelect.appendChild(option);
  }
  panel.$.targetDirectorySelect.value = directories.includes(previous) ? previous : (directories.find((item) => item === "assets/res") || "assets");
}

function renderAssets(panel) {
  renderClassifyAssetsView(panel, {
    entries,
    selectedPaths,
  }, {
    locate: (path) => locate(panel, path),
    onSelectionChange: (path, checked) => {
      selectedPaths = toggleClassifySelection(selectedPaths, path, checked);
      invalidatePlan(panel);
      updateSelectionSummary(panel);
    },
  });
}

function selectVisible(panel) {
  selectedPaths = selectVisibleClassifyEntries(selectedPaths, entries);
  invalidatePlan(panel);
  renderAssets(panel);
  updateSelectionSummary(panel);
}

function clearSelection(panel) {
  selectedPaths = clearClassifySelection();
  invalidatePlan(panel);
  renderAssets(panel);
  updateSelectionSummary(panel);
}

function updateSelectionSummary(panel) {
  panel.$.scanSummary.textContent = formatClassifyScanSummary(classifyScanSummary, selectedPaths.size);
}

function updateMode(panel) {
  const rulesMode = panel.$.modeSelect.value === "rules";
  panel.$.targetDirectoryLabel.classList.toggle("hidden", rulesMode);
  panel.$.ruleScopeLabel.classList.toggle("hidden", !rulesMode);
  invalidatePlan(panel);
}

function renderRules(panel) {
  renderClassifyRulesView(panel, rules, {
    onRuleEnabledChange: (rule, checked) => {
      rule.enabled = checked;
      invalidatePlan(panel);
    },
    onRuleExtensionsChange: (rule, value) => {
      rule.extensions = value.split(",");
      invalidatePlan(panel);
    },
    onRuleKeywordsChange: (rule, value) => {
      rule.nameKeywords = value.split(",");
      invalidatePlan(panel);
    },
    onRuleTargetChange: (rule, value) => {
      rule.target = value;
      invalidatePlan(panel);
    },
    onRuleRemove: (rule) => {
      rules = rules.filter((item) => item !== rule);
      renderRules(panel);
      invalidatePlan(panel);
    },
  });
}

function addRule(panel) {
  const rule = {
    id: `rule-${Date.now()}`,
    enabled: true,
    extensions: [".ext"],
    nameKeywords: [],
    target: "assets/res"
  };
  const fallbackIndex = rules.findIndex((item) => item.id === "image-other");
  fallbackIndex >= 0 ? rules.splice(fallbackIndex, 0, rule) : rules.push(rule);
  renderRules(panel);
  invalidatePlan(panel);
}

async function saveRules(panel) {
  try {
    const result = await requestMain("save-rules", { rules });
    rules = result.rules;
    renderRules(panel);
    setStatus(panel, `规则已保存到 ${result.profilePath}`);
  } catch (error) {
    setStatus(panel, `保存规则失败：${error.message}`);
  }
}

async function preview(panel) {
  if (panel.$.modeSelect.value === "manual" && selectedPaths.size === 0) {
    setStatus(panel, "手动移动模式需要先勾选资源。");
    return;
  }
  if (panel.$.modeSelect.value === "rules" && panel.$.ruleScopeSelect.value === "selected" && selectedPaths.size === 0) {
    setStatus(panel, "规则范围为“仅勾选资源”时，需要先勾选资源。");
    return;
  }

  setBusy(panel, true);
  setStatus(panel, "正在生成移动预览...");
  try {
    currentPlan = await requestMain("preview-moves", {
      mode: panel.$.modeSelect.value,
      paths: [...selectedPaths],
      targetDirectory: panel.$.targetDirectorySelect.value,
      ruleScope: panel.$.ruleScopeSelect.value,
      conflictPolicy: panel.$.conflictPolicySelect.value,
      rules
    });
    panel.$.backupConfirmed.checked = false;
    renderPlan(panel);
    setStatus(panel, currentPlan.warning);
  } catch (error) {
    invalidatePlan(panel);
    setStatus(panel, `生成预览失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

async function previewReverse(panel) {
  const historyId = panel.$.historySelect.value;
  if (!historyId) {
    setStatus(panel, "没有可生成反向计划的历史记录。");
    return;
  }

  setBusy(panel, true);
  try {
    currentPlan = await requestMain("preview-reverse", {
      historyId,
      conflictPolicy: panel.$.conflictPolicySelect.value
    });
    panel.$.backupConfirmed.checked = false;
    renderPlan(panel);
    activateTab(panel, "classify");
    setStatus(panel, currentPlan.warning);
  } catch (error) {
    invalidatePlan(panel);
    setStatus(panel, `生成反向计划失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

function renderPlan(panel) {
  renderClassifyPlanView(panel, currentPlan);
  renderOverview(panel);
}

async function execute(panel) {
  const blockReason = getMovePlanExecutionBlockReason(currentPlan, panel.$.backupConfirmed.checked);
  if (blockReason) {
    setStatus(panel, blockReason);
    return;
  }

  if (!window.confirm(formatMovePlanExecutionConfirmMessage(currentPlan))) {
    return;
  }

  setBusy(panel, true);
  setStatus(panel, "正在执行移动，请勿同时在资源管理器操作这些资源...");
  try {
    const result = await requestMain("execute-moves", {
      token: currentPlan.token,
      backupConfirmed: panel.$.backupConfirmed.checked,
      cleanupEmptyDirectories: panel.$.cleanupEmptyDirectories.checked
    });
    const resultMessage = formatMoveExecutionResultMessage(result);
    if (result.failed.length || result.failedDirectories.length) {
      await addLog(panel, "warning", resultMessage);
    } else {
      await addLog(panel, "info", resultMessage);
    }
    currentPlan = null;
    selectedPaths.clear();
    await loadState(panel);
    await scan(panel);
    setStatus(panel, resultMessage);
  } catch (error) {
    await addLog(panel, "error", `执行移动失败：${error.message}`);
    setStatus(panel, `执行失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

function renderHistory(panel) {
  renderHistoryView(panel, history, { document, formatDate });
  renderOverview(panel);
}

async function locate(panel, path) {
  try {
    await requestMain("locate-asset", { path });
    setStatus(panel, `已在资源管理器定位：${path}`);
  } catch (error) {
    setStatus(panel, `定位失败：${error.message}`);
  }
}

function invalidatePlan(panel) {
  currentPlan = null;
  panel.$.backupConfirmed.checked = false;
  renderPlan(panel);
}

function setBusy(panel, busy) {
  panel.$.assetScanButton.disabled = busy;
  panel.$.overviewRunScanButton.disabled = busy;
  panel.$.overviewRunHealthButton.disabled = busy;
  panel.$.overviewExportReportButton.disabled = busy;
  panel.$.referenceSelectedAssetButton.disabled = busy;
  panel.$.referenceCheckButton.disabled = busy;
  panel.$.nodeReferenceCheckButton.disabled = busy;
  panel.$.nodeReferenceTileLayoutButton.disabled = busy;
  panel.$.nodeReferenceMaxLeftButton.disabled = busy;
  panel.$.nodeReferenceMaxRightButton.disabled = busy;
  panel.$.unusedScanButton.disabled = busy;
  panel.$.unusedSelectVisibleButton.disabled = busy || getVisibleUnusedCandidates(panel).length === 0;
  panel.$.unusedClearSelectionButton.disabled = busy || unusedSelectedPaths.size === 0;
  panel.$.unusedDeletePreviewButton.disabled = busy;
  panel.$.unusedDeleteExecuteButton.disabled = busy || !unusedDeletePlan || !panel.$.unusedDeleteConfirmedInput.checked || safeNumber(unusedDeletePlan.summary?.ready) <= 0;
  panel.$.resourcesRuntimeCheckButton.disabled = busy;
  panel.$.resourcesRuntimeTileLayoutButton.disabled = busy;
  panel.$.resourcesRuntimeMaxLeftButton.disabled = busy;
  panel.$.resourcesRuntimeMaxRightButton.disabled = busy;
  panel.$.packageSizeReportButton.disabled = busy;
  panel.$.packageSizeTileLayoutButton.disabled = busy;
  panel.$.packageSizeMaxStatsButton.disabled = busy;
  panel.$.packageSizeMaxReferencedButton.disabled = busy;
  panel.$.directoryConventionCheckButton.disabled = busy;
  panel.$.directoryConventionPreviewButton.disabled = busy || directoryConventionMismatches.length === 0;
  panel.$.materialTextureCheckButton.disabled = busy;
  panel.$.duplicateAssetCheckButton.disabled = busy;
  panel.$.duplicateAssetTileLayoutButton.disabled = busy;
  panel.$.duplicateAssetMaxLeftButton.disabled = busy;
  panel.$.duplicateAssetMaxRightButton.disabled = busy;
  panel.$.scenePrefabHealthCheckButton.disabled = busy;
  panel.$.exportSessionReportButton.disabled = busy;
  panel.$.projectCacheReloadStrategySelect.disabled = busy;
  panel.$.projectCacheCleanButton.disabled = busy;
  panel.$.scanButton.disabled = busy;
  panel.$.previewButton.disabled = busy;
  panel.$.reverseButton.disabled = busy;
  panel.$.historyDetailButton.disabled = busy || history.length === 0;
  panel.$.saveRulesButton.disabled = busy;
  panel.$.executeButton.disabled = busy || !canExecuteMovePlan(currentPlan);
}

function setStatus(panel, text) {
  panel.$.statusText.textContent = text;
}
