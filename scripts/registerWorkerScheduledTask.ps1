param(
  [string]$TaskName = "EcsWorkerResident",
  [string]$LogDir = "",
  [string]$PnpmPath = "",
  [switch]$IncludeStartup,
  [switch]$RunWithoutLogon,
  [switch]$StartupOnly,
  [switch]$LogonOnly,
  [switch]$DryRun,
  [switch]$Force
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$taskScript = Join-Path $repoRoot "scripts\runWorkerScheduledTask.ps1"
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

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
$argList.Add("-WindowStyle Hidden")
$argList.Add("-ExecutionPolicy Bypass")
$argList.Add("-File `"$taskScript`"")

Add-QuotedArg -Target $argList -Name "LogDir" -Value $LogDir
Add-QuotedArg -Target $argList -Name "PnpmPath" -Value $PnpmPath

$actionArgs = [string]::Join(" ", $argList)
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs -WorkingDirectory $repoRoot

$triggerList = [System.Collections.Generic.List[Microsoft.Management.Infrastructure.CimInstance]]::new()
$useStartupTrigger = $false
$useLogonTrigger = $true

if ($IncludeStartup.IsPresent) {
  $useStartupTrigger = $true
}
if ($StartupOnly.IsPresent) {
  $useStartupTrigger = $true
  $useLogonTrigger = $false
}
if ($LogonOnly.IsPresent) {
  $useStartupTrigger = $false
  $useLogonTrigger = $true
}

if ($useStartupTrigger) {
  $triggerList.Add((New-ScheduledTaskTrigger -AtStartup))
}
if ($useLogonTrigger) {
  $triggerList.Add((New-ScheduledTaskTrigger -AtLogOn -User $currentUser))
}

if ($triggerList.Count -eq 0) {
  throw "At least one trigger is required."
}

$principal = $null
if ($RunWithoutLogon.IsPresent) {
  $principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType S4U -RunLevel Highest
}

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1)

if ($DryRun.IsPresent) {
  [pscustomobject]@{
    TaskName = $TaskName
    User = $currentUser
    Execute = "powershell.exe"
    Arguments = $actionArgs
    WorkingDirectory = $repoRoot
    Triggers = @(
      if ($useStartupTrigger) { "AtStartup" }
      if ($useLogonTrigger) { "AtLogOn" }
    )
    LogDir = $LogDir
    PnpmPath = $PnpmPath
    InteractiveOnly = -not $RunWithoutLogon.IsPresent
    RunWithoutLogon = $RunWithoutLogon.IsPresent
  } | Format-List
  exit 0
}

if ($null -ne $principal) {
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $triggerList.ToArray() `
    -Principal $principal `
    -Settings $settings `
    -Description "Resident ecs-sidecar-rollout worker process" `
    -Force:$Force.IsPresent | Out-Null
}
else {
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $triggerList.ToArray() `
    -Settings $settings `
    -Description "Resident ecs-sidecar-rollout worker process" `
    -Force:$Force.IsPresent | Out-Null
}

Write-Host "REGISTERED WORKER TASK: $TaskName"
Write-Host "USER: $currentUser"
if ($RunWithoutLogon.IsPresent) {
  Write-Host "LOGON MODE: run whether user is logged on or not (S4U)"
}
else {
  Write-Host "LOGON MODE: interactive only"
}
Write-Host "ACTION: powershell.exe $actionArgs"
Write-Host "TRIGGERS: $((@(
  if ($useStartupTrigger) { 'AtStartup' }
  if ($useLogonTrigger) { 'AtLogOn' }
) -join ', '))"
