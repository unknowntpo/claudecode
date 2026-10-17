// Spec 001: RB10 / RB11, the real backend's failure reporting (no broker needed).
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
  test('RB11: missing streams-app binary → error names build:java and nothing is spawned', async () => {
    backend = new RealBackend({ bin: '/nonexistent/streams-app', inspectorUrl: 'http://127.0.0.1:1' })
    expect(backend.snapshot().error).toContain('bun run build:java')
    await backend.handle({ type: 'addMember', groupId: 'word-count' })
    expect(backend.snapshot().groups.find((g) => g.groupId === 'word-count')!.members).toEqual([])
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
