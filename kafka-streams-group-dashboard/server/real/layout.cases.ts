// Test plan rows for docs/specs/002-console/spec.md (rendered by `bun run docs:test-plan`).
// CS1: pipelineLayout turns subtopologies + topics into a left-to-right chain.

export interface LayoutCase {
  id: string
  case: string
  /** Subtopologies as "id:sources>repartitionSinks", sources may be repartition topics; ";" separated. */
  subtopologies: string
  sinks: string
  expected: string
}

export const testPlanRows: LayoutCase[] = [
  { id: 'CS1', case: 'word-count: two subtopologies joined by a repartition topic', subtopologies: '1:rep>;0:text-lines>rep', sinks: 'word-counts', expected: '[text-lines] → 0 → [rep] → 1 → [word-counts]' },
  { id: 'CS1', case: 'ids opposite to the data flow: 0 reads the repartition topic 1 writes', subtopologies: '0:rep>;1:text-lines>rep', sinks: 'out', expected: '[text-lines] → 1 → [rep] → 0 → [out]' },
  { id: 'CS1', case: 'order-enrichment: two source topics into one node (join)', subtopologies: '0:orders,customers>', sinks: 'enriched-orders', expected: '[orders, customers] → 0 → [enriched-orders]' },
  { id: 'CS1', case: 'page-view-sessions: one stateful node', subtopologies: '0:page-views>', sinks: 'user-sessions', expected: '[page-views] → 0 → [user-sessions]' },
  { id: 'CS1', case: 'no topology yet (EMPTY group)', subtopologies: '', sinks: 'word-counts', expected: '' },
]
