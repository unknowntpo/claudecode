"""
Kafka Producer API
==================
Simple FastAPI application that receives HTTP requests and produces messages to Kafka.
Exposes Prometheus metrics for monitoring throughput.
"""

import os
import time
import json
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
from confluent_kafka import Producer, KafkaError
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST

# ============ Configuration ============
KAFKA_BOOTSTRAP_SERVERS = os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'localhost:9093')
KAFKA_TOPIC = os.getenv('KAFKA_TOPIC', 'test-topic')

# ============ FastAPI App ============
app = FastAPI(
    title="Kafka Producer API",
    description="HTTP API that produces messages to Kafka for scalability testing",
    version="1.0.0"
)

# ============ Kafka Producer ============
producer_config = {
    'bootstrap.servers': KAFKA_BOOTSTRAP_SERVERS,
    'queue.buffering.max.messages': 100000,
    'queue.buffering.max.ms': 5,
    'batch.num.messages': 1000,
    'linger.ms': 5,
    'acks': 1,  # Wait for leader acknowledgment only (faster)
}

producer: Optional[Producer] = None

def get_producer() -> Producer:
    global producer
    if producer is None:
        producer = Producer(producer_config)
    return producer

# ============ Prometheus Metrics ============
MESSAGES_SENT_TOTAL = Counter(
    'producer_messages_sent_total',
    'Total number of messages sent to Kafka'
)

MESSAGES_FAILED_TOTAL = Counter(
    'producer_messages_failed_total',
    'Total number of failed message sends'
)

SEND_LATENCY = Histogram(
    'producer_send_latency_seconds',
    'Time spent sending message to Kafka',
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0)
)

MESSAGES_IN_QUEUE = Gauge(
    'producer_messages_in_queue',
    'Number of messages currently in producer queue'
)

REQUESTS_PER_SECOND = Counter(
    'producer_http_requests_total',
    'Total HTTP requests received'
)

# ============ Request/Response Models ============
class MessagePayload(BaseModel):
    data: str = "test"
    timestamp: Optional[str] = None

class SendResponse(BaseModel):
    status: str
    message: Optional[str] = None

# ============ Callbacks ============
delivery_success_count = 0
delivery_fail_count = 0

def delivery_callback(err, msg):
    global delivery_success_count, delivery_fail_count
    if err:
        delivery_fail_count += 1
        MESSAGES_FAILED_TOTAL.inc()
    else:
        delivery_success_count += 1

# ============ API Endpoints ============
@app.on_event("startup")
async def startup_event():
    """Initialize producer on startup"""
    get_producer()
    print(f"Producer started - Kafka: {KAFKA_BOOTSTRAP_SERVERS}, Topic: {KAFKA_TOPIC}")

@app.on_event("shutdown")
async def shutdown_event():
    """Flush and close producer on shutdown"""
    global producer
    if producer:
        producer.flush(timeout=10)
        print("Producer flushed and closed")

@app.post("/send", response_model=SendResponse)
async def send_message(payload: MessagePayload = MessagePayload()):
    """
    Send a message to Kafka.
    This endpoint is the target for load testing.
    """
    REQUESTS_PER_SECOND.inc()
    start_time = time.time()

    try:
        p = get_producer()

        # Add timestamp if not provided
        if not payload.timestamp:
            payload.timestamp = time.strftime('%Y-%m-%dT%H:%M:%S')

        # Produce message
        message_value = json.dumps(payload.dict()).encode('utf-8')
        p.produce(
            KAFKA_TOPIC,
            value=message_value,
            callback=delivery_callback
        )

        # Poll to trigger callbacks (non-blocking)
        p.poll(0)

        # Update metrics
        MESSAGES_SENT_TOTAL.inc()
        SEND_LATENCY.observe(time.time() - start_time)
        MESSAGES_IN_QUEUE.set(len(p))

        return SendResponse(status="ok")

    except KafkaError as e:
        MESSAGES_FAILED_TOTAL.inc()
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        MESSAGES_FAILED_TOTAL.inc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/send/batch")
async def send_batch(count: int = 100):
    """Send multiple messages at once for higher throughput testing"""
    REQUESTS_PER_SECOND.inc()
    start_time = time.time()

    p = get_producer()

    for i in range(count):
        message = {
            "data": f"batch-{i}",
            "timestamp": time.strftime('%Y-%m-%dT%H:%M:%S'),
            "batch_index": i
        }
        p.produce(
            KAFKA_TOPIC,
            value=json.dumps(message).encode('utf-8'),
            callback=delivery_callback
        )

        # Poll every 100 messages
        if i % 100 == 0:
            p.poll(0)

    p.poll(0)

    MESSAGES_SENT_TOTAL.inc(count)
    SEND_LATENCY.observe(time.time() - start_time)

    return {"status": "ok", "count": count}

@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST
    )

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy", "kafka": KAFKA_BOOTSTRAP_SERVERS, "topic": KAFKA_TOPIC}

@app.get("/stats")
async def stats():
    """Get current producer statistics"""
    return {
        "delivery_success": delivery_success_count,
        "delivery_failed": delivery_fail_count,
        "kafka_bootstrap": KAFKA_BOOTSTRAP_SERVERS,
        "topic": KAFKA_TOPIC
    }

# ============ Main ============
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv('PORT', '8000'))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
