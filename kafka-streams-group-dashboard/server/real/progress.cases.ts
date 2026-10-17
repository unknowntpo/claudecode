// Test plan rows for docs/specs/004-read-only-console/spec.md (rendered by `bun run docs:test-plan`).
// RO4: one task's polls as "<ms>:<committed>/<end>[@<owner>]" ("-" = unknown) → stalled after the last poll?
// The stall is measured from when unprocessed input appeared (end > committed), not from the last commit.
// RO11: members before ("<member>:<process>[:stalled=<ms>]") and the member ids still listed → what is logged.

export interface ProgressCase {
  id: string
  case: string
  input: string
  /** RO11 only: member ids on the next poll. */
  next: string
  expected: string
}

const stall = (c: string, polls: string, expected: string): ProgressCase => ({ id: 'RO4', case: c, input: polls, next: '', expected })
const gone = (c: string, before: string, next: string, expected: string): ProgressCase => ({ id: 'RO11', case: c, input: before, next, expected })

export const testPlanRows: ProgressCase[] = [
  stall('committing every second', '0:0/0 1000:5/5 2000:10/10 3000:15/15 4000:20/20 5000:25/25 6000:30/30', 'ok (threshold 5000)'),
  stall('backlog waiting 5.5 s while input grows', '0:0/0 1000:5/5 2000:5/8 4000:5/15 7500:5/30', 'stalled 5500 (threshold 5000)'),
  stall('an idle partition gets one record after a minute: not stalled at once', '0:0/0 1000:5/5 60000:5/5 61000:5/6', 'ok (threshold 5000)'),
  stall('backlog waiting exactly the threshold is not stalled yet', '0:0/0 1000:5/5 2000:5/6 7000:5/9', 'ok (threshold 5000)'),
  stall('end offset unknown', '0:0/0 1000:5/- 9000:5/-', 'ok (threshold 5000)'),
  stall('frozen while input is idle too', '0:0/0 1000:5/5 4000:5/5 8000:5/5', 'ok (threshold 5000)'),
  stall('frozen 4 s while input grows: below 5 s', '0:0/0 1000:5/5 5000:5/20', 'ok (threshold 5000)'),
  stall('the threshold uses the lower median of unequal intervals', '0:0/0 1000:5/5 4000:10/10 5000:15/15 6000:15/16 12000:15/40', 'stalled 6000 (threshold 5000)'),
  stall('commit interval 3 s raises the threshold to 9 s: frozen 7 s is ok', '0:0/0 3000:5/5 6000:10/10 9000:15/15 16000:15/40', 'ok (threshold 9000)'),
  stall('commit interval 3 s: a backlog waiting 10 s is stalled', '0:0/0 3000:5/5 6000:10/10 9000:15/15 10000:15/16 20000:15/55', 'stalled 10000 (threshold 9000)'),
  stall('committed offset unknown', '0:-/0 4000:-/10 9500:-/20', 'ok (threshold 5000)'),
  stall('a new owner restarts the clock: restoring after a rebalance is not a stall', '0:0/0@a 1000:5/5@a 5000:5/20@b 9000:5/30@b', 'ok (threshold 5000)'),
  stall('a backlog that waited under the old owner starts again under the new one', '0:0/0@a 1000:5/5@a 2000:5/10@a 8000:5/20@b 9000:5/30@b', 'ok (threshold 5000)'),
  stall('the new owner stalls too once the threshold passes', '0:0/0@a 1000:5/5@a 5000:5/20@b 11000:5/40@b', 'stalled 6000 (threshold 5000)'),
  stall('a stalled task that commits again recovers', '0:0/0 1000:5/5 7500:5/30 8000:30/31', 'ok (threshold 5000)'),
  gone('nobody disappears', 'm1:A m2:B', 'm1 m2', ''),
  gone('a member disappears without stalling: left', 'm1:A m2:B', 'm1', 'B left'),
  gone('a member disappears after stalling: fenced', 'm1:A m2:B:stalled=9000', 'm1', 'B fenced 9000'),
  gone('one stalled and one healthy thread of a process disappear: fenced', 'm1:A m2:B m3:B:stalled=9000', 'm1', 'B fenced 9000'),
  gone('the same, listed the other way round', 'm1:A m3:B:stalled=9000 m2:B', 'm1', 'B fenced 9000'),
  gone('every member of a process disappears', 'm1:A m2:B:stalled=9000 m3:B:stalled=8000', 'm1', 'B fenced 9000'),
]
