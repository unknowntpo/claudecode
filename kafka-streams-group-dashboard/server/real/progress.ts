// Spec 004 Behavior 4: stalled tasks from committed offsets, and members that left or were fenced.
// The broker reports no heartbeat times, so progress is the only sign of trouble before it fences a member.

export interface TaskSample {
  task: string
  /** Sum of the committed offsets of the task's input partitions; null if any is unknown. */
  committed: number | null
  /** Sum of the end offsets of the same partitions; null if unknown. */
  end: number | null
  /** The member that owns it as active; a new owner restores state before it commits, so its clock restarts. */
  owner?: string | null
  /** Changelog records to replay at most (Spec 006); null when unknown, absent when the task has no store. */
  changelog?: number | null
  /** Restore progress 0–1 its active owner reports (Spec 007, Kafka 4.4); absent when not reported. */
  progress?: number
}

export interface GroupProgress {
  /**
   * Per task: the committed offset, when it last changed, its owner, and since when unprocessed input has been
   * waiting (end > committed) without a commit; null while there is none. `newOwner`: the owner changed after
   * the first poll and has not committed since (Spec 006); `restoringSince`: when it was last seen restoring.
   */
  tasks: Record<string, TaskProgress>
  /** Recent times between committed-offset changes (any task), newest last. */
  intervals: number[]
}

interface TaskProgress {
  committed: number
  changedAt: number
  backlogSince: number | null
  owner: string | null
  newOwner: boolean
  restoringSince: number | null
  /** The current owner reported restore progress for it (Spec 007). */
  reported: boolean
  /** The current owner has committed: it runs, so a report still seen is stale (reports lag by an interval). */
  committedSinceOwner: boolean
  /** Last reported progress and when it last changed. */
  lastProgress: number | null
  progressChangedAt: number
}

const MIN_THRESHOLD_MS = 5000
const MAX_INTERVALS = 50

/** 3 × the group's typical commit interval, at least 5 s. The lower median keeps a stall itself from raising it. */
export function stallThreshold(intervals: number[]): number {
  if (intervals.length === 0) return MIN_THRESHOLD_MS
  const sorted = [...intervals].sort((a, b) => a - b)
  return Math.max(MIN_THRESHOLD_MS, 3 * sorted[(sorted.length - 1) >> 1])
}

/**
 * RO4 / RS3: advance the progress state by one poll and report stalled tasks (ms the backlog has waited) and
 * restoring tasks (a new owner with state to rebuild that has not committed yet; never stalled).
 */
export function stepProgress(
  prev: GroupProgress | undefined,
  now: number,
  samples: TaskSample[],
): {
  next: GroupProgress
  stalledMs: Record<string, number>
  thresholdMs: number
  restoringMs: Record<string, number>
  /** Tasks that started restoring at this poll. */
  restoreStarted: string[]
  /** Tasks whose restore a commit (or the end of its reports) ended at this poll: ms since the restore started. */
  restoredMs: Record<string, number>
  /** Reported restore progress (Spec 007) and ms since the reported value last changed. */
  progress: Record<string, { fraction: number; ageMs: number }>
} {
  const tasks = { ...(prev?.tasks ?? {}) }
  const intervals = [...(prev?.intervals ?? [])]
  const restoredMs: Record<string, number> = {}
  for (const s of samples) {
    if (s.committed === null) continue
    const known = tasks[s.task]
    const owner = s.owner ?? null
    const backlog = s.end !== null && s.end > s.committed
    // a commit, a new owner or the first sample restarts the clock; a backlog left after it starts now
    const restart: TaskProgress = {
      committed: s.committed, changedAt: now, backlogSince: backlog ? now : null, owner, newOwner: false, restoringSince: null,
      reported: false, committedSinceOwner: false, lastProgress: null, progressChangedAt: now,
    }
    if (!known) tasks[s.task] = restart
    // nobody owning it is no new owner: the clock restarts, restoring waits for the next owner
    else if (known.owner !== owner) tasks[s.task] = { ...restart, newOwner: owner !== null }
    else if (known.committed !== s.committed) {
      intervals.push(now - known.changedAt)
      if (known.restoringSince !== null) restoredMs[s.task] = now - known.restoringSince
      tasks[s.task] = { ...restart, committedSinceOwner: true }
    } else if (known.backlogSince === null && backlog) {
      // input arrived on an idle partition: the stall is measured from now, not from the last commit
      tasks[s.task] = { ...known, backlogSince: now }
    }
  }
  while (intervals.length > MAX_INTERVALS) intervals.shift()

  const thresholdMs = stallThreshold(intervals)
  const stalledMs: Record<string, number> = {}
  const restoringMs: Record<string, number> = {}
  const restoreStarted: string[] = []
  const progress: Record<string, { fraction: number; ageMs: number }> = {}
  for (const s of samples) {
    let known = tasks[s.task]
    if (!known) continue
    // RP3: the owner's report decides first; once it stops, the restore has finished and nothing is inferred
    if (s.progress !== undefined && !known.committedSinceOwner) {
      const changed = known.lastProgress !== s.progress
      if (known.restoringSince === null) restoreStarted.push(s.task)
      known = tasks[s.task] = {
        ...known,
        reported: true,
        lastProgress: s.progress,
        progressChangedAt: changed ? now : known.progressChangedAt,
        restoringSince: known.restoringSince ?? (known.newOwner ? known.changedAt : now),
      }
      restoringMs[s.task] = now - known.restoringSince!
      progress[s.task] = { fraction: s.progress, ageMs: now - known.progressChangedAt }
      continue
    }
    if (known.reported) {
      if (known.restoringSince !== null) restoredMs[s.task] = now - known.restoringSince
      const backlog = s.end !== null && s.committed !== null && s.end > s.committed
      if (known.restoringSince !== null || known.newOwner)
        known = tasks[s.task] = { ...known, restoringSince: null, newOwner: false, backlogSince: backlog ? now : null, lastProgress: null }
    }
    const waiting = known.backlogSince === null ? null : now - known.backlogSince
    if (waiting !== null && known.newOwner && (s.changelog ?? 0) > 0) {
      restoringMs[s.task] = waiting
      if (known.restoringSince === null) {
        restoreStarted.push(s.task)
        tasks[s.task] = { ...known, restoringSince: known.backlogSince }
      }
      continue
    }
    if (known.restoringSince !== null) tasks[s.task] = { ...known, restoringSince: null }
    // idle input is never stalled: only unprocessed records that wait past the threshold are
    if (waiting !== null && waiting > thresholdMs) stalledMs[s.task] = waiting
  }
  return { next: { tasks, intervals }, stalledMs, thresholdMs, restoringMs, restoreStarted, restoredMs, progress }
}

export interface GoneProcess {
  processId: string
  kind: 'left' | 'fenced' | 'restoring'
  /** How long it had made no progress before it was fenced; null otherwise. */
  stalledMs: number | null
}

/**
 * RO11 / RS4: processes whose members disappeared since the last poll: fenced if any of them was stalled, else
 * gone while restoring if any was restoring (a crash and a stop look the same then), else left.
 */
export function goneProcesses(
  before: { memberId: string; processId: string; stalledMs: number | null; restoring?: boolean }[],
  stillListed: Set<string>,
): GoneProcess[] {
  const byProcess = new Map<string, { stalledMs: number | null; restoring: boolean }>()
  for (const m of before) {
    if (stillListed.has(m.memberId)) continue
    const prev = byProcess.get(m.processId) ?? { stalledMs: null, restoring: false }
    byProcess.set(m.processId, {
      stalledMs: m.stalledMs === null ? prev.stalledMs : Math.max(prev.stalledMs ?? 0, m.stalledMs),
      restoring: prev.restoring || !!m.restoring,
    })
  }
  return [...byProcess].map(([processId, { stalledMs, restoring }]) => ({
    processId,
    kind: stalledMs !== null ? 'fenced' : restoring ? 'restoring' : 'left',
    stalledMs,
  }))
}
