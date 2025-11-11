# Railway Setup Script - Initialize Career Intelligence Pipeline
Write-Host "=== Career Intelligence Pipeline - Railway Setup ===" -ForegroundColor Cyan
Write-Host ""

$API_URL = "https://career-api-production-9b6a.up.railway.app"

# Step 1: Database Setup
Write-Host "Step 1: Creating database schema..." -ForegroundColor Yellow
railway run npm run db:setup
Start-Sleep -Seconds 3
Write-Host "Database schema created" -ForegroundColor Green
Write-Host ""

# Step 2: Install AI Prompts
Write-Host "Step 2: Installing AI prompt templates..." -ForegroundColor Yellow
railway run npm run db:prompts
Start-Sleep -Seconds 3
Write-Host "AI prompts installed" -ForegroundColor Green
Write-Host ""

# Step 3: Import O*NET Data
Write-Host "Step 3: Importing O*NET occupation data..." -ForegroundColor Yellow
railway run npm run onet:import -- --csv=./data/All_Occupations.csv --enqueue
Start-Sleep -Seconds 5
Write-Host "O*NET data imported and queued" -ForegroundColor Green
Write-Host ""

# Step 4: Verify Setup
Write-Host "Step 4: Verifying setup..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$API_URL/api/jobs?limit=5"
    Write-Host "Jobs imported: $($response.total)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Sample jobs:" -ForegroundColor Cyan
    $response.jobs | Select-Object -First 5 | Format-Table id, canonicalTitle, socCode
} catch {
    Write-Host "Could not verify jobs" -ForegroundColor Red
    Write-Host $_.Exception.Message
}
Write-Host ""

# Step 5: Check Queue Status
Write-Host "Step 5: Checking AI job queue..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer secure-random-token-2025" }
    $status = Invoke-RestMethod -Uri "$API_URL/api/admin/status" -Headers $headers
    Write-Host "Queue Status:" -ForegroundColor Green
    Write-Host "  - Total Jobs: $($status.jobs.total)"
    Write-Host "  - Pending Items: $($status.progress.pending)"
    Write-Host "  - Total Items: $($status.progress.total)"
    Write-Host ""
    Write-Host "Queue breakdown:"
    $status.queue | ConvertTo-Json
} catch {
    Write-Host "Could not check queue" -ForegroundColor Red
    Write-Host $_.Exception.Message
}
Write-Host ""

Write-Host "=== Setup Complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Run AI Worker: railway run npm run worker:ai -- --max=100 --verbose"
Write-Host "2. Monitor progress: railway run npm run verify"
Write-Host "3. Check logs: railway logs"
Write-Host ""
Write-Host "API URL: $API_URL" -ForegroundColor Yellow
$githubUrl = "https://github.com/worldbibleproject/career-intelligence-pipeline"
Write-Host "GitHub: $githubUrl" -ForegroundColor Yellow
