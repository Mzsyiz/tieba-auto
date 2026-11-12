[CmdletBinding()]
param(
    [int]$FrontendPort = 3001,
    [string]$FrontendBindHost = "0.0.0.0"
)

. (Join-Path $PSScriptRoot "Common.ps1")

$backendDir = Join-Path $ProjectRoot "backend"
$frontendDir = Join-Path $ProjectRoot "frontend"
$runtimeDir = Join-Path $ProjectRoot ".runtime"
$logDir = Join-Path $runtimeDir "logs"
$pidFile = Join-Path $runtimeDir "windows-pids.json"
$accessFile = Join-Path $runtimeDir "access-urls.txt"
$BackendPort = 8000

function Test-HttpOk {
    param([string]$Url)
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
    } catch {
        return $false
    }
}

function Get-LanIPv4Addresses {
    param([int]$Port)

    $defaultIndices = @()
    try {
        $defaultIndices = @(
            Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction Stop |
                Select-Object -ExpandProperty InterfaceIndex -Unique
        )
    } catch {
        $defaultIndices = @()
    }

    $candidates = New-Object System.Collections.Generic.List[object]
    try {
        $addresses = @(
            Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred -ErrorAction Stop |
                Where-Object {
                    $_.IPAddress -ne "127.0.0.1" -and
                    -not $_.IPAddress.StartsWith("169.254.")
                } |
                Sort-Object @{
                    Expression = {
                        if ($defaultIndices -contains $_.InterfaceIndex) { 0 } else { 1 }
                    }
                }, InterfaceAlias, IPAddress
        )
        foreach ($address in $addresses) {
            $candidates.Add([pscustomobject]@{
                Url = "http://$($address.IPAddress):$Port"
                InterfaceAlias = $address.InterfaceAlias
            })
        }
    } catch {
        $candidates.Clear()
    }

    if ($candidates.Count -eq 0) {
        try {
            $hostAddresses = [Net.Dns]::GetHostAddresses([Net.Dns]::GetHostName()) |
                Where-Object {
                    $_.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork -and
                    $_.IPAddressToString -ne "127.0.0.1" -and
                    -not $_.IPAddressToString.StartsWith("169.254.")
                }
            foreach ($address in $hostAddresses) {
                $candidates.Add([pscustomobject]@{
                    Url = "http://$($address.IPAddressToString):$Port"
                    InterfaceAlias = "Host"
                })
            }
        } catch {
            $candidates.Clear()
        }
    }

    $result = New-Object System.Collections.Generic.List[object]
    $seen = @{}
    foreach ($candidate in $candidates) {
        if (-not $seen.ContainsKey($candidate.Url)) {
            $seen[$candidate.Url] = $true
            $result.Add($candidate)
        }
    }
    return $result.ToArray()
}

function Show-AccessInfo {
    param(
        [string]$LocalUrl,
        [int]$Port,
        [string]$BindHost
    )

    $localOnly = $BindHost -eq "127.0.0.1" -or $BindHost -eq "localhost"
    if ($localOnly) {
        $lanAddresses = @()
    } else {
        $lanAddresses = @(Get-LanIPv4Addresses -Port $Port)
    }

    $lines = New-Object System.Collections.Generic.List[string]
    Write-Host ""
    Write-Host "Access addresses" -ForegroundColor Cyan
    Write-Host "  Local: $LocalUrl"
    $lines.Add("Local: $LocalUrl")

    if ($localOnly) {
        Write-Host "  LAN: disabled (frontend is bound to loopback only)"
        $lines.Add("LAN: disabled")
    } elseif ($lanAddresses.Count -eq 0) {
        Write-Host "  LAN: no active IPv4 LAN address was detected" -ForegroundColor Yellow
        Write-Host "  Run ipconfig to check the network adapter." -ForegroundColor Yellow
        $lines.Add("LAN: no active IPv4 LAN address detected")
    } else {
        Write-Host "  LAN access:" -ForegroundColor Green
        $lines.Add("LAN:")
        foreach ($address in $lanAddresses) {
            Write-Host "    $($address.Url)  [$($address.InterfaceAlias)]" -ForegroundColor Green
            $lines.Add("$($address.Url)  [$($address.InterfaceAlias)]")
        }
        Write-Host "  If another device cannot connect, allow TCP $Port for Private networks in Windows Firewall."
        $lines.Add("Firewall: allow TCP $Port for Private networks.")
    }

    Write-Host "  API docs: http://127.0.0.1:$BackendPort/docs"
    Write-Host "  Saved to: $accessFile"
    $lines.Add("API docs: http://127.0.0.1:$BackendPort/docs")
    $lines.Add("Generated: $((Get-Date).ToString("o"))")
    Write-Utf8File -Path $accessFile -Content (($lines -join "`r`n") + "`r`n")
}

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw "This launcher only supports Windows."
}

Update-ProcessPath
$uv = Find-Uv
$node = Find-Node
$pnpm = Get-PnpmLauncher
if ($null -eq $uv -or $null -eq $node) {
    throw "Dependencies are incomplete. Run the one-click dependency installer BAT first."
}
if (-not (Test-Path (Join-Path $backendDir ".env"))) {
    throw "backend\.env is missing. Run the one-click dependency installer BAT first."
}
if (-not (Test-Path (Join-Path $frontendDir ".env.local"))) {
    throw "frontend\.env.local is missing. Run the one-click dependency installer BAT first."
}
if (-not (Test-Path (Join-Path $backendDir ".venv\Scripts\python.exe"))) {
    throw "The backend virtual environment is missing. Run the one-click dependency installer BAT first."
}
$nextEntry = Join-Path $frontendDir "node_modules\next\dist\bin\next"
if (-not (Test-Path $nextEntry)) {
    throw "Frontend dependencies are missing. Run the one-click dependency installer BAT first."
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$backendHealth = "http://127.0.0.1:${BackendPort}/health"
$frontendUrl = "http://127.0.0.1:${FrontendPort}"
if ((Test-HttpOk $backendHealth) -and (Test-HttpOk $frontendUrl)) {
    Write-Host "Application is already running. Opening browser..." -ForegroundColor Green
    Show-AccessInfo -LocalUrl $frontendUrl -Port $FrontendPort -BindHost $FrontendBindHost
    Start-Process $frontendUrl
    return
}
if ((Test-HttpOk $backendHealth) -or (Test-HttpOk $frontendUrl)) {
    throw "One service is already running on the selected ports. Stop it first or run windows\stop.ps1."
}

Write-Step "Applying database migrations"
Push-Location $backendDir
try {
    & $uv run alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw "Alembic migration failed." }
} finally {
    Pop-Location
}

$buildId = Join-Path $frontendDir ".next\BUILD_ID"
if (-not (Test-Path $buildId)) {
    if ($null -eq $pnpm) {
        throw "The frontend build is missing and pnpm is unavailable. Run the one-click dependency installer BAT first."
    }
    Write-Step "Frontend build is missing; building now"
    Push-Location $frontendDir
    try {
        $buildArguments = @("build")
        Invoke-Pnpm -Launcher $pnpm -Arguments $buildArguments
        if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }
    } finally {
        Pop-Location
    }
}

$backendOut = Join-Path $logDir "backend.out.log"
$backendErr = Join-Path $logDir "backend.err.log"
$frontendOut = Join-Path $logDir "frontend.out.log"
$frontendErr = Join-Path $logDir "frontend.err.log"

foreach ($path in @($backendOut, $backendErr, $frontendOut, $frontendErr)) {
    if (Test-Path $path) { Remove-Item $path -Force }
}

Write-Step "Starting backend on port $BackendPort"
$backend = Start-Process -FilePath $uv -ArgumentList @(
    "run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$BackendPort"
) -WorkingDirectory $backendDir -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr -WindowStyle Hidden -PassThru

Write-Step "Starting frontend on port $FrontendPort"
$quotedNextEntry = '"{0}"' -f $nextEntry
$frontend = Start-Process -FilePath $node -ArgumentList @(
    $quotedNextEntry, "start", "-H", $FrontendBindHost, "-p", "$FrontendPort"
) -WorkingDirectory $frontendDir -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr -WindowStyle Hidden -PassThru

Write-Utf8File -Path $pidFile -Content (@{
    backend = $backend.Id
    frontend = $frontend.Id
    started_at = (Get-Date).ToString("o")
    backend_port = $BackendPort
    frontend_port = $FrontendPort
} | ConvertTo-Json)

$ready = $false
for ($index = 0; $index -lt 60; $index++) {
    if ($backend.HasExited -or $frontend.HasExited) {
        break
    }
    if ((Test-HttpOk $backendHealth) -and (Test-HttpOk $frontendUrl)) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 1
}

if (-not $ready) {
    & (Join-Path $PSScriptRoot "stop.ps1") | Out-Null
    throw "Services did not become ready within 60 seconds. Check .runtime\logs."
}

Write-Host ""
Write-Host "Application started successfully." -ForegroundColor Green
Write-Host "Logs: $logDir"
Show-AccessInfo -LocalUrl $frontendUrl -Port $FrontendPort -BindHost $FrontendBindHost
Start-Process $frontendUrl
