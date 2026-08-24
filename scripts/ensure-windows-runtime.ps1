$ErrorActionPreference = 'Stop'

$dockerDesktopPath = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
$tunnelTaskName = 'NXQ Social Cloudflare Tunnel'

function Wait-ForCondition {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Condition,
    [Parameter(Mandatory = $true)]
    [string]$FailureMessage,
    [int]$TimeoutSeconds = 120
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      if (& $Condition) {
        return
      }
    } catch {
      # The dependency may still be starting. Retry until the bounded deadline.
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  throw $FailureMessage
}

if (-not (Test-Path -LiteralPath $dockerDesktopPath)) {
  throw "Docker Desktop was not found at $dockerDesktopPath"
}

if (-not (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath $dockerDesktopPath -WindowStyle Hidden
}

$tunnelTask = Get-ScheduledTask -TaskName $tunnelTaskName -ErrorAction Stop
if ($tunnelTask.State -ne 'Running') {
  Start-ScheduledTask -TaskName $tunnelTaskName
}

Wait-ForCondition -FailureMessage 'The NXQ Cloudflare tunnel task did not reach Running state.' -Condition {
  (Get-ScheduledTask -TaskName $tunnelTaskName -ErrorAction Stop).State -eq 'Running'
}

Wait-ForCondition -FailureMessage 'Docker Desktop did not become ready within 120 seconds.' -Condition {
  & docker info *> $null
  $LASTEXITCODE -eq 0
}

Wait-ForCondition -FailureMessage 'The NXQ backend did not pass its local readiness check.' -TimeoutSeconds 180 -Condition {
  $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/api/health/ready' -TimeoutSec 5
  $response.StatusCode -eq 200
}

Wait-ForCondition -FailureMessage 'The NXQ frontend did not pass its local health check.' -TimeoutSeconds 180 -Condition {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3001/health' -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
      return $true
    }
  } catch {
    # The retained Windows rollback image predates the dedicated /health route.
  }
  $fallback = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3001/' -TimeoutSec 5
  $fallback.StatusCode -eq 200
}

Write-Host 'NXQ Windows runtime is locally healthy and the named tunnel task is running.'
