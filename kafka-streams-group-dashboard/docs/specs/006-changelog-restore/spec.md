# Spec 006: Changelog size and inferred restoring

Status: Accepted (2026-10-18, human: "寫 Spec 006 草稿給我看 然後作一版", after choosing broker-only inference for operations monitoring)
Date: 2026-10-18
Traceability: enforced
Builds on: Specs 002, 004

## Intent

An operator sees how much state each stateful task would have to rebuild, and sees a task that is rebuilding
its state after it moved, instead of a false "stalled". All of it from the broker: no application setting.

## Evidence

- After a rebalance a new owner restores its stores from the changelog before it processes input. Today the
  console marks such a task **stalled** after 5 s (Spec 004 Behavior 4), the same as a hung process.
- The broker cannot report restore progress: KIP-1071 members may report `taskOffsets` / `taskEndOffsets`, but
  `describeStreamsGroups` against the demo (kafka-clients 4.1.0, 2026-10-18) returns both empty for every member.
- What the broker does know, without KIP-1071: earliest and latest offset of every changelog partition
  (`ListOffsets`). What KIP-1071 adds: which changelog topics belong to which subtopology
  (`stateChangelogTopics`), so changelog partition `p` belongs to task `<subtopology>_p`.
- Human, 2026-10-18: for operations monitoring; broker-only inference first.

## Example

Captured 2026-10-18 from the demo (`kafka-get-offsets.sh --time -2 / -1`):

| Changelog partition | earliest → latest | Task | Changelog (upper bound) |
| --- | --- | --- | --- |
| `word-count-counts-store-changelog` 0 | 0 → 1166 | `1_0` | ≤ 1,166 |
| `word-count-counts-store-changelog` 1 | 0 → 0 | `1_1` | 0 |
| `page-view-sessions-sessions-store-changelog` 2 | 0 → 1962 | `0_2` | ≤ 1,962 |

With a large store (the demo `seed`, Behavior 6) and `docker kill …-word-count-3`:

| Moment | Console shows |
| --- | --- |
| before | drawer row `1_4 · A word-count-3 · ≤ 250,000`; card `word-count-3` changelog ≤ 1,000,000 |
| tasks moved to `word-count-1` | `1_4` **restoring** on `word-count-1` (warm-up colour ↻, seconds counting), not stalled; log `1_4 restoring on word-count-1 (changelog ≤ 250,000)` |
| first commit | ↻ gone; log `1_4 restored on word-count-1 after 9 s` |

## Behavior

1. **Inspector**: also asks `listOffsets` with `OffsetSpec.earliest()` for every partition of the group's changelog
   topics, and returns `startOffsets: { <changelog topic>: { <partition>: offset } }`.
2. **Changelog size** of task `s_p` = Σ over the subtopology's changelog topics of (latest − earliest) at
   partition `p`; null when any of them is unknown; absent for a task without changelog. It is an upper bound:
   compaction leaves gaps in the offsets, and a new owner with local state replays less.
3. **Restoring** (inferred), per task: its active owner changed since the previous poll (not the first poll
   the console sees), and since then it has not committed while input waits (Spec 004 backlog) and its
   changelog size is > 0. Its seconds count from when its input started waiting under the new owner (the Spec 004
   backlog clock). It ends at the first commit or when the owner changes again. A restoring task is never
   stalled. With a changelog of 0 or unknown, Spec 004 applies unchanged. Limit: a new owner that hangs before
   its first commit shows as restoring, not stalled; the broker cannot tell the two apart.
4. **Log**: `<task> restoring on <process> (changelog ≤ N)` when it starts; `<task> restored on <process> after
   N s` when it ends by a commit. A process that disappears while any of its tasks is restoring is logged
   `<process> gone while restoring` and gets no fenced card (a crash and a stop look the same here); a stalled
   thread still makes it fenced.
5. **Console**: the drawer task table of a stateful subtopology gains a changelog column (`≤ 1,166`, `0`, `—`);
   a restoring task shows a ↻ in the warm-up colour (KIP-1071 warm-up tasks also rebuild state) in the drawer
   with seconds, in the matrix row, and on its chip in the process card; a member or process with a restoring
   task and none stalled has a **restoring** badge; cards are ordered alive, restoring, stalled; each card with
   stateful active tasks shows their changelog total (`—` if any is unknown).
   The changelog label carries an InfoTip (Spec 005): "Records a new owner replays at most. Compaction and
   local state make it less."
6. **Demo**: an optional compose service `seed` (profile `restore`) writes `SEED_WORDS` distinct words
   (default 2,000,000) to `text-lines` once, so word-count's `counts-store` is large enough for a visible restore.

## Simplification review

1. **Question**: bytes on disk (`describeLogDirs`) would be closer to restore time, but need cluster DESCRIBE and
   a call per broker; offsets answer "how much" already. Standby-to-active "from standby" hints: not needed while
   the default is 0 standbys.
2. **Delete**: no separate restore page; restoring reuses the stall machinery (same backlog clock, same places).
3. **Simplify**: one extra `listOffsets` call per poll; size computed where task samples are built.
4. **Shorten the cycle**: table cases for size, restoring and console rows; one E2E for `startOffsets`.
5. **Automate**: none.

## Acceptance

### Behavior
- RS1: inspector against the demo → `GET /groups` → `startOffsets` has every changelog topic of word-count with one entry per partition, each ≤ the matching `endOffsets` entry.
- RS2: task samples carry the changelog size: Σ(latest − earliest) over the subtopology's changelog topics at the task's partition; null when any is unknown; null without changelog.
- RS3: restoring rule (table cases): new owner + backlog + no commit + size > 0 → restoring, never stalled; commit or another owner change ends it; size 0 or null → Spec 004 stall; the first poll never marks restoring.
- RS4: log lines for restoring start, restored after N s, and "gone while restoring" without a fenced card.
- RS5: console rows: drawer rows carry `changelog` and `restoringMs`; a process with a stalled thread is stalled, else restoring if a thread restores, else alive; cards are ordered alive, restoring, stalled and carry the changelog total of their active tasks (null if any is unknown).

### Failure and retry
- RS6: earliest offsets missing for a changelog topic → its tasks' size is null, shown `—`, and they follow Spec 004 (no restoring).

### Budget
- RS7: [measure] a `GET /groups` poll of the three demo groups stays under 500 ms (median of 20) with the extra `listOffsets` call.

### Observability
- RS8: [deploy] with `seed` loaded, `docker kill` one word-count instance → its stateful tasks show restoring on their new owners (no stalled alert) and clear after the first commit; the log shows both lines.

### Test plan: restoring (RS3)

<!-- test-plan:start server/real/restore.cases.ts -->
| id | case | polls | expected | log |
| --- | --- | --- | --- | --- |
| RS3 | new owner, input waiting, no commit, changelog > 0: restoring, not stalled | 0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@b#1000 12000:5/40@b#1000 | restoring 7000 | start b |
| RS3 | the first commit ends it | 0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@b#1000 12000:5/40@b#1000 14000:40/41@b#1000 | ok | start b, restored 9000 |
| RS3 | changelog 0: nothing to restore, Spec 004 stall | 0:0/0@a#0 1000:5/5@a#0 5000:5/20@b#0 12000:5/40@b#0 | stalled 7000 |  |
| RS3 | changelog unknown: Spec 004 stall | 0:0/0@a#- 1000:5/5@a#- 5000:5/20@b#- 12000:5/40@b#- | stalled 7000 |  |
| RS3 | no changelog: Spec 004 stall | 0:0/0@a 1000:5/5@a 5000:5/20@b 12000:5/40@b | stalled 7000 |  |
| RS3 | the first poll the console sees is never restoring | 0:5/20@b#1000 9000:5/40@b#1000 | stalled 9000 |  |
| RS3 | same owner, no commit: stalled, not restoring | 0:0/0@a#1000 1000:5/5@a#1000 2000:5/10@a#1000 9000:5/30@a#1000 | stalled 7000 |  |
| RS3 | new owner with idle input: nothing yet | 0:0/0@a#1000 1000:5/5@a#1000 5000:5/5@b#1000 20000:5/5@b#1000 | ok |  |
| RS3 | another owner change ends it and starts a new one | 0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@b#1000 9000:5/25@c#1000 | restoring 0 | start b, start c |
| RS3 | after the first commit the new owner can stall like any other | 0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@b#1000 6000:20/21@b#1000 7000:20/25@b#1000 13000:20/40@b#1000 | stalled 7000 | start b, restored 1000 |
| RS3 | a task nobody owns is not restoring | 0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@-#1000 | ok |  |
| RS3 | after a gap without owner, the next owner restores from when it got the task | 0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@-#1000 6000:5/22@b#1000 8000:5/25@b#1000 | restoring 2000 | start b |
<!-- test-plan:end -->

## Non-goals

- Restore progress, remaining time and restore buffer memory (KIP-1325): the broker does not have them.
  Needs application metrics or KIP-714 client metrics (a separate spike).
- Bytes on disk per changelog partition (simplification review 1).
- Standby lag.
