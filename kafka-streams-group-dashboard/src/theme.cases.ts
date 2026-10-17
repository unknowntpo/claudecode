// Test plan rows for docs/specs/003-console-v2/spec.md (rendered by `bun run docs:test-plan`).
// CV15: the stored theme choice and the data-theme attribute it sets on <html>.

import type { ThemeChoice } from './theme'

export interface ThemeCase {
  id: string
  case: string
  /** What localStorage holds; "(throws)" = storage blocked, "(none)" = nothing stored. */
  stored: string
  choice: ThemeChoice
  dataTheme: string
}

export const testPlanRows: ThemeCase[] = [
  { id: 'CV15', case: 'nothing stored', stored: '(none)', choice: 'system', dataTheme: '(no attribute)' },
  { id: 'CV15', case: 'light stored', stored: 'light', choice: 'light', dataTheme: 'light' },
  { id: 'CV15', case: 'dark stored', stored: 'dark', choice: 'dark', dataTheme: 'dark' },
  { id: 'CV15', case: 'system stored', stored: 'system', choice: 'system', dataTheme: '(no attribute)' },
  { id: 'CV15', case: 'unknown value', stored: 'sepia', choice: 'system', dataTheme: '(no attribute)' },
  { id: 'CV15', case: 'storage throws', stored: '(throws)', choice: 'system', dataTheme: '(no attribute)' },
]
