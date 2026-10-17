// Test plan rows for docs/specs/003-console-v2/spec.md (rendered by `bun run docs:test-plan`).
// Members are written as "<process>/<member> <status> a=<active> s=<standby> t=<target active> ts=<target standby> r=<revoking> ms=<silent>"
// separated by " | "; lists are comma separated. CV3: drawer task rows. CV4: process cards.

export interface DetailCase {
  id: string
  case: string
  members: string
  subtopology: string
  expected: string
}

const drawer = (c: string, members: string, expected: string): DetailCase => ({ id: 'CV3', case: c, members, subtopology: '0', expected })
const cards = (c: string, members: string, expected: string): DetailCase => ({ id: 'CV4', case: c, members, subtopology: '', expected })

export const testPlanRows: DetailCase[] = [
  drawer('stable owner and standby on another process', 'A/m1 alive a=0_0 | B/m2 alive s=0_0', '0_0 A:A S:B'),
  drawer('crashed owner: no working owner, standby elsewhere', 'A/m1 alive s=0_3 | B/m2 crashed a=0_3', '0_3 A:B× S:A !'),
  drawer('owner revoking, new owner waiting: a move', 'A/m1 alive a=0_2 r=0_2 | B/m2 alive t=0_2', '0_2 A:A→B'),
  drawer('owner revoking with nobody waiting is no move', 'A/m1 alive a=0_2 r=0_2', '0_2 A:A'),
  drawer('standby comes from the owned assignment, not the target', 'A/m1 alive a=0_1 | B/m2 alive ts=0_1', '0_1 A:A'),
  drawer('a crashed standby holder is marked', 'A/m1 alive a=0_0 | B/m2 crashed s=0_0', '0_0 A:A S:B×'),
  { ...drawer('subtopology 1 does not include subtopology 10', 'A/m1 alive a=1_0,10_0', '1_0 A:A'), subtopology: '1' },
  drawer('nobody owns it', 'A/m1 alive a=1_0', '0_0 A:— !'),
  drawer('other subtopologies are left out', 'A/m1 alive a=0_0,1_0', '0_0 A:A'),
  cards('alive before crashed, threads with tasks in task order, active then standby', 'B/m2 crashed a=0_3 ms=6000 | A/m1 alive a=0_1,0_0 s=0_3', 'A alive [m1: 0_0A 0_1A 0_3S] | B crashed 6s [m2: 0_3A]'),
  cards('alive first even when the crashed process sorts first by name', 'A/m1 crashed a=0_0 | B/m2 alive a=0_1', 'B alive [m2: 0_1A] | A crashed [m1: 0_0A]'),
  cards('starting before crashed', 'A/m1 crashed a=0_0 | C/(starting) joining', 'C joining [(starting): ] | A crashed [m1: 0_0A]'),
  cards('a process with one starting thread is alive', 'A/m1 alive a=0_0 | A/(starting) joining', 'A alive [m1: 0_0A] [(starting): ]'),
  cards('tasks sort by subtopology, then partition', 'A/m1 alive a=1_0,0_1', 'A alive [m1: 0_1A 1_0A]'),
  cards('two threads in one process', 'A/m1 alive a=0_0 | A/m3 alive a=0_1', 'A alive [m1: 0_0A] [m3: 0_1A]'),
  { ...cards('crashed without a known kill time has no duration', 'B/m2 crashed a=0_0', 'B crashed [m2: 0_0A]'), id: 'CV10' },
  cards('an alive process with a recent heartbeat shows no duration', 'A/m1 alive a=0_0 ms=1500', 'A alive [m1: 0_0A]'),
  cards('a starting process', 'C/(starting) joining', 'C joining [(starting): ]'),
  cards('no members', '', ''),
]
