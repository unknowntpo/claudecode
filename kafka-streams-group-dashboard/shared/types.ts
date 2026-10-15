// Types shared by the Bun server and the Vue dashboard.
// Names follow KIP-1071 (Streams Rebalance Protocol) where possible.

/** Task id in Kafka Streams notation: `${subtopologyId}_${partition}`, e.g. "1_3". */
export type TaskId = string

export interface Subtopology {
  id: string
  /** Human readable summary of what this subtopology does. */
  name: string
  sourceTopics: string[]
  repartitionSourceTopics: string[]
  repartitionSinkTopics: string[]
  stateChangelogTopics: string[]
  sinkTopics: string[]
  stores: string[]
  /** Number of input partitions == number of tasks of this subtopology. */
  partitions: number
}

export interface Topology {
  epoch: number
  subtopologies: Subtopology[]
}

export interface Assignment {
  active: TaskId[]
  standby: TaskId[]
  /** Only reported by a real broker (warm-up tasks restore state before becoming active). */
  warmup?: TaskId[]
}

export type MemberState = 'STABLE' | 'UNREVOKED_TASKS' | 'UNRELEASED_TASKS'
/** NOT_READY only comes from a real broker (e.g. source topics missing). */
export type GroupState = 'EMPTY' | 'NOT_READY' | 'ASSIGNING' | 'RECONCILING' | 'STABLE'

export interface MemberView {
  memberId: string
  processId: string
  clientId: string
  memberEpoch: number
  state: MemberState
  /** joining = started but has not sent its first heartbeat yet. */
  status: 'joining' | 'alive' | 'crashed'
  /** Tasks the member currently owns (as known by the coordinator). */
  assignment: Assignment
  /** Tasks the member was asked to give up but has not acknowledged yet. */
  pendingRevocation: Assignment
  /** Target assignment computed by the broker-side assignor. */
  target: Assignment
  msSinceHeartbeat: number
}

export interface LogEvent {
  id: number
  time: number
  groupId: string
  kind: 'heartbeat' | 'epoch' | 'assignor' | 'member'
  message: string
}

export interface GroupView {
  groupId: string
  description: string
  dsl: string
  state: GroupState
  groupEpoch: number
  targetAssignmentEpoch: number
  numStandbyReplicas: number
  topology: Topology
  tasks: TaskId[]
  members: MemberView[]
  events: LogEvent[]
}

export interface Snapshot {
  /** sim = in-process coordinator simulation, real = live Kafka broker. */
  mode: 'sim' | 'real'
  /** Set when the real backend cannot reach the broker / inspector. */
  error?: string
  paused: boolean
  groups: GroupView[]
}

export type ClientMessage =
  | { type: 'addMember'; groupId: string; processId?: string }
  /** Graceful shutdown of a whole process (all its members leave the group). */
  | { type: 'stopProcess'; groupId: string; processId: string }
  /** Hard kill: the process stops heart-beating and is fenced after the session timeout. */
  | { type: 'killProcess'; groupId: string; processId: string }
  | { type: 'setStandbyReplicas'; groupId: string; value: number }
  | { type: 'togglePause' }
  | { type: 'reset' }
