# Kafka Scalability Test

驗證 Kafka consumer 水平擴展能力的測試專案。

## 架構

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌───────────────┐
│   k6    │────▶│  FastAPI    │────▶│    Kafka    │────▶│   Consumer    │
│ 壓測工具 │     │  Producer   │     │  (10 分區)   │     │  (可水平擴展)  │
└─────────┘     └─────────────┘     └─────────────┘     └───────────────┘
                     :8000                :9093              :9100-910x
                       │                                         │
                       └──────────────┬──────────────────────────┘
                                      ▼
                              ┌─────────────┐
                              │ Prometheus  │
                              │   :9090     │
                              └──────┬──────┘
                                     ▼
                              ┌─────────────┐
                              │   Grafana   │
                              │   :3000     │
                              └─────────────┘
```

## 快速開始

### 1. 啟動環境

```bash
# 啟動 Kafka + Prometheus + Grafana
./scripts/start.sh
```

### 2. 啟動 Producer

```bash
uv run python producer/app.py
```

### 3. 啟動 Consumer(s)

```bash
# Terminal 1 - Consumer 1
METRICS_PORT=9100 CONSUMER_ID=consumer-1 uv run python consumer/app.py

# Terminal 2 - Consumer 2
METRICS_PORT=9101 CONSUMER_ID=consumer-2 uv run python consumer/app.py

# Terminal 3 - Consumer 3
METRICS_PORT=9102 CONSUMER_ID=consumer-3 uv run python consumer/app.py
```

### 4. 執行壓測

```bash
k6 run k6/load_test.js
```

### 5. 查看 Dashboard

打開 [http://localhost:3000](http://localhost:3000)
- 帳號: `admin`
- 密碼: `admin`

選擇 **Kafka Scalability Dashboard**

## 自動化測試

執行完整的 scaling 測試：

```bash
./scripts/run_scaling_test.sh
```

這會自動執行 1、2、3 個 consumer 的測試並比較 throughput。

## 服務端口

| 服務 | 端口 | 說明 |
|------|------|------|
| Producer API | 8000 | FastAPI HTTP endpoint |
| Kafka (external) | 9093 | Kafka broker |
| Kafka UI | 8080 | Web UI for Kafka |
| Prometheus | 9090 | Metrics aggregation |
| Grafana | 3000 | Dashboard |
| Consumer 1 metrics | 9100 | Prometheus metrics |
| Consumer 2 metrics | 9101 | Prometheus metrics |
| Consumer 3 metrics | 9102 | Prometheus metrics |

## 預期結果

| Consumer 數量 | 預期 Throughput |
|--------------|-----------------|
| 1 | X msg/s (基準) |
| 2 | ~2X msg/s |
| 3 | ~3X msg/s |
| N (N ≤ 10) | ~NX msg/s |

> **注意**: 當 consumer 數量超過 partition 數量 (10) 時，多餘的 consumer 會閒置。

## Dashboard 說明

### Overview Panel
- **Producer HTTP QPS**: Producer 接收的 HTTP 請求數/秒
- **Total Consumer Throughput**: 所有 consumer 的總處理量
- **Active Consumers**: 當前活躍的 consumer 數量
- **Producer P95 Latency**: Producer 發送延遲的 P95 值

### Throughput Comparison
- **Producer vs Consumer Throughput**: 對比圖，驗證 consumer 是否跟得上 producer

### Per-Consumer Throughput
- **Stacked Chart**: 堆疊圖顯示每個 consumer 的貢獻
- **Bar Chart**: 條形圖直觀比較各 consumer 的 throughput

### Scaling Analysis
- **Consumer/Producer Ratio**: 應接近 100%，表示 consumer 能處理所有訊息
- **Avg Throughput per Consumer**: 應保持穩定，證明線性擴展

## 環境變數

### Producer

| 變數 | 預設值 | 說明 |
|------|--------|------|
| KAFKA_BOOTSTRAP_SERVERS | localhost:9093 | Kafka 地址 |
| KAFKA_TOPIC | test-topic | Topic 名稱 |
| PORT | 8000 | HTTP 服務端口 |

### Consumer

| 變數 | 預設值 | 說明 |
|------|--------|------|
| KAFKA_BOOTSTRAP_SERVERS | localhost:9093 | Kafka 地址 |
| KAFKA_TOPIC | test-topic | Topic 名稱 |
| CONSUMER_GROUP | scalability-test-group | Consumer group ID |
| CONSUMER_ID | hostname | Consumer 識別名稱 |
| METRICS_PORT | 9100 | Prometheus metrics 端口 |

## 停止服務

```bash
./scripts/stop.sh
```

## 依賴

- Docker & Docker Compose
- Python 3.10+
- uv (Python package manager)
- k6 (load testing tool)

### 安裝 k6

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### 安裝 uv

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```
