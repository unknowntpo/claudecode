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
  /**
   * stalled = owns an active task that made no progress past the stall threshold (Spec 004 Behavior 4);
   * restoring = otherwise owns a task its new owner is rebuilding from the changelog (Spec 006, inferred).
   */
  status: 'alive' | 'stalled' | 'restoring'
  /** Tasks the member currently owns (as known by the coordinator). */
  assignment: Assignment
  /** Tasks the member was asked to give up but has not acknowledged yet. */
  pendingRevocation: Assignment
  /** Target assignment computed by the broker-side assignor. */
  target: Assignment
  /** Longest time without progress among its stalled active tasks; null when not stalled. */
  stalledMs: number | null
  /** Longest restore among its restoring active tasks; null when none restores. */
  restoringMs: number | null
}

/** A process the broker fenced after it stopped making progress; shown for 60 s (Spec 004 RO11). */
export interface FencedProcess {
  processId: string
  fencedAt: number
  stalledMs: number
  /** Active tasks it owned when last seen. */
  tasks: TaskId[]
}

export interface LogEvent {
  id: number
  time: number
  groupId: string
  kind: 'heartbeat' | 'epoch' | 'assignor' | 'member'
  message: string
}

export type TopicKind = 'source' | 'repartition' | 'changelog'

export interface TopicFlow {
  name: string
  kind: TopicKind
  endOffset: number | null
  /** Records per second since the previous poll; null when unknown (Spec 002 Behavior 3). */
  rate: number | null
}

export interface GroupFlow {
  topics: TopicFlow[]
  /** Lag per subtopology id; null when unknown. */
  lag: Record<string, number | null>
  /** Sum of the source topics' rates; null when any is unknown. */
  inputRate: number | null
}

export interface ConfigEntry {
  key: string
  /** null when the broker reports no entry for the key */
  value: string | null
  source: 'group' | 'default'
}

export interface GroupView {
  groupId: string
  state: GroupState
  groupEpoch: number
  targetAssignmentEpoch: number
  numStandbyReplicas: number
  topology: Topology
  tasks: TaskId[]
  members: MemberView[]
  events: LogEvent[]
  flow: GroupFlow | null
  configs: ConfigEntry[]
  /** Stalled tasks: ms since their last commit (Spec 004 Behavior 4). */
  stalledTasks: Record<TaskId, number>
  stallThresholdMs: number
  fenced: FencedProcess[]
  /** Restoring tasks: ms their input has waited for the new owner's first commit (Spec 006). */
  restoringTasks: Record<TaskId, number>
  /** Changelog records each stateful task replays at most; null when unknown (Spec 006). */
  changelog: Record<TaskId, number | null>
}

export interface Snapshot {
  /** Set when the backend cannot reach the broker / inspector. */
  error?: string
  paused: boolean
  groups: GroupView[]
}

/** The console is read-only (Spec 004): the only write is the broker-side standby group config. */
export type ClientMessage =
  | { type: 'setStandbyReplicas'; groupId: string; value: number }
  | { type: 'togglePause' }
