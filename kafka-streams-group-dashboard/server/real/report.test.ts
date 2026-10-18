// Spec 007 RP2 / RP3: restore progress from the task offsets members report (Kafka 4.4), with Spec 006 fallback.
import { expect, test } from 'bun:test'
import { type InspectorGroup, taskSamples } from './mapping'
import { type GroupProgress, stepProgress } from './progress'
import { testPlanRows } from './report.cases'

const CL = 'word-count-counts-store-changelog'
const member = (memberId: string, active: string[], standby: string[], reports: Record<string, [number, number]>) => ({
  memberId, memberEpoch: 3, processId: `uuid-${memberId}`, clientId: `word-count-${memberId}-StreamThread-1-consumer`,
  assignment: { active, standby, warmup: [] }, targetAssignment: { active, standby, warmup: [] },
  taskOffsets: Object.fromEntries(Object.entries(reports).map(([t, [o]]) => [t, o])),
  taskEndOffsets: Object.fromEntries(Object.entries(reports).map(([t, [, e]]) => [t, e])),
})

function formula(input: string, earliest: string): string {
  const reports: Record<string, Record<string, [number, number]>> = { owner: {}, standby: {} }
  for (const r of input.split(' ').filter(Boolean)) {
    const [who, v] = r.split('=')
    const [o, e] = v.split('/').map(Number)
    reports[who]['1_0'] = [o, e]
  }
  const g: InspectorGroup = {
    groupId: 'word-count', state: 'STABLE', groupEpoch: 1, targetAssignmentEpoch: 1, topologyEpoch: 0, numStandbyReplicas: 1,
    subtopologies: [{ id: '1', sourceTopics: ['text-lines'], repartitionSourceTopics: [], repartitionSinkTopics: [], stateChangelogTopics: [CL], partitions: 1 }],
    members: [member('owner', ['1_0'], [], reports.owner), member('standby', [], ['1_0'], reports.standby)],
    endOffsets: { [CL]: { '0': 833228 } },
    ...(earliest === '-' ? {} : { startOffsets: { [CL]: { '0': Number(earliest) } } }),
  }
  const p = taskSamples(g).find((s) => s.task === '1_0')!.progress
  return p === undefined ? 'none' : `${Math.round(p * 100)}%`
}

test.each(testPlanRows)('$id: $case', (row) => {
  if (row.id === 'RP2') {
    expect(formula(row.input, row.earliest)).toBe(row.expected)
    return
  }
  let state: GroupProgress | undefined
  let result: ReturnType<typeof stepProgress> | undefined
  const log: string[] = []
  for (const poll of row.input.split(' ')) {
    const [t, rest] = poll.split(':')
    const [offsets, tail] = rest.split('@')
    const [ownerAndSize, report] = tail.split('%')
    const [owner, size] = ownerAndSize.split('#')
    const [c, e] = offsets.split('/').map(Number)
    const progress = report === undefined ? undefined : (([r, total]) => r / total)(report.split('/').map(Number))
    result = stepProgress(state, Number(t), [{ task: '1_0', committed: c, end: e, owner, changelog: Number(size), ...(progress === undefined ? {} : { progress }) }])
    state = result.next
    for (const task of result.restoreStarted) log.push(`start ${state.tasks[task].owner}`)
    for (const ms of Object.values(result.restoredMs)) log.push(`restored ${ms}`)
  }
  const restoring = result!.restoringMs['1_0']
  const stalled = result!.stalledMs['1_0']
  const pct = result!.progress['1_0']
  const state1 = restoring !== undefined ? `restoring ${restoring}${pct ? ` ${Math.round(pct.fraction * 100)}%` : ''}` : stalled !== undefined ? `stalled ${stalled}` : 'ok'
  expect(state1).toBe(row.expected)
  expect(log.join(', ')).toBe(row.log)
})
