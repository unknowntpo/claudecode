// Pure view logic for the console screens (Spec 003): order, "behind", drawer rows, process cards.
import type { GroupView, Subtopology, TaskId } from '../shared/types'

/** A member makes no progress, or a process was fenced in the last minute (Spec 004 Behavior 4). */
export const hasTrouble = (g: GroupView) => g.members.some((m) => m.status === 'stalled') || g.fenced.length > 0
const TRANSITIONAL = ['RECONCILING', 'ASSIGNING', 'NOT_READY']
const rank = (g: GroupView) => (hasTrouble(g) ? 0 : TRANSITIONAL.includes(g.state) ? 1 : 2)

/** CV1: stalled or fenced first, then groups that are moving, then the rest; each by id. */
export function sortGroups(groups: GroupView[]): GroupView[] {
  return [...groups].sort((a, b) => rank(a) - rank(b) || a.groupId.localeCompare(b.groupId))
}

/** Largest known subtopology lag, or null. */
export function maxLag(g: GroupView): number | null {
  const lags = Object.values(g.flow?.lag ?? {}).filter((l): l is number => l !== null)
  return lags.length ? Math.max(...lags) : null
}

/** CV2: behind = more than 5 seconds of input queued (or some lag while the rate is unknown). */
export function isBehind(g: GroupView): boolean {
  const lag = maxLag(g)
  if (lag === null) return false
  const rate = g.flow?.inputRate ?? null
  return rate === null ? lag > 0 : lag > 5 * rate
}

export interface TaskRow {
  task: TaskId
  /** Processes owning the task as active. */
  active: string[]
  /** Processes holding a standby. */
  standby: string[]
  /** "A→B" while the owner revokes and another member waits for it. */
  move: string | null
  /** No member owns it. */
  unowned: boolean
  /** It has an owner but made no progress past the stall threshold (Spec 004). */
  stalledMs: number | null
  /** Its new owner is rebuilding its state (Spec 006, inferred). */
  restoringMs: number | null
  /** Changelog records a new owner replays at most; null unknown, undefined without a store (Spec 006). */
  changelog: number | null | undefined
}

/** CV3: one row per task of a subtopology. */
export function taskRows(g: GroupView, subtopologyId: string): TaskRow[] {
  return g.tasks
    .filter((t) => t.split('_')[0] === subtopologyId)
    .map((task) => {
      const owners = g.members.filter((m) => m.assignment.active.includes(task))
      const revoking = owners.find((m) => m.pendingRevocation.active.includes(task))
      const waiting = g.members.find((m) => m !== revoking && m.target.active.includes(task) && !m.assignment.active.includes(task))
      return {
        task,
        active: owners.map((m) => m.processId),
        standby: g.members.filter((m) => m.assignment.standby.includes(task)).map((m) => m.processId),
        move: revoking && waiting ? `${revoking.processId}→${waiting.processId}` : null,
        unowned: owners.length === 0,
        stalledMs: g.stalledTasks[task] ?? null,
        restoringMs: g.restoringTasks[task] ?? null,
        changelog: g.changelog[task],
      }
    })
}

export interface ProcessCard {
  processId: string
  status: 'alive' | 'restoring' | 'stalled'
  /** The longest time without progress among its threads; null when it is not stalled. */
  stalledMs: number | null
  /** The longest restore among its threads; null when none restores. */
  restoringMs: number | null
  /** Changelog total of its active stateful tasks: null if any is unknown, undefined if it has none (RS5). */
  changelog: number | null | undefined
  threads: { memberId: string; memberEpoch: number; tasks: { task: TaskId; role: 'active' | 'standby' }[] }[]
}

const byTask = (a: TaskId, b: TaskId) => {
  const [sa, pa] = a.split('_').map(Number)
  const [sb, pb] = b.split('_').map(Number)
  return sa - sb || pa - pb
}
const STATUS_RANK = { alive: 0, restoring: 1, stalled: 2 }

/** CV4 / RS5: one card per process: stalled if a thread is, else restoring if one is; alive, restoring, stalled; each by label. */
export function processCards(g: GroupView): ProcessCard[] {
  const byProcess = new Map<string, GroupView['members']>()
  for (const m of g.members) byProcess.set(m.processId, [...(byProcess.get(m.processId) ?? []), m])
  return [...byProcess]
    .map(([processId, ms]): ProcessCard => {
      const stalls = ms.map((m) => m.stalledMs).filter((x): x is number => x !== null)
      const restores = ms.map((m) => m.restoringMs).filter((x): x is number => x !== null)
      const sizes = ms.flatMap((m) => m.assignment.active).filter((t) => t in g.changelog).map((t) => g.changelog[t])
      return {
        processId,
        status: stalls.length ? 'stalled' : restores.length ? 'restoring' : 'alive',
        stalledMs: stalls.length ? Math.max(...stalls) : null,
        restoringMs: restores.length ? Math.max(...restores) : null,
        changelog: !sizes.length ? undefined : sizes.includes(null) ? null : sizes.reduce((a, b) => a! + b!, 0),
        threads: ms.map((m) => ({
          memberId: m.memberId,
          memberEpoch: m.memberEpoch,
          tasks: [
            ...[...m.assignment.active].sort(byTask).map((task) => ({ task, role: 'active' as const })),
            ...[...m.assignment.standby].sort(byTask).map((task) => ({ task, role: 'standby' as const })),
          ],
        })),
      }
    })
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.processId.localeCompare(b.processId))
}

/** CV9: the subtopology the drawer shows, or null once it no longer exists. */
export function drawerSubtopology(g: GroupView, selected: string | null): Subtopology | null {
  return selected === null ? null : (g.topology.subtopologies.find((s) => s.id === selected) ?? null)
}

export interface FencedCard {
  processId: string
  stalledMs: number
  fencedAt: number
  /** Each task it owned and who owns it now (null while nobody does). */
  tasks: { task: TaskId; nowOwnedBy: string | null }[]
}

/** RO11: fenced processes of the last minute, with where their tasks went. */
export function fencedCards(g: GroupView): FencedCard[] {
  return g.fenced.map((f) => ({
    processId: f.processId,
    stalledMs: f.stalledMs,
    fencedAt: f.fencedAt,
    tasks: [...f.tasks].sort(byTask).map((task) => ({
      task,
      nowOwnedBy: g.members.find((m) => m.assignment.active.includes(task))?.processId ?? null,
    })),
  }))
}
