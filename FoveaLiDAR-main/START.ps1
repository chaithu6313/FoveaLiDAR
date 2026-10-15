# FoveaLidar Dashboard - Complete Startup Script (PowerShell)
# Run this script to start both backend and frontend servers

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "FoveaLidar Dashboard - Complete Startup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host

# Check if we're in the right directory
if (-not (Test-Path "requirements.txt")) {
    Write-Host "ERROR: Please run this from the project root directory" -ForegroundColor Red
    exit 1
}

Write-Host "[1/3] Checking Python environment..." -ForegroundColor Green
if (-not (Test-Path "venv")) {
    Write-Host "ERROR: Virtual environment not found. Run 'python -m venv venv' first" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Virtual environment found" -ForegroundColor Green

Write-Host
Write-Host "[2/3] Starting backend (port 8000)..." -ForegroundColor Green
Write-Host "      Backend URL: http://localhost:8000" -ForegroundColor Gray
Write-Host "      WebSocket: ws://localhost:8000/ws/frames" -ForegroundColor Gray
Write-Host

# Start backend in background
$projectRoot = $PSScriptRoot
$backendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    $env:PYTHONPATH = "."
    .\venv\Scripts\python -m uvicorn src.api.main:app --host 127.0.0.1 --port 8000
} -ArgumentList $projectRoot
Write-Host "  ✓ Backend started (Job ID: $($backendJob.Id))" -ForegroundColor Green

# Wait for backend to start
Start-Sleep -Seconds 3

# Check if backend is responding
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/api/config" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    Write-Host "  ✓ Backend responding to HTTP requests" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Backend failed to start" -ForegroundColor Red
    Stop-Job -Job $backendJob
    exit 1
}

Write-Host
Write-Host "[3/3] Starting frontend (port 5173)..." -ForegroundColor Green
Write-Host "      Frontend URL: http://localhost:5173" -ForegroundColor Gray
Write-Host

# Start frontend
cd frontend
npm run dev

# Cleanup when exiting
Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
