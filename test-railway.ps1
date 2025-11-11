# Railway Career Intelligence Pipeline - Test & Management Script
# This script provides easy access to all CLI operations

$API_URL = "https://career-api-production-9b6a.up.railway.app"
$ADMIN_TOKEN = "secure-random-token-2025"

Write-Host "=== Career Intelligence Pipeline - Railway Management ===" -ForegroundColor Cyan
Write-Host ""

function Test-Health {
    Write-Host "Testing Health Endpoint..." -ForegroundColor Yellow
    $response = Invoke-RestMethod -Uri "$API_URL/health" -Method Get
    Write-Host "Status: $($response.status)" -ForegroundColor Green
    Write-Host "Uptime: $($response.uptime) seconds"
    Write-Host "Environment: $($response.environment)"
    Write-Host ""
}

function Test-DatabaseHealth {
    Write-Host "Testing Database Health..." -ForegroundColor Yellow
    try {
        $response = Invoke-RestMethod -Uri "$API_URL/health/db" -Method Get
        Write-Host "Database Status: $($response.database)" -ForegroundColor Green
    } catch {
        Write-Host "Database Error: $_" -ForegroundColor Red
    }
    Write-Host ""
}

function Get-Jobs {
    Write-Host "Fetching Jobs..." -ForegroundColor Yellow
    try {
        $response = Invoke-RestMethod -Uri "$API_URL/api/jobs?limit=10" -Method Get
        Write-Host "Total Jobs: $($response.total)" -ForegroundColor Green
        $response.jobs | Format-Table -Property id, canonicalTitle, socCode
    } catch {
        Write-Host "Error: $_" -ForegroundColor Red
    }
    Write-Host ""
}

function Get-AdminStatus {
    Write-Host "Fetching Admin Status..." -ForegroundColor Yellow
    try {
        $headers = @{
            "Authorization" = "Bearer $ADMIN_TOKEN"
        }
        $response = Invoke-RestMethod -Uri "$API_URL/api/admin/status" -Method Get -Headers $headers
        Write-Host "Jobs Total: $($response.jobs.total)" -ForegroundColor Green
        Write-Host "Queue Status:" -ForegroundColor Green
        $response.queue | ConvertTo-Json
        Write-Host "Progress:" -ForegroundColor Green
        $response.progress | ConvertTo-Json
    } catch {
        Write-Host "Error: $_" -ForegroundColor Red
    }
    Write-Host ""
}

function Run-DbSetup {
    Write-Host "Running Database Setup..." -ForegroundColor Yellow
    railway run npm run db:setup
    Write-Host ""
}

function Run-PromptsSetup {
    Write-Host "Installing AI Prompts..." -ForegroundColor Yellow
    railway run npm run db:prompts
    Write-Host ""
}

function Run-Worker {
    param([int]$max = 10)
    Write-Host "Running AI Worker (max $max items)..." -ForegroundColor Yellow
    railway run npm run worker:ai -- --max=$max --verbose
    Write-Host ""
}

function Run-Verify {
    Write-Host "Running Verification..." -ForegroundColor Yellow
    railway run npm run verify
    Write-Host ""
}

function Show-Logs {
    param([int]$lines = 50)
    Write-Host "Showing Last $lines Log Lines..." -ForegroundColor Yellow
    railway logs | Select-Object -Last $lines
    Write-Host ""
}

# Main Menu
while ($true) {
    Write-Host "=== Available Commands ===" -ForegroundColor Cyan
    Write-Host "1. Test Health"
    Write-Host "2. Test Database Health"
    Write-Host "3. Get Jobs List"
    Write-Host "4. Get Admin Status"
    Write-Host "5. Run Database Setup"
    Write-Host "6. Install AI Prompts"
    Write-Host "7. Run AI Worker (10 items)"
    Write-Host "8. Run Verification"
    Write-Host "9. Show Logs"
    Write-Host "Q. Quit"
    Write-Host ""
    
    $choice = Read-Host "Select option"
    
    switch ($choice) {
        "1" { Test-Health }
        "2" { Test-DatabaseHealth }
        "3" { Get-Jobs }
        "4" { Get-AdminStatus }
        "5" { Run-DbSetup }
        "6" { Run-PromptsSetup }
        "7" { Run-Worker -max 10 }
        "8" { Run-Verify }
        "9" { Show-Logs -lines 50 }
        "Q" { Write-Host "Exiting..."; exit }
        default { Write-Host "Invalid option" -ForegroundColor Red }
    }
}
