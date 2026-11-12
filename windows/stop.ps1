. (Join-Path $PSScriptRoot "Common.ps1")

$pidFile = Join-Path $ProjectRoot ".runtime\windows-pids.json"
if (-not (Test-Path $pidFile)) {
    Write-Host "No running-process record was found." -ForegroundColor Yellow
    return
}

$state = Get-Content $pidFile -Raw | ConvertFrom-Json
$recordedAt = [datetime]$state.started_at

function Stop-TrackedProcess {
    param(
        [object]$ProcessId,
        [string]$ExpectedCommand
    )
    if ($null -eq $ProcessId) { return }

    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if ($null -eq $process) { return }

    if ($process.CreationDate -is [datetime]) {
        $processStarted = $process.CreationDate
    } else {
        $processStarted = [Management.ManagementDateTimeConverter]::ToDateTime($process.CreationDate)
    }
    $difference = [math]::Abs(($processStarted.ToUniversalTime() - $recordedAt.ToUniversalTime()).TotalSeconds)
    if ($difference -gt 120 -or $process.CommandLine -notmatch $ExpectedCommand) {
        Write-Warning "Skipped process $ProcessId because it no longer matches this project."
        return
    }

    & taskkill.exe /PID ([string]$ProcessId) /T /F 2>$null | Out-Null
}

Stop-TrackedProcess -ProcessId $state.backend -ExpectedCommand "app\.main:app"
Stop-TrackedProcess -ProcessId $state.frontend -ExpectedCommand "next"
Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
Write-Host "Application processes stopped." -ForegroundColor Green
