# Streams Group Dashboard (KIP-1071)

用 Vue 3 + Bun + TypeScript 做的小型 dashboard，把 **Kafka Streams 新的 Streams Rebalance Protocol（KIP-1071，`group.protocol=streams`）** 的 task 分配過程視覺化。

KIP-848 把 consumer group 的 partition assignment 搬到 broker；KIP-1071 延續同樣的設計，讓 **broker 端的 group coordinator 負責 Kafka Streams 的 task assignment**（active / standby task），client 只需要送 heartbeat 和 topology。

![rebalancing](docs/rebalancing.png)

## 跑起來

預設接**真的 Kafka 4.1 broker**（Docker），每個「process」都是一個真的 Kafka Streams JVM（`group.protocol=streams`）。

```bash
bun install
docker compose up -d   # Kafka 4.1.0，開啟 streams group protocol
bun run build:java     # 建 streams-app（Java 21 + Gradle）
bun run dev            # 打開 http://localhost:5173
```

沒有 Docker / Java 時可以用模擬器：`MODE=sim bun run dev`。

| 指令 | 用途 |
| --- | --- |
| `bun run check` | 單元測試 + build + traceability + test-plan 檢查（本機 gate） |
| `bun run test:e2e` | 對真 broker 跑 Spec 001 的 E2E |

架構：Bun server 啟動 `streams-app inspect`（Java，包 `Admin#describeStreamsGroups`），每秒輪詢；按「Start new process」會 spawn `streams-app run <app> process-X 1`。規格見 [`docs/specs/001-real-broker/spec.md`](docs/specs/001-real-broker/spec.md)，流程見 [`docs/process/workflow.md`](docs/process/workflow.md)。

## 畫面上看得到什麼

| 區塊 | 內容 |
| --- | --- |
| Group | group state、**group epoch**、**target assignment epoch**、topology epoch、`num.standby.replicas`（可調） |
| Topology | 三個範例 Kafka Streams app 的 DSL 與 subtopology（source / repartition / changelog / sink topic、state store）。每個 subtopology 有幾個 input partition 就有幾個 task（`0_0`, `1_3`…） |
| Task assignment | 列 = task、欄 = member（依 process 分組，一個 StreamThread = 一個 member）。實心 = 已擁有、虛線 = target 但還沒拿到、橘色刪除線 = 等待 revoke、紅色 `!` = 該 task 目前沒有人在處理 |
| Coordinator log | 每個 `StreamsGroupHeartbeat` request/response、epoch bump、assignor 計算結果 |

可以操作：**Start new process**、每個 process 的 **+ thread**、**stop**（SIGTERM，member 立刻 leave）、**kill**（SIGKILL，session timeout 10s 後被 fence）、調整 standby 數量（下次 rebalance 生效，只有 stateful task 會有 standby）、Pause / Reset。

## 範例 app

| group | subtopologies | tasks |
| --- | --- | --- |
| `word-count` | 0: split & re-key → repartition；1: count（state store） | 4 + 4 |
| `order-enrichment` | 0: orders ⋈ customers（co-partitioned stream-table join） | 3 |
| `page-view-sessions` | 0: session window count，預設 1 個 standby replica | 6 |

## 模擬器的 protocol 邏輯

```
member ──StreamsGroupHeartbeat──▶ coordinator
                                   1. membership / config 變更 → group epoch++
                                   2. group epoch > target assignment epoch → 跑 assignor，產生新的 target assignment
                                   3. 逐步 reconcile 每個 member：
                                      a. 先 revoke 不再屬於它的 task  (UNREVOKED_TASKS，member epoch 不動)
                                      b. member 下次 heartbeat 確認 revoke 後，member epoch = target epoch
                                      c. 新的 active task 要等原 owner 釋放後才給 (UNRELEASED_TASKS)
                                      d. 全部拿到 → STABLE
```

- 同一個 active task 在任何時刻**最多只會有一個 owner**（有測試驗證）。沒有 stop-the-world rebalance，沒受影響的 task 持續處理。
- Assignor（`server/assignor.ts`）是 broker 端 sticky task assignor 的簡化版：active task 盡量留在原 owner、剩下的給負載最低的 member；standby 一定放在**不同 process**。
- Group state：`EMPTY` → `ASSIGNING`（target 還沒算）→ `RECONCILING` → `STABLE`。

## 結構

```
shared/types.ts          server 與前端共用型別
server/coordinator.ts    streams group coordinator 模擬（heartbeat、epoch、reconciliation、fencing）
server/assignor.ts       sticky task assignor
server/topologies.ts     三個範例 app
server/index.ts          Bun.serve + WebSocket，每 250ms 推 snapshot；MODE 選 backend
server/sim.ts            模擬器 backend
server/real/             real backend（spawn JVM、輪詢 inspector）與 broker JSON → 畫面的轉換
streams-app/             Java：`run`（Kafka Streams app）與 `inspect`（Admin API → JSON）
e2e/                     對真 broker 的 E2E
src/                     Vue 3 前端（App + 3 個 component）
```

## 限制

- Real 模式：member 的 reconciliation 狀態（UNREVOKED / UNRELEASED）是用 assignment vs target 推導的，broker 沒有直接提供；也沒有 heartbeat 時間。
- 模擬器沒有 warm-up task、lag-based assignment、static membership。
- 已知 workaround 見 [`docs/gardening.md`](docs/gardening.md)。
