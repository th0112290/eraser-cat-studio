param(
  [switch]$Stop
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$stdoutPath = Join-Path $repoRoot "out\dev_logs\worker-main.stdout.log"
$stderrPath = Join-Path $repoRoot "out\dev_logs\worker-main.stderr.log"
$pidPath = Join-Path $repoRoot "out\dev_logs\worker-main.pid"
$workerCommandLine = "node scripts/runWorkerDirect.mjs"
$repoRootPattern = [regex]::Escape($repoRoot)
$workerTargetPattern = "src\\dev\.ts|runWorkerDirect\.mjs"

function Get-TrackedWorkerProcess {
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

function Get-WorkerProcesses {
  $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  $matched = @(
    $all | Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match $repoRootPattern -and
      $_.CommandLine -match $workerTargetPattern
    }
  )

  $parentIds = $matched | ForEach-Object { $_.ParentProcessId } | Where-Object { $_ -gt 0 } | Select-Object -Unique
  $parentCandidates = @(
    $all | Where-Object {
      $_.ProcessId -in $parentIds -and
      $_.CommandLine -and
      ($_.CommandLine -match "tsx\\dist\\cli\.mjs.+src\\dev\.ts" -or $_.CommandLine -match "pnpm\.cjs.+run dev")
    }
  )

  return @($matched + $parentCandidates) | Sort-Object ProcessId -Unique
}

function Stop-TrackedWorkerProcess {
  param(
    [Parameter(Mandatory = $true)]
    $TrackedProcess
  )

  try {
    Stop-Process -Id $TrackedProcess.ProcessId -Force -ErrorAction SilentlyContinue
  } finally {
    Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
  }
}

function Test-WorkerReady {
  if (!(Test-Path $stdoutPath)) {
    return $false
  }

  $content = Get-Content $stdoutPath -Raw -ErrorAction SilentlyContinue
  return $content -match "\[worker\] running\."
}

New-Item -ItemType Directory -Force -Path (Split-Path $stdoutPath) | Out-Null

$tracked = Get-TrackedWorkerProcess
if ($Stop) {
  $matched = @(Get-WorkerProcesses)
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

if ($tracked -and (Test-WorkerReady)) {
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
if ($tracked) {
  Stop-TrackedWorkerProcess -TrackedProcess $tracked
}

$matched = @(Get-WorkerProcesses)
if ($matched.Count -gt 0) {
  foreach ($proc in $matched) {
    try {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    } catch {
    }
  }
}

Remove-Item $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue

$cmdArgs = "/c $workerCommandLine"

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
      throw "worker exited before readiness check completed."
    }
    if (Test-WorkerReady) {
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
  throw "worker did not become ready within 60 seconds."
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
