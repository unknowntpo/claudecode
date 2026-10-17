// Test plan rows for docs/specs/002-console/spec.md (rendered by `bun run docs:test-plan`).
// CS2 / CS9 / CS10: topic rate from two polls. CS3: subtopology lag.

export interface FlowCase {
  id: string
  case: string
  /** rate rows: previous and next end offset (null = missing), elapsed ms. lag rows: "end/committed" pairs. */
  previous: number | null
  next: number | null
  elapsedMs: number
  lagInputs: string
  expected: number | null
}

const rate = (id: string, c: string, previous: number | null, next: number | null, elapsedMs: number, expected: number | null): FlowCase =>
  ({ id, case: c, previous, next, elapsedMs, lagInputs: '', expected })
const lag = (c: string, lagInputs: string, expected: number | null): FlowCase =>
  ({ id: 'CS3', case: c, previous: null, next: null, elapsedMs: 0, lagInputs, expected })

export const testPlanRows: FlowCase[] = [
  rate('CS2', '25 records in 5 s', 100, 125, 5000, 5),
  rate('CS2', 'no new records', 125, 125, 1000, 0),
  rate('CS2', 'offset went down (topic recreated)', 125, 3, 1000, null),
  rate('CS2', 'no time elapsed', 100, 125, 0, null),
  rate('CS9', 'topic does not exist yet', null, null, 1000, null),
  rate('CS9', 'topic appeared since the last poll', null, 40, 1000, null),
  rate('CS10', 'first poll after start', null, 125, 0, null),
  lag('one input topic', '120/100', 20),
  lag('two input topics summed', '120/100,50/45', 25),
  lag('committed ahead of end is clamped to 0', '100/104', 0),
  lag('an input without committed offset', '120/-', null),
  lag('no input topics', '', null),
]
