// Spec 006 RS3: a task whose new owner has not committed yet while it has state to rebuild is restoring.
import { expect, test } from 'bun:test'
import { type GroupProgress, stepProgress } from './progress'
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
