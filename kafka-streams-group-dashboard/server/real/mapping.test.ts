// Spec 001 (docs/specs/001-real-broker/spec.md): RB6 / RB12 mapping and RB15 events, driven by case files.
import { describe, expect, test } from 'bun:test'
import type { Change } from './events.cases'
import { testPlanRows as eventRows } from './events.cases'
import { testPlanRows as mappingRows } from './mapping.cases'
import { diffEvents, type InspectorAssignment, type InspectorGroup, type InspectorMember, toGroupView } from './mapping'

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
    const killed = new Set(row.killed ? ['process-A'] : [])
    const view = toGroupView(g, undefined, { joining: [], killed }, [])
    const m = view.members[0]
    expect(m.processId).toBe(row.expectedLabel)
    expect(m.state).toBe(row.expectedMemberState)
    expect(fmt(m.pendingRevocation)).toBe(row.expectedPendingRevocation)
    expect(m.status).toBe(row.expectedStatus)
    expect(view.state).toBe(row.expectedGroupState)
  })

  test('RB6: topology, task ids and stores come from the broker subtopologies', () => {
    const v = toGroupView(group(), undefined, { joining: [], killed: new Set() }, [])
    expect(v.tasks).toEqual(['0_0', '0_1', '1_0', '1_1'])
    expect(v.topology.subtopologies.map((s) => s.stores)).toEqual([[], ['counts-store']])
  })

  test('RB6: a started process without a member yet is shown as joining, a listed one is not', () => {
    const v = toGroupView(group(), undefined, { joining: ['process-A', 'process-B'], killed: new Set() }, [])
    expect(v.members.map((m) => [m.processId, m.status])).toEqual([
      ['process-A', 'alive'],
      ['process-B', 'joining'],
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
