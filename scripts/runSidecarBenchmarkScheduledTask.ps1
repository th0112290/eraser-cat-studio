param(
  [string]$EpisodeId = "",
  [string]$Video = "",
  [string]$Image = "",
  [string]$ReferenceVideo = "",
  [string]$ReferenceImage = "",
  [string]$Preset = "nightly_quality",
  [string]$RenderStage = "nightly",
  [int]$ClipSeconds = 5,
  [switch]$FullRun,
  [string]$OutDir = ""
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
if ([string]::IsNullOrWhiteSpace($OutDir)) {
  $OutDir = Join-Path $repoRoot "out\nightly\sidecar-benchmark\$timestamp"
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$logPath = Join-Path $OutDir "scheduled-task.log"
$args = @(
  "scripts/runSidecarBenchmarkNightly.mjs",
  "--preset=$Preset",
  "--render-stage=$RenderStage",
  "--out-dir=$OutDir",
  "--clip-seconds=$ClipSeconds"
)

if (-not [string]::IsNullOrWhiteSpace($EpisodeId)) {
  $args += "--episode-id=$EpisodeId"
}
if (-not [string]::IsNullOrWhiteSpace($Video)) {
  $args += "--video=$Video"
}
if (-not [string]::IsNullOrWhiteSpace($Image)) {
  $args += "--image=$Image"
}
if (-not [string]::IsNullOrWhiteSpace($ReferenceVideo)) {
  $args += "--reference-video=$ReferenceVideo"
}
if (-not [string]::IsNullOrWhiteSpace($ReferenceImage)) {
  $args += "--reference-image=$ReferenceImage"
}
if ($FullRun.IsPresent) {
  $args += "--full-run"
}

Push-Location $repoRoot
try {
  & node @args *>&1 | Tee-Object -FilePath $logPath
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
  Write-Host "SIDECAR BENCHMARK SCHEDULED TASK LOG: $logPath"
  Write-Host "SIDECAR BENCHMARK OUT: $OutDir"
}
finally {
  Pop-Location
}
