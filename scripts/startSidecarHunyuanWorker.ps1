$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$stdoutPath = Join-Path $repoRoot "out\dev_logs\worker-sidecar-hunyuan.stdout.log"
$stderrPath = Join-Path $repoRoot "out\dev_logs\worker-sidecar-hunyuan.stderr.log"
$pidPath = Join-Path $repoRoot "out\dev_logs\worker-sidecar-hunyuan.pid"
$workerCommandLine = "pnpm.cmd -C apps/worker exec tsx src/dev.ts"

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

  if ($proc.CommandLine -notmatch [regex]::Escape($workerCommandLine)) {
    Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
    return $null
  }

  return $proc
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

Remove-Item $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue

$envPairs = @(
  "WORKER_EPISODE_QUEUE_NAME=episode-jobs-hunyuan-sidecar",
  "VIDEO_HUNYUAN_PREMIUM_DEFAULT=false",
  "VIDEO_SIDECAR_BENCHMARK_FAST_MODE=false",
  "BENCHMARK_PRESET_FAST_MODE=false",
  "VIDEO_SIDECAR_PREMIUM_CANDIDATE_COUNT=1",
  "VIDEO_SIDECAR_PREMIUM_ACTUAL_CANDIDATE_COUNT=1",
  "VIDEO_SIDECAR_PREMIUM_ACTUAL_RETAKE_COUNT=0",
  "VIDEO_HUNYUAN_COMFY_TIMEOUT_MS=10800000",
  "VIDEO_HUNYUAN_SR_COMFY_TIMEOUT_MS=21600000",
  "VIDEO_HUNYUAN_SR_TILED_VAE_DECODE=true"
)
$envCommand = ($envPairs | ForEach-Object { "set $_" }) -join " && "
$cmdArgs = "/c $envCommand && $workerCommandLine"

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
