// MODE=sim: the in-process coordinator simulation.
import type { ClientMessage, Snapshot } from '../shared/types'
import type { Backend } from './backend'
import { createGroups } from './topologies'

export class SimBackend implements Backend {
  private groups = createGroups()
  private paused = false
  private lastTick = Date.now()

  snapshot(): Snapshot {
    const now = Date.now()
    return { mode: 'sim', paused: this.paused, groups: this.groups.map((g) => g.view(now)) }
  }

  handle(msg: ClientMessage) {
    if (msg.type === 'reset') {
      this.groups = createGroups()
      this.paused = false
      return
    }
    if (msg.type === 'togglePause') {
      this.paused = !this.paused
      return
    }
    const group = this.groups.find((g) => g.groupId === msg.groupId)
    if (!group) return
    if (msg.type === 'addMember') group.addMember(Date.now(), msg.processId)
    else if (msg.type === 'stopProcess') group.stopProcess(msg.processId)
    else if (msg.type === 'killProcess') group.killProcess(msg.processId)
    else if (msg.type === 'setStandbyReplicas') group.setStandbyReplicas(msg.value)
  }

  tick() {
    const now = Date.now()
    // While paused, shift member timers so nothing "times out" on resume.
    if (this.paused) {
      for (const g of this.groups)
        for (const m of g.members.values()) {
          m.lastHeartbeat += now - this.lastTick
          m.nextHeartbeat += now - this.lastTick
        }
    } else {
      for (const g of this.groups) g.tick(now)
    }
    this.lastTick = now
  }

  close() {}
}
