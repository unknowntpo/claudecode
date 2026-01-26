#!/bin/bash
# ============================================
# Stop all services
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "Stopping Docker services..."
docker-compose down

echo "Killing any remaining Python processes..."
pkill -f "producer/app.py" 2>/dev/null || true
pkill -f "consumer/app.py" 2>/dev/null || true

echo "Done."
