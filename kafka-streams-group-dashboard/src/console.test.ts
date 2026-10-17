// Spec 003 (docs/specs/003-console-v2/spec.md): CV1–CV10 as pure functions over GroupView.
import { describe, expect, test } from 'bun:test'
import type { GroupState, GroupView, MemberView } from '../shared/types'
import { drawerSubtopology, fencedCards, isBehind, maxLag, processCards, sortGroups, taskRows } from './console'
import { testPlanRows as consoleRows } from './console.cases'
import { testPlanRows as detailRows } from './detail.cases'
import { DICTIONARIES, detectLang, PROTECTED_TERMS, t } from './i18n'
import { parseRoute, routeHash } from './route'

/** "A/m1 alive a=0_0,0_1 s=0_3 t=0_2 r=0_2 ms=6000" → MemberView */
function member(spec: string): MemberView {
  const [who, status, ...parts] = spec.trim().split(/\s+/)
  const [processId, memberId] = who.split('/')
  const kv = Object.fromEntries(parts.map((p) => p.split('=')))
  const list = (k: string) => (kv[k] ? kv[k].split(',') : [])
  return {
    memberId,
    processId,
    clientId: `x-${processId}`,
    memberEpoch: 3,
    state: 'STABLE',
    status: status as MemberView['status'],
    assignment: { active: list('a'), standby: list('s') },
    pendingRevocation: { active: list('r'), standby: [] },
    target: { active: [...list('a').filter((x: string) => !list('r').includes(x)), ...list('t')], standby: kv.ts ? list('ts') : list('s') },
    stalledMs: status === 'stalled' ? Number(kv.ms ?? 0) : null,
  }
}

function view(over: Partial<GroupView> = {}): GroupView {
  return {
    groupId: 'g',
    state: 'STABLE',
    groupEpoch: 1,
    targetAssignmentEpoch: 1,
    numStandbyReplicas: 0,
    topology: { epoch: 0, subtopologies: [] },
    tasks: ['0_0', '0_1', '0_2', '0_3', '1_0', '10_0'],
    members: [],
    events: [],
    flow: null,
    configs: [],
    stalledTasks: {},
    stallThresholdMs: 5000,
    fenced: [],
    ...over,
  }
}

/** The group a member list describes: stalled members' active tasks are its stalled tasks. */
function groupOf(ms: MemberView[], over: Partial<GroupView> = {}): GroupView {
  const stalledTasks: Record<string, number> = {}
  for (const m of ms) if (m.status === 'stalled') for (const t of m.assignment.active) stalledTasks[t] = m.stalledMs ?? 0
  return view({ members: ms, stalledTasks, ...over })
}

const members = (s: string) => (s ? s.split(' | ').map(member) : [])

describe('order and behind', () => {
  test.each(consoleRows)('$id: $case', (row) => {
    if (row.id === 'CV1') {
      const groups = row.groups
        ? row.groups.split(' ').map((g) => {
            const [groupId, state, stalled] = g.split(':')
            return groupOf(stalled ? [member('B/m stalled a=0_0 ms=6000')] : [], { groupId, state: state as GroupState })
          })
        : []
      expect(sortGroups(groups).map((g) => g.groupId).join(' ')).toBe(row.expected)
    } else {
      const num = (v: string) => (v === '-' ? null : Number(v))
      const lags = Object.fromEntries(row.lag.split(',').map((l, i) => [String(i), num(l)]))
      const g = view({ topology: { epoch: 0, subtopologies: [] }, flow: { topics: [], lag: lags, inputRate: num(row.rate) } })
      expect(isBehind(g) ? 'behind' : 'ok').toBe(row.expected)
    }
  })
})

const fmtRow = (r: ReturnType<typeof taskRows>[number]) =>
  [
    r.task,
    `A:${r.move ?? (r.active.length ? r.active.join(',') : '—')}`,
    ...(r.standby.length ? [`S:${r.standby.join(',')}`] : []),
    ...(r.unowned ? ['!'] : []),
    ...(r.stalledMs !== null ? ['stalled'] : []),
  ].join(' ')

const fmtCard = (c: ReturnType<typeof processCards>[number]) =>
  [
    `${c.processId} ${c.status}${c.stalledMs ? ` ${Math.round(c.stalledMs / 1000)}s` : ''}`,
    ...c.threads.map((th) => `[${th.memberId}: ${th.tasks.map((x) => x.task + (x.role === 'active' ? 'A' : 'S')).join(' ')}]`),
  ].join(' ')

describe('drawer and processes', () => {
  test.each(detailRows)('$id: $case', (row) => {
    const g = groupOf(members(row.members))
    if (row.id === 'CV3') {
      const rows = taskRows(g, row.subtopology)
      expect(rows.every((r) => r.task.startsWith(`${row.subtopology}_`))).toBe(true)
      const focus = row.expected.split(' ')[0]
      expect(fmtRow(rows.find((r) => r.task === focus)!)).toBe(row.expected)
    } else {
      expect(processCards(g).map(fmtCard).join(' | ')).toBe(row.expected)
    }
  })
})

describe('fenced', () => {
  test('RO11: a fenced card lists its tasks in order with their new owners', () => {
    const g = groupOf([member('A/m1 alive a=0_3')], { fenced: [{ processId: 'B', fencedAt: 1, stalledMs: 9000, tasks: ['0_4', '0_3'] }] })
    expect(fencedCards(g)).toEqual([
      { processId: 'B', stalledMs: 9000, fencedAt: 1, tasks: [{ task: '0_3', nowOwnedBy: 'A' }, { task: '0_4', nowOwnedBy: null }] },
    ])
    expect(fencedCards(view())).toEqual([]) // positive control: nothing fenced
  })
})

describe('i18n', () => {
  test('CV5: both dictionaries have the same keys and never translate protocol terms', () => {
    expect(Object.keys(DICTIONARIES['zh-Hant']).sort()).toEqual(Object.keys(DICTIONARIES.en).sort())
    for (const dict of Object.values(DICTIONARIES))
      for (const value of Object.values(dict)) for (const term of PROTECTED_TERMS) expect(value).not.toContain(term)
    expect(t('zh-Hant', 'nav.overview')).toBe('總覽') // positive control: zh is really used
  })

  test('CV5: placeholders are filled in both languages', () => {
    expect(t('en', 'metric.stalled', { n: 2 })).toBe('2 stalled')
    expect(t('zh-Hant', 'metric.processCount', { n: 3 })).toBe('3 個 process')
  })

  test('CV5: a placeholder without a value stays visible as {name}', () => {
    expect(t('en', 'metric.stalled', {})).toBe('{n} stalled')
  })

  test('CV2: largest lag is null while every lag is unknown, not 0', () => {
    expect(maxLag(view({ flow: { topics: [], lag: { '0': null, '1': null }, inputRate: 5 } }))).toBeNull()
    expect(maxLag(view({ flow: { topics: [], lag: { '0': null, '1': 7 }, inputRate: 5 } }))).toBe(7)
  })

  test('CV7: a missing zh-Hant key falls back to English, never the key', () => {
    const en = { 'only.en': 'Only English' }
    expect(t('zh-Hant', 'only.en', {}, { en, 'zh-Hant': {} })).toBe('Only English')
    expect(t('en', 'nav.overview')).toBe('Overview')
  })

  test('CV8: an unknown stored language or throwing storage falls back to the browser default', () => {
    const throwing = { getItem: () => { throw new Error('blocked') } }
    expect(detectLang({ getItem: () => 'fr' }, ['zh-TW', 'en'])).toBe('zh-Hant')
    expect(detectLang(throwing, ['en-US'])).toBe('en')
    expect(detectLang({ getItem: () => 'en' }, ['zh-TW'])).toBe('en') // positive control: a valid stored choice wins
  })
})

describe('routes and drawer', () => {
  test('CV6: hash routes', () => {
    const ids = ['word-count']
    expect(parseRoute('#/', ids)).toEqual({ page: 'overview' })
    expect(parseRoute('#/group/word-count', ids)).toEqual({ page: 'group', groupId: 'word-count' })
    expect(parseRoute('#/group/nope', ids)).toEqual({ page: 'overview' })
    expect(parseRoute('#garbage', ids)).toEqual({ page: 'overview' })
    expect(parseRoute('', ids)).toEqual({ page: 'overview' })
  })

  test('CV6: routeHash and parseRoute round-trip, ids are encoded', () => {
    const ids = ['word-count', 'a b/c']
    for (const groupId of ids) expect(parseRoute(routeHash({ page: 'group', groupId }), ids)).toEqual({ page: 'group', groupId })
    expect(routeHash({ page: 'group', groupId: 'a b/c' })).toBe('#/group/a%20b%2Fc')
    expect(routeHash({ page: 'overview' })).toBe('#/')
  })

  test('CV9: the drawer closes when its subtopology disappears', () => {
    const sub = { id: '1', name: 'count', sourceTopics: [], repartitionSourceTopics: [], repartitionSinkTopics: [], stateChangelogTopics: [], sinkTopics: [], stores: [], partitions: 4 }
    const g = view({ topology: { epoch: 0, subtopologies: [sub] } })
    expect(drawerSubtopology(g, '1')?.id).toBe('1') // positive control
    const two = view({ topology: { epoch: 0, subtopologies: [{ ...sub, id: '0', name: 'split' }, sub] } })
    expect(drawerSubtopology(two, '1')?.name).toBe('count')
    expect(drawerSubtopology(two, '0')?.name).toBe('split')
    expect(drawerSubtopology(view(), '1')).toBeNull()
    expect(drawerSubtopology(g, null)).toBeNull()
  })
})

