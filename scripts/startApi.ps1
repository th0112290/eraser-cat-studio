param(
  [switch]$Stop
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$stdoutPath = Join-Path $repoRoot "out\dev_logs\api-main.stdout.log"
$stderrPath = Join-Path $repoRoot "out\dev_logs\api-main.stderr.log"
$pidPath = Join-Path $repoRoot "out\dev_logs\api-main.pid"
$repoRootPattern = [regex]::Escape($repoRoot)
$apiTargetPattern = "apps\\api|src\\index\.ts"
$apiUrl = "http://127.0.0.1:3000/health"

function Get-TrackedApiProcess {
  if (!(Test-Path $pidPath)) {
    return $null
  }

  try {
    $pid = [int](Get-Content $pidPath -Raw).Trim()
  } catch {
    Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
    return $null
  }

  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $pid" -ErrorAction SilentlyContinue
  if ($null -eq $proc) {
    Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
    return $null
  }

  if ($proc.CommandLine -notmatch $repoRootPattern) {
    Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
    return $null
  }

  return $proc
}

function Get-ApiProcesses {
  return Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match $repoRootPattern -and
      $_.CommandLine -match $apiTargetPattern
    }
}

function Test-ApiReady {
  try {
    $response = Invoke-WebRequest -Uri $apiUrl -UseBasicParsing -TimeoutSec 5
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

New-Item -ItemType Directory -Force -Path (Split-Path $stdoutPath) | Out-Null

$tracked = Get-TrackedApiProcess
if ($Stop) {
  $matched = @(Get-ApiProcesses)
  if ($matched.Count -gt 0) {
    foreach ($proc in $matched) {
      try {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
      } catch {
      }
    }
    Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
    [ordered]@{
      ok = $true
      stopped = $true
      stopped_count = $matched.Count
      pid_file = $pidPath
      stdout = $stdoutPath
      stderr = $stderrPath
    } | ConvertTo-Json -Depth 4
    exit 0
  }

  [ordered]@{
    ok = $true
    stopped = $false
    pid_file = $pidPath
    stdout = $stdoutPath
    stderr = $stderrPath
  } | ConvertTo-Json -Depth 4
  exit 0
}

if ($tracked -and (Test-ApiReady)) {
  [ordered]@{
    ok = $true
    started = $false
    pid = $tracked.ProcessId
    pid_file = $pidPath
    stdout = $stdoutPath
    stderr = $stderrPath
  } | ConvertTo-Json -Depth 4
  exit 0
}

$matched = @(Get-ApiProcesses)
if ($matched.Count -gt 0) {
  foreach ($proc in $matched) {
    try {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    } catch {
    }
  }
  Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
}

Remove-Item $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue

$cmdArgs = "/c pnpm -C apps/api run dev"

$proc = Start-Process `
  -FilePath "cmd.exe" `
  -ArgumentList $cmdArgs `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -PassThru

Set-Content -Path $pidPath -Value $proc.Id -Encoding ascii

try {
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    if ($proc.HasExited) {
      throw "api exited before readiness check completed."
    }
    if (Test-ApiReady) {
      [ordered]@{
        ok = $true
        started = $true
        pid = $proc.Id
        pid_file = $pidPath
        stdout = $stdoutPath
        stderr = $stderrPath
      } | ConvertTo-Json -Depth 4
      exit 0
    }
  }
  throw "api did not become ready within 60 seconds."
} catch {
  try {
    if ($proc -and -not $proc.HasExited) {
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
  } finally {
    Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
  }
  Write-Error $_.Exception.Message
  exit 1
}
