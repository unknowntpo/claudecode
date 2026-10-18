// Spec 006 RS3: a task whose new owner has not committed yet while it has state to rebuild is restoring.
import { expect, test } from 'bun:test'
import { type GroupProgress, goneProcesses, stepProgress } from './progress'
import { testPlanRows } from './restore.cases'

test.each(testPlanRows)('$id: $case', (row) => {
  let state: GroupProgress | undefined
  let result: ReturnType<typeof stepProgress> | undefined
  const log: string[] = []
  for (const poll of row.polls.split(' ')) {
    const [t, rest] = poll.split(':')
    const [offsets, ownerAndSize] = rest.split('@')
    const [owner, size] = ownerAndSize.split('#')
    const [c, e] = offsets.split('/')
    const num = (v: string) => (v === '-' ? null : Number(v))
    result = stepProgress(state, Number(t), [
      { task: '1_0', committed: num(c), end: num(e), owner: owner === '-' ? null : owner, ...(size === undefined ? {} : { changelog: num(size) }) },
    ])
    state = result.next
    for (const task of result.restoreStarted) log.push(`start ${state.tasks[task].owner}`)
    for (const ms of Object.values(result.restoredMs)) log.push(`restored ${ms}`)
  }
  const restoring = result!.restoringMs['1_0']
  const stalled = result!.stalledMs['1_0']
  expect(restoring !== undefined ? `restoring ${restoring}` : stalled !== undefined ? `stalled ${stalled}` : 'ok').toBe(row.expected)
  expect(log.join(', ')).toBe(row.log)
})

test('RS4: a stalled thread makes its process fenced even while another restores; any restoring thread makes it gone while restoring', () => {
  const gone = (before: { memberId: string; processId: string; stalledMs: number | null; restoring?: boolean }[]) =>
    goneProcesses(before, new Set()).map((g) => `${g.processId} ${g.kind}`).join(', ')
  expect(gone([{ memberId: 'm1', processId: 'P', stalledMs: 9000 }, { memberId: 'm2', processId: 'P', stalledMs: null, restoring: true }])).toBe('P fenced')
  expect(gone([{ memberId: 'm1', processId: 'P', stalledMs: null, restoring: true }, { memberId: 'm2', processId: 'P', stalledMs: null }])).toBe('P restoring')
  expect(gone([{ memberId: 'm2', processId: 'P', stalledMs: null }, { memberId: 'm1', processId: 'P', stalledMs: null, restoring: true }])).toBe('P restoring')
  expect(gone([{ memberId: 'm1', processId: 'P', stalledMs: null }])).toBe('P left') // positive control
})
