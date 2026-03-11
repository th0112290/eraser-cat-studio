$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$comfyRoot = "C:\Users\th011\AppData\Local\Programs\ComfyUI\resources\ComfyUI"
$pythonExe = Join-Path $comfyRoot ".venv\Scripts\pythonw.exe"
$stdoutPath = Join-Path $repoRoot "out\dev_logs\comfyui-live.stdout.log"
$stderrPath = Join-Path $repoRoot "out\dev_logs\comfyui-live.stderr.log"
$pidPath = Join-Path $repoRoot "out\dev_logs\comfyui-live.pid"
$serverUrl = "http://127.0.0.1:8000"

function Test-ComfyReady {
  try {
    $response = Invoke-WebRequest -UseBasicParsing "$serverUrl/object_info" -TimeoutSec 5
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Get-TrackedComfyProcess {
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
  if ($proc.ExecutablePath -ne $pythonExe -or $proc.CommandLine -notmatch "main.py" -or $proc.CommandLine -notmatch "--port 8000") {
    Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
    return $null
  }
  return $proc
}

function Stop-TrackedComfyProcess {
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

if (!(Test-Path $pythonExe)) {
  throw "ComfyUI python not found: $pythonExe"
}

New-Item -ItemType Directory -Force -Path (Split-Path $stdoutPath) | Out-Null

$tracked = Get-TrackedComfyProcess
if ($tracked -and (Test-ComfyReady)) {
  [ordered]@{
    ok = $true
    started = $false
    pid = $tracked.ProcessId
    pid_file = $pidPath
    server_url = $serverUrl
  } | ConvertTo-Json -Depth 4
  exit 0
}
if ($tracked) {
  Stop-TrackedComfyProcess -TrackedProcess $tracked
}

Remove-Item $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue

$proc = Start-Process `
  -FilePath $pythonExe `
  -ArgumentList @("main.py", "--listen", "127.0.0.1", "--port", "8000") `
  -WorkingDirectory $comfyRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -PassThru

Set-Content -Path $pidPath -Value $proc.Id -Encoding ascii

try {
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    if ($proc.HasExited) {
      throw "ComfyUI exited before readiness check completed."
    }
    if (Test-ComfyReady) {
      [ordered]@{
        ok = $true
        started = $true
        pid = $proc.Id
        pid_file = $pidPath
        server_url = $serverUrl
      } | ConvertTo-Json -Depth 4
      exit 0
    }
  }
  throw "ComfyUI did not become ready within 60 seconds."
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
