// Spec 005: the console explains itself; only an InfoTip may carry an explanation.
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DICTIONARIES, t } from './i18n'

const REMOVED = ['overview.hint', 'tasks.hint', 'group.standbyNote']
const components = readdirSync(join(import.meta.dir, 'components')).map((f) => readFileSync(join(import.meta.dir, 'components', f), 'utf8'))

describe('self-explaining UI', () => {
  test('SX1: no hint or note texts; the standby rule lives in a tip in both languages', () => {
    for (const dict of Object.values(DICTIONARIES))
      expect(Object.keys(dict).filter((k) => /\.hint$|Note$/.test(k) || REMOVED.includes(k))).toEqual([])
    expect(t('en', 'tip.standby')).toContain('next rebalance') // positive control: the fact is still there
    expect(t('zh-Hant', 'tip.standby')).toContain('rebalance')
    for (const src of components) for (const key of REMOVED) expect(src).not.toContain(`'${key}'`)
  })

  test('SX3: empty states name the empty thing only', () => {
    for (const key of ['tasks.empty', 'processes.empty', 'log.empty'] as const)
      for (const lang of ['en', 'zh-Hant'] as const) {
        const text = t(lang, key)
        expect(text.length).toBeLessThan(24)
        expect(text).not.toMatch(/start|啟動|click|點選/i)
      }
  })
})
