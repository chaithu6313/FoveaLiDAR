#!/bin/bash
# FoveaLidar Dashboard - Complete Startup Script
# Run this script to start both backend and frontend servers

echo "=========================================="
echo "FoveaLidar Dashboard - Complete Startup"
echo "=========================================="
echo

# Check if we're in the right directory
if [ ! -f "requirements.txt" ]; then
    echo "ERROR: Please run this from the project root directory"
    exit 1
fi

echo "[1/3] Checking Python environment..."
if [ ! -d "venv" ]; then
    echo "ERROR: Virtual environment not found. Run 'python -m venv venv' first"
    exit 1
fi
echo "  ✓ Virtual environment found"

echo
echo "[2/3] Starting backend (port 8000)..."
echo "      Backend URL: http://localhost:8000"
echo "      WebSocket: ws://localhost:8000/ws/frames"
echo

# Start backend in background
cd "$(dirname "$0")"
./venv/Scripts/python -m uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo "  ✓ Backend started (PID: $BACKEND_PID)"

# Wait for backend to start
sleep 3

# Check if backend is responding
if ! curl -s http://localhost:8000/api/config > /dev/null 2>&1; then
    echo "  ✗ Backend failed to start"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi
echo "  ✓ Backend responding to HTTP requests"

echo
echo "[3/3] Starting frontend (port 5173)..."
echo "      Frontend URL: http://localhost:5173"
echo

# Start frontend
cd frontend
npm run dev

# Cleanup backend when exiting
trap "kill $BACKEND_PID 2>/dev/null" EXIT
