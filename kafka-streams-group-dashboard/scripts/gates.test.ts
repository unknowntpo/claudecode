// Tests for the spec gates themselves (docs/process/workflow.md).
import { describe, expect, test } from 'bun:test'
import { acceptanceItems, runsCaseFile, testTitles, untracedItems } from './check-spec-traceability'
import { renderSpec, renderTable } from './render-test-plan'

const spec = `Traceability: enforced

## Acceptance
- A1: traced
- A2: [deploy] proven by deployment
- A3: missing

## Non-goals
- N1: not an acceptance item
`

describe('check-spec-traceability', () => {
  test('finds untagged acceptance IDs without a test, ignores tagged ones and other sections', () => {
    const items = acceptanceItems('s.md', spec)
    expect(items.map((i) => i.id)).toEqual(['A1', 'A2', 'A3'])
    const titles = testTitles(`test('A1: works', () => {})`)
    expect(untracedItems(items, titles).map((i) => i.id)).toEqual(['A3'])
    expect(untracedItems(items, titles, new Set(['s.md#A3']))).toEqual([])
  })

  test('ignores specs that are not enforced', () => {
    expect(acceptanceItems('s.md', spec.replace('enforced', 'off'))).toEqual([])
  })

  test('a case file counts only when a test runs it with test.each', () => {
    const src = `import { testPlanRows } from './x.cases'\ntest.each(testPlanRows)('$id', () => {})`
    expect(runsCaseFile(src, 'server/x.cases.ts')).toBe(true)
    expect(runsCaseFile(src.replace('test.each', 'test'), 'server/x.cases.ts')).toBe(false)
  })
})

describe('render-test-plan', () => {
  test('renders rows into the marked block and detects drift', async () => {
    const md = '<!-- test-plan:start x.ts -->\nold\n<!-- test-plan:end -->'
    const out = await renderSpec(md, async () => [{ id: 'A1', ok: true, note: null }])
    expect(out).toBe(`<!-- test-plan:start x.ts -->\n${renderTable([{ id: 'A1', ok: true, note: null }])}<!-- test-plan:end -->`)
    expect(renderTable([{ id: 'A1', ok: true, note: null }])).toContain('| A1 | yes | — |')
  })
})
