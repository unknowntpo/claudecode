// Test plan rows for docs/specs/007-restore-progress/spec.md (rendered by `bun run docs:test-plan`).
// RP2: what the members report for task 1_0 (owned as active by "owner"; "standby" holds a standby of it) and
// its changelog earliest offset → the progress the console shows.
// RP3: one task's polls as "<ms>:<committed>/<end>@<owner>#<changelog size>[%<restored>/<total>]" (the owner's
// report) → the task after the last poll and what was logged on the way.

export interface ReportCase {
  id: string
  case: string
  input: string
  /** RP2: earliest changelog offset ("-" unknown); RP3: unused. */
  earliest: string
  expected: string
  log: string
}

const formula = (c: string, input: string, earliest: string, expected: string): ReportCase => ({ id: 'RP2', case: c, input, earliest, expected, log: '' })
const polls = (c: string, input: string, expected: string, log = ''): ReportCase => ({ id: 'RP3', case: c, input, earliest: '', expected, log })

export const testPlanRows: ReportCase[] = [
  formula('the owner reports offset / end', 'owner=314319/833228', '0', '38%'),
  formula('the earliest offset is subtracted', 'owner=314319/833228', '100000', '29%'),
  formula('earliest unknown counts as 0', 'owner=314319/833228', '-', '38%'),
  formula('an offset beyond the end is 100 %', 'owner=900/833', '0', '100%'),
  formula('an offset below earliest is 0 %', 'owner=50/1000', '100', '0%'),
  formula('a negative (unknown) offset: none', 'owner=-1/833228', '0', 'none'),
  formula('an end not above earliest: none', 'owner=500/500', '500', 'none'),
  formula('a standby report is not the restore of the active task', 'standby=314319/833228', '0', 'none'),
  formula('nothing reported: none', '', '0', 'none'),
  formula('an offset without an end (on-disk state): none', 'owner=833525/-', '0', 'none'),
  polls('reported from the first poll, no waiting input: restoring, not stalled', '0:5/5@b#1000%100/1000 2000:5/5@b#1000%300/1000', 'restoring 2000 30%', 'start b'),
  polls('reported, then not: finished, no inference; a later backlog stalls from the finish', '0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@b#1000%100/1000 7000:5/30@b#1000%900/1000 9000:5/40@b#1000 20000:5/60@b#1000', 'stalled 11000', 'start b, restored 4000'),
  polls('finished, then the first commit: ok', '0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@b#1000%100/1000 7000:5/30@b#1000 8000:30/31@b#1000', 'ok', 'start b, restored 2000'),
  polls('never reported (Kafka 4.1): Spec 006 inference, no percentage', '0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@b#1000 12000:5/40@b#1000', 'restoring 7000', 'start b'),
  polls('a new owner starts over: its own report or Spec 006', '0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@b#1000%100/1000 7000:5/25@c#1000 9000:5/30@c#1000', 'restoring 2000', 'start b, start c'),
  polls('a report still seen after the first commit is stale: no second restore', '0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@b#1000%100/1000 7000:20/21@b#1000%900/1000 8000:21/22@b#1000', 'ok', 'start b, restored 2000'),
]
