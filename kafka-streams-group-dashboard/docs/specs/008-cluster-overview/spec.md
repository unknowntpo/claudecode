# Spec 008: Cluster overview (roadmap phase 1, first cut)

Status: Accepted (2026-10-19, human: "ok, go" on the roadmap's next step; D1 rename at phase 1)
Date: 2026-10-19
Traceability: enforced
Builds on: Specs 003–007, docs/roadmap.md (phase 1, decisions D1, D3)

## Intent

The console opens on the cluster: an operator sees the brokers (rack, leaders, replicas, disk), which broker is
the controller, and which partitions need attention, before going into consumer workloads. The product becomes
**Kafka Console** (D1). Streams groups move under Groups, unchanged.

## Evidence

- The console only knew streams groups; a broker down was invisible unless a group happened to stall.
- What the Admin API gives without any application or broker setting: `describeCluster` (live brokers, rack,
  cluster id), `describeMetadataQuorum` (the active controller = quorum leader; `describeCluster().controller()`
  is a random live broker in KRaft, KIP-590, found on the demo 2026-10-19: five calls named 2, 1, 3, 2, 2), `listTopics` + `describeTopics` (leader, replicas, ISR per partition), `describeLogDirs`
  (bytes per replica; needs cluster DESCRIBE). A stopped broker is absent from `describeCluster` but stays in the
  partitions' replica lists.
- Roadmap D3: one cluster per console until phase 4a.

## Example

Captured 2026-10-19 from the three-broker demo (`GET /cluster`, 38 ms):

| | before | `docker compose stop kafka-3` (+15 s) |
| --- | --- | --- |
| live brokers | 1 rack-a, 2 rack-b, 3 rack-c | 1 rack-a, 2 rack-b |
| active controller (quorum leader) | 1 | 1 (re-captured after the controller fix) |
| topics / partitions | 12 / 110 | 12 / 110 |
| leaders per broker | 1: 36, 2: 37, 3: 37 | 1: 61, 2: 49 |
| replicas per broker | 110 each | 110 each (3 still listed) |
| disk (bytes) | 417,524 each | 1: 587,676, 2: 587,790, 3: unknown |
| under-replicated | 0 | 110 (e.g. `__consumer_offsets-0` replicas [1,2,3], ISR [1,2]) |
| offline | 0 | 0 |
| streams groups | 3 STABLE | 3 STABLE |
| `docker compose start kafka-3` (+40 s) | | broker 3 online, under-replicated 0; its leaders stay 0 until Kafka's leader rebalance (a phase 2 finding) |

Console after the stop: broker card 3 grey **offline** (rack-c, 110 replicas, leaders 0, disk —); controller
badge on the quorum leader; metric "Under-replicated 110"; the attention list shows those partitions with ISR missing 3.

## Behavior

1. **Demo**: three KRaft nodes, each broker and controller, racks `rack-a/b/c`, host ports 9092/9094/9096;
   `default.replication.factor=3`, `min.insync.replicas=2`; demo topics replication factor 3. The console and the
   apps bootstrap from all three, so one broker down does not cut them off.
2. **Inspector** `GET /cluster` → `{ clusterId, controllerId (metadata quorum leader, null if refused), brokers: [{ id, host, port, rack }], topics: [{ name,
   internal, partitions: [{ partition, leader (-1 none), replicas, isr }] }], logDirBytes: { "<id>": bytes } | null }`.
3. **Cluster view** (pure): one card per broker known from `brokers` or from any replica list, ordered by id:
   online (listed) or offline (only in replica lists); controller; rack; leaders (partitions it leads); replicas
   (partitions it holds); disk (its `logDirBytes`, null when unknown). Totals: brokers online / known, topics,
   partitions, under-replicated (a leader, and an ISR smaller than the replicas), offline (no leader; not also
   counted as under-replicated).
4. **Attention list**: every offline or under-replicated partition, offline first, then by topic and partition;
   each with leader, replicas and the replicas missing from the ISR. Internal topics included.
5. **Backend**: polls `/cluster` with each groups poll; a failed `/cluster` keeps the last cluster view and shows
   its error on the cluster page only; groups keep working.
6. **Navigation and rename**: `#/` is the cluster page, `#/groups` the streams groups overview, `#/group/<id>` a
   group; anything else is the cluster page. Sidebar: brand **Kafka Console**; "Cluster" (dot red when a broker
   is offline or a partition offline, amber when partitions are under-replicated, else active), then Groups with
   "Streams groups" and the groups as before.

## Simplification review

1. **Question**: under-min-ISR needs every topic's `min.insync.replicas` (a describeConfigs per topic): later.
   Topic pages: phase 1 second cut.
2. **Delete**: no per-partition table for healthy partitions; the attention list only.
3. **Simplify**: one `/cluster` call, one pure mapping, one page.
4. **Shorten the cycle**: table cases for the view; one E2E for the contract; the broker-down demo.
5. **Automate**: none.

## Acceptance

### Behavior
- CL1: inspector against the demo → `GET /cluster` lists brokers 1–3 with racks a–c, the metadata quorum leader as controller (the same on repeated calls), `text-lines` with 12 partitions of 3 replicas, and bytes for each broker.
- CL2: cluster view (table cases): online and offline brokers, controller, leaders, replicas, disk; totals; the attention list and its order.
- CL3: routes: `#/` cluster, `#/groups` streams overview, `#/group/<id>` a known group, anything else cluster.
- CL4: sidebar cluster dot: offline broker or partition → fenced, under-replicated → revoking, else active.

### Failure and retry
- CL5: `/cluster` fails while `/groups` answers → groups update, the last cluster view stays, the cluster error is set; the next good poll clears it.

### Budget
- CL6: [measure] `GET /cluster` on the demo, median of 20 under 200 ms.

### Observability
- CL7: [deploy] `docker compose stop kafka-3` → within 15 s card 3 offline, the controller badge on a live broker, under-replicated count and list match the inspector, streams groups still update; `start` → back to 0.
- CL8: [deploy] `bun run test:e2e` passes on the three-broker demo.

### Test plan: cluster view (CL2)

<!-- test-plan:start server/real/cluster.cases.ts -->
| id | case | brokers | controller | partitions | disk | cards | totals | attention |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CL2 | three healthy brokers | 1:a 2:b 3:c | 3 | t-0 L1 R1,2,3 I1,2,3; t-1 L2 R2,3,1 I2,3,1 | 1=10 2=20 3=30 | 1 a L1 R2 d10 \| 2 b L1 R2 d20 \| 3 ctl c L0 R2 d30 | brokers 3/3 topics 1 partitions 2 ur 0 off 0 |  |
| CL2 | a stopped broker stays as an offline card from the replica lists | 1:a 2:b | 2 | t-0 L1 R1,2,3 I1,2; t-1 L2 R2,3,1 I2,1 | 1=10 2=20 | 1 a L1 R2 d10 \| 2 ctl b L1 R2 d20 \| 3 offline - L0 R2 d- | brokers 2/3 topics 1 partitions 2 ur 2 off 0 | t-0 ur -3 \| t-1 ur -3 |
| CL2 | an offline partition comes first | 1:a 2:b | 1 | a-0 L1 R1,2 I1; b-0 L-1 R3 I | 1=1 2=2 | 1 ctl a L1 R1 d1 \| 2 b L0 R1 d2 \| 3 offline - L0 R1 d- | brokers 2/3 topics 2 partitions 2 ur 1 off 1 | b-0 offline \| a-0 ur -2 |
| CL2 | then by topic and numeric partition | 1:a 2:b | 1 | b-1 L1 R1,2 I1; a-10 L1 R1,2 I1; a-2 L1 R1,2 I1 | - | 1 ctl a L3 R3 d- \| 2 b L0 R3 d- | brokers 2/2 topics 2 partitions 3 ur 3 off 0 | a-2 ur -2 \| a-10 ur -2 \| b-1 ur -2 |
| CL2 | no controller and no rack | 1:- 2:- | - | t-0 L2 R1,2 I1,2 | 1=0 2=0 | 1 - L0 R1 d0 \| 2 - L1 R1 d0 | brokers 2/2 topics 1 partitions 1 ur 0 off 0 |  |
<!-- test-plan:end -->

## Non-goals

- Under-min-ISR, topic pages, consumer groups of other types (phase 1, later cuts).
- Any write to the cluster (phase 3).
