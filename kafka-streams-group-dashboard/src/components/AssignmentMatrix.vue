<script setup lang="ts">
import { computed } from 'vue'
import { tasksOf } from '../../shared/pipeline'
import type { ClientMessage, GroupView, MemberView, TaskId } from '../../shared/types'
import { badgeClass } from '../format'
import { useI18n } from '../i18n'

const props = defineProps<{ group: GroupView; selected: string | null; send: (msg: ClientMessage) => void }>()
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

/** No live member processes it: a crashed owner does not count (same rule as the drawer, Spec 003 CV3). */
const unowned = (t: TaskId) =>
  members.value.some((m) => m.status !== 'joining') &&
  !props.group.members.some((m) => m.status !== 'crashed' && m.assignment.active.includes(t))
const subtopologyOf = (t: TaskId) => t.split('_')[0]
/** Placeholders of starting processes share a memberId, so key by process too. */
const key = (m: MemberView) => `${m.processId}/${m.memberId}`
const alive = (processId: string) => props.group.members.some((m) => m.processId === processId && m.status !== 'crashed')
const shortId = (id: string) => (id.length > 8 ? `${id.slice(0, 6)}…` : id)
const memberBadge = (m: MemberView) => (m.status === 'alive' ? m.state : m.status)
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
            <div v-if="alive(p.processId)" class="actions">
              <button class="sc-button sc-button--small" :title="tr('action.threadTitle')" @click="send({ type: 'addMember', groupId: group.groupId, processId: p.processId })">{{ tr('action.thread') }}</button>
              <button class="sc-button sc-button--small" :title="tr('action.stopTitle')" @click="send({ type: 'stopProcess', groupId: group.groupId, processId: p.processId })">{{ tr('action.stop') }}</button>
              <button class="sc-button sc-button--small sc-button--danger" :title="tr('action.killTitle')" @click="send({ type: 'killProcess', groupId: group.groupId, processId: p.processId })">{{ tr('action.kill') }}</button>
            </div>
          </th>
        </tr>
        <tr>
          <th />
          <th v-for="m in members" :key="key(m)" class="sc-member">
            <div class="sc-member__id" :title="m.memberId">{{ shortId(m.memberId) }}</div>
            <div class="sc-member__epoch">epoch {{ m.memberEpoch }}</div>
            <span :class="badgeClass(memberBadge(m))">{{ m.status === 'alive' ? m.state : tr(m.status === 'crashed' ? 'status.crashed' : 'status.joining') }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(t, i) in tasks" :key="t" :class="{ 'sc-split': i > 0 && subtopologyOf(t) !== subtopologyOf(tasks[i - 1]) }">
          <th>{{ t }} <span v-if="unowned(t)" class="sc-unowned" :title="tr('tasks.unowned')">!</span></th>
          <td v-for="m in members" :key="key(m)">
            <span v-if="cell(m, t)" :class="cell(m, t)!.cls" :title="cell(m, t)!.title">{{ cell(m, t)!.label }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.actions { display: flex; gap: var(--space-1); justify-content: center; margin-top: var(--space-1); }
.empty { margin: 0; color: var(--ink-muted); }
</style>
