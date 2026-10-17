// Test plan rows for docs/specs/003-console-v2/spec.md (rendered by `bun run docs:test-plan`).
// CV1: sidebar and overview order. CV2: when a group is "behind".

export interface ConsoleCase {
  id: string
  case: string
  /** CV1: groups as "id:state[:crashed]" separated by spaces. */
  groups: string
  /** CV2: largest subtopology lag and input rate ("-" = unknown). */
  lag: string
  rate: string
  expected: string
}

const order = (c: string, groups: string, expected: string): ConsoleCase => ({ id: 'CV1', case: c, groups, lag: '', rate: '', expected })
const behind = (c: string, lag: string, rate: string, expected: 'behind' | 'ok'): ConsoleCase => ({ id: 'CV2', case: c, groups: '', lag, rate, expected })

export const testPlanRows: ConsoleCase[] = [
  order('crashed member first, then transitional states, then the rest', 'word-count:STABLE pvs:STABLE:crashed orders:RECONCILING', 'pvs orders word-count'),
  order('same rank sorts by id', 'zeta:STABLE alpha:STABLE', 'alpha zeta'),
  order('ASSIGNING and NOT_READY rank with RECONCILING', 'b:STABLE a:NOT_READY c:ASSIGNING', 'a c b'),
  order('EMPTY ranks with STABLE', 'b:EMPTY a:STABLE', 'a b'),
  order('no groups', '', ''),
  behind('lag above 5 s of input', '30', '5', 'behind'),
  behind('the largest of several subtopology lags counts', '2,30', '5', 'behind'),
  behind('an EMPTY group whose input keeps arriving is behind (human, 2026-10-17)', '3013', '9.9', 'behind'),
  behind('lag exactly 5 s of input is not behind', '25', '5', 'ok'),
  behind('lag below 5 s of input', '4', '5', 'ok'),
  behind('unknown rate and some lag', '3', '-', 'behind'),
  behind('unknown rate and no lag', '0', '-', 'ok'),
  behind('unknown lag', '-', '5', 'ok'),
]
