$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$comfyRoot = "C:\Users\th011\AppData\Local\Programs\ComfyUI\resources\ComfyUI"
$pythonExe = Join-Path $comfyRoot ".venv\Scripts\pythonw.exe"
$pidPath = Join-Path $repoRoot "out\dev_logs\comfyui-live.pid"

$stoppedPid = $null

if (Test-Path $pidPath) {
  try {
    $trackedPid = [int](Get-Content $pidPath -Raw).Trim()
    $tracked = Get-CimInstance Win32_Process -Filter "ProcessId = $trackedPid" -ErrorAction SilentlyContinue
    if ($tracked -and $tracked.ExecutablePath -eq $pythonExe -and $tracked.CommandLine -match "main.py" -and $tracked.CommandLine -match "--port 8000") {
      Stop-Process -Id $trackedPid -Force -ErrorAction SilentlyContinue
      $stoppedPid = $trackedPid
    }
  } finally {
    Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
  }
}

if ($null -eq $stoppedPid) {
  $fallback = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ExecutablePath -eq $pythonExe -and
      $_.CommandLine -match "main.py" -and
      $_.CommandLine -match "--listen 127.0.0.1" -and
      $_.CommandLine -match "--port 8000"
    } |
    Select-Object -First 1
  if ($fallback) {
    Stop-Process -Id $fallback.ProcessId -Force -ErrorAction SilentlyContinue
    $stoppedPid = $fallback.ProcessId
  }
}

[ordered]@{
  ok = $true
  stopped = $null -ne $stoppedPid
  pid = $stoppedPid
  pid_file = $pidPath
} | ConvertTo-Json -Depth 4
