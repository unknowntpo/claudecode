// A simplified version of the broker-side "sticky" task assignor that KIP-1071
// moved from the Kafka Streams client into the group coordinator.
//
// 1. Active tasks stay on their previous owner (stickiness) as long as that
//    member is not above its fair share.
// 2. Remaining active tasks go to the least loaded member (ties broken by
//    the least loaded process).
// 3. Standby tasks go to members on a *different process* than every other
//    copy of the task, preferring the previous standby owner.

import type { Assignment, TaskId } from '../shared/types'

export interface AssignorMember {
  memberId: string
  processId: string
}

export function compareTaskIds(a: TaskId, b: TaskId): number {
  const [sa, pa] = a.split('_').map(Number)
  const [sb, pb] = b.split('_').map(Number)
  return sa - sb || pa - pb
}

export function stickyAssign(
  members: AssignorMember[],
  tasks: TaskId[],
  previous: Map<string, Assignment>,
  numStandbyReplicas: number,
): Map<string, Assignment> {
  const result = new Map<string, Assignment>()
  for (const m of members) result.set(m.memberId, { active: [], standby: [] })
  if (members.length === 0) return result

  const get = (memberId: string) => result.get(memberId)!
  const processLoad = (processId: string) =>
    members
      .filter((m) => m.processId === processId)
      .reduce((sum, m) => sum + get(m.memberId).active.length + get(m.memberId).standby.length, 0)

  // --- 1. sticky active tasks -------------------------------------------
  const fairShare = Math.ceil(tasks.length / members.length)
  const unassigned: TaskId[] = []
  for (const task of tasks) {
    const prevOwner = [...previous].find(([id, a]) => result.has(id) && a.active.includes(task))?.[0]
    if (prevOwner && get(prevOwner).active.length < fairShare) get(prevOwner).active.push(task)
    else unassigned.push(task)
  }

  // --- 2. balance remaining active tasks --------------------------------
  for (const task of unassigned) {
    const best = [...members].sort(
      (a, b) =>
        get(a.memberId).active.length - get(b.memberId).active.length ||
        processLoad(a.processId) - processLoad(b.processId) ||
        a.memberId.localeCompare(b.memberId),
    )[0]
    get(best.memberId).active.push(task)
  }

  // --- 3. standby tasks on other processes ------------------------------
  for (let replica = 0; replica < numStandbyReplicas; replica++) {
    for (const task of tasks) {
      const usedProcesses = new Set(
        members
          .filter((m) => get(m.memberId).active.includes(task) || get(m.memberId).standby.includes(task))
          .map((m) => m.processId),
      )
      const candidates = members.filter((m) => !usedProcesses.has(m.processId))
      if (candidates.length === 0) continue // not enough processes for another replica

      const load = (m: AssignorMember) => get(m.memberId).active.length + get(m.memberId).standby.length
      const sticky = candidates.find((m) => previous.get(m.memberId)?.standby.includes(task))
      const best =
        sticky ?? [...candidates].sort((a, b) => load(a) - load(b) || a.memberId.localeCompare(b.memberId))[0]
      get(best.memberId).standby.push(task)
    }
  }

  for (const a of result.values()) {
    a.active.sort(compareTaskIds)
    a.standby.sort(compareTaskIds)
  }
  return result
}
