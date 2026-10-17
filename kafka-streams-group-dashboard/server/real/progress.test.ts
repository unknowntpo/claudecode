// Spec 004 RO4 / RO11: stalled tasks and members that left or were fenced.
import { expect, test } from 'bun:test'
import { type GroupProgress, goneProcesses, stepProgress } from './progress'
import { testPlanRows } from './progress.cases'

test.each(testPlanRows)('$id: $case', (row) => {
  if (row.id === 'RO4') {
    let state: GroupProgress | undefined
    let result: ReturnType<typeof stepProgress> | undefined
    for (const poll of row.input.split(' ')) {
      const [t, rest] = poll.split(':')
      const [offsets, owner] = rest.split('@')
      const [c, e] = offsets.split('/')
      const num = (v: string) => (v === '-' ? null : Number(v))
      result = stepProgress(state, Number(t), [{ task: '0_0', committed: num(c), end: num(e), owner: owner ?? null }])
      state = result.next
    }
    const ms = result!.stalledMs['0_0']
    expect(`${ms === undefined ? 'ok' : `stalled ${ms}`} (threshold ${result!.thresholdMs})`).toBe(row.expected)
  } else {
    const before = row.input.split(' ').map((m) => {
      const [memberId, processId, stalled] = m.split(':')
      return { memberId, processId, stalledMs: stalled ? Number(stalled.split('=')[1]) : null }
    })
    const gone = goneProcesses(before, new Set(row.next.split(' ').filter(Boolean)))
    expect(gone.map((g) => `${g.processId} ${g.kind}${g.kind === 'fenced' ? ` ${g.stalledMs}` : ''}`).join(', ')).toBe(row.expected)
  }
})
