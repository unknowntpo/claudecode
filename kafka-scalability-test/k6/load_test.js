/**
 * Kafka Scalability Load Test
 * ============================
 * k6 script for testing Producer API throughput
 *
 * Usage:
 *   k6 run k6/load_test.js
 *   k6 run --vus 50 --duration 30s k6/load_test.js
 *   k6 run k6/load_test.js --env TARGET_QPS=2000
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend, Gauge } from 'k6/metrics';

// ============ Custom Metrics ============
const successRate = new Rate('success_rate');
const requestDuration = new Trend('request_duration_ms');
const messagesPerSecond = new Gauge('messages_per_second');

// ============ Configuration ============
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const TARGET_QPS = parseInt(__ENV.TARGET_QPS) || 1000;

// ============ Test Scenarios ============
export const options = {
  scenarios: {
    // Scenario 1: Ramp up to find max QPS
    ramp_up_test: {
      executor: 'ramping-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: '10s', target: 500 },    // Warm up to 500 QPS
        { duration: '20s', target: 1000 },   // Increase to 1000 QPS
        { duration: '20s', target: 1500 },   // Push to 1500 QPS
        { duration: '20s', target: 2000 },   // Push to 2000 QPS
        { duration: '30s', target: 2000 },   // Sustain 2000 QPS
        { duration: '10s', target: 500 },    // Cool down
      ],
    },
  },

  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],  // 95% < 200ms, 99% < 500ms
    success_rate: ['rate>0.99'],                     // 99% success rate
    http_req_failed: ['rate<0.01'],                  // Less than 1% failures
  },
};

// ============ Test Function ============
export default function () {
  const payload = JSON.stringify({
    data: `load-test-${__VU}-${__ITER}`,
    timestamp: new Date().toISOString(),
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: '10s',
  };

  const startTime = Date.now();
  const res = http.post(`${BASE_URL}/send`, payload, params);
  const duration = Date.now() - startTime;

  // Record metrics
  requestDuration.add(duration);

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'response has ok status': (r) => {
      try {
        return r.json('status') === 'ok';
      } catch {
        return false;
      }
    },
    'response time < 200ms': (r) => r.timings.duration < 200,
  });

  successRate.add(success ? 1 : 0);
}

// ============ Lifecycle Hooks ============
export function setup() {
  console.log('========================================');
  console.log('  Kafka Scalability Load Test');
  console.log('========================================');
  console.log(`Target URL: ${BASE_URL}`);
  console.log(`Target QPS: ${TARGET_QPS}`);
  console.log('');

  // Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  if (healthRes.status !== 200) {
    console.error('Health check failed! Make sure the producer is running.');
    return { healthy: false };
  }

  console.log('Producer health check: OK');
  console.log('Starting load test...');
  console.log('');

  return { healthy: true, startTime: Date.now() };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;

  console.log('');
  console.log('========================================');
  console.log('  Load Test Complete');
  console.log('========================================');
  console.log(`Total duration: ${duration.toFixed(1)}s`);
  console.log('');
  console.log('Check Grafana dashboard for detailed metrics:');
  console.log('  http://localhost:3000');
  console.log('');
}

// ============ Alternative Scenarios ============
// Uncomment to use different scenarios

/*
// Constant rate test
export const options = {
  scenarios: {
    constant_rate: {
      executor: 'constant-arrival-rate',
      rate: 1000,           // 1000 requests per second
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
  },
};
*/

/*
// Step-wise increase for scaling test
export const options = {
  scenarios: {
    steps: {
      executor: 'ramping-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: '30s', target: 500 },   // 1 consumer should handle
        { duration: '30s', target: 1000 },  // 2 consumers needed
        { duration: '30s', target: 1500 },  // 3 consumers needed
        { duration: '30s', target: 2000 },  // 4 consumers needed
      ],
    },
  },
};
*/
