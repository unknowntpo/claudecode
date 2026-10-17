// Spec 002 (docs/specs/002-console/spec.md): CS1 layout, CS2/CS3/CS9/CS10 flow math, CS4 node filter.
import { describe, expect, test } from 'bun:test'
import { layoutText, pipelineLayout, tasksOf } from '../../shared/pipeline'
import { computeFlow, subtopologyLag, topicRate } from './flow'
import { testPlanRows as flowRows } from './flow.cases'
import { testPlanRows as layoutRows } from './layout.cases'

const parseSubs = (s: string) =>
  s
    ? s.split(';').map((part) => {
        const [id, rest] = part.split(':')
        const [inputs, outs] = rest.split('>')
        const ins = inputs ? inputs.split(',') : []
        return {
          id,
          sourceTopics: ins.filter((t) => t !== 'rep'),
          repartitionSourceTopics: ins.filter((t) => t === 'rep'),
          repartitionSinkTopics: outs ? outs.split(',') : [],
        }
      })
    : []

describe('layout', () => {
  test.each(layoutRows)('$id: $case', (row) => {
    expect(layoutText(pipelineLayout(parseSubs(row.subtopologies), row.sinks.split(',')))).toBe(row.expected)
  })
})

describe('flow', () => {
  test.each(flowRows)('$id: $case', (row) => {
    if (row.id === 'CS3') {
      const inputs = row.lagInputs
        ? row.lagInputs.split(',').map((p) => {
            const [end, committed] = p.split('/')
            return { end: Number(end), committed: committed === '-' ? undefined : Number(committed) }
          })
        : []
      expect(subtopologyLag(inputs)).toBe(row.expected)
    } else {
      expect(topicRate(row.previous, row.next, row.elapsedMs)).toBe(row.expected)
    }
  })
})

describe('computeFlow', () => {
  const g = {
    topics: [
      { name: 'text-lines', kind: 'source' as const, endOffset: 150 },
      { name: 'word-counts', kind: 'sink' as const, endOffset: 40 },
    ],
    committed: { 'text-lines': 140 },
    subtopologies: [{ id: '0', sourceTopics: ['text-lines'], repartitionSourceTopics: [] }],
  }

  test('CS10: the first poll has no rates, but lag is already known', () => {
    const flow = computeFlow(g, null, 0)
    expect(flow.topics.map((t) => t.rate)).toEqual([null, null])
    expect(flow.inputRate).toBeNull()
    expect(flow.lag).toEqual({ '0': 10 })
  })

  test('CS2: a second poll gives rates per topic and the input rate', () => {
    const flow = computeFlow(g, { 'text-lines': 100, 'word-counts': 30 }, 10_000) // positive control for CS10
    expect(flow.topics.map((t) => t.rate)).toEqual([5, 1])
    expect(flow.inputRate).toBe(5)
  })
})

describe('node filter', () => {
  const tasks = ['0_0', '0_1', '1_0', '1_1']
  test('CS4: a selected subtopology keeps only its tasks; no selection keeps all', () => {
    expect(tasksOf(tasks, '1')).toEqual(['1_0', '1_1'])
    expect(tasksOf(tasks, null)).toEqual(tasks)
  })
})
