// Spec 003 CV15: theme choice and the data-theme attribute.
import { expect, test } from 'bun:test'
import { detectTheme, themeAttribute } from './theme'
import { testPlanRows } from './theme.cases'

test.each(testPlanRows)('$id: $case', (row) => {
  const storage = {
    getItem: () => {
      if (row.stored === '(throws)') throw new Error('blocked')
      return row.stored === '(none)' ? null : row.stored
    },
  }
  const choice = detectTheme(storage)
  expect(choice).toBe(row.choice)
  expect(themeAttribute(choice) ?? '(no attribute)').toBe(row.dataTheme)
})
