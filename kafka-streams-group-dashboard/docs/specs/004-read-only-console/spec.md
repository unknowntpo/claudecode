# Spec 004: Read-only console, demo workload outside it

Status: Accepted (2026-10-18, human: "ok, yes, go" after the stalled / fenced lifecycle)
Date: 2026-10-17
Traceability: enforced
Builds on: Specs 001–003

## Intent

The console observes Kafka Streams applications the way it would in production: it connects to a broker,
discovers every streams group there, and shows their pipelines, tasks and members. It never starts, stops or
hosts an application. The demo applications and the demo data run beside it as their own Docker Compose
services, which an engineer scales, stops and kills with Docker, as they would with any deployment.

## Evidence

- Human, 2026-10-17: "this mix the demo purpose and real usage. not ok, normal workflow won't let you host
  kstream in bun." Decisions: demo apps as docker compose services; console read-only (all process actions
  removed; the standby selector stays because it is broker-side group config); groups discovered from the broker.
- Today the Bun server spawns every Kafka Streams JVM (`streams-app run`), the inspector JVM also produces demo
  data and sets demo group configs, and the console only knows the three example apps (`server/topologies.ts`,
  `Inspector.GROUPS`, `Inspector.SINKS`).
- What a read-only observer can know (kafka-clients 4.1.0): `Admin#listGroups` with type STREAMS; `describeStreamsGroups`
  (no heartbeat times); `listStreamsGroupOffsets` per partition; `listOffsets`; group configs. It cannot know a
  member crashed until the broker fences it (session timeout), and it cannot know sink topics (they are not part
  of the topology the client sends).

## Example

`docker compose up -d` starts the broker, a one-shot `setup` (topics and group configs), `producer`, and one
container per demo app; `docker compose up -d --scale word-count=2` adds a second word-count instance;
`docker kill kafka-streams-group-dashboard-word-count-2` crashes one (`docker compose kill` would kill every instance of the service).

| Moment | Console shows |
| --- | --- |
| after `up` | sidebar lists the streams groups the broker has (`order-enrichment`, `page-view-sessions`, `word-count`), each STABLE with 1 process labelled by its container (`word-count-1`) |
| after `--scale word-count=2` | word-count RECONCILING then STABLE, 2 processes, tasks split |
| `docker kill …-word-count-2`, first ~10 s | broker still lists both members; tasks owned by `word-count-2` stop committing while input arrives: after the stall threshold they are **stalled** (amber `!`), the process card says "no progress for N s" |
| after the session timeout | `word-count-2` disappears; because it was stalled, the log says "fenced after no progress for N s" and a grey **fenced** card stays on the Processes tab for 60 s listing the tasks it had and who took them; its tasks move to `word-count-1` |
| `docker stop kafka-streams-group-dashboard-word-count-1` instead | it leaves at once without stalling: the log says "left"; no fenced card |
| a group nobody runs any more | EMPTY; still listed while the broker keeps it |

## Behavior

1. **Demo workload** (`docker-compose.yml`, not the console): services `kafka`, `setup` (creates source topics
   and sets `streams.session.timeout.ms=10000`, `streams.heartbeat.interval.ms=2000` for the demo groups, then
   exits), `producer` (the demo records of Spec 002 Behavior 1), and `word-count`, `order-enrichment`,
   `page-view-sessions`, each running `streams-app run <app>` with `client.id = <app>-<container name>` (Behavior 5) and
   scalable. `streams-app` keeps its `run` and `inspect` modes; `inspect` no longer produces, creates topics or
   sets configs.
2. **Discovery**: the inspector lists streams groups (`listGroups`, type STREAMS) on each `GET /groups` and
   describes all of them; `?ids=` is no longer needed.
3. **Read-only**: the console removes start process, + thread, stop and kill (UI, WebSocket messages,
   `RealBackend` spawning). It keeps the standby selector (`POST /groups/<id>/standby`).
4. **Stalled and fenced** replace console-known crashes (human, 2026-10-18). For each task (subtopology `s`,
   partition `p`) its input is partition `p` of the subtopology's source and repartition topics.
   - **Progress**: per task, the console remembers when unprocessed input started waiting: the first poll since
     the last commit at which the input end offset is beyond the committed offset. A task is **stalled** when
     that input has waited longer than the stall threshold without a commit. Idle input never starts the clock
     (the verifier found, 2026-10-18, that measuring from the last commit flagged an idle partition as stalled
     for minutes as soon as one record arrived). The clock restarts when the task's active owner
     changes: a new owner restores state before it commits (found in the first E2E run, 2026-10-18: right after a
     scale-up, freshly moved tasks looked stalled). The threshold is 3 × the group's observed commit
     interval (lower median of the last 50 times between committed-offset changes across its tasks), at least 5 s; 5 s until an
     interval is observed.
   - A member owning a stalled active task is `stalled` (amber, `!` on the task), with "no progress for N s"
     (N = the longest stall among its tasks).
   - **Gone**: when a member disappears between two polls, it was **fenced** if it was stalled on the previous
     poll, else it **left**. Both are logged ("left", "fenced after no progress for N s"). A fenced process stays
     as a grey card on the Processes tab for 60 s with the tasks it owned and their new owners. The console never
     says "crashed": it cannot tell a crash from a network partition or a long GC pause.
4a. **Inspector contract** (per group in `GET /groups`, Spec 001/002 fields unchanged otherwise): `endOffsets`
   `{topic: {partition: offset}}` for the group's source, repartition and changelog topics, and
   `committedOffsets` `{topic: {partition: offset}}` from `listStreamsGroupOffsets`; topic `kind` is only
   `source | repartition | changelog` (no `sink`).
5. **Process labels**: from `client.id` = `<app>-<container name>`; the container name is found by a reverse DNS
   lookup of the container's own address (Docker's hostname is the container id) and is
   `<compose project>-<service>-<n>`; the console cuts the label to its last `<app>-…` part (`word-count-2`). A
   foreign client id falls back to the broker's process id (Spec 001 rule unchanged). Threads per instance come
   from `STREAM_THREADS` (`WORD_COUNT_THREADS` in compose for word-count).
6. **What the console no longer shows**: app descriptions and DSL (they belong to the app), sink topics (the
   broker does not know them: the pipeline ends at the last subtopology with its output repartition / no edge),
   the simulator (`MODE=sim` and `server/coordinator.ts` are removed: a read-only console cannot drive it).
7. **E2E** drives the demo with `docker compose` (`up --scale`, `stop`, `kill`) and observes through the console's
   backend only.

## Simplification review

1. **Question** — inspector-side producer, topic creation and group configs: demo concerns → moved to compose.
   Simulator: no owner once the console is read-only → deleted. Static app metadata: belongs to the app →
   deleted. Stalled detection: needed, or a crash is invisible for 10 s.
2. **Delete** — `RealBackend` process management, `addMember` / `stopProcess` / `killProcess`, `server/sim.ts`,
   `server/coordinator.ts`, `server/assignor.ts`, `server/topologies.ts`, `Inspector.GROUPS` / `SINKS`,
   `DemoProducer` inside the inspector (moves to a `produce` mode run by the `producer` service).
3. **Simplify** — one image for every demo service (`streams-app` jar), modes chosen by command.
4. **Shorten the cycle** — stalled detection and discovery are pure functions over two polls, tested from case files.
5. **Automate** — `docker compose up -d` brings the whole demo up.

## Acceptance

### Behavior
- RO1: with the demo up, the console lists exactly the streams groups the broker has, without any static list.
- RO2: `--scale word-count=2` → two processes labelled `word-count-1` and `word-count-2`, tasks split, STABLE.
- RO3: no control in the UI or the WebSocket protocol starts, stops or kills an application; the standby selector still works.
- RO4: stall rows below: committed unchanged past the threshold while input grew → stalled; committed moving → not; input idle → not; threshold from the observed commit interval, at least 5 s.
- RO11: gone rows below: a member that disappears after being stalled → fenced (card kept 60 s, then dropped); without being stalled → left; a fenced card lists its tasks' new owners.

### Failure and retry
- RO5: `kill` one instance → within 10 s its tasks are stalled in the console; after the session timeout they move to the survivor and the stall clears.
- RO6: `stop` one instance → members leave at once, no stall.
- RO7: a group with no topology after a broker restart is still listed as EMPTY (Spec 001 RB17).
- RO8: a group that disappears from the broker disappears from the sidebar; its open page returns to the overview.

### Test plan: stalled and gone (RO4, RO11)

<!-- test-plan:start server/real/progress.cases.ts -->
| id | case | input | next | expected |
| --- | --- | --- | --- | --- |
| RO4 | committing every second | 0:0/0 1000:5/5 2000:10/10 3000:15/15 4000:20/20 5000:25/25 6000:30/30 |  | ok (threshold 5000) |
| RO4 | backlog waiting 5.5 s while input grows | 0:0/0 1000:5/5 2000:5/8 4000:5/15 7500:5/30 |  | stalled 5500 (threshold 5000) |
| RO4 | an idle partition gets one record after a minute: not stalled at once | 0:0/0 1000:5/5 60000:5/5 61000:5/6 |  | ok (threshold 5000) |
| RO4 | backlog waiting exactly the threshold is not stalled yet | 0:0/0 1000:5/5 2000:5/6 7000:5/9 |  | ok (threshold 5000) |
| RO4 | end offset unknown | 0:0/0 1000:5/- 9000:5/- |  | ok (threshold 5000) |
| RO4 | frozen while input is idle too | 0:0/0 1000:5/5 4000:5/5 8000:5/5 |  | ok (threshold 5000) |
| RO4 | frozen 4 s while input grows: below 5 s | 0:0/0 1000:5/5 5000:5/20 |  | ok (threshold 5000) |
| RO4 | the threshold uses the lower median of unequal intervals | 0:0/0 1000:5/5 4000:10/10 5000:15/15 6000:15/16 12000:15/40 |  | stalled 6000 (threshold 5000) |
| RO4 | commit interval 3 s raises the threshold to 9 s: frozen 7 s is ok | 0:0/0 3000:5/5 6000:10/10 9000:15/15 16000:15/40 |  | ok (threshold 9000) |
| RO4 | commit interval 3 s: a backlog waiting 10 s is stalled | 0:0/0 3000:5/5 6000:10/10 9000:15/15 10000:15/16 20000:15/55 |  | stalled 10000 (threshold 9000) |
| RO4 | committed offset unknown | 0:-/0 4000:-/10 9500:-/20 |  | ok (threshold 5000) |
| RO4 | a new owner restarts the clock: restoring after a rebalance is not a stall | 0:0/0@a 1000:5/5@a 5000:5/20@b 9000:5/30@b |  | ok (threshold 5000) |
| RO4 | a backlog that waited under the old owner starts again under the new one | 0:0/0@a 1000:5/5@a 2000:5/10@a 8000:5/20@b 9000:5/30@b |  | ok (threshold 5000) |
| RO4 | the new owner stalls too once the threshold passes | 0:0/0@a 1000:5/5@a 5000:5/20@b 11000:5/40@b |  | stalled 6000 (threshold 5000) |
| RO4 | a stalled task that commits again recovers | 0:0/0 1000:5/5 7500:5/30 8000:30/31 |  | ok (threshold 5000) |
| RO11 | nobody disappears | m1:A m2:B | m1 m2 |  |
| RO11 | a member disappears without stalling: left | m1:A m2:B | m1 | B left |
| RO11 | a member disappears after stalling: fenced | m1:A m2:B:stalled=9000 | m1 | B fenced 9000 |
| RO11 | one stalled and one healthy thread of a process disappear: fenced | m1:A m2:B m3:B:stalled=9000 | m1 | B fenced 9000 |
| RO11 | the same, listed the other way round | m1:A m3:B:stalled=9000 m2:B | m1 | B fenced 9000 |
| RO11 | every member of a process disappears | m1:A m2:B:stalled=9000 m3:B:stalled=8000 | m1 | B fenced 9000 |
<!-- test-plan:end -->

### Budget
- RO9: `/groups` with discovery of the demo groups answers within 1000 ms (20 calls).

### Observability
- RO10: [deploy] the verifier runs the Example scenario with docker compose and captures the console at each moment.

## Non-goals

- Controlling applications from the console; showing sink topics; heartbeat times; the simulator.
