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
}

export interface GroupProgress {
  /**
   * Per task: the committed offset, when it last changed, its owner, and since when unprocessed input has been
   * waiting (end > committed) without a commit; null while there is none.
   */
  tasks: Record<string, { committed: number; changedAt: number; backlogSince: number | null; owner: string | null }>
  /** Recent times between committed-offset changes (any task), newest last. */
  intervals: number[]
}

const MIN_THRESHOLD_MS = 5000
const MAX_INTERVALS = 50

/** 3 × the group's typical commit interval, at least 5 s. The lower median keeps a stall itself from raising it. */
export function stallThreshold(intervals: number[]): number {
  if (intervals.length === 0) return MIN_THRESHOLD_MS
  const sorted = [...intervals].sort((a, b) => a - b)
  return Math.max(MIN_THRESHOLD_MS, 3 * sorted[(sorted.length - 1) >> 1])
}

/** RO4: advance the progress state by one poll and report stalled tasks (ms since their last commit). */
export function stepProgress(
  prev: GroupProgress | undefined,
  now: number,
  samples: TaskSample[],
): { next: GroupProgress; stalledMs: Record<string, number>; thresholdMs: number } {
  const tasks = { ...(prev?.tasks ?? {}) }
  const intervals = [...(prev?.intervals ?? [])]
  for (const s of samples) {
    if (s.committed === null) continue
    const known = tasks[s.task]
    const owner = s.owner ?? null
    const backlog = s.end !== null && s.end > s.committed
    // a commit, a new owner or the first sample restarts the clock; a backlog left after it starts now
    const restart = { committed: s.committed, changedAt: now, backlogSince: backlog ? now : null, owner }
    if (!known || known.owner !== owner) tasks[s.task] = restart
    else if (known.committed !== s.committed) {
      intervals.push(now - known.changedAt)
      tasks[s.task] = restart
    } else if (known.backlogSince === null && backlog) {
      // input arrived on an idle partition: the stall is measured from now, not from the last commit
      tasks[s.task] = { ...known, backlogSince: now }
    }
  }
  while (intervals.length > MAX_INTERVALS) intervals.shift()

  const thresholdMs = stallThreshold(intervals)
  const stalledMs: Record<string, number> = {}
  for (const s of samples) {
    const known = tasks[s.task]
    if (!known || known.backlogSince === null) continue
    const waiting = now - known.backlogSince
    // idle input is never stalled: only unprocessed records that wait past the threshold are
    if (waiting > thresholdMs) stalledMs[s.task] = waiting
  }
  return { next: { tasks, intervals }, stalledMs, thresholdMs }
}

export interface GoneProcess {
  processId: string
  kind: 'left' | 'fenced'
  /** How long it had made no progress before it was fenced; null when it left. */
  stalledMs: number | null
}

/** RO11: processes whose members disappeared since the last poll: fenced if any of them was stalled, else left. */
export function goneProcesses(
  before: { memberId: string; processId: string; stalledMs: number | null }[],
  stillListed: Set<string>,
): GoneProcess[] {
  const byProcess = new Map<string, number | null>()
  for (const m of before) {
    if (stillListed.has(m.memberId)) continue
    const prev = byProcess.has(m.processId) ? byProcess.get(m.processId)! : null
    byProcess.set(m.processId, m.stalledMs === null ? prev : Math.max(prev ?? 0, m.stalledMs))
  }
  return [...byProcess].map(([processId, stalledMs]) => ({
    processId,
    kind: stalledMs === null ? 'left' : 'fenced',
    stalledMs,
  }))
}
