$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$stdoutPath = Join-Path $repoRoot "out\dev_logs\comfy-adapter-8013.stdout.log"
$stderrPath = Join-Path $repoRoot "out\dev_logs\comfy-adapter-8013.stderr.log"

$existingAdapters = Get-CimInstance Win32_Process |
  Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -match "scripts/comfyAdapter\.mjs" }

foreach ($process in $existingAdapters) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

$env:COMFY_ADAPTER_PORT = "8013"
$env:COMFY_SERVER_URL = "http://127.0.0.1:8000"
$env:COMFY_TIMEOUT_MS = "600000"
$env:COMFY_INPUT_DIR = "C:\Users\th011\AppData\Local\Programs\ComfyUI\resources\ComfyUI\input"
$env:COMFY_DISABLE_OBJECT_INFO_CACHE = "true"
$env:COMFY_ADAPTER_MODE = "checkpoint"

Start-Process `
  -FilePath "C:\Program Files\nodejs\node.exe" `
  -ArgumentList @("scripts/comfyAdapter.mjs") `
  -WorkingDirectory $repoRoot `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath

Start-Sleep -Seconds 4
try {
  $health = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8013/health" -TimeoutSec 5
  $health.Content
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
