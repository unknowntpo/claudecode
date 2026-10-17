// Spec 002 (docs/specs/002-console/spec.md): how rates, counts and states are shown in the console.
import { describe, expect, test } from 'bun:test'
import { badgeClass, formatCount, formatRate } from './format'

describe('format', () => {
  test('CS7: an unknown rate is shown as "—", never 0', () => {
    expect(formatRate(null)).toBe('—')
    expect(formatRate(undefined)).toBe('—')
    expect(formatRate(0)).toBe('0.0 rec/s') // positive control: a known 0 is a number
  })

  test('CS2: below 10 rec/s one decimal, from 10 rounded with thousands separators', () => {
    expect(formatRate(5)).toBe('5.0 rec/s')
    expect(formatRate(9.94)).toBe('9.9 rec/s')
    expect(formatRate(10)).toBe('10 rec/s')
    expect(formatRate(32.6)).toBe('33 rec/s')
    expect(formatRate(1234.4)).toBe('1,234 rec/s')
  })

  test('CS9: counts use thousands separators, unknown is "—"', () => {
    expect(formatCount(null)).toBe('—')
    expect(formatCount(undefined)).toBe('—')
    expect(formatCount(0)).toBe('0')
    expect(formatCount(12345)).toBe('12,345')
  })

  test('RB6: state badges follow the design system state language', () => {
    expect(badgeClass('STABLE')).toBe('sc-badge sc-badge--active')
    expect(badgeClass('alive')).toBe('sc-badge sc-badge--active')
    for (const s of ['RECONCILING', 'ASSIGNING', 'UNREVOKED_TASKS', 'UNRELEASED_TASKS'] as const)
      expect(badgeClass(s)).toBe('sc-badge sc-badge--revoking')
    expect(badgeClass('crashed')).toBe('sc-badge sc-badge--fenced')
    for (const s of ['EMPTY', 'NOT_READY', 'joining'] as const) expect(badgeClass(s)).toBe('sc-badge sc-badge--idle')
  })
})
