// Test plan rows for docs/specs/006-changelog-restore/spec.md (rendered by `bun run docs:test-plan`).
// RS3: one task's polls as "<ms>:<committed>/<end>@<owner>[#<changelog size>]" ("-" = unknown or no owner; no "#" = no
// changelog) → the task after the last poll (ok / restoring <ms> / stalled <ms>) and what happened on the way
// ("start <owner>" when restoring starts, "restored <ms>" when a commit ends it).

export interface RestoreCase {
  id: string
  case: string
  polls: string
  expected: string
  log: string
}

const row = (c: string, polls: string, expected: string, log = ''): RestoreCase => ({ id: 'RS3', case: c, polls, expected, log })

export const testPlanRows: RestoreCase[] = [
  row('new owner, input waiting, no commit, changelog > 0: restoring, not stalled', '0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@b#1000 12000:5/40@b#1000', 'restoring 7000', 'start b'),
  row('the first commit ends it', '0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@b#1000 12000:5/40@b#1000 14000:40/41@b#1000', 'ok', 'start b, restored 9000'),
  row('changelog 0: nothing to restore, Spec 004 stall', '0:0/0@a#0 1000:5/5@a#0 5000:5/20@b#0 12000:5/40@b#0', 'stalled 7000'),
  row('changelog unknown: Spec 004 stall', '0:0/0@a#- 1000:5/5@a#- 5000:5/20@b#- 12000:5/40@b#-', 'stalled 7000'),
  row('no changelog: Spec 004 stall', '0:0/0@a 1000:5/5@a 5000:5/20@b 12000:5/40@b', 'stalled 7000'),
  row('the first poll the console sees is never restoring', '0:5/20@b#1000 9000:5/40@b#1000', 'stalled 9000'),
  row('same owner, no commit: stalled, not restoring', '0:0/0@a#1000 1000:5/5@a#1000 2000:5/10@a#1000 9000:5/30@a#1000', 'stalled 7000'),
  row('new owner with idle input: nothing yet', '0:0/0@a#1000 1000:5/5@a#1000 5000:5/5@b#1000 20000:5/5@b#1000', 'ok'),
  row('another owner change ends it and starts a new one', '0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@b#1000 9000:5/25@c#1000', 'restoring 0', 'start b, start c'),
  row('after the first commit the new owner can stall like any other', '0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@b#1000 6000:20/21@b#1000 7000:20/25@b#1000 13000:20/40@b#1000', 'stalled 7000', 'start b, restored 1000'),
  row('a task nobody owns is not restoring', '0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@-#1000', 'ok'),
  row('after a gap without owner, the next owner restores from when it got the task', '0:0/0@a#1000 1000:5/5@a#1000 5000:5/20@-#1000 6000:5/22@b#1000 8000:5/25@b#1000', 'restoring 2000', 'start b'),
]
