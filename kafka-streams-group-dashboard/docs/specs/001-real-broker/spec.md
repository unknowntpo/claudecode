# Spec 001: Real-broker mode

Status: Accepted (2026-10-15)
Date: 2026-10-14
Traceability: enforced
Builds on: the simulator dashboard (commit 1e38227)

## Intent

A Kafka developer wants to **see how a real Kafka 4.1 broker assigns Kafka Streams tasks** under the
streams rebalance protocol (KIP-1071): which member owns which active / standby task, the target
assignment it is reconciling towards, and how this changes when processes start, stop, crash or add
threads. Today the dashboard only shows a simulation, so it cannot show what the broker actually does.

Observable outcome: with `docker compose up -d` and `bun run dev`, clicking "Start new process" starts a
real Kafka Streams JVM, and within seconds the matrix shows the broker's `StreamsGroupDescribe` data.

## Evidence

- `kafka-clients` 4.1.0 exposes `Admin#describeStreamsGroups` with group epoch, target assignment epoch,
  topology epoch, per-member `assignment()` / `targetAssignment()` (active, standby, warmup task ids) and
  subtopologies (checked with `javap` on 2026-10-14).
- The broker does **not** expose a member's reconciliation state (UNREVOKED/UNRELEASED) or last heartbeat
  time; these must be derived or dropped.
- No JavaScript Kafka client implements `StreamsGroupDescribe` (API key 89), so the Bun server needs a
  JVM helper.
- Local: Docker 29.4, `apache/kafka:4.1.0` image, Java 21, Gradle 8.14, Bun 1.3.13.
- Findings from the first live run (2026-10-14, Kafka 4.1.0 container):
  - Without `unstable.feature.versions.enable=true` the `streams.version` feature stays at 0 and both the
    heartbeat and `describeStreamsGroups` fail with `UNSUPPORTED_VERSION`; with it, `streams.version=1` is
    finalized at format time (`kafka-features describe`).
  - The broker setting `group.streams.session.timeout.ms=10000` did not shorten fencing: a SIGKILLed member was
    removed after 48 s. With the group configs `streams.session.timeout.ms=10000` and
    `streams.heartbeat.interval.ms=2000` it was removed after 11 s.
  - Changing `streams.num.standby.replicas` takes effect only at the next group-epoch bump (no change after
    20 s; standbys appeared after an `add-thread`). Standbys are assigned only to stateful tasks
    (word-count `1_x`, not `0_x`).
  - An unknown group is described as `DEAD` with epoch -1 (no `GroupIdNotFoundException`).
  - Internal repartition / changelog topics are created by the broker; the topology starts without sink topics.
  - SIGTERM with `close(CloseOptions.leaveGroup(true))` exits in about 1 s and the member leaves at once.
  - 2026-10-15: after a broker restart, a streams group without members is described without topology and
    `Admin#describeStreamsGroups` (and `kafka-streams-groups --describe`) fail with
    `IllegalStateException: Topology information is missing`.
  - Kafka Streams 4.1 logs "Warmup replicas are not supported yet with the streams protocol": warm-up
    tasks never appear in this setup.

## Example

Captured from the live broker with `curl 'localhost:8085/groups?ids=word-count'` (word-count, processes
`A` and `B`, one StreamThread each). Values verbatim, re-indented; `subtopologies` repeated only once.

**Mid-rebalance, 2026-10-14T09:52:59Z (≈3 s after starting B).** A still owns all 8 tasks at
`memberEpoch` 2 while its target is 4 tasks; B owns nothing yet.

```json
{
  "groupId": "word-count", "state": "RECONCILING",
  "groupEpoch": 3, "targetAssignmentEpoch": 3, "topologyEpoch": 0, "numStandbyReplicas": 0,
  "subtopologies": [
    { "id": "0", "sourceTopics": ["text-lines"], "repartitionSourceTopics": [],
      "repartitionSinkTopics": ["word-count-counts-store-repartition"], "stateChangelogTopics": [], "partitions": 4 },
    { "id": "1", "sourceTopics": [], "repartitionSourceTopics": ["word-count-counts-store-repartition"],
      "repartitionSinkTopics": [], "stateChangelogTopics": ["word-count-counts-store-changelog"], "partitions": 4 }
  ],
  "members": [
    { "memberId": "YOZOEVIHTCGHmpuOxkBfCA", "memberEpoch": 3,
      "processId": "6d161cd8-1894-4dac-95df-b1206ad1066a", "clientId": "word-count-B-StreamThread-1-consumer",
      "assignment":       { "active": [], "standby": [], "warmup": [] },
      "targetAssignment": { "active": ["0_2","0_3","1_0","1_3"], "standby": [], "warmup": [] } },
    { "memberId": "4uervFPYQ6CI1bdXzHrBrQ", "memberEpoch": 2,
      "processId": "f902ed60-3175-4b98-bdbe-54a21d9aa16d", "clientId": "word-count-A-StreamThread-1-consumer",
      "assignment":       { "active": ["0_0","0_1","0_2","0_3","1_0","1_1","1_2","1_3"], "standby": [], "warmup": [] },
      "targetAssignment": { "active": ["0_0","0_1","1_1","1_2"], "standby": [], "warmup": [] } }
  ]
}
```

**STABLE, 2026-10-14T09:53:02Z.** Same epochs; each member's assignment equals its target.

```json
"state": "STABLE", "groupEpoch": 3, "targetAssignmentEpoch": 3,
"members": [
  { "memberId": "YOZOEVIHTCGHmpuOxkBfCA", "memberEpoch": 3, "clientId": "word-count-B-StreamThread-1-consumer",
    "assignment": { "active": ["0_2","0_3","1_0","1_3"], "standby": [], "warmup": [] },
    "targetAssignment": { "active": ["0_2","0_3","1_0","1_3"], "standby": [], "warmup": [] } },
  { "memberId": "4uervFPYQ6CI1bdXzHrBrQ", "memberEpoch": 3, "clientId": "word-count-A-StreamThread-1-consumer",
    "assignment": { "active": ["0_0","0_1","1_1","1_2"], "standby": [], "warmup": [] },
    "targetAssignment": { "active": ["0_0","0_1","1_1","1_2"], "standby": [], "warmup": [] } }
]
```

Expected dashboard output for the mid-rebalance poll:

| member | process (from `clientId`) | derived state | owned (solid) | target only (dashed) | revoking (orange) |
| --- | --- | --- | --- | --- | --- |
| `4uervF…` | `A` | `UNREVOKED_TASKS` | 0_0 0_1 1_1 1_2 | — | 0_2 0_3 1_0 1_3 |
| `YOZOEV…` | `B` | `UNRELEASED_TASKS` | — | 0_2 0_3 1_0 1_3 | — |

Group badge `RECONCILING`, group epoch 3, target assignment epoch 3. Between the two polls the log shows
`4uervF… memberEpoch=3 active=[0_0,0_1,1_1,1_2] …`, `YOZOEV… memberEpoch=3 active=[0_2,0_3,1_0,1_3] …`,
and `group state RECONCILING → STABLE`.

## Behavior

1. `streams-app run <appId> <label> <threads>` runs one Kafka Streams instance (one "process") with
   `group.protocol=streams`, `application.id=<appId>`, `client.id=<appId>-<label>`, a per-process
   `state.dir`; stdin `add-thread` calls `addStreamThread()`; SIGTERM closes it (members leave).
2. `streams-app inspect <port>` on start creates the source topics if missing (`text-lines`=4, `orders`=3,
   `customers`=3, `page-views`=6 partitions) and sets the group configs `streams.session.timeout.ms=10000`,
   `streams.heartbeat.interval.ms=2000` for the three groups (the broker-level defaults are not applied, see
   Evidence), then serves:
   - `GET /groups?ids=a,b` → `{ groups: [...] }`, one entry per id, shape in the Example. A group the
     broker does not know is returned as `state: "EMPTY"` with no members and no subtopologies.
   - `POST /groups/<id>/standby?value=<n>` → sets group config `streams.num.standby.replicas`; it applies at the
     next rebalance, which the dashboard states next to the selector (it does not force one).
3. `MODE=real` (default) Bun server: starts the inspector, polls it every 1 s, and maps each group to the
   existing `GroupView` (rows below). `MODE=sim` keeps the simulator.
4. Mapping (who needs it: the matrix and member badges):
   - process label = the part of `clientId` between `<appId>-` and `-StreamThread`, else the broker `processId`;
   - member state is derived: owns a task not in target → `UNREVOKED_TASKS`; else target has a task it does
     not own → `UNRELEASED_TASKS`; else `STABLE`;
   - pending revocation = assignment − target;
   - group state: `EMPTY | NOT_READY | ASSIGNING | RECONCILING | STABLE` pass through; anything else
     (e.g. `DEAD` for an unknown group) → `EMPTY`. A group the broker describes without topology
     (`Topology information is missing`, RB17) is reported as `EMPTY` by the inspector.
5. Process status: started but not yet listed → `joining` placeholder; SIGKILLed by the dashboard or exited on
   its own but still listed → `crashed`; dropped once the broker no longer lists it.
6. Actions: Start new process → spawn `run <app> process-<letter> 1`; `+ thread` → `add-thread`;
   stop → SIGTERM; kill → SIGKILL; standby selector → `POST /groups/<id>/standby`.
7. Coordinator log: events derived by diffing consecutive polls (rows below) plus one line per dashboard action.
8. When the inspector or broker cannot be reached, or `streams-app` is not built, the snapshot carries an
   `error` that the UI shows in a banner; the last known state stays visible. A poll that gets no answer is
   abandoned after 3 s, and the inspector's Admin client uses a 3 s API timeout (found 2026-10-15: with the
   broker stopped, the default kept the banner hidden for 60 s).

## Simplification review

1. **Question every requirement**
   - Java inspector HTTP server — needed: Bun cannot call `StreamsGroupDescribe` (Evidence). Owner: Bun server.
   - Topic creation — needed: without source topics the group stays `NOT_READY`. Owner: the demo user.
   - Standby config endpoint — needed to show standby placement across processes (RB5). Owner: the demo user.
   - `add-thread` — needed to show several members (StreamThreads) per process, i.e. `memberId` ≠ `processId`.
   - Simulator (`MODE=sim`) — kept (human, 2026-10-15): offline demo without Docker/Java and the existing
     tests; costs a small `Backend` interface.
   - Forcing a rebalance after a standby change — not done (human, 2026-10-15): the dashboard shows the
     broker's own behaviour and says the change applies at the next rebalance.
2. **Delete**
   - Background data producer — deleted: task assignment does not depend on records flowing.
   - Output topics (`word-counts`, …) — deleted: only needed once records flow.
   - `msSinceHeartbeat`, `sinkTopics` in real mode — the broker does not report them; not shown (always 0 / empty).
   - Parsing `kafka-streams-groups --describe` text output — deleted in favour of the Admin API (typed, no text parsing).
   - Separate per-member leave/crash buttons — replaced by per-process stop/kill (one JVM = one process).
3. **Simplify** — one Gradle module, two modes in one jar; JDK `HttpServer`, no web framework; Bun reuses the
   existing view types, so the Vue app changes only for process-level actions, the warmup cell and the error banner.
4. **Shorten the cycle** — mapping and event derivation are pure functions tested from case files in
   milliseconds; only RB1–RB5, RB7–RB9, RB13 need the broker (`bun run test:e2e`).
5. **Automate** — `docker compose up -d`, `bun run build:java`, `bun run test:e2e`.

## Acceptance

E2E items run against `docker compose up -d` (Kafka 4.1.0, heartbeat 2 s, session timeout 10 s) via
`bun run test:e2e`, driving the real `RealBackend` in-process.

### Behavior
- RB1: inspector running, word-count has one process → `GET /groups?ids=word-count` → 200 with the Example's fields, task ids `<sub>_<partition>` → test asserts shape.
- RB2: inspector running → `GET /groups?ids=no-such-group` → that group has `state: "EMPTY"`, no members, no subtopologies.
- RB3: no processes → start two word-count processes, wait for STABLE → each of `0_0..0_3`, `1_0..1_3` is active on exactly one member, and both processes own at least one task.
- RB4: one process → `+ thread` → two members with the same process label within 20 s.
- RB5: two processes STABLE → set standby replicas to 1, then start a third process (next rebalance) → each stateful task (`1_x`) has exactly one standby, on a different process than its active; stateless tasks (`0_x`) have none.
- RB6: mapping rows below (process label, derived member state, pending revocation, crashed status).

### Failure and retry
- RB7: two processes STABLE → SIGKILL one → its members show `crashed` while still listed; within 25 s (10 s session timeout set by the inspector + polling) every task is active on the survivor.
- RB8: two processes STABLE → SIGTERM one → its members disappear before the session timeout (graceful leave).
- RB9: a process JVM is killed outside the dashboard (`kill -9 <pid>`) → its members show `crashed`.
- RB10: inspector unreachable, or reachable but not answering (e.g. broker stopped: the Admin call would block for its 60 s default timeout) → within 5 s the snapshot `error` mentions the inspector/broker; groups keep their last state.
- RB11: `streams-app` binary missing → snapshot `error` says to run `bun run build:java`; no process is spawned.
- RB12: broker reports `NOT_READY` / `DEAD` → mapped per Behavior 4 (rows below).
- RB17: word-count has no members → broker restarts → `GET /groups?ids=word-count,order-enrichment` → 200; word-count is `EMPTY` (the broker answers without topology and `Admin` throws `Topology information is missing`), the other group is still described.

### Budget
- RB13: one process STABLE → start a second process → group is STABLE with the new member owning tasks within 20 s (measured value printed by the test).

### Observability
- RB14: [deploy] snapshot `error` is shown as a banner in the dashboard (checked in the running local app by the verifier).
- RB15: event rows below: joins, leaves, state / epoch / target epoch changes, member assignment changes; no events when nothing changed.
- RB16: [deploy] the standby selector says the change applies at the next rebalance (checked in the running local app).

### Test plan: mapping (RB6, RB12)

<!-- test-plan:start server/real/mapping.cases.ts -->
| id | case | assignment | target | clientId | killed | brokerState | expectedLabel | expectedMemberState | expectedPendingRevocation | expectedStatus | expectedGroupState |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RB6 | assignment equals target | 0_0,0_1\| | 0_1,0_0\| | word-count-process-A-StreamThread-1-consumer | no | STABLE | process-A | STABLE | \| | alive | STABLE |
| RB6 | owns a task no longer in target | 0_0,0_1\| | 0_0\| | word-count-process-A-StreamThread-1-consumer | no | STABLE | process-A | UNREVOKED_TASKS | 0_1\| | alive | STABLE |
| RB6 | owns a standby no longer in target | 0_0\|1_0 | 0_0\| | word-count-process-A-StreamThread-1-consumer | no | STABLE | process-A | UNREVOKED_TASKS | \|1_0 | alive | STABLE |
| RB6 | target task not owned yet | 0_0\| | 0_0,0_1\| | word-count-process-A-StreamThread-1-consumer | no | STABLE | process-A | UNRELEASED_TASKS | \| | alive | STABLE |
| RB6 | revoke and receive at once: revoke wins | 0_0\| | 0_1\| | word-count-process-A-StreamThread-1-consumer | no | STABLE | process-A | UNREVOKED_TASKS | 0_0\| | alive | STABLE |
| RB6 | process label with dashes | \| | \| | word-count-process-B-2-StreamThread-3-consumer | no | STABLE | process-B-2 | STABLE | \| | alive | STABLE |
| RB6 | foreign client.id falls back to broker processId | \| | \| | someone-else | no | STABLE | uuid-1 | STABLE | \| | alive | STABLE |
| RB6 | process killed by the dashboard | 0_0\| | 0_0\| | word-count-process-A-StreamThread-1-consumer | yes | STABLE | process-A | STABLE | \| | crashed | STABLE |
| RB12 | broker state NOT_READY (missing source topics) | \| | \| | word-count-process-A-StreamThread-1-consumer | no | NOT_READY | process-A | STABLE | \| | alive | NOT_READY |
| RB12 | broker state DEAD | \| | \| | word-count-process-A-StreamThread-1-consumer | no | DEAD | process-A | STABLE | \| | alive | EMPTY |
| RB12 | broker state RECONCILING | \| | \| | word-count-process-A-StreamThread-1-consumer | no | RECONCILING | process-A | STABLE | \| | alive | RECONCILING |
<!-- test-plan:end -->

### Test plan: events (RB15)

<!-- test-plan:start server/real/events.cases.ts -->
| id | change | expectedKinds | expectedMessageContains |
| --- | --- | --- | --- |
| RB15 | none |  |  |
| RB15 | first poll | member | m-1 joined (process-A |
| RB15 | member joined | member | m-2 joined (process-B |
| RB15 | member left | member | m-1 left / fenced (process-A) |
| RB15 | group state changed | epoch | STABLE → RECONCILING |
| RB15 | group epoch bumped | epoch | group epoch → 4 |
| RB15 | target assignment epoch bumped | assignor | target assignment epoch 4 |
| RB15 | member assignment changed | heartbeat | m-1 memberEpoch=3 active=[0_0] |
| RB15 | member epoch bumped | heartbeat | m-1 memberEpoch=4 |
<!-- test-plan:end -->

## Non-goals

- Lag, offsets, warm-up task tuning, rack awareness, static membership.
- Multi-broker clusters, security (SASL/TLS).
- Changing the broker-side assignor.
