# Roadmap

Status: Draft (2026-10-18). Open decisions are marked **Decision**; specs start only after they are made.

## Where we are going

From a Kafka Streams console to a Kafka cluster console. It should show what the cluster is doing (groups,
topics, brokers, mirroring), say what is out of balance, and act on it under explicit control, the way Cruise
Control balances a cluster. The human set this direction on 2026-10-18: cluster management "like Cruise Control",
and managing cluster mirroring.

## Principles (carried over from Specs 001–007)

1. **Broker first**: data comes from the Admin API and broker or group configs, never from settings inside
   the applications (Spec 004; human, 2026-10-18).
2. **Read-only by default**: the console observes. Each write is a separate, specified feature with
   a dry run and an explicit confirmation (today the only write is the standby group config).
3. **Detect, then fall back**: use a newer broker feature when the cluster has it, and say less, never
   something wrong, when it does not (Spec 007 task offsets → Spec 006 inference).
4. **Self-explaining UI** (Spec 005): states, values and affordances. Hidden tips only for facts the screen
   cannot show.
5. **Spec-driven** (`docs/process/workflow.md`): spec, failing tests, implementation, independent verifier.

## Phases

| Phase | Outcome | Main data | Writes |
| --- | --- | --- | --- |
| 0 · Streams groups (done) | Pipelines, tasks, stalled / fenced, changelog size, restore progress | `describeStreamsGroups`, offsets, group configs | standby config |
| 1 · Cluster overview | Brokers, racks, topics, partitions; leaders and replicas per broker; under-replicated and offline partitions; disk per broker and log dir; consumer groups of all types with lag | `describeCluster`, `describeTopics`, `describeLogDirs`, `listGroups`, `describeConsumerGroups`, offsets | none |
| 2 · Balance analysis | What is out of balance and a proposed reassignment with the data it would move (dry run only) | phase 1 data + rates from offset and log-size deltas | none |
| 3 · Controlled reassignment | Execute a proposal with a replication throttle, watch progress, cancel | `alterPartitionReassignments`, `listPartitionReassignments`, throttle configs | reassignments, throttles |
| 4 · Mirroring | Phase 4a: MirrorMaker 2 flows and lag between clusters. Phase 4b: Kafka-native mirror topics (KIP-1279) | 4a: MM2 heartbeats, checkpoints and offset-sync topics. 4b: KIP-1279 Admin APIs once they exist | 4a: none. 4b: to be decided with its spec |

### Phase 1: cluster overview

- Navigation becomes Cluster · Groups · Topics. Streams groups stay as they are, under Groups.
- A first cut: one cluster screen with broker cards (leaders, replicas, disk) and a list of partitions
  that need attention (offline, under-replicated, under min ISR).
- Demo: three brokers in compose with racks, so distribution and rack awareness are visible.

### Phase 2: balance analysis

- Goals in order, each checkable from broker data alone:
  1. rack-aware replicas;
  2. replica count per broker;
  3. leader count per broker;
  4. disk use per broker;
  5. inbound rate per broker (estimated from offset deltas).
- Output: per goal, met or violated with numbers; one proposal that fixes the violated goals in that order,
  with the partitions to move and the bytes to copy.
- Cruise Control models CPU and network too, from a metrics reporter installed on the brokers. That is a
  broker-side install, which principle 1 allows, but it is heavy. See the build-or-integrate decision below.

### Phase 3: controlled reassignment

- Each run is: proposal (phase 2) → dry-run view → confirm → execute with a throttle → progress per
  partition → done or cancel.
- Progress: replicas catching up (`listPartitionReassignments`, log end offsets of the new replicas).
- Needs the write model decided first (below).

### Phase 4: mirroring

- **4a, MirrorMaker 2** (works with today's Kafka). Show source → target flows per topic, and replication
  lag from MM2's internal topics and both clusters' offsets: heartbeats, `<source>.checkpoints.internal`,
  offset syncs. This is read from the brokers; MM2 itself is not touched.
- **4b, KIP-1279 Cluster Mirroring** (Kafka-native mirror topics). Its first PR merged to trunk on 2026-10-12.
  It adds the `mirror-coordinator` module and broker configs, all internal until an early-access release.
  There are no Admin APIs yet. Track trunk, and write the spec when its Admin APIs and RPCs are merged.
- Mirroring needs more than one cluster in the console and in the demo (two compose clusters).

## Decisions needed

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| D1 | Product name and scope | keep "Streams Console" / rename (e.g. "Kafka Console") | Rename at phase 1, when the cluster screen lands |
| D2 | Write model (phase 3, and 4b if it writes) | (a) the console's own Kafka principal + dry run + confirmation + audit log; (b) per-user identities passed through to Kafka ACLs | (a) first: simplest and auditable; (b) only if several operators with different rights use one console |
| D3 | Multi-cluster | one cluster per console / a list of clusters | A list, introduced with phase 4a; phases 1–3 stay one cluster |
| D4 | Balancing: build or integrate Cruise Control | (a) own analyzer on broker data (phase 2); (b) read proposals from an existing Cruise Control REST API; (c) both | (a), then optionally (b) for clusters that already run Cruise Control |
| D5 | Where Admin logic lives | keep growing the Java inspector behind the Bun server / move the API into a Java service | Keep for phase 1, revisit when phase 3 adds writes |
| D6 | Oldest supported Kafka | 4.1 (today) / 4.4 | Keep 4.1 working through principle 3; new features may require newer brokers |

## Not planned

- Hosting or controlling applications (Spec 004).
- Producing or consuming messages from the UI, schema registry, Connect management beyond reading MM2's topics.

## Next step

Decide D1–D4, then write Spec 008 (cluster overview, phase 1 first cut).
