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
          sourceTopics: ins.filter((t) => !t.startsWith('rep')),
          repartitionSourceTopics: ins.filter((t) => t.startsWith('rep')),
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
      { name: 'counts-changelog', kind: 'changelog' as const, endOffset: 40 },
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
    const flow = computeFlow(g, { 'text-lines': 100, 'counts-changelog': 30 }, 10_000) // positive control for CS10
    expect(flow.topics.map((t) => t.rate)).toEqual([5, 1])
    expect(flow.inputRate).toBe(5)
  })
})

describe('computeFlow: word-count with a repartition topic', () => {
  const rep = 'word-count-counts-store-repartition'
  const wc = (topics: { name: string; kind: 'source' | 'repartition' | 'changelog'; endOffset?: number }[]) => ({
    topics,
    committed: { 'text-lines': 140, [rep]: 900 },
    subtopologies: [
      { id: '0', sourceTopics: ['text-lines'], repartitionSourceTopics: [] },
      { id: '1', sourceTopics: [], repartitionSourceTopics: [rep] },
    ],
  })
  const all = wc([
    { name: 'text-lines', kind: 'source', endOffset: 150 },
    { name: rep, kind: 'repartition', endOffset: 1000 },
    { name: 'word-count-counts-store-changelog', kind: 'changelog', endOffset: 500 },
    { name: 'counts-changelog', kind: 'changelog', endOffset: 40 },
  ])
  const previous = { 'text-lines': 100, [rep]: 600, 'word-count-counts-store-changelog': 400, 'counts-changelog': 30 }

  test('CS3: a subtopology fed by a repartition topic has lag from that topic', () => {
    expect(computeFlow(all, previous, 10_000).lag).toEqual({ '0': 10, '1': 100 })
  })

  test('CS2: the input rate sums source topics only, not repartition or changelog', () => {
    const flow = computeFlow(all, previous, 10_000)
    expect(flow.topics.map((t) => t.rate)).toEqual([5, 40, 10, 1]) // positive control: every topic has a rate
    expect(flow.inputRate).toBe(5)
  })

  test('CS9: a topic missing from the previous poll has no rate yet, and the input rate is unknown', () => {
    const twoSources = {
      ...all,
      topics: [...all.topics, { name: 'more-lines', kind: 'source' as const, endOffset: 70 }],
    }
    const flow = computeFlow(twoSources, previous, 10_000) // previous has no `more-lines`
    expect(flow.topics.find((t) => t.name === 'more-lines')!.rate).toBeNull()
    expect(flow.topics.find((t) => t.name === 'text-lines')!.rate).toBe(5)
    expect(flow.inputRate).toBeNull()
  })

  test('CS9: a topic that does not exist has endOffset null, no rate, and its subtopology no lag', () => {
    const flow = computeFlow(wc([{ name: 'text-lines', kind: 'source', endOffset: 150 }, { name: rep, kind: 'repartition' }]), { [rep]: 0 }, 10_000)
    const t = flow.topics.find((x) => x.name === rep)!
    expect(t.endOffset).toBeNull()
    expect(t.rate).toBeNull()
    expect(flow.lag).toEqual({ '0': 10, '1': null })
  })

  test('CS9: a group without source topics has an unknown input rate, not 0', () => {
    const flow = computeFlow(wc([{ name: 'counts-changelog', kind: 'changelog', endOffset: 40 }]), { 'counts-changelog': 30 }, 10_000)
    expect(flow.topics[0].rate).toBe(1) // positive control: a changelog topic still has a rate
    expect(flow.inputRate).toBeNull()
  })
})

describe('node filter', () => {
  const tasks = ['0_0', '0_1', '1_0', '1_1', '10_0']
  test('CS4: a selected subtopology keeps only its tasks; no selection keeps all', () => {
    expect(tasksOf(tasks, '1')).toEqual(['1_0', '1_1'])
    expect(tasksOf(tasks, '10')).toEqual(['10_0'])
    expect(tasksOf(tasks, null)).toEqual(tasks)
  })
})
