// Spec 001 (docs/specs/001-real-broker/spec.md): RB6 / RB12 mapping and RB15 events, driven by case files.
import { describe, expect, test } from 'bun:test'
import type { Change } from './events.cases'
import { testPlanRows as eventRows } from './events.cases'
import { testPlanRows as mappingRows } from './mapping.cases'
import { diffEvents, type InspectorAssignment, type InspectorGroup, type InspectorMember, taskSamples, toGroupView } from './mapping'

const quiet = { stalledTasks: {}, thresholdMs: 5000, fenced: [] }

/** "0_0,0_1|1_0" → active [0_0, 0_1], standby [1_0] */
const parse = (s: string): InspectorAssignment => {
  const [active, standby] = s.split('|').map((part) => (part ? part.split(',') : []))
  return { active, standby, warmup: [] }
}
const fmt = (a: { active: string[]; standby: string[] }) => `${a.active.join(',')}|${a.standby.join(',')}`

const member = (over: Partial<InspectorMember> = {}): InspectorMember => ({
  memberId: 'm-1',
  memberEpoch: 3,
  processId: 'uuid-1',
  clientId: 'word-count-process-A-StreamThread-1-consumer',
  assignment: parse('0_0|'),
  targetAssignment: parse('0_0|'),
  ...over,
})

const group = (over: Partial<InspectorGroup> = {}): InspectorGroup => ({
  groupId: 'word-count',
  state: 'STABLE',
  groupEpoch: 3,
  targetAssignmentEpoch: 3,
  topologyEpoch: 0,
  numStandbyReplicas: 0,
  subtopologies: [
    {
      id: '1',
      sourceTopics: [],
      repartitionSourceTopics: ['word-count-counts-store-repartition'],
      repartitionSinkTopics: [],
      stateChangelogTopics: ['word-count-counts-store-changelog'],
      partitions: 2,
    },
    {
      id: '0',
      sourceTopics: ['text-lines'],
      repartitionSourceTopics: [],
      repartitionSinkTopics: ['word-count-counts-store-repartition'],
      stateChangelogTopics: [],
      partitions: 2,
    },
  ],
  members: [member()],
  ...over,
})

describe('mapping', () => {
  test.each(mappingRows)('$id: $case', (row) => {
    const g = group({
      state: row.brokerState,
      members: [member({ clientId: row.clientId, assignment: parse(row.assignment), targetAssignment: parse(row.target) })],
    })
    const view = toGroupView(g, { ...quiet, stalledTasks: row.stalled ? { '0_0': 6000 } : {} }, [])
    const m = view.members[0]
    expect(m.processId).toBe(row.expectedLabel)
    expect(m.state).toBe(row.expectedMemberState)
    expect(fmt(m.pendingRevocation)).toBe(row.expectedPendingRevocation)
    expect(m.status).toBe(row.expectedStatus)
    expect(view.state).toBe(row.expectedGroupState)
  })

  test('RB6: topology, task ids and stores come from the broker subtopologies', () => {
    const v = toGroupView(group(), quiet, [])
    expect(v.tasks).toEqual(['0_0', '0_1', '1_0', '1_1'])
    expect(v.topology.subtopologies.map((s) => s.stores)).toEqual([[], ['counts-store']])
  })

  test('RB6: assignment and target are listed in task order', () => {
    const m = member({ assignment: parse('1_0,0_1,0_0|1_1,0_0'), targetAssignment: parse('1_1,0_0|1_0,0_1') })
    const v = toGroupView(group({ members: [m] }), quiet, [])
    expect(fmt(v.members[0].assignment)).toBe('0_0,0_1,1_0|0_0,1_1')
    expect(fmt(v.members[0].target)).toBe('0_0,1_1|0_1,1_0')
  })

  test('CS5: configs pass through, and an older inspector without configs gives []', () => {
    const configs = [{ key: 'streams.session.timeout.ms', value: '10000', source: 'group' as const }]
    expect(toGroupView(group({ configs }), quiet, []).configs).toEqual(configs) // positive control
    expect(toGroupView(group(), quiet, []).configs).toEqual([])
  })

  test("RO4: stalled ms is the longest stall among the member's active tasks", () => {
    const m = member({ assignment: parse('0_0,0_1|'), targetAssignment: parse('0_0,0_1|') })
    const v = toGroupView(group({ members: [m] }), { ...quiet, stalledTasks: { '0_0': 6000, '0_1': 9000, '1_0': 99000 } }, [])
    expect(v.members[0].stalledMs).toBe(9000)
    expect(toGroupView(group({ members: [m] }), quiet, []).members[0].stalledMs).toBeNull() // positive control
  })

  test('RO4: a subtopology without input topics has unknown offsets, not 0', () => {
    const g = group({ subtopologies: [{ id: '0', sourceTopics: [], repartitionSourceTopics: [], repartitionSinkTopics: [], stateChangelogTopics: [], partitions: 1 }], members: [] })
    expect(taskSamples(g)).toEqual([{ task: '0_0', committed: null, end: null, owner: null }])
  })

  test('RO4: task samples sum the input partitions of each task', () => {
    const g = group({
      endOffsets: { 'text-lines': { '0': 10, '1': 20 }, 'word-count-counts-store-repartition': { '0': 5, '1': 7 } },
      committedOffsets: { 'text-lines': { '0': 9 }, 'word-count-counts-store-repartition': { '0': 5, '1': 6 } },
    })
    expect(taskSamples(g)).toEqual([
      { task: '1_0', committed: 5, end: 5, owner: null },
      { task: '1_1', committed: 6, end: 7, owner: null },
      { task: '0_0', committed: 9, end: 10, owner: 'm-1' },
      { task: '0_1', committed: null, end: 20, owner: null },
    ])
  })
})

/** Builds the (prev, next) pair for one event-table row. */
function scenario(change: Change): [InspectorGroup | undefined, InspectorGroup] {
  const prev = group()
  const m1 = prev.members[0]
  const m2 = member({ memberId: 'm-2', processId: 'uuid-2', clientId: 'word-count-process-B-StreamThread-1-consumer' })
  switch (change) {
    case 'none':
      return [prev, group()]
    case 'first poll':
      return [undefined, prev]
    case 'member joined':
      return [prev, group({ members: [m1, m2] })]
    case 'member left':
      return [prev, group({ members: [] })]
    case 'group state changed':
      return [prev, group({ state: 'RECONCILING' })]
    case 'group epoch bumped':
      return [prev, group({ groupEpoch: 4 })]
    case 'target assignment epoch bumped':
      return [prev, group({ targetAssignmentEpoch: 4 })]
    case 'member assignment changed':
      return [{ ...prev, members: [member({ assignment: parse('0_0,0_1|') })] }, prev]
    case 'member standby changed':
      return [prev, group({ members: [member({ assignment: parse('0_0|1_0') })] })]
    case 'member epoch bumped':
      return [prev, group({ members: [member({ memberEpoch: 4 })] })]
  }
}

describe('events', () => {
  test.each(eventRows)('$id: $change', (row) => {
    const [prev, next] = scenario(row.change)
    const events = diffEvents(prev, next)
    expect(events.map((e) => e.kind).join(',')).toBe(row.expectedKinds)
    if (row.expectedMessageContains) expect(events.map((e) => e.message).join('\n')).toContain(row.expectedMessageContains)
  })
})
