param(
  [Parameter(Mandatory = $true)]
  [string]$CharacterId,

  [Parameter(Mandatory = $true)]
  [string]$PositivePrompt,

  [Parameter(Mandatory = $true)]
  [int]$FrontSeed,

  [string]$NegativePrompt = "",
  [string]$ShotsPath = "",
  [string]$OutputPath = "",
  [switch]$NoRender
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$comfyRoot = "C:\Users\th011\AppData\Local\Programs\ComfyUI\resources\ComfyUI"
$pythonExe = Join-Path $comfyRoot ".venv\Scripts\python.exe"
$comfyInputDir = Join-Path $comfyRoot "input"
$stdoutPath = Join-Path $repoRoot "out\dev_logs\comfyui-live.stdout.log"
$stderrPath = Join-Path $repoRoot "out\dev_logs\comfyui-live.stderr.log"
$comfyServerUrl = "http://127.0.0.1:8000"

if (!(Test-Path $pythonExe)) {
  throw "ComfyUI python not found: $pythonExe"
}

Remove-Item $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
Get-Process |
  Where-Object { $_.ProcessName -like "python*" -and $_.Path -eq $pythonExe } |
  Stop-Process -Force -ErrorAction SilentlyContinue

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

  $objectInfo = Invoke-RestMethod -Uri "$comfyServerUrl/object_info" -Method Get -TimeoutSec 20
  $requiredNodes = @(
    "UNETLoader",
    "CLIPLoader",
    "VAELoader",
    "LoraLoader",
    "EmptySD3LatentImage",
    "ModelSamplingAuraFlow",
    "KSampler",
    "VAEDecode",
    "SaveImage",
    "LoadImage",
    "FluxKontextImageScale",
    "GetImageSize",
    "DualCLIPLoader",
    "FluxGuidance",
    "VAEEncode",
    "ReferenceLatent",
    "FluxKontextMultiReferenceLatentMethod",
    "ModelSamplingFlux"
  )
  $missingNodes = @($requiredNodes | Where-Object { -not $objectInfo.PSObject.Properties.Name.Contains($_) })
  $clipNames = @($objectInfo.CLIPLoader.input.required.clip_name[0])
  $clipTypes = @($objectInfo.CLIPLoader.input.required.type[0])
  $unetNames = @($objectInfo.UNETLoader.input.required.unet_name[0])
  $vaeNames = @($objectInfo.VAELoader.input.required.vae_name[0])
  $loraNames = @($objectInfo.LoraLoader.input.required.lora_name[0])
  $objectInfoSummary = [ordered]@{
    missing_nodes = $missingNodes
    models = [ordered]@{
      qwen = $clipNames -contains "qwen_3_4b.safetensors"
      clip_l = $clipNames -contains "clip_l.safetensors"
      zimage = $unetNames -contains "z_image_turbo_bf16.safetensors"
      flux_kontext = $unetNames -contains "flux1-dev-kontext_fp8_scaled.safetensors"
      vae = $vaeNames -contains "ae.safetensors"
      lora = $loraNames -contains "z_lora_cuteanimal_1_000008500.safetensors"
      clip_loader_types = $clipTypes
    }
  }
  Write-Output ("[live-pipeline] object_info summary:`n" + ($objectInfoSummary | ConvertTo-Json -Depth 6))

  if ($missingNodes.Count -gt 0) {
    throw "Required Comfy nodes missing: $($missingNodes -join ', ')"
  }

  $env:COMFY_SERVER_URL = $comfyServerUrl
  $env:COMFY_INPUT_DIR = $comfyInputDir

  $pipelineArgs = @(
    "-C",
    (Join-Path $repoRoot "packages\image-gen"),
    "run",
    "pipeline:mvp",
    "--",
    "--character-id=$CharacterId",
    "--positive-prompt=$PositivePrompt",
    "--front-seed=$FrontSeed"
  )

  if ($NegativePrompt.Trim().Length -gt 0) {
    $pipelineArgs += "--negative-prompt=$NegativePrompt"
  }
  if ($ShotsPath.Trim().Length -gt 0) {
    $pipelineArgs += "--shots=$ShotsPath"
  }
  if ($OutputPath.Trim().Length -gt 0) {
    $pipelineArgs += "--output=$OutputPath"
  }
  if ($NoRender.IsPresent) {
    $pipelineArgs += "--no-render"
  }

  & pnpm @pipelineArgs
  if ($LASTEXITCODE -ne 0) {
    throw "pipeline:mvp failed with exit code $LASTEXITCODE"
  }
} finally {
  if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  }
}
