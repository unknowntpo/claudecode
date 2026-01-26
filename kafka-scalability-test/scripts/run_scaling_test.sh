#!/bin/bash
# ============================================
# Automated Scaling Test Script
# ============================================
# This script demonstrates linear scaling by running tests
# with different numbers of consumers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Arrays to store PIDs
CONSUMER_PIDS=()

cleanup() {
    echo ""
    echo -e "${YELLOW}Cleaning up...${NC}"
    for pid in "${CONSUMER_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    kill "$PRODUCER_PID" 2>/dev/null || true
    echo "Done."
}

trap cleanup EXIT

start_consumer() {
    local id=$1
    local port=$((9100 + id - 1))
    echo -e "${BLUE}Starting Consumer $id (metrics port: $port)${NC}"
    METRICS_PORT=$port CONSUMER_ID="consumer-$id" uv run python consumer/app.py &
    CONSUMER_PIDS+=($!)
    sleep 2
}

run_test() {
    local num_consumers=$1
    local duration=${2:-60}

    echo ""
    echo "============================================"
    echo -e "  ${GREEN}TEST: $num_consumers Consumer(s)${NC}"
    echo "============================================"

    # Start producer
    echo -e "${BLUE}Starting Producer...${NC}"
    uv run python producer/app.py &
    PRODUCER_PID=$!
    sleep 3

    # Start consumers
    for i in $(seq 1 $num_consumers); do
        start_consumer $i
    done

    # Wait for consumers to join group
    sleep 5

    # Run k6 test
    echo ""
    echo -e "${YELLOW}Running k6 load test for ${duration}s...${NC}"
    echo "Watch the Grafana dashboard: http://localhost:3000"
    echo ""

    k6 run --duration "${duration}s" k6/load_test.js || true

    echo ""
    echo -e "${GREEN}Test with $num_consumers consumer(s) complete!${NC}"
    echo ""

    # Cleanup for next test
    for pid in "${CONSUMER_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    CONSUMER_PIDS=()
    kill "$PRODUCER_PID" 2>/dev/null || true

    sleep 5
}

echo "============================================"
echo "  Kafka Scalability - Scaling Test"
echo "============================================"
echo ""
echo "This script will run tests with 1, 2, and 3 consumers"
echo "to demonstrate linear scaling."
echo ""
echo "Prerequisites:"
echo "  - Docker services running (./scripts/start.sh)"
echo "  - k6 installed"
echo ""
read -p "Press Enter to start the scaling test..."

# Test with 1 consumer
run_test 1 45

# Test with 2 consumers
run_test 2 45

# Test with 3 consumers
run_test 3 45

echo ""
echo "============================================"
echo -e "  ${GREEN}All Tests Complete!${NC}"
echo "============================================"
echo ""
echo "Check Grafana dashboard to compare throughput:"
echo "  http://localhost:3000"
echo ""
echo "Expected results:"
echo "  1 consumer:  ~X msg/s"
echo "  2 consumers: ~2X msg/s"
echo "  3 consumers: ~3X msg/s"
echo ""
