[CmdletBinding()]
param(
    [string]$DbHost = "127.0.0.1",
    [int]$DbPort = 5432,
    [string]$DbName = "tieba_auto",
    [string]$DbUser = "postgres",
    [string]$DbPassword = $null,
    [switch]$SkipSystemInstall,
    [switch]$SkipBuild
)

. (Join-Path $PSScriptRoot "Common.ps1")

$backendDir = Join-Path $ProjectRoot "backend"
$frontendDir = Join-Path $ProjectRoot "frontend"
$installerDir = Join-Path $PSScriptRoot "installers"

function Get-LocalInstaller {
    param(
        [string]$FileName,
        [string]$ExpectedHash
    )
    $path = Join-Path $installerDir $FileName
    if (-not (Test-Path $path)) { return $null }

    Write-Step "Verifying local installer $FileName"
    $actualHash = (Get-FileHash -Path $path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $ExpectedHash.ToLowerInvariant()) {
        throw "Local installer $FileName failed SHA-256 verification. Download the project package again."
    }
    return $path
}

function Install-ElevatedPackage {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$DisplayName,
        [switch]$AsCurrentUser
    )
    Write-Step "Installing $DisplayName from the bundled package"
    try {
        if ($AsCurrentUser) {
            $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -Wait -PassThru
        } else {
            $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -Verb RunAs -Wait -PassThru
        }
    } catch {
        throw "Installing $DisplayName was cancelled or could not start: $($_.Exception.Message)"
    }
    if (@(0, 1641, 1638, 3010) -notcontains $process.ExitCode) {
        throw "$DisplayName installation failed with exit code $($process.ExitCode)."
    }
    Update-ProcessPath
}

function Install-PythonFromLocal {
    $installer = Get-LocalInstaller `
        -FileName "python-3.12.10-amd64.exe" `
        -ExpectedHash "67B5635E80EA51072B87941312D00EC8927C4DB9BA18938F7AD2D27B328B95FB"
    if ($null -eq $installer) { return $false }

    Install-ElevatedPackage -FilePath $installer -DisplayName "Python 3.12.10" -AsCurrentUser -Arguments @(
        "/quiet", "InstallAllUsers=0", "PrependPath=1", "Include_pip=1",
        "Include_launcher=1", "Include_test=0", "AssociateFiles=0", "Shortcuts=0"
    )
    return $true
}

function Install-PortableNodeFromLocal {
    $archive = Get-LocalInstaller `
        -FileName "node-v24.22.1-win-x64.zip" `
        -ExpectedHash "D2046D28C2C3DCD211AC5145C0BF30E2047EF9DFB306693C8C6E2ECCD8B95FA5"
    if ($null -eq $archive) { return $false }

    $nodeDirectory = Join-Path $ProjectRoot ".runtime\tools\node"
    New-Item -ItemType Directory -Path $nodeDirectory -Force | Out-Null
    Write-Step "Extracting portable Node.js"
    Expand-Archive -Path $archive -DestinationPath $nodeDirectory -Force
    return $true
}

function Install-NodeFromLocal {
    $installer = Get-LocalInstaller `
        -FileName "node-v24.22.1-x64.msi" `
        -ExpectedHash "3BDA4BAF1EE709B33CF920DD633106DDB23951E322BFF9C03EC9F64AB8981B01"
    if ($null -eq $installer) { return $false }

    $msiexec = Join-Path $env:SystemRoot "System32\msiexec.exe"
    Install-ElevatedPackage -FilePath $msiexec -DisplayName "Node.js 24.22.1 LTS" -Arguments @(
        "/i", "`"$installer`"", "/qn", "/norestart"
    )
    return $true
}

function Assert-Windows {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
        throw "This installer only supports Windows."
    }
}

function Install-WingetPackage {
    param(
        [string[]]$Ids,
        [string]$Override
    )
    $winget = Get-CommandPath "winget.exe"
    if ($null -eq $winget) {
        throw "winget was not found. Install 'App Installer' from Microsoft Store, then run this installer again."
    }
    foreach ($id in $Ids) {
        Write-Step "Installing $id with winget"
        $arguments = @(
            "install", "--id", $id, "--exact", "--source", "winget",
            "--silent", "--accept-source-agreements", "--accept-package-agreements"
        )
        if (-not [string]::IsNullOrWhiteSpace($Override)) {
            $arguments += @("--override", $Override)
        }
        & $winget @arguments | Out-Host
        Update-ProcessPath
        if ($LASTEXITCODE -eq 0) { return }
        Write-Warning "winget package $id returned exit code $LASTEXITCODE."
    }
}

function Ensure-Python {
    Update-ProcessPath
    $py = Get-CommandPath "py.exe"
    if ($null -eq $py) {
        if (-not $SkipSystemInstall) {
            $installedLocally = Install-PythonFromLocal
            if (-not $installedLocally) {
                Install-WingetPackage @("Python.Python.3.12")
            }
            Update-ProcessPath
            $py = Get-CommandPath "py.exe"
        }
    }
    if ($null -eq $py) {
        $python = Get-CommandPath "python.exe"
        if ($null -eq $python) {
            throw "Python 3.12 was not found. Install Python 3.12 and run this script again."
        }
        & $python -c "import sys; raise SystemExit(0 if (3,11) <= sys.version_info[:2] < (3,13) else 1)"
        if ($LASTEXITCODE -ne 0) {
            throw "Python 3.11 or 3.12 is required."
        }
        return $python
    }
    & $py -3.12 -c "import sys" 2>$null
    if ($LASTEXITCODE -ne 0) {
        if (-not $SkipSystemInstall) {
            $installedLocally = Install-PythonFromLocal
            if (-not $installedLocally) {
                Install-WingetPackage @("Python.Python.3.12")
            }
            Update-ProcessPath
            $py = Get-CommandPath "py.exe"
        }
        & $py -3.12 -c "import sys"
        if ($LASTEXITCODE -ne 0) {
            throw "Python 3.12 is required."
        }
    }
    return $py
}

function Ensure-Node {
    Update-ProcessPath
    $node = Find-Node
    $needsInstall = $null -eq $node
    if ($null -ne $node) {
        $versionText = (& $node -p "process.versions.node").Trim()
        $versionParts = $versionText.Split(".")
        $major = [int]$versionParts[0]
        $minor = [int]$versionParts[1]
        if ($major -lt 20 -or ($major -eq 20 -and $minor -lt 9)) {
            $needsInstall = $true
        }
    }
    if ($needsInstall -and -not $SkipSystemInstall) {
        $installedPortable = Install-PortableNodeFromLocal
        if (-not $installedPortable) {
            $installedLocally = Install-NodeFromLocal
            if (-not $installedLocally) {
                Install-WingetPackage @("OpenJS.NodeJS.LTS")
            }
        }
        Update-ProcessPath
        $node = Find-Node
    }
    if ($null -eq $node) {
        throw "Node.js 20 or newer was not found."
    }
    $nodeDirectory = Split-Path -Parent $node
    if (($env:Path -split ";") -notcontains $nodeDirectory) {
        $env:Path = "$nodeDirectory;$env:Path"
    }
    return $node
}

function Ensure-Pnpm {
    $localPnpm = Get-LocalInstaller `
        -FileName "pnpm-win-x64.exe" `
        -ExpectedHash "D7DCDC1E67084A4AC2BBE396CA3AF370ABAA6BC4EB653C4B2D6C7AD83B719A74"
    $launcher = Get-PnpmLauncher
    if ($null -eq $launcher) {
        throw "Corepack, pnpm, and npm were not found after installing Node.js."
    }
    Write-Step "Preparing pnpm"
    Push-Location $frontendDir
    try {
        $pnpmVersion = Invoke-Pnpm -Launcher $launcher -Arguments @("--version")
        if ($LASTEXITCODE -ne 0) {
            throw "pnpm could not be prepared. Check the network connection to the npm registry."
        }
        Write-Host "pnpm version: $((@($pnpmVersion) -join " ").Trim())"
    } finally {
        Pop-Location
    }
    return $launcher
}

function Ensure-Uv {
    Update-ProcessPath
    $uv = Find-Uv
    if ($null -ne $uv) { return $uv }

    if (-not $SkipSystemInstall) {
        $uvArchive = Get-LocalInstaller `
            -FileName "uv-x86_64-pc-windows-msvc.zip" `
            -ExpectedHash "875981BE7908295937DEE09532BB66D576986D4F223259E171B0C767C885897A"
        if ($null -ne $uvArchive) {
            $uvDirectory = Join-Path $ProjectRoot ".runtime\tools\uv"
            New-Item -ItemType Directory -Path $uvDirectory -Force | Out-Null
            Expand-Archive -Path $uvArchive -DestinationPath $uvDirectory -Force
            $uv = Find-Uv
            $uvWorks = $false
            if ($null -ne $uv) {
                try {
                    & $uv --version 2>$null | Out-Null
                    $uvWorks = $LASTEXITCODE -eq 0
                } catch {
                    $uvWorks = $false
                }
            }
            if (-not $uvWorks) {
                $vcRedist = Get-LocalInstaller `
                    -FileName "VC_redist.x64.exe" `
                    -ExpectedHash "9C02C9ED120F671B900E6B9471D890E3B2414117A7E53F4AE2E855466FA2B7C9"
                if ($null -ne $vcRedist) {
                    Install-ElevatedPackage -FilePath $vcRedist -DisplayName "Microsoft Visual C++ Runtime" -Arguments @(
                        "/install", "/quiet", "/norestart"
                    )
                }
            }
        }
        if ($null -eq $uv) {
            Install-WingetPackage @("astral-sh.uv")
            Update-ProcessPath
            $uv = Find-Uv
        }
    }
    if ($null -eq $uv) {
        Write-Step "Installing uv with pip"
        $python = Get-CommandPath "py.exe"
        if ($null -ne $python) {
            & $python -3.12 -m pip install --user --upgrade uv | Out-Host
        } else {
            & (Get-CommandPath "python.exe") -m pip install --user --upgrade uv | Out-Host
        }
    }
    Update-ProcessPath
    $uv = Find-Uv
    if ($null -eq $uv) {
        throw "uv was installed but uv.exe could not be located."
    }
    return $uv
}

function Ensure-Postgres {
    param([string]$InstallerPassword)
    Update-ProcessPath
    $psql = Find-PostgresTool "psql"
    if ($null -ne $psql) { return $psql }
    if (-not $SkipSystemInstall) {
        if ([string]::IsNullOrEmpty($InstallerPassword)) {
            throw "A non-empty PostgreSQL password is required when PostgreSQL has not been installed yet."
        }
        if ($InstallerPassword -match '[\s"]') {
            throw 'The PostgreSQL installation password cannot contain spaces or double quote characters.'
        }
        $localPostgres = Get-LocalInstaller `
            -FileName "postgresql-16.9-3-windows-x64.exe" `
            -ExpectedHash "7CAB56C3B95C2E1546EEFB5A8C127C6CC1BE57156131CB8E1835A7829DAC015D"
        if ($null -ne $localPostgres) {
            Install-ElevatedPackage -FilePath $localPostgres -DisplayName "PostgreSQL 16.9" -Arguments @(
                "--mode", "unattended",
                "--unattendedmodeui", "none",
                "--serverport", "$DbPort",
                "--superpassword", $InstallerPassword
            )
        } else {
            $postgresOverride = (
                "--mode unattended --unattendedmodeui none " +
                "--serverport $DbPort --superpassword $InstallerPassword"
            )
            Install-WingetPackage @(
                "PostgreSQL.PostgreSQL.16",
                "PostgreSQL.PostgreSQL.15",
                "PostgreSQL.PostgreSQL.17"
            ) -Override $postgresOverride
        }
        Update-ProcessPath
        $psql = Find-PostgresTool "psql"
    }
    if ($null -eq $psql) {
        throw "PostgreSQL was not found. Install PostgreSQL 16, ensure psql.exe is available, then run this installer again."
    }
    return $psql
}

function Read-DatabasePassword {
    param([switch]$ForNewInstall)
    if ($ForNewInstall) {
        $prompt = "Create a password for PostgreSQL user '$DbUser'"
    } else {
        $prompt = "Enter the PostgreSQL password for user '$DbUser' (press Enter only for trust authentication)"
    }
    $secure = Read-Host $prompt -AsSecureString
    if ($null -eq $secure -or $secure.Length -eq 0) { return "" }
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

function Start-LocalPostgresService {
    param([string]$HostName)
    if ($HostName -ne "127.0.0.1" -and $HostName -ne "localhost") { return }

    $services = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue |
        Where-Object { $_.Status -eq "Stopped" }
    foreach ($service in $services) {
        Write-Step "Starting PostgreSQL service $($service.Name)"
        try {
            Start-Service -Name $service.Name
        } catch {
            Write-Warning "Could not start PostgreSQL service $($service.Name): $($_.Exception.Message)"
        }
    }
}

Assert-Windows

if ($DbName -notmatch "^[A-Za-z0-9_]+$") {
    throw "DbName may contain only letters, digits, and underscores."
}

Write-Step "Preparing Windows dependencies"
$null = Ensure-Python
$env:UV_PYTHON_DOWNLOADS = "never"
$env:UV_PYTHON_PREFERENCE = "system"
$null = Ensure-Node
$pnpm = Ensure-Pnpm
$uv = Ensure-Uv

$passwordWasSupplied = $PSBoundParameters.ContainsKey("DbPassword")
$postgresAlreadyInstalled = $null -ne (Find-PostgresTool "psql")
if (-not $passwordWasSupplied) {
    $DbPassword = Read-DatabasePassword -ForNewInstall:(-not $postgresAlreadyInstalled)
}
if (-not $postgresAlreadyInstalled -and [string]::IsNullOrEmpty($DbPassword)) {
    throw "A new PostgreSQL installation requires a non-empty database password. Run this installer again and enter one."
}
$psql = Ensure-Postgres -InstallerPassword $DbPassword
$pgRestore = Find-PostgresTool "pg_restore"
Start-LocalPostgresService -HostName $DbHost

Write-Step "Checking PostgreSQL connection"
$env:PGCONNECT_TIMEOUT = "5"
$env:PGPASSWORD = $DbPassword
$postgresReady = $false
for ($attempt = 1; $attempt -le 30; $attempt++) {
    & $psql -w -h $DbHost -p $DbPort -U $DbUser -d postgres -tAc "SELECT 1" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $postgresReady = $true
        break
    }
    Start-Sleep -Seconds 1
}
if (-not $postgresReady) {
    throw "Cannot connect to PostgreSQL at ${DbHost}:${DbPort}. Check the service, username, and password."
}

$escapedDbName = $DbName.Replace("'", "''")
$exists = & $psql -w -h $DbHost -p $DbPort -U $DbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$escapedDbName'"
if (($exists -join "").Trim() -ne "1") {
    Write-Step "Creating database $DbName"
    & $psql -w -h $DbHost -p $DbPort -U $DbUser -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE `"$DbName`""
    if ($LASTEXITCODE -ne 0) { throw "Database creation failed." }
}

$defaultDump = Join-Path $ProjectRoot "tieba_auto.dump"
if ((Test-Path $defaultDump) -and $null -ne $pgRestore) {
    $tableCount = & $psql -w -h $DbHost -p $DbPort -U $DbUser -d $DbName -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
    if (($tableCount -join "").Trim() -eq "0") {
        Write-Step "Restoring database from tieba_auto.dump"
        & $pgRestore -w -h $DbHost -p $DbPort -U $DbUser -d $DbName --no-owner --no-acl --exit-on-error $defaultDump
        if ($LASTEXITCODE -ne 0) {
            throw "Database restore failed. Check tieba_auto.dump and PostgreSQL logs."
        }
    } else {
        Write-Warning "tieba_auto.dump exists, but the database already contains tables. Automatic restore was skipped."
    }
}

$encodedUser = [Uri]::EscapeDataString($DbUser)
$encodedPassword = [Uri]::EscapeDataString($DbPassword)
$auth = $encodedUser
if (-not [string]::IsNullOrEmpty($encodedPassword)) {
    $auth = "${encodedUser}:${encodedPassword}"
}
$databaseUrl = "postgresql+psycopg://${auth}@${DbHost}:${DbPort}/${DbName}"

Write-Step "Writing backend configuration"
$backendEnv = Join-Path $backendDir ".env"
$backendDefault = @"
# FastAPI service
APP_NAME=Tieba Auto API
ENVIRONMENT=development
DATABASE_URL=$databaseUrl
CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000","http://localhost:3001","http://127.0.0.1:3001"]
TIEBA_FOLLOW_MIN_INTERVAL=2
TIEBA_FOLLOW_MAX_INTERVAL=5
"@
Set-EnvValues -Path $backendEnv -Values @{
    "APP_NAME" = "Tieba Auto API"
    "ENVIRONMENT" = "development"
    "DATABASE_URL" = $databaseUrl
    "CORS_ORIGINS" = '["http://localhost:3000","http://127.0.0.1:3000","http://localhost:3001","http://127.0.0.1:3001"]'
} -DefaultContent $backendDefault

$frontendEnv = Join-Path $frontendDir ".env.local"
Set-EnvValues -Path $frontendEnv -Values @{
    "API_INTERNAL_URL" = "http://127.0.0.1:8000"
} -DefaultContent "API_INTERNAL_URL=http://127.0.0.1:8000"

Write-Step "Installing backend dependencies"
Push-Location $backendDir
try {
    & $uv sync --frozen
    if ($LASTEXITCODE -ne 0) { throw "uv sync failed." }
    Write-Step "Applying database migrations"
    & $uv run alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw "Alembic migration failed." }
} finally {
    Pop-Location
}

Write-Step "Installing frontend dependencies"
Push-Location $frontendDir
try {
    Invoke-Pnpm -Launcher $pnpm -Arguments @(
        "install", "--frozen-lockfile", "--registry=https://registry.npmmirror.com"
    )
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed." }
    if (-not $SkipBuild) {
        Write-Step "Building frontend"
        Invoke-Pnpm -Launcher $pnpm -Arguments @("build")
        if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }
    }
} finally {
    Pop-Location
}

$materialsDir = Join-Path $backendDir "uploads\materials"
New-Item -ItemType Directory -Path $materialsDir -Force | Out-Null
$runtimeDir = Join-Path $ProjectRoot ".runtime"
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

Write-Host ""
Write-Host "Installation completed." -ForegroundColor Green
Write-Host "Start the application by double-clicking the one-click start BAT file."
Write-Host "Open: http://127.0.0.1:3001"
