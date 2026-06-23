"use strict";

const { requestMain } = require("./request");
const {
  safeNumber,
  normalizePanelExtensions,
  formatAction,
  formatLogLevel,
  formatLogLevelClass,
  formatRuntimeCallStatus,
  formatRuntimeCallStatusClass,
  formatMaterialTextureStatus,
  formatMaterialTextureStatusClass,
  formatShortHash,
  formatUnusedDeleteBackupScope,
  formatIssueKind,
  formatIssueSeverity,
  formatIssueSeverityClass,
  formatUuidList,
  formatPathList,
  formatReferenceChain,
  formatSize,
  formatPercent,
  formatDate,
  escapeHtml,
} = require("./format");

let entries = [];
let directories = [];
let selectedPaths = new Set();
let rules = [];
let history = [];
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

exports.template = `
<section class="root">
  <header class="toolbox-header">
    <div>
      <h2>项目资源管家</h2>
      <p>资源扫描、自动分类、未引用资源、健康检查和历史报告的治理入口。</p>
    </div>
    <nav id="tabBar" class="tab-bar">
      <button class="tab-button" data-tab="scan">资源扫描</button>
      <button class="tab-button active" data-tab="classify">自动分类</button>
      <button class="tab-button" data-tab="unused">未引用资源</button>
      <button class="tab-button" data-tab="health">健康检查</button>
      <button class="tab-button" data-tab="history">历史与报告</button>
    </nav>
  </header>

  <section id="scanTab" class="tab-page">
    <header class="toolbar">
      <label><span>搜索路径</span><input id="assetScanSearchInput" placeholder="例如 prefab / Fish"></label>
      <label><span>扩展名</span><input id="assetScanExtensionInput" placeholder=".prefab,.fbx"></label>
      <label><span>扫描目录</span><input id="assetScanDirectoryInput" value="assets" placeholder="assets 或 assets/res"></label>
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

    <div class="scan-workspace">
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
        <button id="referenceCheckButton">检查引用</button>
      </header>
      <div class="summary" id="referenceSummary">静态搜索目标资源 UUID。未找到引用不等于可删除，还需要人工复核动态加载。</div>
      <div class="reference-workspace">
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

  <section id="classifyTab" class="tab-page active">
    <header class="toolbar">
      <label><span>搜索路径</span><input id="searchInput" placeholder="例如 prefab / Fish"></label>
      <label><span>扩展名</span><input id="extensionInput" placeholder=".prefab,.fbx"></label>
      <button id="scanButton">扫描 assets</button>
      <button id="selectVisibleButton">全选当前结果</button>
      <button id="clearSelectionButton">清空选择</button>
    </header>

    <div class="summary" id="scanSummary">尚未扫描。</div>

    <div class="workspace">
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

  <section id="healthTab" class="tab-page">
    <section class="node-reference-panel">
      <h3>场景节点引用检查</h3>
      <header class="toolbar">
        <label class="wide-field"><span>节点 ID</span><input id="nodeReferenceUuidInput" placeholder="留空时使用当前选中节点"></label>
        <label><span>扫描目录</span><input id="nodeReferenceDirectoryInput" value="assets"></label>
        <label><span>文件类型</span><input id="nodeReferenceExtensionInput" value=".scene,.prefab"></label>
        <button id="nodeReferenceCheckButton">检查节点引用</button>
      </header>
      <div class="summary" id="nodeReferenceSummary">根据目标节点 ID 反查哪些组件属性引用了它；只报告，不修改场景。</div>
      <div class="node-reference-grid">
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
    <section class="resources-runtime-panel">
      <h3>resources 动态加载检查</h3>
      <header class="toolbar">
        <label class="wide-field"><span>代码扫描目录</span><input id="resourcesCodeDirectoriesInput" value="assets/script,assets/scripts"></label>
        <label class="wide-field"><span>resources 目录</span><input id="resourcesDirectoryInput" value="assets/resources"></label>
        <button id="resourcesRuntimeCheckButton">运行检查</button>
      </header>
      <div class="summary" id="resourcesRuntimeSummary">只静态检查 resources.load/loadDir；变量、拼接路径和封装调用需要人工复核。</div>
      <div class="resources-runtime-grid">
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
    <section class="package-size-panel">
      <h3>包体贡献统计</h3>
      <header class="toolbar">
        <label><span>扫描目录</span><input id="packageSizeDirectoryInput" value="assets"></label>
        <label class="wide-field"><span>主场景</span><input id="packageSizeSceneInput" value="assets/scene/main.scene"></label>
        <label><span>Top 文件数</span><input id="packageSizeTopNInput" type="number" min="1" max="200" value="20"></label>
        <label class="inline-check"><input id="packageSizeIncludeMetaInput" type="checkbox"><span>包含 .meta</span></label>
        <button id="packageSizeReportButton">统计体积</button>
      </header>
      <div class="summary" id="packageSizeSummary">统计项目源资源磁盘体积，不等同于最终构建包体。</div>
      <div class="package-size-grid">
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
    <section class="duplicate-asset-panel">
      <h3>重复资源检查</h3>
      <header class="toolbar">
        <label><span>扫描目录</span><input id="duplicateAssetDirectoryInput" value="assets/res"></label>
        <button id="duplicateAssetCheckButton">检查重复资源</button>
      </header>
      <div class="summary" id="duplicateAssetSummary">检查不同目录同名资源和 SHA-256 相同内容；只报告和定位，不自动删除。</div>
      <div class="duplicate-asset-grid">
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
.toolbox-header h2 { color: #f2f2f2; font-size: 16px; margin: 0 0 4px; }
.toolbox-header p { color: #aaa; margin: 0 0 8px; }
.tab-bar { align-items: center; display: flex; gap: 6px; }
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
.workspace { display: grid; flex: 1; gap: 10px; grid-template-columns: minmax(560px, 1fr) 360px; min-height: 260px; }
.scan-workspace { display: grid; flex: 1; gap: 10px; grid-template-columns: minmax(560px, 1fr) 360px; min-height: 0; }
.scan-resource-section { flex: 0 0 180px; margin-bottom: 10px; }
.reference-section { border: 1px solid #444; box-sizing: border-box; flex: 0 0 255px; margin-top: 10px; min-height: 0; padding: 8px; }
.reference-section > h3 { color: #eee; font-size: 13px; margin: 0 0 8px; }
.reference-workspace { display: grid; gap: 10px; grid-template-columns: minmax(420px, 1fr) minmax(520px, 1.2fr); height: 170px; min-height: 0; }
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
.resources-runtime-panel { flex: 0 0 auto; margin-bottom: 10px; }
.resources-runtime-grid { display: grid; gap: 10px; grid-template-columns: minmax(360px, 0.9fr) minmax(520px, 1.4fr); height: 250px; }
.resources-all-details { margin-top: 10px; }
.resources-all-details summary { color: #bcdcff; cursor: pointer; }
.resources-all-table { height: 180px; margin-top: 8px; }
.package-size-panel { flex: 0 0 auto; margin-bottom: 10px; }
.package-size-grid { display: grid; gap: 10px; grid-template-columns: minmax(360px, 1fr) minmax(280px, .75fr) minmax(420px, 1.2fr); height: 260px; }
.referenced-size-section { border: 1px solid #444; margin-top: 10px; padding: 8px; }
.referenced-size-table { height: 230px; }
.reference-chain { max-width: 720px; white-space: normal; }
.directory-convention-panel { flex: 0 0 auto; margin-bottom: 10px; }
.directory-convention-table { height: 270px; }
.material-texture-panel { flex: 0 0 auto; margin-bottom: 10px; }
.material-texture-table { height: 320px; }
.duplicate-asset-panel { flex: 0 0 auto; margin-bottom: 10px; }
.duplicate-asset-grid { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; height: 340px; }
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
#healthTab { overflow: auto; }
.node-reference-panel { flex: 0 0 auto; margin-bottom: 10px; }
.node-reference-grid { display: grid; gap: 10px; grid-template-columns: minmax(360px, .9fr) minmax(560px, 1.4fr); height: 260px; }
.node-reference-table { height: 220px; }
.history-panel { max-width: 720px; }
.history-panel label { justify-content: space-between; margin-bottom: 8px; }
.history-panel button { margin-bottom: 8px; }
.history-detail-table { height: 220px; margin-top: 8px; }
.history-cleanup-details summary { color: #bcdcff; cursor: pointer; }
.report-panel { margin-top: 10px; max-width: none; }
.log-panel { margin-top: 10px; max-width: none; }
.log-table { height: 220px; }
footer { color: #ffcf7a; min-height: 22px; padding-top: 7px; }
`;

exports.$ = {
  tabBar: "#tabBar",
  scanTab: "#scanTab",
  classifyTab: "#classifyTab",
  unusedTab: "#unusedTab",
  healthTab: "#healthTab",
  historyTab: "#historyTab",
  assetScanSearchInput: "#assetScanSearchInput",
  assetScanExtensionInput: "#assetScanExtensionInput",
  assetScanDirectoryInput: "#assetScanDirectoryInput",
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
  panel.$.assetScanButton.addEventListener("click", () => scanAssetReport(panel));
  panel.$.referenceCheckButton.addEventListener("click", () => checkReferences(panel));
  panel.$.nodeReferenceCheckButton.addEventListener("click", () => checkNodeReferences(panel));
  panel.$.unusedScanButton.addEventListener("click", () => scanUnusedAssets(panel));
  panel.$.unusedSearchInput.addEventListener("input", () => renderUnusedCandidates(panel));
  panel.$.unusedExtensionInput.addEventListener("input", () => renderUnusedCandidates(panel));
  panel.$.unusedSelectVisibleButton.addEventListener("click", () => selectVisibleUnusedCandidates(panel));
  panel.$.unusedClearSelectionButton.addEventListener("click", () => clearUnusedSelection(panel));
  panel.$.unusedDeletePreviewButton.addEventListener("click", () => previewUnusedDelete(panel));
  panel.$.unusedDeleteExecuteButton.addEventListener("click", () => executeUnusedDelete(panel));
  panel.$.unusedDeleteConfirmedInput.addEventListener("change", () => renderUnusedDeletePlan(panel));
  panel.$.resourcesRuntimeCheckButton.addEventListener("click", () => checkResourcesRuntime(panel));
  panel.$.packageSizeReportButton.addEventListener("click", () => reportPackageSize(panel));
  panel.$.directoryConventionCheckButton.addEventListener("click", () => checkDirectoryConvention(panel));
  panel.$.directoryConventionPreviewButton.addEventListener("click", () => previewDirectoryConvention(panel));
  panel.$.materialTextureCheckButton.addEventListener("click", () => checkMaterialTextures(panel));
  panel.$.duplicateAssetCheckButton.addEventListener("click", () => checkDuplicateAssets(panel));
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
  await loadState(panel);
  await loadLogs(panel);
  await scan(panel);
};

function activateTab(panel, tabName) {
  const tabs = {
    scan: panel.$.scanTab,
    classify: panel.$.classifyTab,
    unused: panel.$.unusedTab,
    health: panel.$.healthTab,
    history: panel.$.historyTab,
  };
  for (const [name, tab] of Object.entries(tabs)) {
    tab.classList.toggle("active", name === tabName);
  }
  panel.$.tabBar.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });
}

async function loadState(panel) {
  try {
    const state = await requestMain("load-state");
    rules = state.rules || [];
    history = state.history || [];
    selectedHistoryDetail = null;
    renderRules(panel);
    renderHistory(panel);
    renderHistoryDetail(panel);
  } catch (error) {
    setStatus(panel, `读取规则和历史失败：${error.message}`);
  }
}

async function loadLogs(panel) {
  try {
    const result = await requestMain("get-logs");
    runtimeLogs = result.logs || [];
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
    panel.$.exportSessionReportSummary.textContent = `已导出 ${safeNumber(result.moduleCount)} 个已运行模块：${result.markdownPath}、${result.jsonPath}`;
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
  const modules = [];
  addSessionReportModule(modules, "asset-scan", "资源扫描", scanReportSummary, {
    resources: scanResourceEntries,
    issues: scanIssues,
    typeStats: scanTypeStats
  });
  addSessionReportModule(modules, "reference-check", "资源引用检查", referenceSummary, {
    targets: referenceTargets,
    references: referenceRows
  });
  addSessionReportModule(modules, "scene-node-reference-check", "场景节点引用检查", nodeReferenceSummary, {
    targets: nodeReferenceTargets,
    references: nodeReferenceRows
  });
  addSessionReportModule(modules, "scene-unused-assets", "未引用资源扫描", unusedSummary, {
    candidates: unusedCandidates
  });
  addSessionReportModule(modules, "resources-runtime-check", "resources 动态加载检查", resourcesRuntimeSummary, {
    resources: resourcesRuntimeResources,
    staticCalls: resourcesRuntimeStaticCalls,
    unusedResources: resourcesRuntimeUnused,
    dynamicCalls: resourcesRuntimeDynamicCalls
  });
  addSessionReportModule(modules, "package-size-report", "包体贡献统计", packageSizeSummary, {
    directoryRanking: packageDirectoryRanking,
    typeRanking: packageTypeRanking,
    topFiles: packageTopFiles,
    referencedTopFiles: packageReferencedTopFiles
  });
  addSessionReportModule(modules, "directory-convention", "目录规范检查", directoryConventionSummary, {
    mismatches: directoryConventionMismatches
  });
  addSessionReportModule(modules, "material-textures", "材质贴图检查", materialTextureSummary, {
    references: materialTextureReferences
  });
  addSessionReportModule(modules, "duplicate-assets", "重复资源检查", duplicateAssetSummary, {
    sameNameGroups: duplicateSameNameGroups,
    duplicateHashGroups
  });
  addSessionReportModule(modules, "scene-prefab-reference-health", "场景和 Prefab 引用健康", scenePrefabReferenceSummary, {
    issues: scenePrefabReferenceIssues
  });
  return {
    modules,
    currentPlan: sanitizeCurrentPlanForReport(currentPlan),
    history: history.map(toHistorySummary),
    logs: runtimeLogs
  };
}

function addSessionReportModule(modules, id, title, summary, data) {
  if (!summary) {
    return;
  }
  modules.push({ id, title, summary, data });
}

function sanitizeCurrentPlanForReport(plan) {
  if (!plan) {
    return null;
  }
  const { token, ...reportPlan } = plan;
  return reportPlan;
}

function toHistorySummary(item) {
  return {
    id: item.id,
    createdAt: item.createdAt,
    kind: item.kind,
    mode: item.mode,
    conflictPolicy: item.conflictPolicy,
    movedCount: item.movedCount,
    failedCount: item.failedCount,
    hasOverwrite: item.hasOverwrite,
    deletedDirectoryCount: Array.isArray(item.deletedDirectories) ? item.deletedDirectories.length : 0,
    cleanupFailedCount: item.cleanupFailedCount
  };
}

async function loadHistoryDetail(panel) {
  const historyId = panel.$.historySelect.value;
  if (!historyId) {
    selectedHistoryDetail = null;
    renderHistoryDetail(panel);
    setStatus(panel, "没有可查看的移动历史。");
    return;
  }
  setBusy(panel, true);
  setStatus(panel, "正在读取移动历史详情...");
  try {
    const result = await requestMain("get-history-detail", { historyId });
    selectedHistoryDetail = result.detail || null;
    renderHistoryDetail(panel);
    setStatus(panel, selectedHistoryDetail?.warning || "移动历史详情已加载。");
  } catch (error) {
    selectedHistoryDetail = null;
    renderHistoryDetail(panel);
    setStatus(panel, `读取移动历史详情失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

function renderHistoryDetail(panel) {
  panel.$.historyDetailRows.innerHTML = "";
  const detail = selectedHistoryDetail;
  const moves = detail?.moves || [];
  panel.$.historyDetailEmpty.style.display = moves.length ? "none" : "block";
  if (!detail) {
    panel.$.historyDetailSummary.textContent = "选择一条移动历史后查看完整已移动项和清理结果。";
    panel.$.historyCleanupSummary.textContent = "暂无清理结果。";
    return;
  }
  const failedMoveHint = detail.failedMovesPersisted
    ? `失败明细 ${safeNumber(detail.failedMoves?.length)} 项已持久化。`
    : "失败明细未持久化，请查看当次执行日志。";
  const cleanupFailedHint = detail.failedDirectoriesPersisted
    ? `清理失败明细 ${safeNumber(detail.failedDirectories?.length)} 项已持久化。`
    : "失败明细未持久化。";
  panel.$.historyDetailSummary.textContent = `${formatDate(detail.createdAt)}：${detail.kind === "reverse" ? "反向" : "移动"} / ${detail.mode || "-"} / ${detail.conflictPolicy || "-"}；成功 ${safeNumber(detail.movedCount)} 项，失败 ${safeNumber(detail.failedCount)} 项，含覆盖 ${detail.hasOverwrite ? "是" : "否"}。${failedMoveHint}`;
  panel.$.historyCleanupSummary.textContent = `删除空源目录 ${safeNumber(detail.deletedDirectories?.length)} 个：${formatPathList(detail.deletedDirectories)}；清理失败 ${safeNumber(detail.cleanupFailedCount)} 个（${cleanupFailedHint}）。`;
  for (const move of moves) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${formatAction(move.action)}</td>
      <td class="path" title="${escapeHtml(move.source)}">${escapeHtml(move.source)}</td>
      <td class="path" title="${escapeHtml(move.destination)}">${escapeHtml(move.destination)}</td>
      <td class="${move.overwrittenTargetRecoverable ? "ready" : "warning"}">${move.overwrittenTargetRecoverable ? "是" : "否"}</td>
    `;
    panel.$.historyDetailRows.appendChild(row);
  }
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
    runtimeLogs = result.logs || runtimeLogs;
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
    runtimeLogs = result.logs || [];
    renderLogs(panel);
    setStatus(panel, "运行日志已清空。");
  } catch (error) {
    setStatus(panel, `清空日志失败：${error.message}`);
  }
}

function renderLogs(panel) {
  panel.$.logRows.innerHTML = "";
  panel.$.logEmpty.style.display = runtimeLogs.length ? "none" : "block";
  for (const log of [...runtimeLogs].slice().reverse()) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(formatDate(log.time))}</td>
      <td class="${formatLogLevelClass(log.level)}">${escapeHtml(formatLogLevel(log.level))}</td>
      <td title="${escapeHtml(log.detail || "")}">${escapeHtml(log.message || "")}</td>
    `;
    panel.$.logRows.appendChild(row);
  }
}

async function scanAssetReport(panel) {
  setBusy(panel, true);
  setStatus(panel, "正在扫描资源异常和类型统计...");
  try {
    const result = await requestMain("scan-assets", {
      search: panel.$.assetScanSearchInput.value,
      extensions: panel.$.assetScanExtensionInput.value,
      directory: panel.$.assetScanDirectoryInput.value
    });
    scanResourceEntries = result.entries || [];
    scanIssues = result.issues || [];
    scanTypeStats = result.typeStats || [];
    scanReportSummary = result.summary || null;
    if (!isCompleteAssetScanResult(result)) {
      const message = "资源扫描接口返回旧结构或字段不完整。请在扩展管理器重载 asset-steward 后重新打开面板。";
      await addLog(panel, "warning", message, JSON.stringify(result?.summary || {}, null, 2));
      scanResourceEntries = [];
      scanIssues = [];
      scanTypeStats = [];
      scanReportSummary = null;
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
    scanResourceEntries = [];
    scanIssues = [];
    scanTypeStats = [];
    scanReportSummary = null;
    renderAssetScanReport(panel);
    await addLog(panel, "error", `资源扫描失败：${error.message}`);
    setStatus(panel, `资源扫描失败：${error.message}`);
  } finally {
    setBusy(panel, false);
  }
}

function renderAssetScanReport(panel) {
  renderAssetScanSummary(panel);
  renderAssetScanResources(panel);
  renderAssetScanIssues(panel);
  renderAssetScanTypes(panel);
}

function renderAssetScanSummary(panel) {
  if (!scanReportSummary) {
    panel.$.assetScanSummary.textContent = "尚未扫描。第一版只预览异常和统计，不删除、不修复、不创建目录。";
    return;
  }

  const summary = scanReportSummary;
  panel.$.assetScanSummary.textContent = `扫描 ${summary.scanDirectory || "assets"}：文件 ${safeNumber(summary.fileCount)} 项，目录 ${safeNumber(summary.directoryCount)} 项，总大小 ${formatSize(summary.totalSize || 0)}；缺失 meta ${safeNumber(summary.missingMetaCount)} 项，孤立 meta ${safeNumber(summary.orphanMetaCount)} 项，空目录 ${safeNumber(summary.emptyDirectoryCount)} 项；当前筛选显示异常 ${safeNumber(summary.visibleIssueCount)} 项，类型 ${safeNumber(summary.typeCount)} 类。`;
}

function renderAssetScanResources(panel) {
  panel.$.assetScanResourceRows.innerHTML = "";
  panel.$.assetScanResourceEmpty.style.display = scanResourceEntries.length ? "none" : "block";
  for (const entry of scanResourceEntries) {
    const canCheckReference = entry.selectable && !entry.missingMeta;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="path" title="${escapeHtml(entry.path)}">${escapeHtml(entry.path)}</td>
      <td>${escapeHtml(entry.extension || "-")}</td>
      <td>${entry.kind === "directory" ? "-" : formatSize(entry.size || 0)}</td>
      <td class="${entry.missingMeta ? "warning" : ""}">${entry.missingMeta ? "缺少 meta" : "正常"}</td>
      <td><button class="locate">定位</button><button class="check-reference" ${canCheckReference ? "" : "disabled"}>查引用</button></td>
    `;
    row.querySelector(".locate").addEventListener("click", () => locate(panel, entry.path));
    if (canCheckReference) {
      row.querySelector(".check-reference").addEventListener("click", () => checkReferenceForPath(panel, entry.path));
    }
    panel.$.assetScanResourceRows.appendChild(row);
  }
}

function renderAssetScanIssues(panel) {
  panel.$.assetScanIssueRows.innerHTML = "";
  panel.$.assetScanIssueEmpty.style.display = scanIssues.length ? "none" : "block";
  for (const issue of scanIssues) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="${formatIssueSeverityClass(issue.severity)}">${formatIssueSeverity(issue.severity)}</td>
      <td>${formatIssueKind(issue.kind)}</td>
      <td class="path" title="${escapeHtml(issue.path)}">${escapeHtml(issue.path)}</td>
      <td>${escapeHtml(issue.extension || "-")}</td>
      <td>${issue.size > 0 ? formatSize(issue.size) : "-"}</td>
      <td><button class="locate" ${issue.locatable ? "" : "disabled"}>${issue.locatable ? "定位" : "仅显示"}</button></td>
    `;
    const locateButton = row.querySelector(".locate");
    if (issue.locatable) {
      locateButton.addEventListener("click", () => locate(panel, issue.path));
    }
    panel.$.assetScanIssueRows.appendChild(row);
  }
}

function renderAssetScanTypes(panel) {
  panel.$.assetScanTypeRows.innerHTML = "";
  panel.$.assetScanTypeEmpty.style.display = scanTypeStats.length ? "none" : "block";
  for (const stat of scanTypeStats) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(stat.extension)}</td>
      <td>${stat.count}</td>
      <td>${formatSize(stat.totalSize)}</td>
    `;
    panel.$.assetScanTypeRows.appendChild(row);
  }
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
    referenceTargets = result.targets || [];
    referenceRows = result.references || [];
    referenceSummary = result.summary || null;
    if (!isCompleteReferenceResult(result)) {
      const message = "引用检查接口返回旧结构或字段不完整。请重载 asset-steward 后重新检查。";
      await addLog(panel, "warning", message, JSON.stringify(result?.summary || {}, null, 2));
      referenceTargets = [];
      referenceRows = [];
      referenceSummary = null;
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
    referenceTargets = [];
    referenceRows = [];
    referenceSummary = null;
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

function renderReferences(panel) {
  renderReferenceSummary(panel);
  renderReferenceTargets(panel);
  renderReferenceRows(panel);
}

function renderReferenceSummary(panel) {
  if (!referenceSummary) {
    panel.$.referenceSummary.textContent = "静态搜索目标资源 UUID。未找到引用不等于可删除，还需要人工复核动态加载。";
    return;
  }

  panel.$.referenceSummary.textContent = `扫描 ${referenceSummary.scanDirectory || "assets"}：目标 ${safeNumber(referenceSummary.targetCount)} 项，UUID ${safeNumber(referenceSummary.uuidCount)} 个，扫描序列化文件 ${safeNumber(referenceSummary.scannedFileCount)} 个，找到引用方 ${safeNumber(referenceSummary.referenceFileCount)} 个，命中 ${safeNumber(referenceSummary.totalMatchCount)} 次，解析位置 ${safeNumber(referenceSummary.referencePositionCount)} 条，可选中节点 ${safeNumber(referenceSummary.selectablePositionCount)} 条。`;
}

function renderReferenceTargets(panel) {
  panel.$.referenceTargetRows.innerHTML = "";
  panel.$.referenceTargetEmpty.style.display = referenceTargets.length ? "none" : "block";
  for (const target of referenceTargets) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="path" title="${escapeHtml(target.path)}">${escapeHtml(target.path)}</td>
      <td>${target.uuidCount}</td>
      <td class="path" title="${escapeHtml((target.uuids || []).join(", "))}">${escapeHtml(formatUuidList(target.uuids))}</td>
      <td><button class="locate">定位</button></td>
    `;
    row.querySelector(".locate").addEventListener("click", () => locate(panel, target.path));
    panel.$.referenceTargetRows.appendChild(row);
  }
}

function renderReferenceRows(panel) {
  panel.$.referenceRows.innerHTML = "";
  panel.$.referenceEmpty.style.display = referenceRows.length ? "none" : "block";
  for (const item of referenceRows) {
    const details = item.details?.length ? item.details : [null];
    for (const detail of details) {
      renderReferenceRow(panel, item, detail);
    }
  }
}

function renderReferenceRow(panel, item, detail) {
    const row = document.createElement("tr");
    const position = detail
      ? `${detail.nodePath || "未解析节点"} | ${detail.componentType || "未知组件"} | ${detail.fieldPath || "未知字段"}`
      : `仅文件级结果，共命中 ${item.matchCount} 次`;
    const matchedUuid = detail?.matchedUuid || formatUuidList(item.matchedUuids);
    const targetPaths = detail?.targetPaths || item.targetPaths;
    row.innerHTML = `
      <td class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</td>
      <td class="path" title="${escapeHtml(position)}">${escapeHtml(position)}</td>
      <td class="path" title="${escapeHtml(matchedUuid)}">${escapeHtml(matchedUuid)}</td>
      <td class="path" title="${escapeHtml((targetPaths || []).join(", "))}">${escapeHtml(formatPathList(targetPaths))}</td>
      <td><button class="locate">定位资源</button> <button class="check-parent">查上级</button> <button class="select-node" ${detail?.selectable ? "" : "disabled"}>选中节点</button></td>
    `;
    row.querySelector(".locate").addEventListener("click", () => locate(panel, item.path));
    row.querySelector(".check-parent").addEventListener("click", () => checkReferenceForPath(panel, item.path));
    row.querySelector(".select-node").addEventListener("click", () => selectReferenceNode(panel, item.path, detail));
    panel.$.referenceRows.appendChild(row);
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
    const result = await requestMain("check-node-references", {
      nodeUuid: panel.$.nodeReferenceUuidInput.value,
      directory: panel.$.nodeReferenceDirectoryInput.value,
      extensions: panel.$.nodeReferenceExtensionInput.value
    });
    nodeReferenceTargets = result.targetNodes || [];
    nodeReferenceRows = result.references || [];
    nodeReferenceSummary = result.summary || null;
    if (result.nodeUuid && !panel.$.nodeReferenceUuidInput.value.trim()) {
      panel.$.nodeReferenceUuidInput.value = result.nodeUuid;
    }
    if (!isCompleteNodeReferenceResult(result)) {
      const message = "节点引用检查接口返回旧结构或字段不完整。请重载 asset-steward 后重新检查。";
      resetNodeReferenceResult();
      renderNodeReferences(panel);
      await addLog(panel, "warning", message, JSON.stringify(result?.summary || {}, null, 2));
      setStatus(panel, message);
      return;
    }
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
  nodeReferenceTargets = [];
  nodeReferenceRows = [];
  nodeReferenceSummary = null;
}

function renderNodeReferences(panel) {
  renderNodeReferenceSummary(panel);
  renderNodeReferenceTargets(panel);
  renderNodeReferenceRows(panel);
}

function renderNodeReferenceSummary(panel) {
  if (!nodeReferenceSummary) {
    panel.$.nodeReferenceSummary.textContent = "根据目标节点 ID 反查哪些组件属性引用了它；只报告，不修改场景。";
    return;
  }

  const summary = nodeReferenceSummary;
  panel.$.nodeReferenceSummary.textContent = `扫描 ${summary.scanDirectory || "assets"}：序列化文件 ${safeNumber(summary.scannedFileCount)} 个，匹配目标节点 ${safeNumber(summary.targetNodeCount)} 个/文件 ${safeNumber(summary.targetFileCount)} 个，找到引用文件 ${safeNumber(summary.referenceFileCount)} 个，引用组件 ${safeNumber(summary.referencePositionCount)} 条，可选中节点 ${safeNumber(summary.selectablePositionCount)} 条。`;
}

function renderNodeReferenceTargets(panel) {
  panel.$.nodeReferenceTargetRows.innerHTML = "";
  panel.$.nodeReferenceTargetEmpty.style.display = nodeReferenceTargets.length ? "none" : "block";
  for (const item of nodeReferenceTargets) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="path" title="${escapeHtml(item.filePath)}">${escapeHtml(item.filePath)}</td>
      <td class="path" title="${escapeHtml(item.nodePath)}">${escapeHtml(item.nodePath || item.nodeName || "-")}</td>
      <td class="path" title="${escapeHtml(item.nodeUuid)}">${escapeHtml(item.nodeUuid)}</td>
      <td><button class="locate">定位资源</button> <button class="select-node" ${item.selectable ? "" : "disabled"}>选中节点</button></td>
    `;
    row.querySelector(".locate").addEventListener("click", () => locate(panel, item.filePath));
    row.querySelector(".select-node").addEventListener("click", () => selectReferenceNode(panel, item.filePath, item));
    panel.$.nodeReferenceTargetRows.appendChild(row);
  }
}

function renderNodeReferenceRows(panel) {
  panel.$.nodeReferenceRows.innerHTML = "";
  panel.$.nodeReferenceEmpty.style.display = nodeReferenceRows.length ? "none" : "block";
  for (const item of nodeReferenceRows) {
    const details = item.references?.length ? item.references : [null];
    for (const detail of details) {
      renderNodeReferenceRow(panel, item, detail);
    }
  }
}

function renderNodeReferenceRow(panel, item, detail) {
  if (!detail) {
    return;
  }
  const row = document.createElement("tr");
  row.innerHTML = `
    <td class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</td>
    <td class="path" title="${escapeHtml(detail.nodePath)}">${escapeHtml(detail.nodePath || "未解析节点")}</td>
    <td class="path" title="${escapeHtml(detail.componentType)}">${escapeHtml(detail.componentType || "未知组件")}</td>
    <td class="path" title="${escapeHtml(detail.fieldPath)}">${escapeHtml(detail.fieldPath || "未知字段")}</td>
    <td class="path" title="${escapeHtml(detail.targetNodePath)}">${escapeHtml(detail.targetNodePath || detail.targetNodeName || "-")}</td>
    <td><button class="locate">定位资源</button> <button class="select-node" ${detail.selectable ? "" : "disabled"}>选中引用节点</button> <button class="select-target" ${detail.targetNodeUuid ? "" : "disabled"}>选中目标</button></td>
  `;
  row.querySelector(".locate").addEventListener("click", () => locate(panel, item.path));
  row.querySelector(".select-node").addEventListener("click", () => selectReferenceNode(panel, item.path, detail));
  row.querySelector(".select-target").addEventListener("click", () => selectReferenceNode(panel, item.path, {
    selectable: Boolean(detail.targetNodeUuid),
    nodeUuid: detail.targetNodeUuid,
    nodePath: detail.targetNodePath
  }));
  panel.$.nodeReferenceRows.appendChild(row);
}

async function scanUnusedAssets(panel) {
  setBusy(panel, true);
  setStatus(panel, "正在从主场景递归依赖图扫描未引用候选...");
  try {
    const result = await requestMain("scan-unused-assets", {
      scene: panel.$.unusedSceneInput.value,
      directory: panel.$.unusedDirectoryInput.value
    });
    unusedCandidates = result.candidates || [];
    unusedSummary = result.summary || null;
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
  unusedCandidates = [];
  unusedSummary = null;
  unusedSelectedPaths = new Set();
  unusedDeletePlan = null;
}

function getVisibleUnusedCandidates(panel) {
  const search = String(panel.$.unusedSearchInput.value || "").trim().toLowerCase();
  const extensions = normalizePanelExtensions(panel.$.unusedExtensionInput.value);
  return unusedCandidates.filter((item) => {
    if (search && !String(item.path).toLowerCase().includes(search)) {
      return false;
    }
    return extensions.length === 0 || extensions.includes(String(item.extension).toLowerCase());
  });
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
  const visible = getVisibleUnusedCandidates(panel);
  panel.$.unusedCandidateRows.innerHTML = "";
  panel.$.unusedCandidateEmpty.style.display = visible.length ? "none" : "block";
  panel.$.unusedSelectVisibleButton.disabled = visible.length === 0;
  panel.$.unusedClearSelectionButton.disabled = unusedSelectedPaths.size === 0;
  if (!unusedSummary) {
    panel.$.unusedSummary.textContent = "只展示和定位候选，不提供删除。脚本与 Shader Chunk 强制保护，动态加载需要人工复核。";
  } else {
    const summary = unusedSummary;
    panel.$.unusedSummary.textContent = `主场景 ${summary.scene}，扫描 ${summary.scanDirectory}：纳入判断 ${safeNumber(summary.scannedCount)} 项，可达 ${safeNumber(summary.reachableCount)} 项，候选 ${safeNumber(summary.candidateCount)} 项（${formatSize(summary.candidateTotalSize || 0)}），保护 ${safeNumber(summary.protectedCount)} 项，未解析 UUID ${safeNumber(summary.unresolvedReferenceCount)} 个；当前筛选显示 ${visible.length} 项。`;
  }
  for (const item of visible) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="check"><input type="checkbox"></td>
      <td class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</td>
      <td>${escapeHtml(item.extension || "-")}</td>
      <td>${formatSize(item.size || 0)}</td>
      <td class="warning">动态加载与运行时引用未知</td>
      <td><button class="locate">定位</button></td>
    `;
    const checkbox = row.querySelector("input");
    checkbox.checked = unusedSelectedPaths.has(item.path);
    checkbox.addEventListener("change", () => {
      checkbox.checked ? unusedSelectedPaths.add(item.path) : unusedSelectedPaths.delete(item.path);
      unusedDeletePlan = null;
      panel.$.unusedClearSelectionButton.disabled = unusedSelectedPaths.size === 0;
      renderUnusedDeletePlan(panel);
    });
    row.querySelector(".locate").addEventListener("click", () => locate(panel, item.path));
    panel.$.unusedCandidateRows.appendChild(row);
  }
  renderUnusedDeletePlan(panel);
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
  panel.$.unusedDeleteRows.innerHTML = "";
  const hasPlan = !!unusedDeletePlan;
  panel.$.unusedDeleteEmpty.style.display = hasPlan ? "none" : "block";
  if (!hasPlan) {
    panel.$.unusedDeleteSummary.textContent = `已勾选 ${unusedSelectedPaths.size} 项；默认不选中任何候选。执行前会重新校验候选并创建备份。`;
    panel.$.unusedDeleteExecuteButton.disabled = true;
    return;
  }
  const summary = unusedDeletePlan.summary || {};
  panel.$.unusedDeleteSummary.textContent = `删除预览：共 ${safeNumber(summary.total)} 项，可删除 ${safeNumber(summary.ready)} 项，阻止 ${safeNumber(summary.blocked)} 项，资源体积 ${formatSize(summary.totalSize || 0)}；备份范围 ${formatUnusedDeleteBackupScope(summary.backupScope)}。`;
  for (const item of unusedDeletePlan.items || []) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="${item.status === "ready" ? "ready" : "blocked"}">${item.status === "ready" ? "可删除" : "已阻止"}</td>
      <td class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</td>
      <td>${escapeHtml(item.extension || "-")}</td>
      <td>${formatSize(item.size || 0)}</td>
      <td>${escapeHtml(item.reason || "-")}</td>
    `;
    panel.$.unusedDeleteRows.appendChild(row);
  }
  panel.$.unusedDeleteExecuteButton.disabled = !panel.$.unusedDeleteConfirmedInput.checked || safeNumber(summary.ready) <= 0;
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
    resourcesRuntimeResources = result.resources || [];
    resourcesRuntimeStaticCalls = result.staticCalls || [];
    resourcesRuntimeUnused = result.unusedResources || [];
    resourcesRuntimeDynamicCalls = result.dynamicCalls || [];
    resourcesRuntimeSummary = result.summary || null;
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
  resourcesRuntimeResources = [];
  resourcesRuntimeStaticCalls = [];
  resourcesRuntimeUnused = [];
  resourcesRuntimeDynamicCalls = [];
  resourcesRuntimeSummary = null;
}

function renderResourcesRuntime(panel) {
  renderResourcesRuntimeSummary(panel);
  renderResourcesUnused(panel);
  renderResourcesCalls(panel);
  renderResourcesAll(panel);
}

function renderResourcesRuntimeSummary(panel) {
  if (!resourcesRuntimeSummary) {
    panel.$.resourcesRuntimeSummary.textContent = "只静态检查 resources.load/loadDir；变量、拼接路径和封装调用需要人工复核。";
    return;
  }
  const summary = resourcesRuntimeSummary;
  const directoryState = summary.resourcesDirectoryExists === false ? `；${summary.resourcesDirectory || "assets/resources"} 当前不存在` : "";
  panel.$.resourcesRuntimeSummary.textContent = `扫描 resources 资源 ${safeNumber(summary.resourceCount)} 项、代码文件 ${safeNumber(summary.scannedCodeFileCount)} 个；静态调用 ${safeNumber(summary.staticCallCount)} 项，其中疑似缺失 ${safeNumber(summary.missingCallCount)} 项；动态调用 ${safeNumber(summary.dynamicCallCount)} 项；疑似未加载资源 ${safeNumber(summary.unusedResourceCount)} 项${directoryState}。`;
}

function renderResourcesUnused(panel) {
  panel.$.resourcesUnusedRows.innerHTML = "";
  panel.$.resourcesUnusedEmpty.style.display = resourcesRuntimeUnused.length ? "none" : "block";
  for (const resource of resourcesRuntimeUnused) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="path" title="${escapeHtml(resource.path)}">${escapeHtml(resource.path)}</td>
      <td class="path" title="${escapeHtml(resource.loadPath)}">${escapeHtml(resource.loadPath)}</td>
      <td>${escapeHtml(resource.extension || "-")}</td>
      <td>${formatSize(resource.size || 0)}</td>
      <td><button class="locate">定位</button></td>
    `;
    row.querySelector(".locate").addEventListener("click", () => locate(panel, resource.path));
    panel.$.resourcesUnusedRows.appendChild(row);
  }
}

function renderResourcesCalls(panel) {
  const calls = [...resourcesRuntimeStaticCalls, ...resourcesRuntimeDynamicCalls]
    .sort((left, right) => String(left.codePath).localeCompare(String(right.codePath), "zh-CN") || left.line - right.line);
  panel.$.resourcesCallRows.innerHTML = "";
  panel.$.resourcesCallEmpty.style.display = calls.length ? "none" : "block";
  for (const call of calls) {
    const row = document.createElement("tr");
    const displayPath = call.kind === "static" ? call.runtimePath : call.expression;
    row.innerHTML = `
      <td class="${formatRuntimeCallStatusClass(call)}">${formatRuntimeCallStatus(call)}</td>
      <td>${escapeHtml(call.method || "-")}</td>
      <td class="path" title="${escapeHtml(displayPath || "")}">${escapeHtml(displayPath || "(空路径)")}</td>
      <td class="path" title="${escapeHtml(call.codePath)}:${safeNumber(call.line)}">${escapeHtml(call.codePath)}:${safeNumber(call.line)}</td>
      <td>${safeNumber(call.matchCount)}</td>
      <td><button class="locate">定位代码</button></td>
    `;
    row.querySelector(".locate").addEventListener("click", () => locate(panel, call.codePath));
    panel.$.resourcesCallRows.appendChild(row);
  }
}

function renderResourcesAll(panel) {
  panel.$.resourcesAllRows.innerHTML = "";
  panel.$.resourcesAllEmpty.style.display = resourcesRuntimeResources.length ? "none" : "block";
  for (const resource of resourcesRuntimeResources) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="${resource.used ? "ready" : "warning"}">${resource.used ? "静态命中" : "待复核"}</td>
      <td class="path" title="${escapeHtml(resource.path)}">${escapeHtml(resource.path)}</td>
      <td class="path" title="${escapeHtml(resource.loadPath)}">${escapeHtml(resource.loadPath)}</td>
      <td>${escapeHtml(resource.extension || "-")}</td>
      <td>${formatSize(resource.size || 0)}</td>
      <td><button class="locate">定位</button></td>
    `;
    row.querySelector(".locate").addEventListener("click", () => locate(panel, resource.path));
    panel.$.resourcesAllRows.appendChild(row);
  }
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
    packageDirectoryRanking = result.directoryRanking || [];
    packageTypeRanking = result.typeRanking || [];
    packageTopFiles = result.topFiles || [];
    packageReferencedTopFiles = result.referencedTopFiles || [];
    packageSizeSummary = result.summary || null;
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
  packageDirectoryRanking = [];
  packageTypeRanking = [];
  packageTopFiles = [];
  packageReferencedTopFiles = [];
  packageSizeSummary = null;
}

function renderPackageSize(panel) {
  renderPackageSizeSummary(panel);
  renderPackageDirectoryRanking(panel);
  renderPackageTypeRanking(panel);
  renderPackageTopFiles(panel);
  renderPackageReferencedTopFiles(panel);
}

function renderPackageSizeSummary(panel) {
  if (!packageSizeSummary) {
    panel.$.packageSizeSummary.textContent = "统计项目源资源磁盘体积，不等同于最终构建包体。";
    return;
  }
  const summary = packageSizeSummary;
  const metaText = summary.includeMeta
    ? "包含 .meta"
    : `排除 .meta ${safeNumber(summary.excludedMetaCount)} 项（${formatSize(summary.excludedMetaSize || 0)}）`;
  panel.$.packageSizeSummary.textContent = `扫描 ${summary.scanDirectory || "assets"}：文件 ${safeNumber(summary.fileCount)} 项，总大小 ${formatSize(summary.totalSize || 0)}，子目录 ${safeNumber(summary.directoryCount)} 个，类型 ${safeNumber(summary.typeCount)} 类，Top ${safeNumber(summary.topN)}；主场景递归可达 ${safeNumber(summary.referencedFileCount)} 项（${formatSize(summary.referencedTotalSize || 0)}），未解析 UUID ${safeNumber(summary.unresolvedReferenceCount)} 个；${metaText}。`;
}

function renderPackageDirectoryRanking(panel) {
  panel.$.packageDirectoryRows.innerHTML = "";
  panel.$.packageDirectoryEmpty.style.display = packageDirectoryRanking.length ? "none" : "block";
  for (const item of packageDirectoryRanking) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</td>
      <td>${safeNumber(item.count)}</td>
      <td>${formatSize(item.totalSize || 0)}</td>
      <td>${formatPercent(item.totalSize, packageSizeSummary?.totalSize)}</td>
      <td><button class="locate">定位</button></td>
    `;
    row.querySelector(".locate").addEventListener("click", () => locate(panel, item.path));
    panel.$.packageDirectoryRows.appendChild(row);
  }
}

function renderPackageTypeRanking(panel) {
  panel.$.packageTypeRows.innerHTML = "";
  panel.$.packageTypeEmpty.style.display = packageTypeRanking.length ? "none" : "block";
  for (const item of packageTypeRanking) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(item.extension || "-")}</td>
      <td>${safeNumber(item.count)}</td>
      <td>${formatSize(item.totalSize || 0)}</td>
      <td>${formatPercent(item.totalSize, packageSizeSummary?.totalSize)}</td>
    `;
    panel.$.packageTypeRows.appendChild(row);
  }
}

function renderPackageTopFiles(panel) {
  panel.$.packageTopFileRows.innerHTML = "";
  panel.$.packageTopFileEmpty.style.display = packageTopFiles.length ? "none" : "block";
  for (const item of packageTopFiles) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</td>
      <td>${escapeHtml(item.extension || "-")}</td>
      <td>${formatSize(item.size || 0)}</td>
      <td>${formatPercent(item.size, packageSizeSummary?.totalSize)}</td>
      <td><button class="locate">定位</button></td>
    `;
    row.querySelector(".locate").addEventListener("click", () => locate(panel, item.path));
    panel.$.packageTopFileRows.appendChild(row);
  }
}

function renderPackageReferencedTopFiles(panel) {
  panel.$.packageReferencedFileRows.innerHTML = "";
  panel.$.packageReferencedFileEmpty.style.display = packageReferencedTopFiles.length ? "none" : "block";
  for (const item of packageReferencedTopFiles) {
    const chain = Array.isArray(item.chain) ? item.chain : [];
    const chainText = chain.join(" -> ");
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</td>
      <td>${escapeHtml(item.extension || "-")}</td>
      <td>${formatSize(item.size || 0)}</td>
      <td class="reference-chain" title="${escapeHtml(chainText)}">${escapeHtml(formatReferenceChain(chain))}</td>
      <td><button class="locate">定位</button></td>
    `;
    row.querySelector(".locate").addEventListener("click", () => locate(panel, item.path));
    panel.$.packageReferencedFileRows.appendChild(row);
  }
}

async function checkDirectoryConvention(panel) {
  setBusy(panel, true);
  setStatus(panel, "正在按当前自动分类规则检查目录规范...");
  try {
    const result = await requestMain("check-directory-convention", {
      directory: panel.$.directoryConventionInput.value,
      rules
    });
    directoryConventionMismatches = result.mismatches || [];
    directoryConventionSummary = result.summary || null;
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
  directoryConventionMismatches = [];
  directoryConventionSummary = null;
}

function renderDirectoryConvention(panel) {
  panel.$.directoryConventionRows.innerHTML = "";
  panel.$.directoryConventionEmpty.style.display = directoryConventionMismatches.length ? "none" : "block";
  panel.$.directoryConventionPreviewButton.disabled = directoryConventionMismatches.length === 0;
  if (!directoryConventionSummary) {
    panel.$.directoryConventionSummary.textContent = "复用当前自动分类规则，只报告首个命中规则下目录不符合的资源。";
  } else {
    const summary = directoryConventionSummary;
    panel.$.directoryConventionSummary.textContent = `扫描 ${summary.scanDirectory || "assets/res"}：文件 ${safeNumber(summary.fileCount)} 项，启用规则 ${safeNumber(summary.ruleCount)} 条；命中 ${safeNumber(summary.matchedCount)} 项，目录正确 ${safeNumber(summary.compliantCount)} 项，不符合 ${safeNumber(summary.mismatchCount)} 项，未命中 ${safeNumber(summary.unmatchedCount)} 项，缺少 meta ${safeNumber(summary.missingMetaCount)} 项。`;
  }
  for (const item of directoryConventionMismatches) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</td>
      <td>${escapeHtml(item.extension || "-")}</td>
      <td class="path" title="${escapeHtml(item.currentDirectory)}">${escapeHtml(item.currentDirectory)}</td>
      <td class="path" title="${escapeHtml(item.suggestedDirectory)}">${escapeHtml(item.suggestedDirectory)}</td>
      <td>${escapeHtml(item.ruleId || "-")}</td>
      <td class="${item.missingMeta ? "blocked" : "warning"}">${item.missingMeta ? "缺少 meta" : "建议移动"}</td>
      <td><button class="locate">定位</button></td>
    `;
    row.querySelector(".locate").addEventListener("click", () => locate(panel, item.path));
    panel.$.directoryConventionRows.appendChild(row);
  }
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
    materialTextureReferences = result.references || [];
    materialTextureSummary = result.summary || null;
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
  materialTextureReferences = [];
  materialTextureSummary = null;
}

function renderMaterialTextures(panel) {
  panel.$.materialTextureRows.innerHTML = "";
  panel.$.materialTextureEmpty.style.display = materialTextureReferences.length ? "none" : "block";
  if (!materialTextureSummary) {
    panel.$.materialTextureSummary.textContent = "扫描 .mtl/.material/.pmtl；无法解析的贴图 UUID 标记为待复核，不自动修复。";
  } else {
    const summary = materialTextureSummary;
    panel.$.materialTextureSummary.textContent = `扫描 ${summary.scanDirectory || "assets/res"}：材质 ${safeNumber(summary.materialCount)} 个，主场景可达 ${safeNumber(summary.reachableMaterialCount)} 个、不可达 ${safeNumber(summary.unreachableMaterialCount)} 个；贴图引用 ${safeNumber(summary.textureReferenceCount)} 条，已解析 ${safeNumber(summary.resolvedReferenceCount)} 条、待复核 ${safeNumber(summary.reviewReferenceCount)} 条；无贴图引用材质 ${safeNumber(summary.noTextureMaterialCount)} 个，无法解析材质文件 ${safeNumber(summary.invalidMaterialCount)} 个。`;
  }
  for (const item of materialTextureReferences) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="${formatMaterialTextureStatusClass(item.status)}">${formatMaterialTextureStatus(item.status)}</td>
      <td class="${item.materialReachable ? "ready" : "warning"}">${item.materialReachable ? "是" : "否"}</td>
      <td class="path" title="${escapeHtml(item.materialPath)}">${escapeHtml(item.materialPath)}</td>
      <td class="path" title="${escapeHtml(item.propertyPath || "-")}">${escapeHtml(item.propertyPath || "-")}</td>
      <td class="path" title="${escapeHtml(item.uuid || "-")}">${escapeHtml(item.uuid || "-")}</td>
      <td class="path" title="${escapeHtml(item.texturePath || "-")}">${escapeHtml(item.texturePath || "-")}</td>
      <td><button class="locate-material">定位材质</button> <button class="locate-texture" ${item.texturePath ? "" : "disabled"}>定位贴图</button></td>
    `;
    row.querySelector(".locate-material").addEventListener("click", () => locate(panel, item.materialPath));
    if (item.texturePath) {
      row.querySelector(".locate-texture").addEventListener("click", () => locate(panel, item.texturePath));
    }
    panel.$.materialTextureRows.appendChild(row);
  }
}

async function checkDuplicateAssets(panel) {
  setBusy(panel, true);
  setStatus(panel, "正在检查同名资源和重复内容...");
  try {
    const result = await requestMain("check-duplicate-assets", {
      directory: panel.$.duplicateAssetDirectoryInput.value
    });
    duplicateSameNameGroups = result.sameNameGroups || [];
    duplicateHashGroups = result.duplicateHashGroups || [];
    duplicateAssetSummary = result.summary || null;
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
  duplicateSameNameGroups = [];
  duplicateHashGroups = [];
  duplicateAssetSummary = null;
}

function renderDuplicateAssets(panel) {
  panel.$.duplicateSameNameRows.innerHTML = "";
  panel.$.duplicateHashRows.innerHTML = "";
  panel.$.duplicateSameNameEmpty.style.display = duplicateSameNameGroups.length ? "none" : "block";
  panel.$.duplicateHashEmpty.style.display = duplicateHashGroups.length ? "none" : "block";
  if (!duplicateAssetSummary) {
    panel.$.duplicateAssetSummary.textContent = "检查不同目录同名资源和 SHA-256 相同内容；只报告和定位，不自动删除。";
  } else {
    const summary = duplicateAssetSummary;
    panel.$.duplicateAssetSummary.textContent = `扫描 ${summary.scanDirectory || "assets/res"}：资源 ${safeNumber(summary.fileCount)} 项，hash 候选 ${safeNumber(summary.hashCandidateCount)} 项；同名 ${safeNumber(summary.sameNameGroupCount)} 组/${safeNumber(summary.sameNameFileCount)} 项，重复内容 ${safeNumber(summary.duplicateHashGroupCount)} 组/${safeNumber(summary.duplicateHashFileCount)} 项，理论可减少重复体积 ${formatSize(summary.duplicateBytes || 0)}。`;
  }
  renderDuplicateGroupRows(panel, panel.$.duplicateSameNameRows, duplicateSameNameGroups, (group) => group.name || group.key);
  renderDuplicateGroupRows(panel, panel.$.duplicateHashRows, duplicateHashGroups, (group) => formatShortHash(group.hash || group.key));
}

function renderDuplicateGroupRows(panel, target, groups, formatGroupKey) {
  for (const group of groups) {
    for (const member of group.members || []) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td class="path" title="${escapeHtml(group.key || "-")}">${escapeHtml(formatGroupKey(group))}</td>
        <td>${safeNumber(group.members?.length)}</td>
        <td class="path" title="${escapeHtml(member.path)}">${escapeHtml(member.path)}</td>
        <td>${escapeHtml(member.extension || "-")}</td>
        <td>${formatSize(member.size || 0)}</td>
        <td><button class="locate">定位</button></td>
      `;
      row.querySelector(".locate").addEventListener("click", () => locate(panel, member.path));
      target.appendChild(row);
    }
  }
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
    scenePrefabReferenceIssues = result.issues || [];
    scenePrefabReferenceSummary = result.summary || null;
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
  scenePrefabReferenceIssues = [];
  scenePrefabReferenceSummary = null;
}

function renderScenePrefabReferenceHealth(panel) {
  panel.$.scenePrefabHealthRows.innerHTML = "";
  panel.$.scenePrefabHealthEmpty.style.display = scenePrefabReferenceIssues.length ? "none" : "block";
  if (!scenePrefabReferenceSummary) {
    panel.$.scenePrefabHealthSummary.textContent = "无法解析 UUID 标记为待复核；白名单精确匹配，只报告和定位，不自动修复。";
  } else {
    const summary = scenePrefabReferenceSummary;
    panel.$.scenePrefabHealthSummary.textContent = `扫描 ${summary.scanDirectory || "assets"}：文件 ${safeNumber(summary.scannedFileCount)} 个，UUID 引用 ${safeNumber(summary.referenceCount)} 次；已解析 ${safeNumber(summary.resolvedReferenceCount)} 次，白名单 ${safeNumber(summary.whitelistReferenceCount)} 次，待复核 ${safeNumber(summary.unresolvedReferenceCount)} 次/${safeNumber(summary.unresolvedUuidCount)} 个 UUID，涉及 ${safeNumber(summary.affectedFileCount)} 个文件。`;
  }
  for (const item of scenePrefabReferenceIssues) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="warning">待复核</td>
      <td class="path" title="${escapeHtml(item.filePath)}">${escapeHtml(item.filePath)}</td>
      <td>${escapeHtml(item.extension || "-")}</td>
      <td class="path" title="${escapeHtml(item.uuid || "-")}">${escapeHtml(item.uuid || "-")}</td>
      <td>${safeNumber(item.matchCount)}</td>
      <td><button class="locate">定位</button></td>
    `;
    row.querySelector(".locate").addEventListener("click", () => locate(panel, item.filePath));
    panel.$.scenePrefabHealthRows.appendChild(row);
  }
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
    entries = result.entries || [];
    directories = result.directories || [];
    selectedPaths = new Set([...selectedPaths].filter((path) => entries.some((entry) => entry.path === path)));
    fillDirectories(panel);
    renderAssets(panel);
    const summary = result.summary;
    if (!summary || !Number.isFinite(Number(summary.visibleCount))) {
      await addLog(panel, "warning", "自动分类扫描接口返回字段不完整，请重载扩展后重试。");
      throw new Error("扫描结果字段不完整，请重载扩展。");
    }
    panel.$.scanSummary.textContent = `当前显示 ${summary.visibleCount} 项；全项目缺少 meta ${summary.missingMetaCount} 项；孤立 meta ${summary.orphanMetaCount} 项；已选择 ${selectedPaths.size} 项。`;
    setStatus(panel, summary.missingMetaCount || summary.orphanMetaCount
      ? "检测到 meta 异常，相关资源会被阻止移动，请先人工处理。"
      : "扫描完成。选择资源后生成移动预览。");
  } catch (error) {
    entries = [];
    directories = [];
    renderAssets(panel);
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
  panel.$.assetRows.innerHTML = "";
  panel.$.assetEmpty.style.display = entries.length ? "none" : "block";
  for (const entry of entries) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="check"><input type="checkbox" ${entry.selectable ? "" : "disabled"}></td>
      <td class="path" title="${escapeHtml(entry.path)}">${escapeHtml(entry.path)}</td>
      <td>${escapeHtml(entry.extension)}</td>
      <td>${entry.kind === "directory" ? "-" : formatSize(entry.size)}</td>
      <td class="${entry.missingMeta ? "warning" : ""}">${entry.missingMeta ? "缺少 meta" : "正常"}</td>
      <td><button class="locate">定位</button></td>
    `;
    const checkbox = row.querySelector("input");
    checkbox.checked = selectedPaths.has(entry.path);
    checkbox.addEventListener("change", () => {
      checkbox.checked ? selectedPaths.add(entry.path) : selectedPaths.delete(entry.path);
      invalidatePlan(panel);
      updateSelectionSummary(panel);
    });
    row.querySelector(".locate").addEventListener("click", () => locate(panel, entry.path));
    panel.$.assetRows.appendChild(row);
  }
}

function selectVisible(panel) {
  for (const entry of entries) {
    if (entry.selectable) {
      selectedPaths.add(entry.path);
    }
  }
  invalidatePlan(panel);
  renderAssets(panel);
  updateSelectionSummary(panel);
}

function clearSelection(panel) {
  selectedPaths.clear();
  invalidatePlan(panel);
  renderAssets(panel);
  updateSelectionSummary(panel);
}

function updateSelectionSummary(panel) {
  const current = panel.$.scanSummary.textContent.replace(/；已选择 \d+ 项。$/, "");
  panel.$.scanSummary.textContent = `${current}；已选择 ${selectedPaths.size} 项。`;
}

function updateMode(panel) {
  const rulesMode = panel.$.modeSelect.value === "rules";
  panel.$.targetDirectoryLabel.classList.toggle("hidden", rulesMode);
  panel.$.ruleScopeLabel.classList.toggle("hidden", !rulesMode);
  invalidatePlan(panel);
}

function renderRules(panel) {
  panel.$.ruleRows.innerHTML = "";
  for (const rule of rules) {
    const row = document.createElement("div");
    row.className = "rule-row";
    row.innerHTML = `
      <input class="enabled" type="checkbox" title="启用规则">
      <input class="extensions" value="${escapeHtml((rule.extensions || []).join(","))}" placeholder=".prefab,.fbx" title="逗号分隔扩展名">
      <input class="keywords" value="${escapeHtml((rule.nameKeywords || []).join(","))}" placeholder="文件名关键词；留空为兜底" title="逗号分隔，忽略大小写，任一关键词命中即匹配">
      <input class="target" value="${escapeHtml(rule.target || "")}" placeholder="assets/res/prefab" title="目标目录；自动分类执行时可自动创建">
      <button class="remove" title="删除规则">×</button>
    `;
    row.querySelector(".enabled").checked = rule.enabled !== false;
    row.querySelector(".enabled").addEventListener("change", (event) => {
      rule.enabled = event.target.checked;
      invalidatePlan(panel);
    });
    row.querySelector(".extensions").addEventListener("change", (event) => {
      rule.extensions = event.target.value.split(",");
      invalidatePlan(panel);
    });
    row.querySelector(".keywords").addEventListener("change", (event) => {
      rule.nameKeywords = event.target.value.split(",");
      invalidatePlan(panel);
    });
    row.querySelector(".target").addEventListener("change", (event) => {
      rule.target = event.target.value;
      invalidatePlan(panel);
    });
    row.querySelector(".remove").addEventListener("click", () => {
      rules = rules.filter((item) => item !== rule);
      renderRules(panel);
      invalidatePlan(panel);
    });
    panel.$.ruleRows.appendChild(row);
  }
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
  panel.$.planRows.innerHTML = "";
  if (!currentPlan) {
    panel.$.planSummary.textContent = "尚未生成计划。";
    panel.$.executeButton.disabled = true;
    return;
  }

  const summary = currentPlan.summary;
  panel.$.planSummary.textContent = `共 ${summary.total} 项；可执行 ${summary.ready} 项；阻止 ${summary.blocked} 项；自动重命名 ${summary.renamed} 项；覆盖 ${summary.overwrite} 项；将创建目录 ${summary.createDirectory} 个。`;
  for (const item of currentPlan.items) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="${item.status === "ready" ? "ready" : "blocked"}">${item.status === "ready" ? "可执行" : "已阻止"}</td>
      <td>${formatAction(item.action)}</td>
      <td class="path" title="${escapeHtml(item.source)}">${escapeHtml(item.source)}</td>
      <td class="path" title="${escapeHtml(item.destination)}">${escapeHtml(item.destination)}</td>
      <td>${escapeHtml(item.reason || item.ruleId || "-")}</td>
    `;
    panel.$.planRows.appendChild(row);
  }
  panel.$.executeButton.disabled = summary.ready <= 0;
}

async function execute(panel) {
  if (!currentPlan?.token) {
    setStatus(panel, "请先生成移动预览。");
    return;
  }
  if (currentPlan.requiresBackupConfirmation && !panel.$.backupConfirmed.checked) {
    setStatus(panel, "当前计划包含覆盖项，必须先备份项目并勾选确认。");
    return;
  }

  const overwriteText = currentPlan.summary.overwrite > 0
    ? `\n\n警告：其中 ${currentPlan.summary.overwrite} 项会永久删除现有目标文件，反向计划无法恢复原目标。`
    : "";
  if (!window.confirm(`即将通过 Creator AssetDB 移动 ${currentPlan.summary.ready} 项资源。${overwriteText}\n\n继续执行？`)) {
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
    const resultMessage = `执行完成：移动成功 ${result.moved.length} 项，失败 ${result.failed.length} 项；创建目录 ${result.createdDirectories.length} 个；删除空源目录 ${result.deletedDirectories.length} 个，清理失败 ${result.failedDirectories.length} 个。建议打开相关场景和 Prefab 回归引用。`;
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
  panel.$.historySelect.innerHTML = "";
  for (const item of history) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${formatDate(item.createdAt)} | ${item.kind === "reverse" ? "反向" : "移动"} ${item.movedCount} 项${item.hasOverwrite ? " | 含覆盖" : ""}`;
    panel.$.historySelect.appendChild(option);
  }
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
  panel.$.referenceCheckButton.disabled = busy;
  panel.$.nodeReferenceCheckButton.disabled = busy;
  panel.$.unusedScanButton.disabled = busy;
  panel.$.unusedSelectVisibleButton.disabled = busy || getVisibleUnusedCandidates(panel).length === 0;
  panel.$.unusedClearSelectionButton.disabled = busy || unusedSelectedPaths.size === 0;
  panel.$.unusedDeletePreviewButton.disabled = busy;
  panel.$.unusedDeleteExecuteButton.disabled = busy || !unusedDeletePlan || !panel.$.unusedDeleteConfirmedInput.checked || safeNumber(unusedDeletePlan.summary?.ready) <= 0;
  panel.$.resourcesRuntimeCheckButton.disabled = busy;
  panel.$.packageSizeReportButton.disabled = busy;
  panel.$.directoryConventionCheckButton.disabled = busy;
  panel.$.directoryConventionPreviewButton.disabled = busy || directoryConventionMismatches.length === 0;
  panel.$.materialTextureCheckButton.disabled = busy;
  panel.$.duplicateAssetCheckButton.disabled = busy;
  panel.$.scenePrefabHealthCheckButton.disabled = busy;
  panel.$.exportSessionReportButton.disabled = busy;
  panel.$.scanButton.disabled = busy;
  panel.$.previewButton.disabled = busy;
  panel.$.reverseButton.disabled = busy;
  panel.$.historyDetailButton.disabled = busy || history.length === 0;
  panel.$.saveRulesButton.disabled = busy;
  panel.$.executeButton.disabled = busy || !currentPlan || currentPlan.summary.ready <= 0;
}

function setStatus(panel, text) {
  panel.$.statusText.textContent = text;
}

function isCompleteAssetScanResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.entries) &&
    Array.isArray(result.issues) &&
    Array.isArray(result.typeStats) &&
    ["fileCount", "directoryCount", "totalSize", "emptyDirectoryCount", "visibleIssueCount", "typeCount"].every((key) => Number.isFinite(Number(summary[key])))
  );
}

function isCompleteReferenceResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.targets) &&
    Array.isArray(result.references) &&
      ["targetCount", "uuidCount", "scannedFileCount", "referenceFileCount", "totalMatchCount"].every((key) => Number.isFinite(Number(summary[key])))
  );
}

function isCompleteNodeReferenceResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.targetNodes) &&
    Array.isArray(result.references) &&
    ["scannedFileCount", "targetFileCount", "targetNodeCount", "referenceFileCount", "referencePositionCount", "selectablePositionCount"]
      .every((key) => Number.isFinite(Number(summary[key])))
  );
}

function isCompleteUnusedResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.candidates) &&
    Array.isArray(result.protectedExtensions) &&
    ["scannedCount", "reachableCount", "candidateCount", "candidateTotalSize", "protectedCount", "ignoredCount", "unresolvedReferenceCount"]
      .every((key) => Number.isFinite(Number(summary[key])))
  );
}

function isCompleteResourcesRuntimeResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.resources) &&
    Array.isArray(result.staticCalls) &&
    Array.isArray(result.unusedResources) &&
    Array.isArray(result.missingCalls) &&
    Array.isArray(result.dynamicCalls) &&
    ["resourceCount", "usedResourceCount", "unusedResourceCount", "scannedCodeFileCount", "staticCallCount", "matchedCallCount", "missingCallCount", "dynamicCallCount"]
      .every((key) => Number.isFinite(Number(summary[key])))
  );
}

function isCompletePackageSizeResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.directoryRanking) &&
    Array.isArray(result.typeRanking) &&
    Array.isArray(result.topFiles) &&
    Array.isArray(result.referencedTopFiles) &&
    ["topN", "fileCount", "totalSize", "directoryCount", "typeCount", "excludedMetaCount", "excludedMetaSize", "referencedFileCount", "referencedTotalSize", "unresolvedReferenceCount"]
      .every((key) => Number.isFinite(Number(summary[key])))
  );
}

function isCompleteDirectoryConventionResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.mismatches) &&
    ["fileCount", "ruleCount", "matchedCount", "compliantCount", "mismatchCount", "unmatchedCount", "missingMetaCount"]
      .every((key) => Number.isFinite(Number(summary[key])))
  );
}

function isCompleteMaterialTextureResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.references) &&
    Array.isArray(result.materialExtensions) &&
    ["materialCount", "reachableMaterialCount", "unreachableMaterialCount", "textureReferenceCount", "resolvedReferenceCount", "reviewReferenceCount", "noTextureMaterialCount", "invalidMaterialCount"]
      .every((key) => Number.isFinite(Number(summary[key])))
  );
}

function isCompleteDuplicateAssetResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.sameNameGroups) &&
    Array.isArray(result.duplicateHashGroups) &&
    ["fileCount", "hashCandidateCount", "sameNameGroupCount", "sameNameFileCount", "duplicateHashGroupCount", "duplicateHashFileCount", "duplicateBytes"]
      .every((key) => Number.isFinite(Number(summary[key])))
  );
}

function isCompleteScenePrefabReferenceHealthResult(result) {
  const summary = result?.summary;
  return (
    !!summary &&
    Array.isArray(result.issues) &&
    Array.isArray(result.whitelist) &&
    Array.isArray(result.extensions) &&
    ["scannedFileCount", "referenceCount", "resolvedReferenceCount", "whitelistReferenceCount", "unresolvedReferenceCount", "unresolvedUuidCount", "affectedFileCount"]
      .every((key) => Number.isFinite(Number(summary[key])))
  );
}

