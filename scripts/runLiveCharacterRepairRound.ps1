param(
  [Parameter(Mandatory = $true)]
  [string]$CharacterId,

  [Parameter(Mandatory = $true)]
  [int]$ThreeQuarterSeed,

  [Parameter(Mandatory = $true)]
  [int]$ProfileSeed,

  [Parameter(Mandatory = $true)]
  [int]$ExpressionBaseSeed,

  [Parameter(Mandatory = $true)]
  [int]$VisemeBaseSeed,

  [string]$NegativePrompt = "",
  [int]$MaxRounds = 1,
  [switch]$UseAdapterViewRepair
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$comfyRoot = "C:\Users\th011\AppData\Local\Programs\ComfyUI\resources\ComfyUI"
$pythonExe = Join-Path $comfyRoot ".venv\Scripts\python.exe"
$nodeExe = "C:\Program Files\nodejs\node.exe"
$comfyInputDir = Join-Path $comfyRoot "input"
$stdoutPath = Join-Path $repoRoot "out\dev_logs\comfyui-repair.stdout.log"
$stderrPath = Join-Path $repoRoot "out\dev_logs\comfyui-repair.stderr.log"
$adapterStdoutPath = Join-Path $repoRoot "out\dev_logs\comfy-adapter-repair.stdout.log"
$adapterStderrPath = Join-Path $repoRoot "out\dev_logs\comfy-adapter-repair.stderr.log"
$comfyServerUrl = "http://127.0.0.1:8000"
$comfyAdapterUrl = "http://127.0.0.1:8013"

if (!(Test-Path $pythonExe)) {
  throw "ComfyUI python not found: $pythonExe"
}

if ($UseAdapterViewRepair -and !(Test-Path $nodeExe)) {
  throw "node.exe not found: $nodeExe"
}

Remove-Item $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
Remove-Item $adapterStdoutPath, $adapterStderrPath -Force -ErrorAction SilentlyContinue
Get-Process |
  Where-Object { $_.ProcessName -like "python*" -and $_.Path -eq $pythonExe } |
  Stop-Process -Force -ErrorAction SilentlyContinue

$adapterProc = $null
$proc = Start-Process `
  -FilePath $pythonExe `
  -ArgumentList @("main.py", "--listen", "127.0.0.1", "--port", "8000") `
  -WorkingDirectory $comfyRoot `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -PassThru

try {
  $ready = $false
  for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Seconds 2
    try {
      $response = Invoke-WebRequest -UseBasicParsing "$comfyServerUrl/object_info" -TimeoutSec 10
      if ($response.StatusCode -eq 200) {
        $ready = $true
        break
      }
    } catch {
      if ($proc.HasExited) {
        break
      }
    }
  }

  if (-not $ready) {
    $stderrTail = if (Test-Path $stderrPath) {
      (Get-Content $stderrPath | Select-Object -Last 200) -join "`n"
    } else {
      "no stderr log"
    }
    throw "ComfyUI did not become ready.`n$stderrTail"
  }

  $env:COMFY_SERVER_URL = $comfyServerUrl
  $env:COMFY_INPUT_DIR = $comfyInputDir
  if ($UseAdapterViewRepair) {
    Get-CimInstance Win32_Process |
      Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -match "scripts/comfyAdapter\.mjs" } |
      ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      }

    $env:COMFY_ADAPTER_PORT = "8013"
    $env:COMFY_ADAPTER_URL = $comfyAdapterUrl
    $env:COMFY_TIMEOUT_MS = "600000"
    $env:COMFY_DISABLE_OBJECT_INFO_CACHE = "true"
    $env:COMFY_ADAPTER_MODE = "checkpoint"
    $env:CHARACTER_PIPELINE_ENABLE_ADAPTER_VIEW_REPAIR = "true"

    $adapterProc = Start-Process `
      -FilePath $nodeExe `
      -ArgumentList @("scripts/comfyAdapter.mjs") `
      -WorkingDirectory $repoRoot `
      -RedirectStandardOutput $adapterStdoutPath `
      -RedirectStandardError $adapterStderrPath `
      -PassThru

    $adapterReady = $false
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Seconds 2
      try {
        $adapterHealth = Invoke-WebRequest -UseBasicParsing "$comfyAdapterUrl/health" -TimeoutSec 10
        if ($adapterHealth.StatusCode -eq 200) {
          $adapterReady = $true
          break
        }
      } catch {
        if ($adapterProc.HasExited) {
          break
        }
      }
    }

    if (-not $adapterReady) {
      $adapterTail = if (Test-Path $adapterStderrPath) {
        (Get-Content $adapterStderrPath | Select-Object -Last 200) -join "`n"
      } else {
        "no adapter stderr log"
      }
      throw "Comfy adapter did not become ready.`n$adapterTail"
    }
  } else {
    Remove-Item Env:CHARACTER_PIPELINE_ENABLE_ADAPTER_VIEW_REPAIR -ErrorAction SilentlyContinue
    Remove-Item Env:COMFY_ADAPTER_URL -ErrorAction SilentlyContinue
  }

  $characterJson = $CharacterId | ConvertTo-Json -Compress
  $negativePromptJson = $NegativePrompt | ConvertTo-Json -Compress

@"
import { runCharacterPipelineEditRepairLoop, resolveCharacterPipelineAcceptance } from "./src/generatedCharacterPipeline.ts";

const result = await runCharacterPipelineEditRepairLoop({
  characterId: $characterJson,
  negativePrompt: $negativePromptJson,
  threeQuarterSeed: $ThreeQuarterSeed,
  profileSeed: $ProfileSeed,
  expressionBaseSeed: $ExpressionBaseSeed,
  visemeBaseSeed: $VisemeBaseSeed,
  maxRounds: $MaxRounds
});

console.log(
  JSON.stringify(
    {
      result,
      acceptance: resolveCharacterPipelineAcceptance($characterJson)
    },
    null,
    2
  )
);
"@ | pnpm -C (Join-Path $repoRoot "packages\image-gen") exec tsx -

  if ($LASTEXITCODE -ne 0) {
    throw "repair loop failed with exit code $LASTEXITCODE"
  }
} finally {
  if ($adapterProc -and -not $adapterProc.HasExited) {
    Stop-Process -Id $adapterProc.Id -Force -ErrorAction SilentlyContinue
  }
  if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  }
}
