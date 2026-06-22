#!/usr/bin/env pwsh
# Monitor EAS Android build status and alert on completion

$buildId = "2f7b34dd-61c2-4b2e-9bae-46fc418e2c8c"
$project = "nxq-social-mobile"
$account = "gionyortiz"
$maxWaitMinutes = 30
$pollIntervalSeconds = 30

Write-Host "Build ID: $buildId" -ForegroundColor Cyan
Write-Host ""

$startTime = Get-Date
$lastStatus = "unknown"

do {
    $elapsed = (Get-Date) - $startTime
    $minutes = [int]$elapsed.TotalMinutes
    
    try {
        $output = & eas build:list --json 2>$null | ConvertFrom-Json
        $build = $output | Where-Object { $_.id -eq $buildId } | Select-Object -First 1
        
        if ($build) {
            $status = $build.status
            
            if ($status -ne $lastStatus) {
                Write-Host "[$minutes min] Status: $status" -ForegroundColor Yellow
                $lastStatus = $status
            }
            
            if ($status -eq "FINISHED") {
                Write-Host "BUILD COMPLETED!" -ForegroundColor Green
                exit 0
            }
            elseif ($status -eq "ERRORED" -or $status -eq "FAILED") {
                Write-Host "BUILD FAILED: $status" -ForegroundColor Red
                exit 1
            }
        }
    }
    catch {
        # Silent fail, continue polling
    }
    
    if ($minutes -gt $maxWaitMinutes) {
        Write-Host "Timeout after $maxWaitMinutes minutes" -ForegroundColor Yellow
        exit 2
    }
    
    Write-Host "." -NoNewline
    Start-Sleep -Seconds $pollIntervalSeconds
    
} while ($true)
