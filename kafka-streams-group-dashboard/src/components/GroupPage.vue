<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ClientMessage, GroupView } from '../../shared/types'
import { drawerSubtopology } from '../console'
import { badgeClass, formatRate } from '../format'
import { type Key, useI18n } from '../i18n'
import AssignmentMatrix from './AssignmentMatrix.vue'
import ConfigTable from './ConfigTable.vue'
import EventLog from './EventLog.vue'
import PipelineGraph from './PipelineGraph.vue'
import ProcessCards from './ProcessCards.vue'
import SubtopologyDrawer from './SubtopologyDrawer.vue'

const props = defineProps<{ group: GroupView; send: (msg: ClientMessage) => void }>()
const { tr } = useI18n()

const selected = ref<string | null>(null)
watch(() => props.group.groupId, () => (selected.value = null))
/** CV9: the drawer closes by itself when its subtopology disappears. */
const drawer = computed(() => drawerSubtopology(props.group, selected.value))
watch(drawer, (d) => { if (!d) selected.value = null })

type Tab = 'tasks' | 'processes' | 'config' | 'log'
const tab = ref<Tab>('tasks')
const tabs: { id: Tab; label: Key }[] = [
  { id: 'tasks', label: 'tab.tasks' },
  { id: 'processes', label: 'tab.processes' },
  { id: 'config', label: 'tab.config' },
  { id: 'log', label: 'tab.log' },
]

const live = computed(() => props.group.members)
const processCount = computed(() => new Set(live.value.map((m) => m.processId)).size)
const stalledCount = computed(() => new Set(props.group.members.filter((m) => m.status === 'stalled').map((m) => m.processId)).size)

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') selected.value = null }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="layout">
    <main class="page">
      <header class="head">
        <div class="title-row">
          <h1 class="sc-mono">{{ group.groupId }}</h1>
          <span :class="badgeClass(group.state)" data-testid="group-state">{{ group.state }}</span>
          <div class="actions">
            <label class="standby">
              <span class="sc-label">{{ tr('group.standby') }}</span>
              <select
                :value="group.numStandbyReplicas"
                @change="send({ type: 'setStandbyReplicas', groupId: group.groupId, value: +($event.target as HTMLSelectElement).value })"
              >
                <option v-for="n in [0, 1, 2]" :key="n" :value="n">{{ n }}</option>
              </select>
            </label>
          </div>
        </div>
        <small class="note" data-testid="standby-note">{{ tr('group.standbyNote') }}</small>
      </header>

      <div class="sc-metrics">
        <div class="sc-metric"><span class="sc-label">{{ tr('metric.groupEpoch') }}</span><span class="sc-metric__value">{{ group.groupEpoch }}</span></div>
        <div class="sc-metric"><span class="sc-label">{{ tr('metric.targetEpoch') }}</span><span class="sc-metric__value">{{ group.targetAssignmentEpoch }}</span></div>
        <div class="sc-metric">
          <span class="sc-label">{{ tr('metric.members') }}</span><span class="sc-metric__value">{{ live.length }}</span>
          <span v-if="stalledCount" class="sc-metric__note warn" data-testid="stalled-note">{{ tr('metric.stalled', { n: stalledCount }) }}</span>
          <span v-else class="sc-metric__note">{{ tr('metric.processCount', { n: processCount }) }}</span>
        </div>
        <div class="sc-metric">
          <span class="sc-label">{{ tr('metric.tasks') }}</span><span class="sc-metric__value">{{ group.tasks.length }}</span>
          <span class="sc-metric__note">{{ tr('metric.subtopologyCount', { n: group.topology.subtopologies.length }) }}</span>
        </div>
        <div class="sc-metric">
          <span class="sc-label">{{ tr('metric.inputRate') }}</span>
          <span class="sc-metric__value" data-testid="input-rate">{{ formatRate(group.flow?.inputRate) }}</span>
        </div>
      </div>

      <PipelineGraph :group="group" :selected="selected" @select="selected = $event" />

      <section class="sc-panel inspector">
        <div class="tabs" role="tablist">
          <button v-for="x in tabs" :key="x.id" role="tab" class="tab" :aria-selected="tab === x.id" :data-testid="`tab-${x.id}`" @click="tab = x.id">
            {{ tr(x.label) }}
          </button>
          <span v-if="tab === 'tasks' && selected !== null" class="filter-chip">
            {{ tr('tasks.filtered', { id: selected }) }}
            <button class="sc-button sc-button--small" @click="selected = null">{{ tr('tasks.showAll') }}</button>
          </span>
        </div>
        <template v-if="tab === 'tasks'">
          <AssignmentMatrix :group="group" :selected="selected" />
          <p class="note">{{ tr('tasks.hint') }}</p>
        </template>
        <ProcessCards v-else-if="tab === 'processes'" :group="group" />
        <ConfigTable v-else-if="tab === 'config'" :configs="group.configs" />
        <EventLog v-else :events="group.events" />
      </section>
    </main>
    <SubtopologyDrawer v-if="drawer" :group="group" :sub="drawer" @close="selected = null" />
  </div>
</template>

<style scoped>
.layout { display: flex; flex-wrap: wrap; align-items: stretch; min-width: 0; }
.page { flex: 999 1 560px; min-width: 0; display: flex; flex-direction: column; gap: var(--space-6); padding: var(--space-6) var(--space-8); }
.head { display: flex; flex-direction: column; gap: var(--space-2); }
.title-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
h1 { margin: 0; font-size: 28px; line-height: 32px; font-weight: 500; overflow-wrap: anywhere; }
.actions { margin-left: auto; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
.standby { display: inline-flex; align-items: center; gap: var(--space-2); }
select {
  font: 500 13px/18px var(--font-mono); color: var(--ink); background: var(--surface-raised);
  border: 1px solid var(--line-strong); border-radius: var(--radius-cell); padding: 2px var(--space-1);
}
.note { margin: 0; color: var(--ink-muted); font-size: 13px; }
.warn { color: var(--state-revoking); }
.inspector { display: grid; gap: var(--space-4); min-width: 0; }
.tabs { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-5, 20px); border-bottom: 1px solid var(--line); }
.tab {
  font: 600 14px/20px var(--font-sans); color: var(--ink-muted); background: none; border: 0; cursor: pointer;
  padding: var(--space-2) 0; border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.tab[aria-selected='true'] { color: var(--ink); border-bottom-color: var(--accent); }
.filter-chip { margin-left: auto; display: inline-flex; align-items: center; gap: var(--space-2); color: var(--ink-muted); }
@media (max-width: 720px) { .page { padding: var(--space-4); } }
</style>
