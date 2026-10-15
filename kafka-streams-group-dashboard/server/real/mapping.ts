// Pure mapping from the inspector's StreamsGroupDescribe JSON (see docs/specs/001-real-broker/spec.md)
// to the dashboard's GroupView, plus event derivation by diffing two consecutive polls.

import type { Assignment, GroupState, GroupView, LogEvent, MemberState, MemberView, TaskId } from '../../shared/types'
import { compareTaskIds } from '../assignor'
import type { AppInfo } from '../topologies'

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
}

export type GroupEvent = Pick<LogEvent, 'kind' | 'message'>

/** Context the Bun server knows about the processes it started. */
export interface ProcessContext {
  /** Labels of processes that were started but have no member in the group yet. */
  joining: string[]
  /** Labels of processes that were SIGKILLed but are still listed by the broker. */
  killed: Set<string>
}

/** `word-count-process-A-StreamThread-1-consumer` → `process-A`; falls back to the broker's processId. */
export function processLabel(groupId: string, m: Pick<InspectorMember, 'clientId' | 'processId'>): string {
  if (!m.clientId.startsWith(`${groupId}-`)) return m.processId
  const rest = m.clientId.slice(groupId.length + 1)
  const i = rest.indexOf('-StreamThread')
  return i > 0 ? rest.slice(0, i) : rest
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

export function toGroupView(
  g: InspectorGroup,
  info: AppInfo | undefined,
  ctx: ProcessContext,
  events: LogEvent[],
): GroupView {
  const members: MemberView[] = g.members.map((m) => {
    const label = processLabel(g.groupId, m)
    return {
      memberId: m.memberId,
      processId: label,
      clientId: m.clientId,
      memberEpoch: m.memberEpoch,
      state: memberState(m),
      status: ctx.killed.has(label) ? 'crashed' : 'alive',
      assignment: toAssignment(m.assignment),
      pendingRevocation: {
        active: minus(m.assignment.active, m.targetAssignment.active),
        standby: minus(m.assignment.standby, m.targetAssignment.standby),
        warmup: minus(m.assignment.warmup, m.targetAssignment.warmup),
      },
      target: toAssignment(m.targetAssignment),
      msSinceHeartbeat: 0,
    }
  })
  const present = new Set(members.map((m) => m.processId))
  for (const label of ctx.joining.filter((l) => !present.has(l))) {
    const none = { active: [], standby: [] }
    members.push({
      memberId: '(starting)',
      processId: label,
      clientId: `${g.groupId}-${label}`,
      memberEpoch: 0,
      state: 'STABLE',
      status: 'joining',
      assignment: none,
      pendingRevocation: none,
      target: none,
      msSinceHeartbeat: 0,
    })
  }
  members.sort((a, b) => a.processId.localeCompare(b.processId) || a.clientId.localeCompare(b.clientId))

  const subtopologies = g.subtopologies.map((s) => ({
    id: s.id,
    name: s.repartitionSinkTopics.length ? 'repartition' : s.stateChangelogTopics.length ? 'stateful' : 'stateless',
    sourceTopics: s.sourceTopics,
    repartitionSourceTopics: s.repartitionSourceTopics,
    repartitionSinkTopics: s.repartitionSinkTopics,
    stateChangelogTopics: s.stateChangelogTopics,
    sinkTopics: [], // not part of the topology the client sends to the broker
    // `<appId>-<store>-changelog` → `<store>`
    stores: s.stateChangelogTopics.map((t) => t.replace(`${g.groupId}-`, '').replace(/-changelog$/, '')),
    partitions: s.partitions,
  }))
  subtopologies.sort((a, b) => Number(a.id) - Number(b.id))

  return {
    groupId: g.groupId,
    description: info?.description ?? '',
    dsl: info?.dsl ?? '',
    // Anything else (e.g. DEAD for an unknown group) is shown as EMPTY.
    state: (KNOWN_STATES as string[]).includes(g.state) ? (g.state as GroupState) : 'EMPTY',
    groupEpoch: g.groupEpoch,
    targetAssignmentEpoch: g.targetAssignmentEpoch,
    numStandbyReplicas: g.numStandbyReplicas,
    topology: { epoch: g.topologyEpoch, subtopologies },
    tasks: subtopologies.flatMap((s) => Array.from({ length: s.partitions }, (_, p) => `${s.id}_${p}`)),
    members,
    events,
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
