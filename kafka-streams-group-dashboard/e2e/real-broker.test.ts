// Spec 001 E2E against a real Kafka 4.1 broker: `docker compose up -d && bun run build:java && bun run test:e2e`.
// Drives the real RealBackend in-process; the inspector runs on its own port so a dev server can keep 8085.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import type { GroupView } from '../shared/types'
import { RealBackend } from '../server/real/backend'

const INSPECTOR = 'http://localhost:18085'
const GROUP = 'word-count'
const ALL_TASKS = ['0_0', '0_1', '0_2', '0_3', '1_0', '1_1', '1_2', '1_3']
const TIMEOUT = 120_000

let backend: RealBackend

const view = (): GroupView => backend.snapshot().groups.find((g) => g.groupId === GROUP)!
const live = (g: GroupView) => g.members.filter((m) => m.status !== 'joining')
const labels = (g: GroupView) => [...new Set(live(g).map((m) => m.processId))]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitFor(what: string, ok: (g: GroupView) => boolean, timeoutMs: number): Promise<number> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await backend.tick({ force: true })
    if (ok(view())) return Date.now() - start
    await sleep(300)
  }
  throw new Error(`timed out after ${timeoutMs} ms waiting for: ${what}\n${JSON.stringify(view().members, null, 1)}`)
}

const stable = (members: number) => (g: GroupView) =>
  g.state === 'STABLE' && live(g).length === members && live(g).every((m) => m.state === 'STABLE')

/** Each task is active on exactly one member. */
const partitioned = (g: GroupView) => {
  const active = live(g).flatMap((m) => m.assignment.active).sort()
  return JSON.stringify(active) === JSON.stringify(ALL_TASKS)
}

async function startProcesses(n: number) {
  for (let i = 0; i < n; i++) await backend.handle({ type: 'addMember', groupId: GROUP })
  await waitFor(`${n} processes STABLE`, (g) => stable(n)(g) && partitioned(g), 60_000)
}


describe.skipIf(!process.env.E2E)('real broker', () => {
  beforeAll(async () => {
    backend = new RealBackend({ inspectorUrl: INSPECTOR })
    const start = Date.now()
    while (Date.now() - start < 60_000) {
      await backend.tick({ force: true })
      if (!backend.snapshot().error) break
      await sleep(500)
    }
    expect(backend.snapshot().error).toBeUndefined()
  }, TIMEOUT)

  afterEach(async () => {
    await backend.handle({ type: 'setStandbyReplicas', groupId: GROUP, value: 0 })
    await backend.handle({ type: 'reset' })
    await waitFor('group empty', (g) => g.members.length === 0, 30_000)
  }, TIMEOUT)

  afterAll(() => backend?.close())

  test('RB1: inspector returns the contract for a running group', async () => {
    await startProcesses(1)
    const res = await fetch(`${INSPECTOR}/groups?ids=${GROUP}`)
    expect(res.status).toBe(200)
    const [g] = (await res.json()).groups
    expect(Object.keys(g)).toEqual([
      'groupId', 'state', 'groupEpoch', 'targetAssignmentEpoch', 'topologyEpoch',
      'numStandbyReplicas', 'subtopologies', 'members',
    ])
    expect(g.subtopologies.map((s: { id: string; partitions: number }) => [s.id, s.partitions])).toEqual([['0', 4], ['1', 4]])
    expect(Object.keys(g.members[0])).toEqual(['memberId', 'memberEpoch', 'processId', 'clientId', 'assignment', 'targetAssignment'])
    for (const t of g.members[0].assignment.active) expect(t).toMatch(/^\d+_\d+$/)
  }, TIMEOUT)

  test('RB2: an unknown group is EMPTY', async () => {
    const [g] = (await (await fetch(`${INSPECTOR}/groups?ids=no-such-group`)).json()).groups
    expect(g).toMatchObject({ groupId: 'no-such-group', state: 'EMPTY', members: [], subtopologies: [] })
  }, TIMEOUT)

  test('RB3: two processes split the tasks, each task active on exactly one member', async () => {
    await startProcesses(2)
    const g = view()
    expect(partitioned(g)).toBe(true)
    for (const label of labels(g))
      expect(live(g).filter((m) => m.processId === label).flatMap((m) => m.assignment.active).length).toBeGreaterThan(0)
  }, TIMEOUT)

  test('RB13: a second process owns tasks and the group is STABLE within 20 s', async () => {
    await startProcesses(1)
    await backend.handle({ type: 'addMember', groupId: GROUP })
    const ms = await waitFor('2 processes STABLE', (g) => stable(2)(g) && partitioned(g), 20_000)
    console.log(`RB13 measured: STABLE ${ms} ms after starting the second process`)
    expect(live(view()).every((m) => m.assignment.active.length > 0)).toBe(true)
  }, TIMEOUT)

  test('RB4: + thread adds a second member to the same process', async () => {
    await startProcesses(1)
    const [label] = labels(view())
    await backend.handle({ type: 'addMember', groupId: GROUP, processId: label })
    await waitFor('2 members in one process', (g) => live(g).length === 2 && labels(g).length === 1, 20_000)
    expect(new Set(live(view()).map((m) => m.memberId)).size).toBe(2)
  }, TIMEOUT)

  test('RB5: after the next rebalance each stateful task has one standby on another process', async () => {
    await startProcesses(2)
    await backend.handle({ type: 'setStandbyReplicas', groupId: GROUP, value: 1 })
    await backend.handle({ type: 'addMember', groupId: GROUP }) // the next rebalance
    await waitFor('3 processes STABLE with standbys', (g) => stable(3)(g) && live(g).some((m) => m.assignment.standby.length), 60_000)
    const g = view()
    expect(g.numStandbyReplicas).toBe(1)
    const owner = (t: string, kind: 'active' | 'standby') => live(g).filter((m) => m.assignment[kind].includes(t))
    for (const t of ['1_0', '1_1', '1_2', '1_3']) {
      const [standby, ...more] = owner(t, 'standby')
      expect(more).toEqual([])
      expect(standby.processId).not.toBe(owner(t, 'active')[0].processId)
    }
    for (const t of ['0_0', '0_1', '0_2', '0_3']) expect(owner(t, 'standby')).toEqual([]) // stateless
  }, TIMEOUT)

  test('RB7: a SIGKILLed process shows crashed, then its tasks move to the survivor within 25 s', async () => {
    await startProcesses(2)
    const [survivor, victim] = labels(view())
    await backend.handle({ type: 'killProcess', groupId: GROUP, processId: victim })
    await backend.tick({ force: true })
    expect(live(view()).filter((m) => m.processId === victim).map((m) => m.status)).toEqual(['crashed'])
    const ms = await waitFor('survivor owns everything', (g) => stable(1)(g) && partitioned(g), 25_000)
    console.log(`RB7 measured: fenced and reassigned ${ms} ms after SIGKILL`)
    expect(labels(view())).toEqual([survivor])
  }, TIMEOUT)

  test('RB8: a SIGTERMed process leaves before the session timeout', async () => {
    await startProcesses(2)
    const [, leaving] = labels(view())
    await backend.handle({ type: 'stopProcess', groupId: GROUP, processId: leaving })
    const ms = await waitFor('member left', (g) => !labels(g).includes(leaving), 9_000)
    console.log(`RB8 measured: left ${ms} ms after SIGTERM`)
  }, TIMEOUT)

  test('RB17: after a broker restart an empty group is EMPTY and other groups are still described', async () => {
    await startProcesses(1)
    await backend.handle({ type: 'reset' })
    await waitFor('group empty', (g) => g.members.length === 0, 30_000)
    await Bun.$`docker compose restart kafka`.quiet()
    let body: { groups: { groupId: string; state: string }[] } | undefined
    const start = Date.now()
    while (Date.now() - start < 60_000) {
      const res = await fetch(`${INSPECTOR}/groups?ids=${GROUP},order-enrichment`).catch(() => undefined)
      if (res?.status === 200) {
        body = await res.json()
        break
      }
      if (res?.status === 500 && (await res.text()).includes('Topology information is missing')) break
      await sleep(1000)
    }
    expect(body?.groups.map((g) => [g.groupId, g.state])).toEqual([[GROUP, 'EMPTY'], ['order-enrichment', 'EMPTY']])
  }, TIMEOUT)

  test('RB9: a JVM killed outside the dashboard shows crashed', async () => {
    await startProcesses(2)
    const [, victim] = labels(view())
    const pid = (await Bun.$`pgrep -f ${`run ${GROUP} ${victim} 1`}`.text()).trim().split('\n')[0]
    expect(pid).toMatch(/^\d+$/)
    await Bun.$`kill -9 ${pid}`
    await waitFor('victim crashed', (g) => live(g).some((m) => m.processId === victim && m.status === 'crashed'), 5_000)
  }, TIMEOUT)
})
