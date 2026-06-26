param(
    [string]$SourceRoot,
    [string]$OutDir,
    [string]$PluginName,
    [string]$ConfigPath,
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

function Convert-ConfigBool {
    param(
        [object]$Value,
        [bool]$DefaultValue = $false
    )

    if ($null -eq $Value) {
        return $DefaultValue
    }

    if ($Value -is [bool]) {
        return $Value
    }

    $text = [string]$Value
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $DefaultValue
    }

    if ($text -match '^(?i:true|1|yes|y)$') {
        return $true
    }

    if ($text -match '^(?i:false|0|no|n)$') {
        return $false
    }

    throw "Invalid boolean value in package config: $text"
}

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
    $SourceRoot = Join-Path $PSScriptRoot ".."
}

$SourceRoot = Resolve-FullPath $SourceRoot

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $PSScriptRoot "package-cocos-plugin.config.json"
}

$ConfigPath = Resolve-FullPath $ConfigPath
$packageConfig = $null
if (Test-Path -LiteralPath $ConfigPath -PathType Leaf) {
    $packageConfig = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
}

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

$targetExtensionsDirectory = [string]$packageConfig.targetExtensionsDirectory
$overwriteTarget = Convert-ConfigBool -Value $packageConfig.overwriteTarget -DefaultValue $false
$targetPluginPath = $null

if (-not [string]::IsNullOrWhiteSpace($targetExtensionsDirectory)) {
    $targetExtensionsDirectory = Resolve-FullPath $targetExtensionsDirectory
    New-Item -ItemType Directory -Force -Path $targetExtensionsDirectory | Out-Null

    $targetPluginPath = Join-Path $targetExtensionsDirectory $PluginName
    if (Test-Path -LiteralPath $targetPluginPath) {
        if (-not $overwriteTarget) {
            throw "Target plugin folder already exists: $targetPluginPath. Set overwriteTarget to true in $ConfigPath to replace it."
        }

        Assert-InsideDirectory -Child $targetPluginPath -Parent $targetExtensionsDirectory
        Remove-Item -LiteralPath $targetPluginPath -Recurse -Force
    }

    New-Item -ItemType Directory -Force -Path $targetPluginPath | Out-Null
    foreach ($entry in Get-ChildItem -LiteralPath $stageRoot -Force) {
        Copy-Item -LiteralPath $entry.FullName -Destination (Join-Path $targetPluginPath $entry.Name) -Recurse -Force
    }
}

Write-Host "Cocos plugin folder: $stageRoot"
if (-not $NoZip) {
    Write-Host "Zip package: $zipPath"
}
if ($targetPluginPath) {
    Write-Host "Installed plugin folder: $targetPluginPath"
} else {
    Write-Host "Set targetExtensionsDirectory in $ConfigPath to copy the plugin directly into a Cocos project Extensions directory."
}
