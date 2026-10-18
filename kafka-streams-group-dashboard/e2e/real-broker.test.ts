// E2E against a real Kafka 4.1 broker and the demo applications as docker compose services (Spec 004).
// `bun run test:e2e` brings the demo up, drives it with docker compose / docker kill / docker stop, and only
// observes it through the console backend, which never touches the applications.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import type { GroupView } from '../shared/types'
import { RealBackend } from '../server/real/backend'

const INSPECTOR = 'http://localhost:18085'
const GROUP = 'word-count'
const TEXT_LINES_PARTITIONS = 12
const PARTITION_IDS = Array.from({ length: TEXT_LINES_PARTITIONS }, (_, p) => String(p))
const ALL_TASKS = ['0', '1'].flatMap((s) => PARTITION_IDS.map((p) => `${s}_${p}`)).sort()
const DEMO_GROUPS = ['order-enrichment', 'page-view-sessions', 'word-count']
const PROJECT = 'kafka-streams-group-dashboard'
const TIMEOUT = 180_000
const cwd = `${import.meta.dir}/..`

let backend: RealBackend

const compose = (...args: string[]) => Bun.$`docker compose ${args}`.cwd(cwd).quiet()
const container = (n: number) => `${PROJECT}-word-count-${n}`
const view = (): GroupView | undefined => backend.snapshot().groups.find((g) => g.groupId === GROUP)
const labels = (g: GroupView) => [...new Set(g.members.map((m) => m.processId))].sort()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitFor(what: string, ok: (g: GroupView) => boolean, timeoutMs: number): Promise<number> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await backend.tick({ force: true })
    const g = view()
    if (g && ok(g)) return Date.now() - start
    await sleep(300)
  }
  throw new Error(`timed out after ${timeoutMs} ms waiting for: ${what}\n${JSON.stringify(view()?.members, null, 1)}`)
}

const stable = (members: number) => (g: GroupView) =>
  g.state === 'STABLE' && g.members.length === members && g.members.every((m) => m.state === 'STABLE')
const partitioned = (g: GroupView) => JSON.stringify(g.members.flatMap((m) => m.assignment.active).sort()) === JSON.stringify(ALL_TASKS)

async function instances(n: number, threads = 1) {
  await Bun.$`docker compose up -d --scale word-count=${n} word-count`.cwd(cwd).env({ ...process.env, WORD_COUNT_THREADS: String(threads) }).quiet()
  await waitFor(`${n} instance(s) × ${threads} thread(s) STABLE`, (g) => stable(n * threads)(g) && partitioned(g), 90_000)
}

describe.skipIf(!process.env.E2E)('real broker + compose demo', () => {
  beforeAll(async () => {
    await compose('up', '-d', '--build', '--scale', 'word-count=1')
    backend = new RealBackend({ inspectorUrl: INSPECTOR })
    const start = Date.now()
    while (Date.now() - start < 60_000) {
      await backend.tick({ force: true })
      if (!backend.snapshot().error && view()) break
      await sleep(500)
    }
    expect(backend.snapshot().error).toBeUndefined()
    await instances(1)
  }, TIMEOUT)

  afterEach(async () => {
    await backend.handle({ type: 'setStandbyReplicas', groupId: GROUP, value: 0 })
    await instances(1)
  }, TIMEOUT)

  afterAll(() => backend?.close())

  test('RO1: the console lists exactly the streams groups the broker has', async () => {
    const res = await (await fetch(`${INSPECTOR}/groups`)).json()
    expect(res.groups.map((g: { groupId: string }) => g.groupId).sort()).toEqual(DEMO_GROUPS)
    expect(backend.snapshot().groups.map((g) => g.groupId).sort()).toEqual(DEMO_GROUPS)
  }, TIMEOUT)

  test('RB1: inspector returns the contract for a running group', async () => {
    const [g] = (await (await fetch(`${INSPECTOR}/groups?ids=${GROUP}`)).json()).groups
    for (const key of ['groupId', 'state', 'groupEpoch', 'targetAssignmentEpoch', 'topologyEpoch', 'numStandbyReplicas', 'subtopologies', 'members', 'topics', 'committed', 'configs', 'endOffsets', 'committedOffsets'])
      expect(Object.keys(g)).toContain(key)
    expect(g.subtopologies.map((s: { id: string; partitions: number }) => [s.id, s.partitions])).toEqual([['0', TEXT_LINES_PARTITIONS], ['1', TEXT_LINES_PARTITIONS]])
    expect(Object.keys(g.members[0])).toEqual(['memberId', 'memberEpoch', 'processId', 'clientId', 'assignment', 'targetAssignment'])
    expect(Object.keys(g.endOffsets['text-lines']).sort()).toEqual([...PARTITION_IDS].sort())
  }, TIMEOUT)

  test('RB2: an unknown group is EMPTY', async () => {
    const [g] = (await (await fetch(`${INSPECTOR}/groups?ids=no-such-group`)).json()).groups
    expect(g).toMatchObject({ groupId: 'no-such-group', state: 'EMPTY', members: [], subtopologies: [] })
  }, TIMEOUT)

  test('RB3: two instances split the tasks; RO2: they are labelled by container', async () => {
    await instances(2)
    const g = view()!
    expect(labels(g)).toEqual(['word-count-1', 'word-count-2'])
    for (const label of labels(g))
      expect(g.members.filter((m) => m.processId === label).flatMap((m) => m.assignment.active).length).toBeGreaterThan(0)
  }, TIMEOUT)

  test('RB13: once the new member joins, the group is STABLE within 8 s', async () => {
    await Bun.$`docker compose up -d --scale word-count=2 word-count`.cwd(cwd).quiet()
    await waitFor('second member joined', (g) => g.members.length === 2, 90_000)
    const ms = await waitFor('2 instances STABLE', (g) => stable(2)(g) && partitioned(g), 8_000)
    console.log(`RB13 measured: STABLE ${ms} ms after the second member joined`)
  }, TIMEOUT)

  test('RB4: an instance with two StreamThreads is two members of one process', async () => {
    await instances(1, 2)
    const g = view()!
    expect(g.members).toHaveLength(2)
    expect(labels(g)).toEqual(['word-count-1'])
  }, TIMEOUT)

  test('RB5: after the next rebalance each stateful task has one standby on another process', async () => {
    await instances(2)
    await backend.handle({ type: 'setStandbyReplicas', groupId: GROUP, value: 1 })
    await Bun.$`docker compose up -d --scale word-count=3 word-count`.cwd(cwd).quiet() // the next rebalance
    await waitFor('3 instances STABLE with standbys', (g) => stable(3)(g) && g.members.some((m) => m.assignment.standby.length > 0), 90_000)
    const g = view()!
    expect(g.numStandbyReplicas).toBe(1)
    const owner = (t: string, kind: 'active' | 'standby') => g.members.filter((m) => m.assignment[kind].includes(t))
    for (const t of ['1_0', '1_1', '1_2', '1_3']) {
      const [standby, ...more] = owner(t, 'standby')
      expect(more).toEqual([])
      expect(standby.processId).not.toBe(owner(t, 'active')[0].processId)
    }
    for (const t of ['0_0', '0_1', '0_2', '0_3']) expect(owner(t, 'standby')).toEqual([])
  }, TIMEOUT)

  test('RO5: a killed instance is stalled within 10 s, then fenced; CS8: its lag grows', async () => {
    await instances(2)
    await waitFor('lag known', (g) => g.flow?.lag['0'] != null, 15_000)
    const before = view()!.flow!.lag['0']!
    await Bun.$`docker kill ${container(2)}`.quiet()
    const stalledAfter = await waitFor('word-count-2 stalled', (g) => g.members.some((m) => m.processId === 'word-count-2' && m.status === 'stalled'), 10_000)
    console.log(`RO5 measured: stalled ${stalledAfter} ms after docker kill (threshold ${view()!.stallThresholdMs} ms)`)
    await waitFor('subtopology 0 lag grows', (g) => (g.flow?.lag['0'] ?? 0) > before, 10_000)
    const fencedAfter = await waitFor('word-count-2 fenced', (g) => g.fenced.some((f) => f.processId === 'word-count-2'), 25_000)
    console.log(`RO5 measured: fenced ${stalledAfter + fencedAfter} ms after docker kill`)
    await waitFor('survivor owns everything', (g) => stable(1)(g) && partitioned(g), 25_000)
    expect(view()!.events.map((e) => e.message).join('\n')).toContain('word-count-2 fenced after no progress')
    // the stall clears: the survivor that took the tasks over is never flagged (verifier, 2026-10-18)
    for (let i = 0; i < 10; i++) {
      await backend.tick({ force: true })
      expect(view()!.members.filter((m) => m.status === 'stalled').map((m) => m.processId)).toEqual([])
      await sleep(500)
    }
  }, TIMEOUT)

  test('RO6: a stopped instance leaves at once, without stalling or a fenced card', async () => {
    await instances(2)
    const stoppedAt = Date.now()
    await Bun.$`docker stop ${container(2)}`.quiet()
    const ms = await waitFor('word-count-2 left', (g) => !labels(g).includes('word-count-2'), 9_000)
    console.log(`RO6 measured: left ${ms} ms after docker stop`)
    // a card from an earlier test may still be inside its 60 s; none may come from this stop
    expect(view()!.fenced.filter((f) => f.fencedAt >= stoppedAt)).toEqual([])
    expect(view()!.events.map((e) => e.message)).toContain('word-count-2 left')
  }, TIMEOUT)

  test('CS5: inspector reports topics by kind and group configs with their source', async () => {
    const [g] = (await (await fetch(`${INSPECTOR}/groups?ids=${GROUP}`)).json()).groups
    const kinds = Object.fromEntries(g.topics.map((t: { name: string; kind: string }) => [t.name, t.kind]))
    expect(kinds).toEqual({
      'text-lines': 'source',
      'word-count-counts-store-repartition': 'repartition',
      'word-count-counts-store-changelog': 'changelog',
    })
    const configs = Object.fromEntries(g.configs.map((c: { key: string; source: string }) => [c.key, c.source]))
    expect(configs['streams.session.timeout.ms']).toBe('group')
  }, TIMEOUT)

  test('CS6: records flow through both subtopologies within 30 s', async () => {
    const changelog = () => view()?.flow?.topics.find((t) => t.name === 'word-count-counts-store-changelog')?.endOffset ?? null
    await waitFor('changelog offset known', () => changelog() !== null, 10_000)
    const start = changelog()!
    const ms = await waitFor(
      'text-lines rate > 0 and the changelog growing',
      (g) => (g.flow?.topics.find((t) => t.name === 'text-lines')?.rate ?? 0) > 0 && (changelog() ?? 0) > start,
      30_000,
    )
    console.log(`CS6 measured: flow seen in ${ms} ms`)
  }, TIMEOUT)

  test('CS11: GET /groups answers within 1000 ms (RO9: with discovery)', async () => {
    let slowest = 0
    for (let i = 0; i < 20; i++) {
      const start = performance.now()
      await (await fetch(`${INSPECTOR}/groups`)).json()
      slowest = Math.max(slowest, performance.now() - start)
    }
    console.log(`CS11 / RO9 measured: slowest ${slowest.toFixed(1)} ms of 20`)
    expect(slowest).toBeLessThan(1000)
  }, TIMEOUT)

  test('RB17: after a broker restart an empty group is EMPTY (RO7: and the others are still described)', async () => {
    await Bun.$`docker compose up -d --scale word-count=0 word-count`.cwd(cwd).quiet()
    await waitFor('word-count empty', (g) => g.members.length === 0, 30_000)
    await compose('restart', 'kafka')
    let body: { groups: { groupId: string; state: string }[] } | undefined
    const start = Date.now()
    while (Date.now() - start < 90_000) {
      const res = await fetch(`${INSPECTOR}/groups`).catch(() => undefined)
      if (res?.status === 200) {
        body = await res.json()
        if (body!.groups.length === DEMO_GROUPS.length) break
      }
      await sleep(1000)
    }
    const states = Object.fromEntries(body!.groups.map((g) => [g.groupId, g.state]))
    expect(states[GROUP]).toBe('EMPTY')
    expect(Object.keys(states).sort()).toEqual(DEMO_GROUPS)
  }, TIMEOUT)
})
