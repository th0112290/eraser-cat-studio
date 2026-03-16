param(
  [string]$TaskName = "EcsSidecarBenchmarkNightly",
  [string]$DailyAt = "02:30",
  [string]$EpisodeId = "",
  [string]$Video = "",
  [string]$Image = "",
  [string]$ReferenceVideo = "",
  [string]$ReferenceImage = "",
  [string]$Preset = "nightly_quality",
  [string]$RenderStage = "nightly",
  [int]$ClipSeconds = 5,
  [switch]$FullRun,
  [switch]$DryRun,
  [switch]$Force
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$taskScript = Join-Path $repoRoot "scripts\runSidecarBenchmarkScheduledTask.ps1"

function Add-QuotedArg {
  param(
    [System.Collections.Generic.List[string]]$Target,
    [string]$Name,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return
  }

  $escaped = $Value.Replace('"', '\"')
  $Target.Add("-$Name `"$escaped`"")
}

$argList = [System.Collections.Generic.List[string]]::new()
$argList.Add("-NoProfile")
$argList.Add("-ExecutionPolicy Bypass")
$argList.Add("-File `"$taskScript`"")
$argList.Add("-Preset `"$Preset`"")
$argList.Add("-RenderStage `"$RenderStage`"")
$argList.Add("-ClipSeconds $ClipSeconds")

Add-QuotedArg -Target $argList -Name "EpisodeId" -Value $EpisodeId
Add-QuotedArg -Target $argList -Name "Video" -Value $Video
Add-QuotedArg -Target $argList -Name "Image" -Value $Image
Add-QuotedArg -Target $argList -Name "ReferenceVideo" -Value $ReferenceVideo
Add-QuotedArg -Target $argList -Name "ReferenceImage" -Value $ReferenceImage

if ($FullRun.IsPresent) {
  $argList.Add("-FullRun")
}

$actionArgs = [string]::Join(" ", $argList)
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs -WorkingDirectory $repoRoot
$triggerTime = [datetime]::ParseExact($DailyAt, "HH:mm", $null)
$trigger = New-ScheduledTaskTrigger -Daily -At $triggerTime
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 6)

if ($DryRun.IsPresent) {
  [pscustomobject]@{
    TaskName = $TaskName
    DailyAt = $DailyAt
    Execute = "powershell.exe"
    Arguments = $actionArgs
    WorkingDirectory = $repoRoot
    ClipSeconds = $ClipSeconds
    FullRun = $FullRun.IsPresent
  } | Format-List
  exit 0
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Nightly sidecar benchmark post-processing run" `
  -Force:$Force.IsPresent | Out-Null

Write-Host "REGISTERED SIDECAR BENCHMARK TASK: $TaskName"
Write-Host "SCHEDULE: daily at $DailyAt"
Write-Host "ACTION: powershell.exe $actionArgs"
