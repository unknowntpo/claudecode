# Spec 007: Restore progress from reported task offsets

Status: Accepted (2026-10-18, human: "如果 taskoffset 能看到就可以顯示進度調 如果沒有就 fallback ? 這樣如何", after the Kafka 4.4 spike)
Date: 2026-10-18
Traceability: enforced
Builds on: Spec 006

## Intent

While a task rebuilds its state, an operator sees how far it got as a progress bar, from what the member
reports to the broker. Where nothing is reported (clients or brokers before Kafka 4.4), the console falls back
to Spec 006: restoring inferred, no bar.

## Evidence

- Kafka 4.4.0 (KAFKA-20116, 2026-06/08): members send `taskOffsets` / `taskEndOffsets` (changelog offset sums
  per task) in `StreamsGroupHeartbeat`; the broker keeps the latest and returns them in `StreamsGroupDescribe`
  (`GroupMetadataManager.java:2222`, `StreamsGroupMember.java:406`). Kafka 4.1 does neither.
- Only tasks not yet caught up are reported: restoring, standby, warm-up, and on-disk state of tasks the member
  does not own. A RUNNING active task is removed (`TaskManager#maybeUpdateTaskOffsetSumSnapshot`). Steady state
  with no standbys reports nothing.
- They are sent every `group.streams.task.offset.interval.ms` (broker, default 60 s, lower bound
  `group.streams.min.task.offset.interval.ms`, default 15 s; group config `streams.task.offset.interval.ms`).
- Docker Hub has no `apache/kafka:4.4.0` yet; `4.4.0-rc4` is the last RC (no `4.4.0` git tag yet, 2026-10-18)
  while Maven and downloads.apache.org already ship 4.4.0.

## Example

Spike, 2026-10-18, Kafka 4.4.0 clients, broker 4.4.0-rc4, interval 1 s, 10 M seeded words; `docker kill`
word-count-2 and -3, word-count-1 restores 8 tasks. Inspector `taskOffsets / taskEndOffsets` of `1_0`
on word-count-1 (earliest changelog offset 0):

| Time after kill | Reported | Console shows for `1_0` |
| --- | --- | --- |
| 14.1 s | 135,539 / 833,228 | ↻ bar 16 % |
| 16.3 s | 314,319 / 833,228 | ↻ bar 38 % |
| 20.0 s | 715,550 / 833,228 | ↻ bar 86 % |
| 22.1 s | not reported (RUNNING) | no bar; log `1_0 restored on word-count-1 after 8 s` |

Same kill against a Kafka 4.1 client: nothing reported, Spec 006 applies (↻ without a bar).

## Behavior

1. **Demo on Kafka 4.4**: clients `4.4.0`; broker image `apache/kafka:4.4.0-rc4` until `4.4.0` is on Docker Hub;
   broker `group.streams.task.offset.interval.ms=1000` and `group.streams.min.task.offset.interval.ms=1000`;
   `setup` sets the group config `streams.task.offset.interval.ms=1000` for the demo groups.
2. **Inspector**: each member carries `taskOffsets` and `taskEndOffsets`, `{ "<subtopology>_<partition>": sum }`;
   the configuration tab also lists `streams.task.offset.interval.ms`.
3. **Progress** of task `t` = (reported offset − earliest) / (reported end − earliest), clamped to 0–100 %,
   where the report is the one of `t`'s **active owner**, and earliest is the sum of `t`'s changelog earliest
   offsets (0 when unknown). No progress when the offset is negative (unknown), the end is not above earliest,
   or the owner does not report `t`. Reports of standbys and of non-owners are ignored here.
4. **Restoring**: a task with progress is restoring, from the first poll and with or without waiting input,
   and never stalled. Its seconds count from the owner change when the console saw one, else from the first
   report. A task its current owner reported before and no longer reports has finished: not
   restoring, and the inference of Spec 006 does not apply to it until its owner changes. A task its owner never
   reported follows Spec 006. Once the owner has committed the task it is running: a report still seen then is
   stale (reports lag by up to one interval) and is ignored until the owner changes (found on the running demo,
   2026-10-18: a second "restoring … restored after 1 s" after the first commit). A report with an offset but no
   end (on-disk state the member had before it owned the task) shows no bar: Spec 006 applies.
5. **Log**: unchanged from Spec 006 (`restoring on`, `restored on … after N s`), whichever way restoring was
   found.
6. **Console**: where Spec 006 shows ↻, a task with progress also shows its percentage: a bar and `59 %` in the
   drawer row, `↻ 1_0 59%` on its process-card chip, and the percentage in the matrix ↻ title. When the
   reported value has not changed for 10 s or more, the drawer row adds `· 12 s ago`.

## Simplification review

1. **Question**: standby catch-up and warm-up bars use the same data; not needed while the demo runs no
   standbys (non-goal). An aggregated per-process bar: the chips already show each task.
2. **Delete**: no restore rate or time estimate: the report interval makes them jumpy.
3. **Simplify**: progress rides on the existing restoring machinery (one more field per task sample).
4. **Shorten the cycle**: table cases for the formula and the fallback; one E2E for the inspector fields.
5. **Automate**: none.

## Acceptance

### Behavior
- RP1: inspector against the Kafka 4.4 demo → members carry `taskOffsets` and `taskEndOffsets` objects, and configs list `streams.task.offset.interval.ms` = 1000 from the group.
- RP2: progress formula (table cases): owner's report, earliest subtracted, clamped; none for a negative offset, an end not above earliest, a report by a non-owner, or no report.
- RP3: restoring with reports (table cases): reported → restoring from the first poll, without waiting input, never stalled; reported then not → finished, no inference, `restored` logged; never reported → Spec 006; a new owner starts over; a report seen after the owner's first commit is ignored.
- RP4: console rows: drawer rows and process-card chips carry the percentage and the report age.

### Failure and retry
- RP5: an inspector without `taskOffsets` (Kafka 4.1) → no progress anywhere; Spec 006 results unchanged.

### Budget
- RP6: [measure] `bun run test:e2e` passes on the Kafka 4.4 demo.

### Observability
- RP7: [deploy] seeded demo, kill two of three word-count instances → the survivor's moved stateful tasks show bars rising to completion, then the bars and ↻ disappear and the log shows `restored`.

### Test plan: progress and fallback (RP2, RP3)

<!-- test-plan:start server/real/report.cases.ts -->
| id | case | input | earliest | expected | log |
| --- | --- | --- | --- | --- | --- |
| RP2 | the owner reports offset / end | owner=314319/833228 | 0 | 38% |  |
| RP2 | the earliest offset is subtracted | owner=314319/833228 | 100000 | 29% |  |
| RP2 | earliest unknown counts as 0 | owner=314319/833228 | - | 38% |  |
| RP2 | an offset beyond the end is 100 % | owner=900/833 | 0 | 100% |  |
| RP2 | an offset below earliest is 0 % | owner=50/1000 | 100 | 0% |  |
| RP2 | a negative (unknown) offset: none | owner=-1/833228 | 0 | none |  |
| RP2 | an end not above earliest: none | owner=500/500 | 500 | none |  |
| RP2 | a standby report is not the restore of the active task | standby=314319/833228 | 0 | none |  |
| RP2 | nothing reported: none |  | 0 | none |  |
| RP2 | an offset without an end (on-disk state): none | owner=833525/- | 0 | none |  |
| RP3 | reported from the first poll, no waiting input: restoring, not stalled | 0:5/5@b#1000%100/1000 2000:5/5@b#1000%300/1000 |  | restoring 2000 30% | start b |
| RP3 | reported, then not: finished, no inference; a later backlog stalls from the finish | 0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@b#1000%100/1000 7000:5/30@b#1000%900/1000 9000:5/40@b#1000 20000:5/60@b#1000 |  | stalled 11000 | start b, restored 4000 |
| RP3 | finished, then the first commit: ok | 0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@b#1000%100/1000 7000:5/30@b#1000 8000:30/31@b#1000 |  | ok | start b, restored 2000 |
| RP3 | never reported (Kafka 4.1): Spec 006 inference, no percentage | 0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@b#1000 12000:5/40@b#1000 |  | restoring 7000 | start b |
| RP3 | a new owner starts over: its own report or Spec 006 | 0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@b#1000%100/1000 7000:5/25@c#1000 9000:5/30@c#1000 |  | restoring 2000 | start b, start c |
| RP3 | a report still seen after the first commit is stale: no second restore | 0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@b#1000%100/1000 7000:20/21@b#1000%900/1000 8000:21/22@b#1000 |  | ok | start b, restored 2000 |
<!-- test-plan:end -->

## Non-goals

- Standby and warm-up catch-up bars; restore rate and remaining time.
- Changing the report interval from the console.
