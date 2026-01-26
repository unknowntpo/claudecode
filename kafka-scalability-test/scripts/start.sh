#!/bin/bash
# ============================================
# Kafka Scalability Test - Startup Script
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "============================================"
echo "  Kafka Scalability Test Environment"
echo "============================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step 1: Start Docker services
echo -e "${BLUE}[1/4] Starting Docker services...${NC}"
docker-compose up -d

echo "Waiting for Kafka to be ready..."
sleep 15

# Step 2: Create topic if not exists
echo -e "${BLUE}[2/4] Creating Kafka topic...${NC}"
docker exec kafka kafka-topics --create \
    --topic test-topic \
    --partitions 10 \
    --replication-factor 1 \
    --bootstrap-server localhost:9092 \
    2>/dev/null || echo "Topic already exists or will be auto-created"

# Step 3: Install Python dependencies
echo -e "${BLUE}[3/4] Installing Python dependencies with uv...${NC}"
if command -v uv &> /dev/null; then
    uv sync
else
    echo -e "${YELLOW}uv not found, using pip...${NC}"
    pip install -e .
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Environment Ready!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Services:"
echo "  - Kafka:      localhost:9093 (external)"
echo "  - Kafka UI:   http://localhost:8080"
echo "  - Prometheus: http://localhost:9090"
echo "  - Grafana:    http://localhost:3000 (admin/admin)"
echo ""
echo "Next steps:"
echo ""
echo -e "  ${YELLOW}1. Start Producer:${NC}"
echo "     uv run python producer/app.py"
echo ""
echo -e "  ${YELLOW}2. Start Consumer(s):${NC}"
echo "     METRICS_PORT=9100 CONSUMER_ID=consumer-1 uv run python consumer/app.py"
echo "     METRICS_PORT=9101 CONSUMER_ID=consumer-2 uv run python consumer/app.py"
echo "     METRICS_PORT=9102 CONSUMER_ID=consumer-3 uv run python consumer/app.py"
echo ""
echo -e "  ${YELLOW}3. Run Load Test:${NC}"
echo "     k6 run k6/load_test.js"
echo ""
echo -e "  ${YELLOW}4. View Dashboard:${NC}"
echo "     Open http://localhost:3000 -> Kafka Scalability Dashboard"
echo ""
