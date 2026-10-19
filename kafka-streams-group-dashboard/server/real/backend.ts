// The console's backend (docs/specs/004-read-only-console/spec.md): it starts the Java inspector, polls it for
// every streams group on the broker, and derives rates, lag, stalled tasks and fenced processes. It never starts,
// stops or hosts an application; the only write is the broker-side standby group config.

import type { Subprocess } from 'bun'
import type { ClientMessage, ClusterView, FencedProcess, GroupFlow, LogEvent, Snapshot } from '../../shared/types'
import { type InspectorCluster, toClusterView } from './cluster'
import { computeFlow, withoutRates } from './flow'
import { diffEvents, type InspectorGroup, processLabel, taskSamples, toGroupView } from './mapping'
import { type GroupProgress, goneProcesses, stallThreshold, stepProgress } from './progress'

const DEFAULT_BIN = `${import.meta.dir}/../../streams-app/build/install/streams-app/bin/streams-app`
const DEFAULT_INSPECTOR = `http://localhost:${process.env.INSPECTOR_PORT ?? 8085}`
const POLL_MS = 1000
const MAX_EVENTS = 200
/** A fenced process stays on the Processes tab this long (Spec 004 RO11). */
export const FENCED_TTL_MS = 60_000

export interface RealBackendOptions {
  /** Path of the `streams-app` launcher (from `bun run build:java`). */
  bin?: string
  /** Base URL of the inspector; its port is passed to `streams-app inspect`. */
  inspectorUrl?: string
  /** A poll without an answer after this long is reported as an error (Spec 001 Behavior 8). */
  pollTimeoutMs?: number
  /** Clock, for tests. */
  now?: () => number
}

interface GroupState {
  group: InspectorGroup
  progress?: GroupProgress
  stalledTasks: Record<string, number>
  restoringTasks: Record<string, number>
  restoreProgress: Record<string, { fraction: number; ageMs: number }>
  thresholdMs: number
  fenced: FencedProcess[]
  events: LogEvent[]
  flow?: GroupFlow
}

let eventSeq = 0

export class RealBackend {
  private inspector?: Subprocess
  private groups = new Map<string, GroupState>()
  /** End offsets of the last successful poll, for rates (Spec 002 Behavior 3). */
  private lastOffsets: { at: number; byGroup: Map<string, Record<string, number>> } | null = null
  private error?: string = 'starting inspector…'
  private paused = false
  /** Spec 008: the last good cluster view, and the error while /cluster fails. */
  private cluster: ClusterView | null = null
  private clusterError?: string
  private lastPoll = 0
  private polling = false
  private readonly inspectorUrl: string
  private readonly built: boolean
  private readonly pollTimeoutMs: number
  private readonly now: () => number

  constructor({ bin = DEFAULT_BIN, inspectorUrl = DEFAULT_INSPECTOR, pollTimeoutMs = 3000, now = Date.now }: RealBackendOptions = {}) {
    this.inspectorUrl = inspectorUrl
    this.pollTimeoutMs = pollTimeoutMs
    this.now = now
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
      error: this.error,
      paused: this.paused,
      cluster: this.cluster,
      clusterError: this.clusterError,
      groups: [...this.groups.values()].map((s) =>
        toGroupView(
          s.group,
          { stalledTasks: s.stalledTasks, restoringTasks: s.restoringTasks, restoreProgress: s.restoreProgress, thresholdMs: s.thresholdMs, fenced: s.fenced },
          s.events,
          s.flow ?? null,
        ),
      ),
    }
  }

  async handle(msg: ClientMessage) {
    if (msg.type === 'togglePause') {
      this.paused = !this.paused
      return
    }
    if (msg.type === 'setStandbyReplicas') {
      const res = await fetch(`${this.inspectorUrl}/groups/${msg.groupId}/standby?value=${msg.value}`, { method: 'POST' })
      this.log(msg.groupId, 'epoch', `group config streams.num.standby.replicas=${msg.value} (HTTP ${res.status})`)
    }
  }

  /** Polls the inspector at most every POLL_MS; `force` skips the interval (tests). */
  async tick({ force = false } = {}) {
    if (!this.built || this.paused || this.polling) return
    if (!force && this.now() - this.lastPoll < POLL_MS) return
    this.polling = true
    this.lastPoll = this.now()
    // CL5: the cluster is polled beside the groups; its failure is its own, and a groups failure does not cut it short
    const clusterPoll = this.pollCluster()
    try {
      // no ids: the inspector discovers every streams group on the broker (Spec 004 Behavior 2)
      const res = await fetch(`${this.inspectorUrl}/groups`, { signal: AbortSignal.timeout(this.pollTimeoutMs) })
      if (!res.ok) throw new Error(`inspector HTTP ${res.status}`)
      const { groups } = (await res.json()) as { groups: InspectorGroup[] }
      this.apply(groups, this.now())
      this.error = undefined
    } catch (err) {
      // CS7: rates are unknown until two good polls in a row
      this.lastOffsets = null
      for (const s of this.groups.values()) if (s.flow) s.flow = withoutRates(s.flow)
      this.error = `cannot reach the inspector / broker (${(err as Error).message}). Is \`docker compose up -d\` running?`
    } finally {
      await clusterPoll
      this.polling = false
    }
  }

  private async pollCluster() {
    try {
      const res = await fetch(`${this.inspectorUrl}/cluster`, { signal: AbortSignal.timeout(this.pollTimeoutMs) })
      if (!res.ok) throw new Error(`inspector HTTP ${res.status}`)
      this.cluster = toClusterView((await res.json()) as InspectorCluster)
      this.clusterError = undefined
    } catch (err) {
      this.clusterError = `cannot read the cluster (${(err as Error).message})`
    }
  }

  close() {
    this.inspector?.kill('SIGTERM')
  }

  private apply(groups: InspectorGroup[], now: number) {
    const byGroup = new Map<string, Record<string, number>>()
    const listed = new Set(groups.map((g) => g.groupId))
    // RO8: a group the broker no longer has disappears
    for (const id of this.groups.keys()) if (!listed.has(id)) this.groups.delete(id)

    for (const g of groups) {
      const prev = this.groups.get(g.groupId)
      const state: GroupState = prev ?? { group: g, stalledTasks: {}, restoringTasks: {}, restoreProgress: {}, thresholdMs: stallThreshold([]), fenced: [], events: [] }

      for (const e of diffEvents(prev?.group, g)) this.log(g.groupId, e.kind, e.message, state)

      // RO11 / RS4: members that disappeared were fenced if they were stalled on the previous poll, else they
      // were gone while restoring, else they left
      if (prev) {
        const before = prev.group.members.map((m) => {
          const stalled = m.assignment.active.map((t) => prev.stalledTasks[t]).filter((ms) => ms !== undefined)
          return {
            memberId: m.memberId,
            processId: processLabel(g.groupId, m),
            stalledMs: stalled.length ? Math.max(...stalled) : null,
            restoring: m.assignment.active.some((t) => prev.restoringTasks[t] !== undefined),
          }
        })
        for (const gone of goneProcesses(before, new Set(g.members.map((m) => m.memberId)))) {
          if (gone.kind !== 'fenced') {
            this.log(g.groupId, 'member', `${gone.processId} ${gone.kind === 'left' ? 'left' : 'gone while restoring'}`, state)
            continue
          }
          const tasks = prev.group.members
            .filter((m) => processLabel(g.groupId, m) === gone.processId)
            .flatMap((m) => m.assignment.active)
          state.fenced.push({ processId: gone.processId, fencedAt: now, stalledMs: gone.stalledMs!, tasks })
          this.log(g.groupId, 'member', `${gone.processId} fenced after no progress for ${Math.round(gone.stalledMs! / 1000)} s`, state)
        }
      }
      state.fenced = state.fenced.filter((f) => now - f.fencedAt < FENCED_TTL_MS)

      const samples = taskSamples(g)
      const step = stepProgress(state.progress, now, samples)
      state.progress = step.next
      state.stalledTasks = step.stalledMs
      state.restoringTasks = step.restoringMs
      state.restoreProgress = step.progress
      state.thresholdMs = step.thresholdMs
      // RS4: restore start and end, by the task's owner
      const ownerOf = (task: string) => {
        const m = g.members.find((x) => x.assignment.active.includes(task))
        return m ? processLabel(g.groupId, m) : '?'
      }
      for (const task of step.restoreStarted) {
        const size = samples.find((x) => x.task === task)?.changelog ?? 0
        this.log(g.groupId, 'member', `${task} restoring on ${ownerOf(task)} (changelog ≤ ${size.toLocaleString('en-US')})`, state)
      }
      for (const [task, ms] of Object.entries(step.restoredMs))
        this.log(g.groupId, 'member', `${task} restored on ${ownerOf(task)} after ${Math.round(ms / 1000)} s`, state)

      const previous = this.lastOffsets?.byGroup.get(g.groupId) ?? null
      state.flow = computeFlow(g, previous, this.lastOffsets ? now - this.lastOffsets.at : 0)
      byGroup.set(g.groupId, Object.fromEntries((g.topics ?? []).flatMap((t) => (t.endOffset === undefined ? [] : [[t.name, t.endOffset]]))))

      state.group = g
      this.groups.set(g.groupId, state)
    }
    this.lastOffsets = { at: now, byGroup }
  }

  private log(groupId: string, kind: LogEvent['kind'], message: string, state = this.groups.get(groupId)) {
    if (!state) return
    state.events.push({ id: ++eventSeq, time: this.now(), groupId, kind, message })
    if (state.events.length > MAX_EVENTS) state.events.shift()
  }
}
