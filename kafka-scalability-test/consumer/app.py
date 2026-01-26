"""
Kafka Consumer
==============
Consumes messages from Kafka and exposes Prometheus metrics.
Can run multiple instances for horizontal scaling testing.
"""

import os
import sys
import time
import signal
import json
import socket
from threading import Thread
from confluent_kafka import Consumer, KafkaError, TopicPartition
from prometheus_client import Counter, Gauge, Histogram, start_http_server, Info

# ============ Configuration ============
KAFKA_BOOTSTRAP_SERVERS = os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'localhost:9093')
KAFKA_TOPIC = os.getenv('KAFKA_TOPIC', 'test-topic')
CONSUMER_GROUP = os.getenv('CONSUMER_GROUP', 'scalability-test-group')
METRICS_PORT = int(os.getenv('METRICS_PORT', '9100'))
CONSUMER_ID = os.getenv('CONSUMER_ID', socket.gethostname())

# ============ Prometheus Metrics ============
MESSAGES_CONSUMED_TOTAL = Counter(
    'consumer_messages_consumed_total',
    'Total number of messages consumed from Kafka',
    ['consumer_id', 'partition']
)

MESSAGES_PER_SECOND = Gauge(
    'consumer_messages_per_second',
    'Current consumption rate (messages per second)',
    ['consumer_id']
)

TOTAL_THROUGHPUT = Gauge(
    'consumer_total_throughput',
    'Total throughput across all consumers (updated by each consumer)'
)

PROCESSING_LATENCY = Histogram(
    'consumer_processing_latency_seconds',
    'Time to process a message',
    ['consumer_id'],
    buckets=(0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1)
)

CONSUMER_LAG = Gauge(
    'consumer_lag',
    'Number of messages behind the latest offset',
    ['consumer_id', 'partition']
)

ASSIGNED_PARTITIONS = Gauge(
    'consumer_assigned_partitions',
    'Number of partitions assigned to this consumer',
    ['consumer_id']
)

CONSUMER_INFO = Info(
    'consumer',
    'Consumer information'
)

# ============ Global State ============
running = True
message_count_window = 0
window_start_time = time.time()

def signal_handler(sig, frame):
    global running
    print(f"\n[{CONSUMER_ID}] Received shutdown signal, stopping...")
    running = False

# ============ Consumer Logic ============
def on_assign(consumer, partitions):
    """Callback when partitions are assigned"""
    partition_list = [p.partition for p in partitions]
    print(f"[{CONSUMER_ID}] Assigned partitions: {partition_list}")
    ASSIGNED_PARTITIONS.labels(consumer_id=CONSUMER_ID).set(len(partitions))

def on_revoke(consumer, partitions):
    """Callback when partitions are revoked"""
    partition_list = [p.partition for p in partitions]
    print(f"[{CONSUMER_ID}] Revoked partitions: {partition_list}")

def create_consumer() -> Consumer:
    """Create and configure Kafka consumer"""
    config = {
        'bootstrap.servers': KAFKA_BOOTSTRAP_SERVERS,
        'group.id': CONSUMER_GROUP,
        'client.id': CONSUMER_ID,
        'auto.offset.reset': 'latest',
        'enable.auto.commit': True,
        'auto.commit.interval.ms': 1000,
        'fetch.min.bytes': 1,
        'fetch.wait.max.ms': 100,
        'max.poll.interval.ms': 300000,
        'session.timeout.ms': 10000,
    }
    return Consumer(config)

def process_message(msg):
    """Process a consumed message"""
    start = time.time()

    # Simulate minimal processing (just decode)
    try:
        value = json.loads(msg.value().decode('utf-8'))
    except:
        value = msg.value()

    PROCESSING_LATENCY.labels(consumer_id=CONSUMER_ID).observe(time.time() - start)
    return value

def throughput_reporter():
    """Background thread to report throughput every second"""
    global message_count_window, window_start_time

    while running:
        time.sleep(1)

        elapsed = time.time() - window_start_time
        if elapsed > 0:
            rate = message_count_window / elapsed
            MESSAGES_PER_SECOND.labels(consumer_id=CONSUMER_ID).set(rate)

            if message_count_window > 0:
                print(f"[{CONSUMER_ID}] Throughput: {rate:.1f} msg/s (total: {message_count_window} in {elapsed:.1f}s)")

        # Reset window
        message_count_window = 0
        window_start_time = time.time()

def main():
    global running, message_count_window

    # Setup signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Set consumer info
    CONSUMER_INFO.info({
        'consumer_id': CONSUMER_ID,
        'group_id': CONSUMER_GROUP,
        'bootstrap_servers': KAFKA_BOOTSTRAP_SERVERS,
        'topic': KAFKA_TOPIC
    })

    # Start Prometheus metrics server
    print(f"[{CONSUMER_ID}] Starting metrics server on port {METRICS_PORT}")
    start_http_server(METRICS_PORT)

    # Start throughput reporter thread
    reporter_thread = Thread(target=throughput_reporter, daemon=True)
    reporter_thread.start()

    # Create consumer
    consumer = create_consumer()
    consumer.subscribe([KAFKA_TOPIC], on_assign=on_assign, on_revoke=on_revoke)

    print(f"[{CONSUMER_ID}] Consumer started")
    print(f"[{CONSUMER_ID}] Kafka: {KAFKA_BOOTSTRAP_SERVERS}")
    print(f"[{CONSUMER_ID}] Topic: {KAFKA_TOPIC}")
    print(f"[{CONSUMER_ID}] Group: {CONSUMER_GROUP}")
    print(f"[{CONSUMER_ID}] Metrics: http://localhost:{METRICS_PORT}/metrics")
    print("-" * 50)

    total_messages = 0

    try:
        while running:
            msg = consumer.poll(timeout=1.0)

            if msg is None:
                continue

            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    # End of partition (normal)
                    continue
                else:
                    print(f"[{CONSUMER_ID}] Error: {msg.error()}")
                    continue

            # Process message
            process_message(msg)

            # Update metrics
            partition = msg.partition()
            MESSAGES_CONSUMED_TOTAL.labels(
                consumer_id=CONSUMER_ID,
                partition=str(partition)
            ).inc()

            message_count_window += 1
            total_messages += 1

    except Exception as e:
        print(f"[{CONSUMER_ID}] Exception: {e}")
    finally:
        print(f"[{CONSUMER_ID}] Closing consumer...")
        consumer.close()
        print(f"[{CONSUMER_ID}] Total messages consumed: {total_messages}")

if __name__ == "__main__":
    main()
