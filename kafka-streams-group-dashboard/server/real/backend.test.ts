// The console backend without a broker: failure reporting (Spec 001), rates after failures (Spec 002),
// fenced / left processes and discovery (Spec 004).
import { afterEach, describe, expect, test } from 'bun:test'
import { RealBackend } from './backend'
import type { InspectorGroup } from './mapping'

const group: InspectorGroup = {
  groupId: 'word-count',
  state: 'STABLE',
  groupEpoch: 2,
  targetAssignmentEpoch: 2,
  topologyEpoch: 0,
  numStandbyReplicas: 0,
  subtopologies: [],
  members: [],
}

let backend: RealBackend | undefined
afterEach(() => backend?.close())

describe('RealBackend failures', () => {
  test('RB11: missing streams-app binary → error names build:java and nothing is polled', async () => {
    let calls = 0
    const inspector = Bun.serve({ port: 0, fetch: () => (calls++, Response.json({ groups: [group] })) })
    backend = new RealBackend({ bin: '/nonexistent/streams-app', inspectorUrl: `http://127.0.0.1:${inspector.port}` })
    expect(backend.snapshot().error).toContain('bun run build:java')
    await backend.tick({ force: true })
    expect(calls).toBe(0)
    expect(backend.snapshot().groups).toEqual([])
    inspector.stop(true)
  })

  test('RB10: inspector unreachable → error mentions it and the last known state stays', async () => {
    const fake = Bun.serve({ port: 0, fetch: () => Response.json({ groups: [group] }) })
    backend = new RealBackend({ bin: '/usr/bin/true', inspectorUrl: `http://127.0.0.1:${fake.port}` })

    await backend.tick({ force: true })
    expect(backend.snapshot().error).toBeUndefined() // positive control: reachable → no error
    expect(backend.snapshot().groups[0].groupEpoch).toBe(2)

    fake.stop(true)
    await backend.tick({ force: true })
    const snap = backend.snapshot()
    expect(snap.error).toContain('inspector')
    expect(snap.groups[0].groupEpoch).toBe(2)
  })

  test('CS7: a failed poll turns every rate into null, never 0', async () => {
    let up = true
    let offset = 100
    const inspector = Bun.serve({
      port: 0,
      fetch: () =>
        up
          ? Response.json({ groups: [{ ...group, topics: [{ name: 'text-lines', kind: 'source', endOffset: (offset += 10) }] }] })
          : new Response('down', { status: 500 }),
    })
    backend = new RealBackend({ bin: '/usr/bin/true', inspectorUrl: `http://127.0.0.1:${inspector.port}` })
    await backend.tick({ force: true })
    await Bun.sleep(20)
    await backend.tick({ force: true })
    const rate = () => backend!.snapshot().groups[0].flow?.topics[0].rate
    expect(rate()).toBeGreaterThan(0) // positive control: two good polls give a rate
    up = false
    await backend.tick({ force: true })
    expect(rate()).toBeNull()
    expect(backend.snapshot().groups[0].flow?.inputRate).toBeNull()
    // the first good poll after a failure has no previous offsets, so still no rate
    up = true
    await Bun.sleep(20)
    await backend.tick({ force: true })
    expect(rate()).toBeNull()
    await Bun.sleep(20)
    await backend.tick({ force: true })
    expect(rate()).toBeGreaterThan(0) // positive control: two good polls in a row again
    inspector.stop(true)
  })

  /** A fake inspector whose answer the test changes between polls, and a clock the test moves. */
  function harness() {
    let groups: InspectorGroup[] = []
    let clock = 1_000_000
    const inspector = Bun.serve({ port: 0, fetch: () => Response.json({ groups }) })
    const b = new RealBackend({ bin: '/usr/bin/true', inspectorUrl: `http://127.0.0.1:${inspector.port}`, now: () => clock })
    return {
      backend: b,
      set: (next: InspectorGroup[]) => (groups = next),
      poll: async (advanceMs: number) => {
        clock += advanceMs
        await b.tick({ force: true })
      },
      stop: () => inspector.stop(true),
    }
  }
  const sub = { id: '0', sourceTopics: ['text-lines'], repartitionSourceTopics: [], repartitionSinkTopics: [], stateChangelogTopics: [], partitions: 1 }
  const m = (memberId: string, label: string, active: string[]) => ({
    memberId, memberEpoch: 3, processId: `uuid-${memberId}`, clientId: `word-count-${label}-StreamThread-1-consumer`,
    assignment: { active, standby: [], warmup: [] }, targetAssignment: { active, standby: [], warmup: [] },
  })
  const wc = (members: ReturnType<typeof m>[], end: number, committed: number): InspectorGroup => ({
    ...group, subtopologies: [sub], members,
    endOffsets: { 'text-lines': { '0': end } }, committedOffsets: { 'text-lines': { '0': committed } },
  })

  test('RO11: a stalled process that disappears is fenced and its card stays 60 s', async () => {
    const h = harness()
    backend = h.backend
    h.set([wc([m('m1', 'a', []), m('m2', 'b', ['0_0'])], 10, 10)])
    await h.poll(0)
    for (let i = 1; i <= 7; i++) {
      h.set([wc([m('m1', 'a', []), m('m2', 'b', ['0_0'])], 10 + i * 5, 10)]) // input grows, nothing commits
      await h.poll(1000)
    }
    const g = () => backend!.snapshot().groups[0]
    expect(g().members.find((x) => x.memberId === 'm2')!.status).toBe('stalled') // positive control
    h.set([wc([m('m1', 'a', ['0_0'])], 50, 10)])
    await h.poll(1000)
    expect(g().fenced.map((f) => [f.processId, f.tasks])).toEqual([['b', ['0_0']]])
    expect(g().events.map((e) => e.message).join('\n')).toContain('b fenced after no progress for 7 s')
    await h.poll(59_000)
    expect(g().fenced).toHaveLength(1)
    await h.poll(1_500)
    expect(g().fenced).toEqual([])
    h.stop()
  })

  test('RO11: a process that disappears without stalling left, no card', async () => {
    const h = harness()
    backend = h.backend
    h.set([wc([m('m1', 'a', []), m('m2', 'b', ['0_0'])], 10, 10)])
    await h.poll(0)
    h.set([wc([m('m1', 'a', ['0_0'])], 11, 11)])
    await h.poll(1000)
    const g = backend.snapshot().groups[0]
    expect(g.fenced).toEqual([])
    expect(g.events.map((e) => e.message)).toContain('b left')
    h.stop()
  })

  test('RO8: a group the broker no longer lists disappears', async () => {
    const h = harness()
    backend = h.backend
    h.set([wc([], 0, 0), { ...wc([], 0, 0), groupId: 'other' }])
    await h.poll(0)
    expect(backend.snapshot().groups.map((x) => x.groupId)).toEqual(['word-count', 'other']) // positive control
    h.set([wc([], 0, 0)])
    await h.poll(1000)
    expect(backend.snapshot().groups.map((x) => x.groupId)).toEqual(['word-count'])
    h.stop()
  })

  test('RO3: the console sends no application control; only the standby config reaches the inspector', async () => {
    const posts: string[] = []
    const inspector = Bun.serve({
      port: 0,
      fetch: (req) => {
        if (req.method === 'POST') posts.push(new URL(req.url).pathname)
        return req.method === 'POST' ? new Response(null, { status: 204 }) : Response.json({ groups: [group] })
      },
    })
    backend = new RealBackend({ bin: '/usr/bin/true', inspectorUrl: `http://127.0.0.1:${inspector.port}` })
    for (const legacy of ['addMember', 'stopProcess', 'killProcess', 'reset'])
      await backend.handle({ type: legacy, groupId: 'word-count', processId: 'a' } as never)
    expect(posts).toEqual([])
    await backend.handle({ type: 'setStandbyReplicas', groupId: 'word-count', value: 1 }) // positive control
    expect(posts).toEqual(['/groups/word-count/standby'])
    inspector.stop(true)
  })

  test('RB10: an inspector that accepts but never answers is reported within the poll timeout', async () => {
    const hung = Bun.serve({ port: 0, fetch: () => new Promise<Response>(() => {}) })
    backend = new RealBackend({ bin: '/usr/bin/true', inspectorUrl: `http://127.0.0.1:${hung.port}`, pollTimeoutMs: 200 })
    const start = Date.now()
    await backend.tick({ force: true })
    expect(Date.now() - start).toBeLessThan(2_000)
    expect(backend.snapshot().error).toContain('inspector')
    hung.stop(true)
  })
})
