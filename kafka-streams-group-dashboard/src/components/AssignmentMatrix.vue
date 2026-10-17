<script setup lang="ts">
import { computed } from 'vue'
import { tasksOf } from '../../shared/pipeline'
import type { GroupView, MemberView, TaskId } from '../../shared/types'
import { badgeClass } from '../format'
import { useI18n } from '../i18n'

const props = defineProps<{ group: GroupView; selected: string | null }>()
const { tr } = useI18n()

/** Members grouped by process (one KafkaStreams instance = one process, one member per StreamThread). */
const processes = computed(() => {
  const byProcess = new Map<string, MemberView[]>()
  for (const m of props.group.members) byProcess.set(m.processId, [...(byProcess.get(m.processId) ?? []), m])
  return [...byProcess].map(([processId, members]) => ({ processId, members }))
})
const members = computed(() => processes.value.flatMap((p) => p.members))
const tasks = computed(() => tasksOf(props.group.tasks, props.selected))

type Cell = { label: string; cls: string; title: string } | null

function cell(m: MemberView, t: TaskId): Cell {
  if (m.pendingRevocation.active.includes(t)) return { label: 'A', cls: 'sc-chip sc-chip--revoking', title: 'active, revoking' }
  if (m.pendingRevocation.standby.includes(t)) return { label: 'S', cls: 'sc-chip sc-chip--revoking', title: 'standby, revoking' }
  if (m.assignment.active.includes(t)) return { label: 'A', cls: 'sc-chip sc-chip--active', title: 'active, owned' }
  if (m.assignment.standby.includes(t)) return { label: 'S', cls: 'sc-chip sc-chip--standby', title: 'standby, owned' }
  if (m.assignment.warmup?.includes(t)) return { label: 'W', cls: 'sc-chip sc-chip--warmup', title: 'warm-up' }
  if (m.target.active.includes(t)) return { label: 'A', cls: 'sc-chip sc-chip--active sc-chip--target', title: 'active, in target' }
  if (m.target.standby.includes(t)) return { label: 'S', cls: 'sc-chip sc-chip--standby sc-chip--target', title: 'standby, in target' }
  return null
}

/** No member owns it right now. */
const unowned = (t: TaskId) => !props.group.members.some((m) => m.assignment.active.includes(t))
/** Owned but no progress past the stall threshold (Spec 004 Behavior 4). */
const stalled = (t: TaskId) => props.group.stalledTasks[t]
const subtopologyOf = (t: TaskId) => t.split('_')[0]
const key = (m: MemberView) => `${m.processId}/${m.memberId}`
const shortId = (id: string) => (id.length > 8 ? `${id.slice(0, 6)}…` : id)
</script>

<template>
  <div class="sc-matrix">
    <p v-if="members.length === 0" class="empty">{{ tr('tasks.empty') }}</p>
    <table v-else>
      <thead>
        <tr>
          <th />
          <th v-for="p in processes" :key="p.processId" :colspan="p.members.length">
            {{ p.processId }}
          </th>
        </tr>
        <tr>
          <th />
          <th v-for="m in members" :key="key(m)" class="sc-member">
            <div class="sc-member__id" :title="m.memberId">{{ shortId(m.memberId) }}</div>
            <div class="sc-member__epoch">epoch {{ m.memberEpoch }}</div>
            <span :class="badgeClass(m.status === 'stalled' ? 'stalled' : m.state)">{{ m.status === 'stalled' ? tr('status.stalled') : m.state }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(t, i) in tasks" :key="t" :class="{ 'sc-split': i > 0 && subtopologyOf(t) !== subtopologyOf(tasks[i - 1]) }">
          <th>{{ t }} <span v-if="unowned(t)" class="sc-unowned" :title="tr('tasks.unowned')">!</span>
            <span v-else-if="stalled(t) !== undefined" class="sc-unowned stalled-mark" :title="tr('tasks.stalled', { s: Math.round(stalled(t)! / 1000) })">!</span></th>
          <td v-for="m in members" :key="key(m)">
            <span v-if="cell(m, t)" :class="cell(m, t)!.cls" :title="cell(m, t)!.title">{{ cell(m, t)!.label }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.stalled-mark { background: var(--state-revoking); }
.empty { margin: 0; color: var(--ink-muted); }
</style>
