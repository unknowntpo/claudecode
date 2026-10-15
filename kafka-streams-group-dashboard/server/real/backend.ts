// MODE=real: Kafka Streams JVMs against a real broker (docs/specs/001-real-broker/spec.md).
// The Bun server starts the Java inspector, spawns one `streams-app run` JVM per "process",
// and polls the inspector (Admin#describeStreamsGroups) for the group state.

import type { Subprocess } from 'bun'
import type { ClientMessage, LogEvent, Snapshot } from '../../shared/types'
import type { Backend } from '../backend'
import { APPS } from '../topologies'
import { diffEvents, type InspectorGroup, processLabel, toGroupView } from './mapping'

const DEFAULT_BIN = `${import.meta.dir}/../../streams-app/build/install/streams-app/bin/streams-app`
const DEFAULT_INSPECTOR = `http://localhost:${process.env.INSPECTOR_PORT ?? 8085}`
const POLL_MS = 1000
const MAX_EVENTS = 200
const GROUP_IDS = APPS.map((a) => a.groupId)

interface StreamsProcess {
  groupId: string
  label: string
  proc: Subprocess<'pipe', 'inherit', 'inherit'>
  killed: boolean
}

export interface RealBackendOptions {
  /** Path of the `streams-app` launcher (from `bun run build:java`). */
  bin?: string
  /** Base URL of the inspector; its port is passed to `streams-app inspect`. */
  inspectorUrl?: string
  /** A poll without an answer after this long is reported as an error (Spec 001 Behavior 8). */
  pollTimeoutMs?: number
}

let eventSeq = 0

export class RealBackend implements Backend {
  private inspector?: Subprocess
  private processes = new Map<string, StreamsProcess>() // key: `${groupId}/${label}`
  private labelSeq = new Map<string, number>()
  private groups = new Map<string, InspectorGroup>()
  private events = new Map<string, LogEvent[]>()
  private error?: string = 'starting inspector…'
  private paused = false
  private lastPoll = 0
  private polling = false
  private readonly bin: string
  private readonly inspectorUrl: string
  private readonly built: boolean
  private readonly pollTimeoutMs: number

  constructor({ bin = DEFAULT_BIN, inspectorUrl = DEFAULT_INSPECTOR, pollTimeoutMs = 3000 }: RealBackendOptions = {}) {
    this.bin = bin
    this.inspectorUrl = inspectorUrl
    this.pollTimeoutMs = pollTimeoutMs
    this.built = Bun.file(bin).size > 0
    if (!this.built) {
      this.error = 'streams-app is not built: run `bun run build:java`'
      return
    }
    const port = new URL(inspectorUrl).port
    this.inspector = Bun.spawn([bin, 'inspect', port], { stdout: 'inherit', stderr: 'inherit' })
  }

  snapshot(): Snapshot {
    return {
      mode: 'real',
      error: this.error,
      paused: this.paused,
      groups: GROUP_IDS.map((id) => {
        const g = this.groups.get(id) ?? emptyGroup(id)
        const mine = [...this.processes.values()].filter((p) => p.groupId === id)
        const listed = new Set(g.members.map((m) => processLabel(id, m)))
        return toGroupView(
          g,
          APPS.find((a) => a.groupId === id),
          {
            joining: mine.filter((p) => !p.killed && !listed.has(p.label)).map((p) => p.label),
            killed: new Set(mine.filter((p) => p.killed).map((p) => p.label)),
          },
          this.events.get(id) ?? [],
        )
      }),
    }
  }

  async handle(msg: ClientMessage) {
    switch (msg.type) {
      case 'togglePause':
        this.paused = !this.paused
        return
      case 'reset':
        for (const p of this.processes.values()) p.proc.kill('SIGTERM')
        this.processes.clear()
        return
      case 'addMember':
        if (msg.processId) this.addThread(msg.groupId, msg.processId)
        else this.startProcess(msg.groupId)
        return
      case 'stopProcess':
        this.processes.get(`${msg.groupId}/${msg.processId}`)?.proc.kill('SIGTERM')
        this.processes.delete(`${msg.groupId}/${msg.processId}`)
        this.log(msg.groupId, 'member', `${msg.processId}: SIGTERM (graceful close, members leave the group)`)
        return
      case 'killProcess': {
        const p = this.processes.get(`${msg.groupId}/${msg.processId}`)
        if (!p || p.killed) return
        p.proc.kill('SIGKILL')
        p.killed = true
        this.log(msg.groupId, 'member', `${msg.processId}: SIGKILL (no more heartbeats, fenced after the session timeout)`)
        return
      }
      case 'setStandbyReplicas': {
        const res = await fetch(`${this.inspectorUrl}/groups/${msg.groupId}/standby?value=${msg.value}`, { method: 'POST' })
        this.log(msg.groupId, 'epoch', `group config streams.num.standby.replicas=${msg.value} (HTTP ${res.status})`)
        return
      }
    }
  }

  /** Polls the inspector at most every POLL_MS; `force` skips the interval (tests). */
  async tick({ force = false } = {}) {
    if (!this.built || this.paused || this.polling) return
    if (!force && Date.now() - this.lastPoll < POLL_MS) return
    this.polling = true
    this.lastPoll = Date.now()
    try {
      const res = await fetch(`${this.inspectorUrl}/groups?ids=${GROUP_IDS.join(',')}`, {
        signal: AbortSignal.timeout(this.pollTimeoutMs),
      })
      if (!res.ok) throw new Error(`inspector HTTP ${res.status}`)
      const { groups } = (await res.json()) as { groups: InspectorGroup[] }
      for (const g of groups) {
        for (const e of diffEvents(this.groups.get(g.groupId), g)) this.log(g.groupId, e.kind, e.message)
        this.groups.set(g.groupId, g)
        this.forgetFencedProcesses(g)
      }
      this.error = undefined
    } catch (err) {
      this.error = `cannot reach the inspector / broker (${(err as Error).message}). Is \`docker compose up -d\` running?`
    } finally {
      this.polling = false
    }
  }

  close() {
    for (const p of this.processes.values()) p.proc.kill('SIGTERM')
    this.inspector?.kill('SIGTERM')
  }

  private startProcess(groupId: string) {
    if (!this.built) return
    const n = this.labelSeq.get(groupId) ?? 0
    this.labelSeq.set(groupId, n + 1)
    const label = `process-${String.fromCharCode(65 + n)}`
    const proc = Bun.spawn([this.bin, 'run', groupId, label, '1'], { stdin: 'pipe', stdout: 'inherit', stderr: 'inherit' })
    const entry = { groupId, label, proc, killed: false }
    this.processes.set(`${groupId}/${label}`, entry)
    // A JVM that dies on its own is treated like a killed process until the broker fences it.
    proc.exited.then((code) => {
      if (this.processes.get(`${groupId}/${label}`) !== entry || entry.killed) return
      entry.killed = true
      this.log(groupId, 'member', `${label}: exited unexpectedly (code ${code})`)
    })
    this.log(groupId, 'member', `${label}: started JVM (pid ${proc.pid}, group.protocol=streams, 1 StreamThread)`)
  }

  private addThread(groupId: string, label: string) {
    const p = this.processes.get(`${groupId}/${label}`)
    if (!p || p.killed) return
    p.proc.stdin.write('add-thread\n')
    p.proc.stdin.flush()
    this.log(groupId, 'member', `${label}: KafkaStreams#addStreamThread()`)
  }

  /** A killed process is dropped once the broker no longer lists any of its members. */
  private forgetFencedProcesses(g: InspectorGroup) {
    const listed = new Set(g.members.map((m) => processLabel(g.groupId, m)))
    for (const [key, p] of this.processes)
      if (p.groupId === g.groupId && p.killed && !listed.has(p.label)) this.processes.delete(key)
  }

  private log(groupId: string, kind: LogEvent['kind'], message: string) {
    const list = this.events.get(groupId) ?? []
    list.push({ id: ++eventSeq, time: Date.now(), groupId, kind, message })
    if (list.length > MAX_EVENTS) list.shift()
    this.events.set(groupId, list)
  }
}

function emptyGroup(groupId: string): InspectorGroup {
  return {
    groupId,
    state: 'EMPTY',
    groupEpoch: 0,
    targetAssignmentEpoch: 0,
    topologyEpoch: 0,
    numStandbyReplicas: 0,
    subtopologies: [],
    members: [],
  }
}
