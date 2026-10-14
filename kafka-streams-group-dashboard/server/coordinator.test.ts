import { describe, expect, test } from 'bun:test'
import { stickyAssign } from './assignor'
import { SESSION_TIMEOUT_MS, StreamsGroup } from './coordinator'

const topology = {
  epoch: 0,
  subtopologies: [
    {
      id: '0',
      name: 'test',
      sourceTopics: ['in'],
      repartitionSourceTopics: [],
      repartitionSinkTopics: [],
      stateChangelogTopics: [],
      sinkTopics: [],
      stores: [],
      partitions: 4,
    },
  ],
}

/** Run heartbeats until nothing changes (no jitter, 3s steps). */
function settle(g: StreamsGroup, start: number, steps = 20): number {
  let now = start
  for (let i = 0; i < steps; i++) g.tick((now += 3000))
  return now
}

const allActive = (g: StreamsGroup) => [...g.members.values()].flatMap((m) => m.assignment.active).sort()

describe('stickyAssign', () => {
  test('balances active tasks and keeps previous owners', () => {
    const tasks = ['0_0', '0_1', '0_2', '0_3']
    const first = stickyAssign([{ memberId: 'a', processId: 'p1' }], tasks, new Map(), 0)
    expect(first.get('a')!.active).toEqual(tasks)

    const second = stickyAssign(
      [
        { memberId: 'a', processId: 'p1' },
        { memberId: 'b', processId: 'p2' },
      ],
      tasks,
      first,
      0,
    )
    expect(second.get('a')!.active).toHaveLength(2)
    expect(second.get('b')!.active).toHaveLength(2)
    // Sticky: everything a keeps it already had.
    for (const t of second.get('a')!.active) expect(first.get('a')!.active).toContain(t)
  })

  test('never places a standby on the same process as the active task', () => {
    const members = [
      { memberId: 'a1', processId: 'p1' },
      { memberId: 'a2', processId: 'p1' },
      { memberId: 'b1', processId: 'p2' },
    ]
    const result = stickyAssign(members, ['0_0', '0_1', '0_2'], new Map(), 1)
    for (const t of ['0_0', '0_1', '0_2']) {
      const holders = members.filter(
        (m) => result.get(m.memberId)!.active.includes(t) || result.get(m.memberId)!.standby.includes(t),
      )
      expect(holders).toHaveLength(2)
      expect(new Set(holders.map((h) => h.processId)).size).toBe(2)
    }
  })
})

describe('StreamsGroup reconciliation', () => {
  test('converges to STABLE with every task owned exactly once', () => {
    const g = new StreamsGroup('g', '', '', topology, () => 0)
    g.addMember(0)
    let now = settle(g, 0)
    expect(g.state).toBe('STABLE')
    expect(allActive(g)).toEqual(['0_0', '0_1', '0_2', '0_3'])

    g.addMember(now)
    now = settle(g, now)
    expect(g.state).toBe('STABLE')
    expect(allActive(g)).toEqual(['0_0', '0_1', '0_2', '0_3'])
    for (const m of g.members.values()) {
      expect(m.assignment.active).toHaveLength(2)
      expect(m.memberEpoch).toBe(g.groupEpoch)
    }
  })

  test('a task is never active on two members at the same time', () => {
    const g = new StreamsGroup('g', '', '', topology, () => 0)
    g.addMember(0)
    let now = settle(g, 0)
    g.addMember(now)
    g.addMember(now)
    for (let i = 0; i < 20; i++) {
      g.tick((now += 500))
      const active = allActive(g)
      expect(new Set(active).size).toBe(active.length)
    }
  })

  test('crashed member is fenced after the session timeout and its tasks move', () => {
    const g = new StreamsGroup('g', '', '', topology, () => 0)
    const a = g.addMember(0)
    const b = g.addMember(0)
    let now = settle(g, 0)
    g.crash(a)
    now = settle(g, now, Math.ceil(SESSION_TIMEOUT_MS / 3000) + 5)
    expect(g.members.has(a)).toBe(false)
    expect(g.members.get(b)!.assignment.active).toEqual(['0_0', '0_1', '0_2', '0_3'])
    expect(g.state).toBe('STABLE')
  })
})
