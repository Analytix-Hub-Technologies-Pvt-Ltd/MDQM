# Test business-user APIs (run backend on http://127.0.0.1:8000 first).
# Usage:
#   .\scripts\test_business_user_api.ps1 -Login "you@email.com" -Password "your-password"

param(
    [string]$BaseUrl = "http://127.0.0.1:8000",
    [Parameter(Mandatory = $true)][string]$Login,
    [Parameter(Mandatory = $true)][string]$Password
)

$ErrorActionPreference = "Stop"

Write-Host "1. Login..." -ForegroundColor Cyan
$loginBody = @{ login = $Login; password = $Password } | ConvertTo-Json
$auth = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType "application/json" -Body $loginBody
$token = $auth.access_token
$headers = @{ Authorization = "Bearer $token" }
Write-Host "   OK — token received" -ForegroundColor Green

$endpoints = @(
    "/api/enterprise/business/overview",
    "/api/enterprise/business/catalog?page=1&page_size=5",
    "/api/enterprise/business/quality-scores?page=1&page_size=5",
    "/api/enterprise/business/glossary?page=1&page_size=5",
    "/api/enterprise/business/reports?page=1&page_size=10",
    "/api/enterprise/business/alert-subscriptions",
    "/api/enterprise/business/data-requests/summary",
    "/api/lineage/graph"
)

Write-Host "`n2. GET business-user endpoints..." -ForegroundColor Cyan
foreach ($path in $endpoints) {
    try {
        $r = Invoke-RestMethod -Method Get -Uri "$BaseUrl$path" -Headers $headers
        $preview = ($r | ConvertTo-Json -Depth 2 -Compress).Substring(0, [Math]::Min(120, (($r | ConvertTo-Json -Compress).Length)))
        Write-Host "   OK $path" -ForegroundColor Green
        Write-Host "      $preview..." -ForegroundColor DarkGray
    } catch {
        Write-Host "   FAIL $path — $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails.Message) { Write-Host "      $($_.ErrorDetails.Message)" -ForegroundColor Red }
    }
}

Write-Host "`nDone. If any FAIL with 500, run migration: alembic upgrade head" -ForegroundColor Yellow
