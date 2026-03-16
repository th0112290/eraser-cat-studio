param(
  [string]$LogDir = "",
  [string]$PnpmPath = ""
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Resolve-PnpmPath {
  param(
    [string]$ExplicitPath
  )

  $candidates = [System.Collections.Generic.List[string]]::new()

  if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
    $candidates.Add($ExplicitPath)
  }

  try {
    $command = Get-Command pnpm.cmd -ErrorAction Stop
    if (-not [string]::IsNullOrWhiteSpace($command.Source)) {
      $candidates.Add($command.Source)
    }
  }
  catch {
  }

  if (-not [string]::IsNullOrWhiteSpace($env:APPDATA)) {
    $candidates.Add((Join-Path $env:APPDATA "npm\pnpm.cmd"))
  }

  if (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
    $candidates.Add((Join-Path $env:USERPROFILE "AppData\Roaming\npm\pnpm.cmd"))
  }

  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }

    if (Test-Path $candidate) {
      return (Resolve-Path $candidate).Path
    }
  }

  throw "Unable to resolve pnpm.cmd. Pass -PnpmPath explicitly or ensure pnpm is installed."
}

if ([string]::IsNullOrWhiteSpace($LogDir)) {
  $LogDir = Join-Path $repoRoot "out\worker"
}

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$logPath = Join-Path $LogDir "worker-scheduled-task.log"
$resolvedPnpmPath = Resolve-PnpmPath -ExplicitPath $PnpmPath

if (Test-Path "C:\Program Files\nodejs") {
  $env:Path = "C:\Program Files\nodejs;$env:Path"
}

Push-Location $repoRoot
try {
  "[$((Get-Date).ToString("s"))] START worker task with $resolvedPnpmPath" | Tee-Object -FilePath $logPath -Append
  & $resolvedPnpmPath -C apps/worker run dev *>&1 | Tee-Object -FilePath $logPath -Append
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
finally {
  Pop-Location
}
