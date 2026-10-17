# Spec 002: Streams Console

Status: Accepted (2026-10-17, human: "照你建議先做一版")
Date: 2026-10-17
Traceability: enforced
Builds on: Spec 001 (real-broker mode), the Streams Console design system
(<https://claude.ai/artifact/FBr69Pi42psrJXtz6wSZxy>)

## Intent

An engineer opens the dashboard and sees, the way Flink's web UI shows a job, **the pipeline with data
actually flowing**: records per second on every topic, lag per subtopology, then the tasks, members and
configuration behind it. Today the dashboard shows the assignment only, and no record ever flows.

## Evidence

- Spec 001 deleted the demo producer ("assignment does not depend on records flowing"). The human now asks
  to "see the real flowing things" (2026-10-17): the producer comes back, with sink topics.
- The broker already reports what the flow view needs: topic end offsets (`Admin#listOffsets`), the group's
  committed offsets (`Admin#listStreamsGroupOffsets`, present in kafka-clients 4.1.0), and group configs
  with their source (`describeConfigs`).

## Example

word-count, one process, producer at 5 lines/s (values illustrate the shape; the verifier captures real ones):

| Edge / node | Shown |
| --- | --- |
| `text-lines` → Subtopology 0 | `text-lines` · 5.0 rec/s |
| Subtopology 0 → Subtopology 1 | `word-count-counts-store-repartition` · ≈ 40 rec/s (≈ 8 words per line) |
| Subtopology 1 store | `↻ counts-store` · `word-count-counts-store-changelog` |
| Subtopology 1 → `word-counts` | `word-counts` · > 0 rec/s (commit interval 1 s) |
| Subtopology 0 | 4 tasks, lag ≈ 0 |
| after `kill` of the only process | Subtopology 0 lag grows by ≈ 5 per second |

## Behavior

1. **Producer** (inspector): one background loop writes demo records: `text-lines` 5 lines/s,
   `page-views` 5/s keyed `user-0..19`, `orders` 3/s keyed `cust-0..9`, `customers` 1/s keyed `cust-0..9`.
   The inspector also creates the sink topics `word-counts`, `enriched-orders`, `user-sessions` (1 partition).
2. **Inspector contract**, added to each group in `GET /groups`:
   - `topics`: `[{ "name", "kind": "source|repartition|changelog|sink", "endOffset" }]` for every topic of the
     group's topology plus its sink topics (static per app), `endOffset` = sum over partitions, omitted when
     the topic does not exist yet;
   - `committed`: `{ "<topic>": <sum of committed offsets> }` for the group's source and repartition topics;
   - `configs`: `[{ "key", "value", "source": "group|default" }]` for `streams.session.timeout.ms`,
     `streams.heartbeat.interval.ms`, `streams.num.standby.replicas`.
3. **Flow math** (Bun, per poll): a topic's rate = Δ`endOffset` / Δt in records/s; `null` on the first poll,
   when Δt ≤ 0, when the offset went down (topic recreated) or the topic is missing. A subtopology's lag =
   Σ over its source and repartition topics of (`endOffset` − `committed`), each term clamped at 0; `null` when
   any of those topics has no committed offset or no end offset, or the subtopology has no input topics.
4. **Layout** (`pipelineLayout`): source topics → subtopologies in data-flow order (a subtopology whose inputs
   are another's repartition sink comes after it) → sink topics. Each edge carries its topic, kind and rate.
5. **UI** in the design system: header (group name, `StateBadge`, `MetricStat`s: group epoch, target
   assignment epoch, members, tasks, input rate), `PipelineGraph`, inspector tabs **Tasks**
   (`AssignmentMatrix`, filtered to the selected subtopology), **Configuration** (`ConfigTable`), **Log**
   (`EventLog`). Process actions stay in the matrix heads. Light and dark themes.
6. **Startup**: `bun run dev` keeps the existing behavior; the human starts processes from the UI.

## Simplification review

1. **Question** — rates/lag: the human asked to see flow. Configs tab: Flink parity, and it explains Spec 001's
   timeouts. Per-task lag: not asked; per-subtopology lag is enough to see a stall. → per-task lag deleted.
2. **Delete** — charts/sparklines, per-partition offsets, throughput history: not asked. Task detail popover: later.
3. **Simplify** — offsets are summed per topic in the inspector; rates are computed in Bun from two polls; no
   new endpoint.
4. **Shorten the cycle** — layout, rate, lag and node filter are pure functions with case files.
5. **Automate** — E2E for flow (CS5, CS6, CS8, CS11) beside Spec 001's.

## Acceptance

### Behavior
- CS1: pipeline layout rows below (chain, join, single node, empty topology).
- CS2: rate rows below.
- CS3: lag rows below.
- CS4: selecting subtopology 1 → the Tasks tab lists only `1_x` tasks; no selection → all tasks.
- CS5: inspector running → `GET /groups?ids=word-count` → `topics` lists `text-lines` (source), the repartition, changelog and `word-counts` (sink) topics; `configs` lists the three keys, `streams.session.timeout.ms` with source `group`.

### Failure and retry
- CS6: one word-count process running → within 30 s the `text-lines` rate is > 0 and the `word-counts` end offset increases (records flow end to end).
- CS7: inspector unreachable on a poll → every rate becomes `null` (shown as "—"), never 0.
- CS8: the only process is killed → within 15 s Subtopology 0 lag is larger than before the kill.
- CS9: a topic that does not exist yet → its rate is `null` and the graph still renders (rows below).
- CS10: the first poll after start → all rates `null` (rows below).

### Budget
- CS11: inspector running → 20 calls of `GET /groups` for the three groups → slowest < 1000 ms (measured value printed by the test).

### Observability
- CS12: [deploy] in the running console, the verifier sees rec/s on the edges, lag on the nodes, and the state badge, in light and dark (screenshots).

### Test plan: layout (CS1)

<!-- test-plan:start server/real/layout.cases.ts -->
| id | case | subtopologies | sinks | expected |
| --- | --- | --- | --- | --- |
| CS1 | word-count: two subtopologies joined by a repartition topic | 1:rep>;0:text-lines>rep | word-counts | [text-lines] → 0 → [rep] → 1 → [word-counts] |
| CS1 | ids opposite to the data flow: 0 reads the repartition topic 1 writes | 0:rep>;1:text-lines>rep | out | [text-lines] → 1 → [rep] → 0 → [out] |
| CS1 | order-enrichment: two source topics into one node (join) | 0:orders,customers> | enriched-orders | [orders, customers] → 0 → [enriched-orders] |
| CS1 | page-view-sessions: one stateful node | 0:page-views> | user-sessions | [page-views] → 0 → [user-sessions] |
| CS1 | no topology yet (EMPTY group) |  | word-counts |  |
<!-- test-plan:end -->

### Test plan: flow (CS2, CS3, CS9, CS10)

<!-- test-plan:start server/real/flow.cases.ts -->
| id | case | previous | next | elapsedMs | lagInputs | expected |
| --- | --- | --- | --- | --- | --- | --- |
| CS2 | 25 records in 5 s | 100 | 125 | 5000 |  | 5 |
| CS2 | no new records | 125 | 125 | 1000 |  | 0 |
| CS2 | offset went down (topic recreated) | 125 | 3 | 1000 |  | — |
| CS2 | no time elapsed | 100 | 125 | 0 |  | — |
| CS9 | topic does not exist yet | — | — | 1000 |  | — |
| CS9 | topic appeared since the last poll | — | 40 | 1000 |  | — |
| CS10 | first poll after start | — | 125 | 0 |  | — |
| CS3 | one input topic | — | — | 0 | 120/100 | 20 |
| CS3 | two input topics summed | — | — | 0 | 120/100,50/45 | 25 |
| CS3 | committed ahead of end is clamped to 0 | — | — | 0 | 100/104 | 0 |
| CS3 | an input without committed offset | — | — | 0 | 120/- | — |
| CS3 | no input topics | — | — | 0 |  | — |
<!-- test-plan:end -->

## Non-goals

- Throughput history or charts; per-partition and per-task lag.
- Editing configs from the UI (except standby, as in Spec 001).
- Branching layouts beyond one join level (enough for the three example apps).
