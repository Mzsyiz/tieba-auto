Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:ProjectRoot = Split-Path -Parent $PSScriptRoot

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Update-ProcessPath {
    $parts = New-Object System.Collections.Generic.List[string]
    foreach ($value in @(
        $env:Path,
        [Environment]::GetEnvironmentVariable("Path", "Machine"),
        [Environment]::GetEnvironmentVariable("Path", "User")
    )) {
        if ([string]::IsNullOrWhiteSpace($value)) { continue }
        foreach ($item in $value.Split(";")) {
            if (-not [string]::IsNullOrWhiteSpace($item) -and -not $parts.Contains($item)) {
                $parts.Add($item)
            }
        }
    }
    $env:Path = ($parts -join ";")
}

function Get-CommandPath {
    param([string]$Name)
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $command) { return $null }
    return $command.Source
}

function Find-PostgresTool {
    param([string]$ToolName)
    $direct = Get-CommandPath $ToolName
    if ($null -ne $direct) { return $direct }

    $roots = New-Object System.Collections.Generic.List[string]
    if (-not [string]::IsNullOrWhiteSpace($env:ProgramFiles)) {
        $roots.Add((Join-Path $env:ProgramFiles "PostgreSQL"))
    }
    $programFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
    if (-not [string]::IsNullOrWhiteSpace($programFilesX86)) {
        $roots.Add((Join-Path $programFilesX86 "PostgreSQL"))
    }
    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        $candidate = Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            ForEach-Object { Join-Path $_.FullName "bin\$ToolName.exe" } |
            Where-Object { Test-Path $_ } |
            Select-Object -First 1
        if ($null -ne $candidate) { return $candidate }
    }
    return $null
}

function Find-Uv {
    $direct = Get-CommandPath "uv.exe"
    if ($null -ne $direct) { return $direct }

    $candidates = @(
        (Join-Path $ProjectRoot ".runtime\tools\uv\uv.exe"),
        (Join-Path $env:USERPROFILE ".local\bin\uv.exe"),
        (Join-Path $env:USERPROFILE ".cargo\bin\uv.exe")
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) { return $candidate }
    }

    $pythonRoot = Join-Path $env:APPDATA "Python"
    if (Test-Path $pythonRoot) {
        $candidate = Get-ChildItem -Path $pythonRoot -Recurse -Filter "uv.exe" -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($null -ne $candidate) { return $candidate.FullName }
    }
    return $null
}

function Find-Node {
    $localNodeRoot = Join-Path $ProjectRoot ".runtime\tools\node"
    if (Test-Path $localNodeRoot) {
        $localNode = Get-ChildItem -Path $localNodeRoot -Recurse -Filter "node.exe" -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($null -ne $localNode) { return $localNode.FullName }
    }
    return Get-CommandPath "node.exe"
}

function Get-PnpmLauncher {
    Update-ProcessPath
    $env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
    $env:COREPACK_NPM_REGISTRY = "https://registry.npmmirror.com"

    $localPnpm = Join-Path $ProjectRoot "windows\installers\pnpm-win-x64.exe"
    if (Test-Path $localPnpm) {
        return @{
            FilePath = $localPnpm
            Arguments = @()
        }
    }

    # Corepack follows package.json's packageManager field and does not require
    # a machine-wide pnpm installation.
    $corepack = Get-CommandPath "corepack.cmd"
    if ($null -ne $corepack) {
        return @{
            FilePath = $corepack
            Arguments = @("pnpm")
        }
    }

    $pnpm = Get-CommandPath "pnpm.cmd"
    if ($null -ne $pnpm) {
        return @{
            FilePath = $pnpm
            Arguments = @()
        }
    }

    $npm = Get-CommandPath "npm.cmd"
    if ($null -ne $npm) {
        return @{
            FilePath = $npm
            Arguments = @("exec", "--yes", "pnpm@10.9.0", "--")
        }
    }
    return $null
}

function Invoke-Pnpm {
    param(
        [hashtable]$Launcher,
        [string[]]$Arguments
    )
    $allArguments = @($Launcher.Arguments) + @($Arguments)
    & $Launcher.FilePath @allArguments
}

function Write-Utf8File {
    param(
        [string]$Path,
        [string]$Content
    )
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Set-EnvValues {
    param(
        [string]$Path,
        [hashtable]$Values,
        [string]$DefaultContent
    )

    if (Test-Path $Path) {
        $sourceLines = [System.IO.File]::ReadAllLines($Path)
    } else {
        $sourceLines = $DefaultContent -split "`r?`n"
    }

    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($line in $sourceLines) {
        $remove = $false
        foreach ($key in $Values.Keys) {
            if ($line -match ("^\s*" + [regex]::Escape($key) + "\s*=")) {
                $remove = $true
                break
            }
        }
        if (-not $remove) { $lines.Add($line) }
    }

    $lines.Add("")
    foreach ($key in $Values.Keys) {
        $lines.Add("$key=$($Values[$key])")
    }
    Write-Utf8File -Path $Path -Content ($lines -join "`r`n")
}
