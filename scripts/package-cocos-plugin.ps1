param(
    [string]$SourceRoot,
    [string]$OutDir,
    [string]$PluginName,
    [switch]$NoZip,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath {
    param([string]$Path)

    $executionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
}

function Assert-InsideDirectory {
    param(
        [string]$Child,
        [string]$Parent
    )

    $childPath = Resolve-FullPath $Child
    $parentPath = Resolve-FullPath $Parent

    if (-not $parentPath.EndsWith([IO.Path]::DirectorySeparatorChar)) {
        $parentPath = $parentPath + [IO.Path]::DirectorySeparatorChar
    }

    if (-not $childPath.StartsWith($parentPath, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove path outside output directory: $childPath"
    }
}

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
    $SourceRoot = Join-Path $PSScriptRoot ".."
}

$SourceRoot = Resolve-FullPath $SourceRoot

if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = Join-Path $SourceRoot "dist"
}

$OutDir = Resolve-FullPath $OutDir
$packagePath = Join-Path $SourceRoot "package.json"

if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) {
    throw "package.json was not found under source root: $SourceRoot"
}

$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json

if ([string]::IsNullOrWhiteSpace($PluginName)) {
    $PluginName = $package.name
}

if ([string]::IsNullOrWhiteSpace($PluginName)) {
    throw "Plugin name is empty. Pass -PluginName or set package.json name."
}

$version = $package.version
if ([string]::IsNullOrWhiteSpace($version)) {
    $version = "0.0.0"
}

$requiredEntries = @(
    "package.json",
    "main.js",
    "main",
    "panel"
)

$optionalEntries = @(
    "README.md",
    "LICENSE",
    "FEATURES.md",
    "docs"
)

foreach ($entry in $requiredEntries) {
    $source = Join-Path $SourceRoot $entry
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Required plugin entry is missing: $entry"
    }
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$stageRoot = Join-Path $OutDir $PluginName
$zipPath = Join-Path $OutDir ("{0}-{1}.zip" -f $PluginName, $version)

if (Test-Path -LiteralPath $stageRoot) {
    if (-not $Clean) {
        throw "Output folder already exists: $stageRoot. Re-run with -Clean to replace it."
    }

    Assert-InsideDirectory -Child $stageRoot -Parent $OutDir
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null

foreach ($entry in ($requiredEntries + $optionalEntries)) {
    $source = Join-Path $SourceRoot $entry
    if (-not (Test-Path -LiteralPath $source)) {
        continue
    }

    $destination = Join-Path $stageRoot $entry
    $destinationParent = Split-Path -Parent $destination
    New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
}

if (-not $NoZip) {
    if (Test-Path -LiteralPath $zipPath) {
        if (-not $Clean) {
            throw "Zip file already exists: $zipPath. Re-run with -Clean to replace it."
        }

        Assert-InsideDirectory -Child $zipPath -Parent $OutDir
        Remove-Item -LiteralPath $zipPath -Force
    }

    Compress-Archive -LiteralPath $stageRoot -DestinationPath $zipPath -Force
}

Write-Host "Cocos plugin folder: $stageRoot"
if (-not $NoZip) {
    Write-Host "Zip package: $zipPath"
}
Write-Host "Copy the folder to a Cocos project Extensions directory, or unzip the package there."
