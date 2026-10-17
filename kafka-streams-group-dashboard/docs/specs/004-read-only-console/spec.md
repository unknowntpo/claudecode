# Spec 004: Read-only console, demo workload outside it

Status: Draft
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
`docker compose kill word-count-2` crashes one.

| Moment | Console shows |
| --- | --- |
| after `up` | sidebar lists the streams groups the broker has (`order-enrichment`, `page-view-sessions`, `word-count`), each STABLE with 1 process labelled by its container (`word-count-1`) |
| after `--scale word-count=2` | word-count RECONCILING then STABLE, 2 processes, tasks split |
| `kill word-count-2`, first ~10 s | broker still lists both members; tasks owned by `word-count-2` stop committing, their lag grows: those tasks are **stalled** (amber `!`), the process card says "no progress for N s" |
| after the session timeout | `word-count-2` gone (log: left / fenced), its tasks move to `word-count-1`, stall clears |
| a group nobody runs any more | EMPTY; still listed while the broker keeps it |

## Behavior

1. **Demo workload** (`docker-compose.yml`, not the console): services `kafka`, `setup` (creates source topics
   and sets `streams.session.timeout.ms=10000`, `streams.heartbeat.interval.ms=2000` for the demo groups, then
   exits), `producer` (the demo records of Spec 002 Behavior 1), and `word-count`, `order-enrichment`,
   `page-view-sessions`, each running `streams-app run <app>` with `client.id = <app>-<container hostname>` and
   scalable. `streams-app` keeps its `run` and `inspect` modes; `inspect` no longer produces, creates topics or
   sets configs.
2. **Discovery**: the inspector lists streams groups (`listGroups`, type STREAMS) on each `GET /groups` and
   describes all of them; `?ids=` is no longer needed.
3. **Read-only**: the console removes start process, + thread, stop and kill (UI, WebSocket messages,
   `RealBackend` spawning). It keeps the standby selector (`POST /groups/<id>/standby`).
4. **Stalled tasks** replace console-known crashes: the inspector reports committed offsets per task
   partition; a task is stalled when its committed offset has not advanced for ≥ 5 s while its input end offset
   has. A member owning a stalled task is shown as `stalled` (amber, `!`), with "no progress for N s".
5. **Process labels**: from `client.id` (`<app>-<hostname>`); a foreign client id falls back to the broker's
   process id (Spec 001 rule unchanged).
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

## Acceptance (draft)

### Behavior
- RO1: with the demo up, the console lists exactly the streams groups the broker has, without any static list.
- RO2: `--scale word-count=2` → two processes labelled by container, tasks split, STABLE.
- RO3: no control in the UI or the WebSocket protocol starts, stops or kills an application; the standby selector still works.
- RO4: stalled rows: committed offset unchanged ≥ 5 s while end offset grew → stalled; committed moving → not; input idle → not.

### Failure and retry
- RO5: `kill` one instance → within 10 s its tasks are stalled in the console; after the session timeout they move to the survivor and the stall clears.
- RO6: `stop` one instance → members leave at once, no stall.
- RO7: a group with no topology after a broker restart is still listed as EMPTY (Spec 001 RB17).
- RO8: a group that disappears from the broker disappears from the sidebar; its open page returns to the overview.

### Budget
- RO9: `/groups` with discovery of the demo groups answers within 1000 ms (20 calls).

### Observability
- RO10: [deploy] the verifier runs the Example scenario with docker compose and captures the console at each moment.

## Non-goals

- Controlling applications from the console; showing sink topics; heartbeat times; the simulator.
