<script setup lang="ts">
import { computed } from 'vue'
import type { ClientMessage, GroupView, MemberView, TaskId } from '../../shared/types'

const props = defineProps<{ group: GroupView; send: (msg: ClientMessage) => void }>()

/** Members grouped by process (one KafkaStreams instance = one process, one member per StreamThread). */
const processes = computed(() => {
  const byProcess = new Map<string, MemberView[]>()
  for (const m of props.group.members) byProcess.set(m.processId, [...(byProcess.get(m.processId) ?? []), m])
  return [...byProcess].map(([processId, members]) => ({ processId, members }))
})
const members = computed(() => processes.value.flatMap((p) => p.members))

type Cell = { label: string; cls: string; title: string } | null

function cell(m: MemberView, t: TaskId): Cell {
  if (m.pendingRevocation.active.includes(t)) return { label: 'A', cls: 'revoke', title: 'active, revoke pending' }
  if (m.pendingRevocation.standby.includes(t)) return { label: 'S', cls: 'revoke', title: 'standby, revoke pending' }
  if (m.assignment.active.includes(t)) return { label: 'A', cls: 'active', title: 'active task (owned)' }
  if (m.assignment.standby.includes(t)) return { label: 'S', cls: 'standby', title: 'standby task (owned)' }
  if (m.target.active.includes(t)) return { label: 'A', cls: 'active target', title: 'target: active, not yet owned' }
  if (m.target.standby.includes(t)) return { label: 'S', cls: 'standby target', title: 'target: standby, not yet owned' }
  return null
}

const ownerCount = (t: TaskId) => props.group.members.filter((m) => m.assignment.active.includes(t)).length
const subtopologyOf = (t: TaskId) => t.split('_')[0]
</script>

<template>
  <section>
    <h2>Task assignment (rows = tasks, columns = members)</h2>
    <div class="legend">
      <span><i class="active">A</i> active</span>
      <span><i class="standby">S</i> standby</span>
      <span><i class="active target">A</i> target, not owned yet</span>
      <span><i class="revoke">A</i> revoking</span>
      <span><i class="none">!</i> task currently not processed</span>
    </div>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th />
            <th v-for="p in processes" :key="p.processId" :colspan="p.members.length" class="process">
              {{ p.processId }}
              <button title="Start one more StreamThread in this process" @click="send({ type: 'addMember', groupId: group.groupId, processId: p.processId })">
                + thread
              </button>
            </th>
          </tr>
          <tr>
            <th />
            <th v-for="m in members" :key="m.memberId" class="member">
              <div class="mono id">{{ m.memberId }}</div>
              <div class="mono muted">epoch {{ m.memberEpoch }}</div>
              <span class="badge" :class="m.status === 'alive' ? m.state : m.status">
                {{ m.status === 'alive' ? m.state : m.status }}
              </span>
              <div v-if="m.status !== 'crashed'" class="btns">
                <button title="Graceful shutdown (heartbeat with epoch -1)" @click="send({ type: 'leaveMember', groupId: group.groupId, memberId: m.memberId })">
                  leave
                </button>
                <button class="danger" title="Stop heart-beating; fenced after session timeout" @click="send({ type: 'crashMember', groupId: group.groupId, memberId: m.memberId })">
                  crash
                </button>
              </div>
              <div v-else class="mono muted">silent {{ (m.msSinceHeartbeat / 1000).toFixed(1) }}s</div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(t, i) in group.tasks"
            :key="t"
            :class="{ split: i > 0 && subtopologyOf(t) !== subtopologyOf(group.tasks[i - 1]) }"
          >
            <th class="mono task">
              {{ t }}
              <i v-if="members.some((m) => m.status !== 'joining') && ownerCount(t) === 0" class="none" title="no member owns this active task right now">!</i>
            </th>
            <td v-for="m in members" :key="m.memberId">
              <i v-if="cell(m, t)" :class="cell(m, t)!.cls" :title="cell(m, t)!.title">{{ cell(m, t)!.label }}</i>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="members.length === 0" class="muted">No members. Start a process to join the group.</p>
    </div>
  </section>
</template>

<style scoped>
.legend { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 12px; color: var(--muted); font-size: 12px; }
.legend span { display: flex; gap: 6px; align-items: center; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; }
th, td { border: 1px solid var(--border); padding: 4px 8px; text-align: center; }
th.process { background: var(--bg); font-weight: 600; }
th.process button { margin-left: 6px; padding: 1px 6px; font-size: 11px; }
th.member { min-width: 130px; font-weight: normal; vertical-align: top; }
.member .id { font-weight: 600; }
.member .badge { margin: 4px 0; font-size: 10px; }
.btns { display: flex; gap: 4px; justify-content: center; }
.btns button { padding: 1px 6px; font-size: 11px; }
th.task { text-align: left; white-space: nowrap; }
tr.split > * { border-top: 2px solid var(--muted); }
i {
  display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 22px;
  border-radius: 5px; font-style: normal; font-weight: 700; font-size: 12px; transition: all .3s;
}
i.active { background: var(--active-bg); color: var(--active); border: 1.5px solid var(--active); }
i.standby { background: var(--standby-bg); color: var(--standby); border: 1.5px solid var(--standby); }
i.target { background: transparent; border-style: dashed; opacity: .8; }
i.revoke { background: var(--revoke-bg); color: var(--revoke); border: 1.5px solid var(--revoke); text-decoration: line-through; }
i.none { width: 18px; height: 18px; margin-left: 4px; background: var(--danger); color: #fff; border-radius: 50%; }
</style>
