// Pure mapping from the inspector's StreamsGroupDescribe JSON (see docs/specs/001-real-broker/spec.md)
// to the dashboard's GroupView, plus event derivation by diffing two consecutive polls.

import { compareTaskIds } from '../../shared/pipeline'
import type {
  Assignment, ConfigEntry, FencedProcess, GroupFlow, GroupState, GroupView, LogEvent, MemberState, MemberView, TaskId,
} from '../../shared/types'
import type { InspectorTopic } from './flow'
import type { TaskSample } from './progress'

export interface InspectorAssignment {
  active: TaskId[]
  standby: TaskId[]
  warmup: TaskId[]
}

export interface InspectorMember {
  memberId: string
  memberEpoch: number
  processId: string
  clientId: string
  assignment: InspectorAssignment
  targetAssignment: InspectorAssignment
}

export interface InspectorSubtopology {
  id: string
  sourceTopics: string[]
  repartitionSourceTopics: string[]
  repartitionSinkTopics: string[]
  stateChangelogTopics: string[]
  partitions: number
}

export interface InspectorGroup {
  groupId: string
  state: string
  groupEpoch: number
  targetAssignmentEpoch: number
  topologyEpoch: number
  numStandbyReplicas: number
  subtopologies: InspectorSubtopology[]
  members: InspectorMember[]
  /** Spec 002 additions; absent from an older inspector. */
  topics?: InspectorTopic[]
  committed?: Record<string, number>
  configs?: ConfigEntry[]
  /** Spec 004 Behavior 4a: per partition. */
  endOffsets?: Record<string, Record<string, number>>
  committedOffsets?: Record<string, Record<string, number>>
}

export type GroupEvent = Pick<LogEvent, 'kind' | 'message'>

/** What the backend derived from progress between polls (Spec 004 Behavior 4). */
export interface ProgressContext {
  stalledTasks: Record<TaskId, number>
  thresholdMs: number
  fenced: FencedProcess[]
}

/** One sample per task: its input is partition p of the subtopology's source and repartition topics. */
export function taskSamples(g: InspectorGroup): TaskSample[] {
  const sum = (offsets: Record<string, Record<string, number>> | undefined, topics: string[], p: number) => {
    let total = 0
    for (const t of topics) {
      const v = offsets?.[t]?.[String(p)]
      if (v === undefined) return null
      total += v
    }
    return topics.length ? total : null
  }
  return g.subtopologies.flatMap((s) => {
    const inputs = [...s.sourceTopics, ...s.repartitionSourceTopics]
    return Array.from({ length: s.partitions }, (_, p) => {
      const task = `${s.id}_${p}`
      return {
        task,
        committed: sum(g.committedOffsets, inputs, p),
        end: sum(g.endOffsets, inputs, p),
        owner: g.members.find((m) => m.assignment.active.includes(task))?.memberId ?? null,
      }
    })
  })
}

/**
 * `word-count-process-A-StreamThread-1-consumer` → `process-A`; falls back to the broker's processId.
 * A container label that repeats the app id (`word-count-<compose project>-word-count-1`) is cut to its last
 * `<app id>-…` part, `word-count-1` (Spec 004 Behavior 5).
 */
export function processLabel(groupId: string, m: Pick<InspectorMember, 'clientId' | 'processId'>): string {
  if (!m.clientId.startsWith(`${groupId}-`)) return m.processId
  const rest = m.clientId.slice(groupId.length + 1)
  const i = rest.indexOf('-StreamThread')
  const label = i > 0 ? rest.slice(0, i) : rest
  const last = label.lastIndexOf(`${groupId}-`)
  return last > 0 && label[last - 1] === '-' ? label.slice(last) : label
}

const minus = (a: TaskId[], b: TaskId[]) => a.filter((t) => !b.includes(t))
const sorted = (a: TaskId[]) => [...a].sort(compareTaskIds)
const toAssignment = (a: InspectorAssignment): Assignment => ({
  active: sorted(a.active),
  standby: sorted(a.standby),
  warmup: sorted(a.warmup),
})

/** The broker does not expose the member state, so derive it from assignment vs. target. */
export function memberState(m: InspectorMember): MemberState {
  const { assignment: a, targetAssignment: t } = m
  if (minus(a.active, t.active).length || minus(a.standby, t.standby).length || minus(a.warmup, t.warmup).length)
    return 'UNREVOKED_TASKS'
  if (minus(t.active, a.active).length || minus(t.standby, a.standby).length || minus(t.warmup, a.warmup).length)
    return 'UNRELEASED_TASKS'
  return 'STABLE'
}

const KNOWN_STATES: GroupState[] = ['EMPTY', 'NOT_READY', 'ASSIGNING', 'RECONCILING', 'STABLE']

export function toGroupView(g: InspectorGroup, ctx: ProgressContext, events: LogEvent[], flow: GroupFlow | null = null): GroupView {
  const members: MemberView[] = g.members.map((m) => {
    const stalled = m.assignment.active.map((t) => ctx.stalledTasks[t]).filter((ms): ms is number => ms !== undefined)
    return {
      memberId: m.memberId,
      processId: processLabel(g.groupId, m),
      clientId: m.clientId,
      memberEpoch: m.memberEpoch,
      state: memberState(m),
      status: stalled.length ? 'stalled' : 'alive',
      assignment: toAssignment(m.assignment),
      pendingRevocation: {
        active: minus(m.assignment.active, m.targetAssignment.active),
        standby: minus(m.assignment.standby, m.targetAssignment.standby),
        warmup: minus(m.assignment.warmup, m.targetAssignment.warmup),
      },
      target: toAssignment(m.targetAssignment),
      stalledMs: stalled.length ? Math.max(...stalled) : null,
    }
  })
  members.sort((a, b) => a.processId.localeCompare(b.processId) || a.clientId.localeCompare(b.clientId))

  const subtopologies = g.subtopologies.map((s) => ({
    id: s.id,
    // the broker knows no processor names, only what each subtopology reads and writes
    name: s.repartitionSinkTopics.length ? 'repartition' : s.stateChangelogTopics.length ? 'stateful' : 'stateless',
    sourceTopics: s.sourceTopics,
    repartitionSourceTopics: s.repartitionSourceTopics,
    repartitionSinkTopics: s.repartitionSinkTopics,
    stateChangelogTopics: s.stateChangelogTopics,
    // `<appId>-<store>-changelog` → `<store>`
    stores: s.stateChangelogTopics.map((t) => t.replace(`${g.groupId}-`, '').replace(/-changelog$/, '')),
    partitions: s.partitions,
  }))
  subtopologies.sort((a, b) => Number(a.id) - Number(b.id))

  return {
    groupId: g.groupId,
    // Anything else (e.g. DEAD for an unknown group) is shown as EMPTY.
    state: (KNOWN_STATES as string[]).includes(g.state) ? (g.state as GroupState) : 'EMPTY',
    groupEpoch: g.groupEpoch,
    targetAssignmentEpoch: g.targetAssignmentEpoch,
    numStandbyReplicas: g.numStandbyReplicas,
    topology: { epoch: g.topologyEpoch, subtopologies },
    tasks: subtopologies.flatMap((s) => Array.from({ length: s.partitions }, (_, p) => `${s.id}_${p}`)),
    members,
    events,
    flow,
    configs: g.configs ?? [],
    stalledTasks: ctx.stalledTasks,
    stallThresholdMs: ctx.thresholdMs,
    fenced: ctx.fenced,
  }
}

const fmt = (a: InspectorAssignment) =>
  `active=[${sorted(a.active).join(',')}] standby=[${sorted(a.standby).join(',')}]` +
  (a.warmup.length ? ` warmup=[${sorted(a.warmup).join(',')}]` : '')
const same = (a: InspectorAssignment, b: InspectorAssignment) => fmt(a) === fmt(b)

/** Events observed between two polls of the same group. */
export function diffEvents(prev: InspectorGroup | undefined, next: InspectorGroup): GroupEvent[] {
  const events: GroupEvent[] = []
  const before = new Map((prev?.members ?? []).map((m) => [m.memberId, m]))
  const after = new Map(next.members.map((m) => [m.memberId, m]))

  for (const m of next.members)
    if (!before.has(m.memberId))
      events.push({ kind: 'member', message: `${m.memberId} joined (${processLabel(next.groupId, m)}, ${m.clientId})` })
  for (const m of prev?.members ?? [])
    if (!after.has(m.memberId))
      events.push({ kind: 'member', message: `${m.memberId} left / fenced (${processLabel(next.groupId, m)})` })

  if (prev && prev.state !== next.state)
    events.push({ kind: 'epoch', message: `group state ${prev.state} → ${next.state}` })
  if (prev && prev.groupEpoch !== next.groupEpoch)
    events.push({ kind: 'epoch', message: `group epoch → ${next.groupEpoch}` })
  if (prev && prev.targetAssignmentEpoch !== next.targetAssignmentEpoch) {
    const summary = next.members.map((m) => `${m.memberId}: ${fmt(m.targetAssignment)}`).join(' | ')
    events.push({ kind: 'assignor', message: `target assignment epoch ${next.targetAssignmentEpoch} → ${summary || '(no members)'}` })
  }

  for (const m of next.members) {
    const p = before.get(m.memberId)
    if (p && (p.memberEpoch !== m.memberEpoch || !same(p.assignment, m.assignment)))
      events.push({
        kind: 'heartbeat',
        message: `${m.memberId} memberEpoch=${m.memberEpoch} ${fmt(m.assignment)} (${memberState(m)})`,
      })
  }
  return events
}
