# Streams Group Dashboard (KIP-1071)

用 Vue 3 + Bun + TypeScript 做的小型 dashboard，把 **Kafka Streams 新的 Streams Rebalance Protocol（KIP-1071，`group.protocol=streams`）** 的 task 分配過程視覺化。

KIP-848 把 consumer group 的 partition assignment 搬到 broker；KIP-1071 延續同樣的設計，讓 **broker 端的 group coordinator 負責 Kafka Streams 的 task assignment**（active / standby task），client 只需要送 heartbeat 和 topology。

![rebalancing](docs/rebalancing.png)

## 跑起來

```bash
bun install
bun run dev      # Bun 模擬器 :3000 + Vite dev server :5173 → 打開 http://localhost:5173
bun test         # assignor / reconciliation 單元測試
bun run start    # build 前端，再由 Bun 在 :3000 一起 serve
```

## 畫面上看得到什麼

| 區塊 | 內容 |
| --- | --- |
| Group | group state、**group epoch**、**target assignment epoch**、topology epoch、`num.standby.replicas`（可調） |
| Topology | 三個範例 Kafka Streams app 的 DSL 與 subtopology（source / repartition / changelog / sink topic、state store）。每個 subtopology 有幾個 input partition 就有幾個 task（`0_0`, `1_3`…） |
| Task assignment | 列 = task、欄 = member（依 process 分組，一個 StreamThread = 一個 member）。實心 = 已擁有、虛線 = target 但還沒拿到、橘色刪除線 = 等待 revoke、紅色 `!` = 該 task 目前沒有人在處理 |
| Coordinator log | 每個 `StreamsGroupHeartbeat` request/response、epoch bump、assignor 計算結果 |

可以操作：**Start new process**、**+ thread**、**leave**（graceful，heartbeat epoch = -1）、**crash**（停止 heartbeat，session timeout 8s 後被 fence）、調整 standby 數量、Pause / Reset。

## 範例 app

| group | subtopologies | tasks |
| --- | --- | --- |
| `word-count` | 0: split & re-key → repartition；1: count（state store） | 4 + 4 |
| `order-enrichment` | 0: orders ⋈ customers（co-partitioned stream-table join） | 3 |
| `page-view-sessions` | 0: session window count，預設 1 個 standby replica | 6 |

## 模擬的 protocol 邏輯

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
server/index.ts          Bun.serve + WebSocket，每 250ms 推 snapshot
src/                     Vue 3 前端（App + 3 個 component）
```

## 限制

這是**模擬器**，不連真的 Kafka，目的是把 protocol 行為看清楚。簡化之處：沒有 warm-up task、lag-based assignment、topology 驗證（`NOT_READY` / missing topics）、static membership。
若要接真的叢集（Kafka 4.1+，broker 開啟 streams group），可以把 `server/` 換成定期呼叫 `StreamsGroupDescribe` API（或 `kafka-streams-groups.sh --describe --members --verbose`）並轉成同樣的 `GroupView` 格式，前端不用改。
