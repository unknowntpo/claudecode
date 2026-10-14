// Simulated broker-side group coordinator for one Kafka Streams group
// (KIP-1071 "Streams Rebalance Protocol", `group.protocol=streams`).
//
// Every member sends a StreamsGroupHeartbeat periodically. The coordinator:
//   * bumps the group epoch when membership or config changes,
//   * recomputes the target assignment (server-side assignor) when the group
//     epoch is ahead of the target assignment epoch,
//   * reconciles each member towards its target assignment incrementally:
//     first revoke tasks the member must give up (UNREVOKED_TASKS), then hand
//     out new active tasks once their previous owner released them
//     (UNRELEASED_TASKS). No stop-the-world rebalance.

import type { Assignment, GroupState, GroupView, LogEvent, MemberState, TaskId, Topology } from '../shared/types'
import { compareTaskIds, stickyAssign } from './assignor'

export const HEARTBEAT_INTERVAL_MS = 2000
export const SESSION_TIMEOUT_MS = 8000
const MAX_EVENTS = 200

interface Member {
  memberId: string
  processId: string
  clientId: string
  memberEpoch: number
  state: MemberState
  joined: boolean
  crashed: boolean
  assignment: Assignment
  pendingRevocation: Assignment
  lastHeartbeat: number
  nextHeartbeat: number
}

const empty = (): Assignment => ({ active: [], standby: [] })
const isEmpty = (a: Assignment) => a.active.length === 0 && a.standby.length === 0
const minus = (a: TaskId[], b: TaskId[]) => a.filter((t) => !b.includes(t))
const fmt = (a: Assignment) => `active=[${a.active.join(',')}] standby=[${a.standby.join(',')}]`

let eventSeq = 0
let memberSeq = 0

export class StreamsGroup {
  groupEpoch = 0
  targetAssignmentEpoch = 0
  numStandbyReplicas = 0
  members = new Map<string, Member>()
  target = new Map<string, Assignment>()
  events: LogEvent[] = []
  private processSeq = 0

  constructor(
    readonly groupId: string,
    readonly description: string,
    readonly dsl: string,
    readonly topology: Topology,
    private readonly jitter = () => Math.random() * 1000,
  ) {}

  get tasks(): TaskId[] {
    return this.topology.subtopologies.flatMap((s) => Array.from({ length: s.partitions }, (_, p) => `${s.id}_${p}`))
  }

  get state(): GroupState {
    const joined = [...this.members.values()].filter((m) => m.joined)
    if (joined.length === 0) return 'EMPTY'
    if (this.targetAssignmentEpoch < this.groupEpoch) return 'ASSIGNING'
    if (joined.some((m) => m.memberEpoch !== this.targetAssignmentEpoch || m.state !== 'STABLE')) return 'RECONCILING'
    return 'STABLE'
  }

  // ---- actions triggered from the dashboard -----------------------------

  /** Start a new StreamThread, either in a new process (KafkaStreams instance) or an existing one. */
  addMember(now: number, processId?: string): string {
    const pid = processId ?? `process-${String.fromCharCode(65 + this.processSeq++)}`
    const thread = [...this.members.values()].filter((m) => m.processId === pid).length + 1
    const memberId = `m${++memberSeq}-${crypto.randomUUID().slice(0, 4)}`
    this.members.set(memberId, {
      memberId,
      processId: pid,
      clientId: `${this.groupId}-${pid}-StreamThread-${thread}`,
      memberEpoch: 0,
      state: 'STABLE',
      joined: false,
      crashed: false,
      assignment: empty(),
      pendingRevocation: empty(),
      lastHeartbeat: now,
      nextHeartbeat: now, // joins on the next tick
    })
    return memberId
  }

  /** Graceful shutdown: the member sends a heartbeat with memberEpoch = -1. */
  leave(memberId: string) {
    const m = this.members.get(memberId)
    if (!m) return
    this.members.delete(memberId)
    this.target.delete(memberId)
    if (!m.joined) return
    this.log('heartbeat', `${memberId} → StreamsGroupHeartbeat(memberEpoch=-1) leave group`)
    this.bumpEpoch(`${memberId} left the group`)
  }

  /** Simulate a crash: the member silently stops heart-beating. */
  crash(memberId: string) {
    const m = this.members.get(memberId)
    if (!m || m.crashed) return
    m.crashed = true
    this.log('member', `${memberId} crashed (no more heartbeats, fenced after ${SESSION_TIMEOUT_MS / 1000}s session timeout)`)
  }

  setStandbyReplicas(value: number) {
    const v = Math.max(0, Math.min(3, Math.floor(value)))
    if (v === this.numStandbyReplicas) return
    this.numStandbyReplicas = v
    this.bumpEpoch(`group config num.standby.replicas=${v}`)
  }

  // ---- simulation loop ----------------------------------------------------

  tick(now: number) {
    for (const m of [...this.members.values()]) {
      if (m.crashed) {
        if (!m.joined) this.members.delete(m.memberId)
        else if (now - m.lastHeartbeat > SESSION_TIMEOUT_MS) {
          this.members.delete(m.memberId)
          this.target.delete(m.memberId)
          this.log('member', `${m.memberId} fenced: session timeout expired`)
          this.bumpEpoch(`${m.memberId} was fenced`)
        }
      } else if (now >= m.nextHeartbeat) {
        this.heartbeat(m, now)
      }
    }
  }

  private heartbeat(m: Member, now: number) {
    if (!m.joined) {
      m.joined = true
      this.log('heartbeat', `${m.memberId} → StreamsGroupHeartbeat(memberEpoch=0, processId=${m.processId}, topology epoch=${this.topology.epoch}) join`)
      this.bumpEpoch(`${m.memberId} joined`)
    } else {
      this.log('heartbeat', `${m.memberId} → StreamsGroupHeartbeat(memberEpoch=${m.memberEpoch})`)
    }

    if (this.groupEpoch > this.targetAssignmentEpoch) this.computeTargetAssignment()

    // The member acknowledges a revocation by no longer reporting the revoked tasks.
    if (!isEmpty(m.pendingRevocation)) {
      m.assignment = {
        active: minus(m.assignment.active, m.pendingRevocation.active),
        standby: minus(m.assignment.standby, m.pendingRevocation.standby),
      }
      this.log('heartbeat', `${m.memberId} acknowledged revocation of ${fmt(m.pendingRevocation)}`)
      m.pendingRevocation = empty()
    }

    this.reconcile(m)
    m.lastHeartbeat = now
    m.nextHeartbeat = now + HEARTBEAT_INTERVAL_MS + this.jitter()
  }

  private reconcile(m: Member) {
    const target = this.target.get(m.memberId) ?? empty()

    // Step 1: revoke what the member must give up. Its epoch stays behind.
    const revoke: Assignment = {
      active: minus(m.assignment.active, target.active),
      standby: minus(m.assignment.standby, target.standby),
    }
    if (!isEmpty(revoke)) {
      m.pendingRevocation = revoke
      m.state = 'UNREVOKED_TASKS'
      this.log('heartbeat', `${m.memberId} ← revoke ${fmt(revoke)} (state UNREVOKED_TASKS, epoch stays ${m.memberEpoch})`)
      return
    }

    // Step 2: move to the target epoch and take over every task that is free.
    const ownedByOthers = new Set(
      [...this.members.values()].filter((o) => o.memberId !== m.memberId).flatMap((o) => o.assignment.active),
    )
    const newActive = minus(target.active, m.assignment.active)
    const free = newActive.filter((t) => !ownedByOthers.has(t))
    const unreleased = minus(newActive, free)
    const newStandby = minus(target.standby, m.assignment.standby)

    const epochChanged = m.memberEpoch !== this.targetAssignmentEpoch
    m.memberEpoch = this.targetAssignmentEpoch
    m.assignment = { active: [...m.assignment.active, ...free].sort(compareTaskIds), standby: [...target.standby] }
    m.state = unreleased.length > 0 ? 'UNRELEASED_TASKS' : 'STABLE'

    if (free.length || newStandby.length || epochChanged || unreleased.length) {
      const waiting = unreleased.length ? `, waiting for [${unreleased.join(',')}] to be released` : ''
      this.log('heartbeat', `${m.memberId} ← memberEpoch=${m.memberEpoch} ${fmt(m.assignment)} (${m.state}${waiting})`)
    }
  }

  private computeTargetAssignment() {
    const members = [...this.members.values()]
      .filter((m) => m.joined) // the coordinator cannot tell a crashed member apart until it is fenced
      .map(({ memberId, processId }) => ({ memberId, processId }))
    this.target = stickyAssign(members, this.tasks, this.target, this.numStandbyReplicas)
    this.targetAssignmentEpoch = this.groupEpoch
    const summary = [...this.target].map(([id, a]) => `${id}: ${fmt(a)}`).join(' | ')
    this.log('assignor', `target assignment epoch ${this.targetAssignmentEpoch} → ${summary || '(no members)'}`)
  }

  private bumpEpoch(reason: string) {
    this.groupEpoch++
    this.log('epoch', `group epoch → ${this.groupEpoch} (${reason})`)
  }

  private log(kind: LogEvent['kind'], message: string) {
    this.events.push({ id: ++eventSeq, time: Date.now(), groupId: this.groupId, kind, message })
    if (this.events.length > MAX_EVENTS) this.events.shift()
  }

  view(now: number): GroupView {
    return {
      groupId: this.groupId,
      description: this.description,
      dsl: this.dsl,
      state: this.state,
      groupEpoch: this.groupEpoch,
      targetAssignmentEpoch: this.targetAssignmentEpoch,
      numStandbyReplicas: this.numStandbyReplicas,
      topology: this.topology,
      tasks: this.tasks,
      members: [...this.members.values()].map((m) => ({
        memberId: m.memberId,
        processId: m.processId,
        clientId: m.clientId,
        memberEpoch: m.memberEpoch,
        state: m.state,
        status: m.crashed ? 'crashed' : m.joined ? 'alive' : 'joining',
        assignment: m.assignment,
        pendingRevocation: m.pendingRevocation,
        target: this.target.get(m.memberId) ?? empty(),
        msSinceHeartbeat: now - m.lastHeartbeat,
      })),
      events: this.events,
    }
  }
}
