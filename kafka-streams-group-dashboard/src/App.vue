<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AssignmentMatrix from './components/AssignmentMatrix.vue'
import ConfigTable from './components/ConfigTable.vue'
import EventLog from './components/EventLog.vue'
import PipelineGraph from './components/PipelineGraph.vue'
import { badgeClass, formatRate } from './format'
import { useStreamsGroups } from './useStreamsGroups'

const { snapshot, connected, send } = useStreamsGroups()
const selectedId = ref('word-count')
const group = computed(() => snapshot.value?.groups.find((g) => g.groupId === selectedId.value))
const selectedSub = ref<string | null>(null)
watch(selectedId, () => (selectedSub.value = null))

type Tab = 'tasks' | 'config' | 'log'
const tab = ref<Tab>('tasks')
const tabs: { id: Tab; label: string }[] = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'config', label: 'Configuration' },
  { id: 'log', label: 'Log' },
]

const live = computed(() => group.value?.members.filter((m) => m.status !== 'joining') ?? [])
const processCount = computed(() => new Set(live.value.map((m) => m.processId)).size)
</script>

<template>
  <div class="sc-root shell">
    <header class="bar">
      <div class="brand">
        <strong>Streams Console</strong>
        <span class="sc-label" data-testid="mode">{{ snapshot?.mode === 'real' ? 'live broker' : 'simulator' }}</span>
      </div>
      <nav v-if="snapshot" class="groups" aria-label="Streams groups">
        <button
          v-for="g in snapshot.groups"
          :key="g.groupId"
          class="group-tab"
          :aria-current="g.groupId === selectedId ? 'page' : undefined"
          @click="selectedId = g.groupId"
        >
          <span class="sc-mono">{{ g.groupId }}</span>
          <span :class="badgeClass(g.state)">{{ g.state }}</span>
        </button>
      </nav>
      <div class="bar-actions">
        <span class="dot" :class="{ on: connected }" :title="connected ? 'Connected' : 'Disconnected'" />
        <button class="sc-button" @click="send({ type: 'togglePause' })">{{ snapshot?.paused ? 'Resume' : 'Pause' }}</button>
        <button class="sc-button" @click="send({ type: 'reset' })">Reset</button>
      </div>
    </header>

    <div v-if="snapshot?.error" class="banner" data-testid="error-banner" role="alert">{{ snapshot.error }}</div>

    <main v-if="group" class="page">
      <section class="summary">
        <div class="title-row">
          <h1>{{ group.groupId }}</h1>
          <span :class="badgeClass(group.state)" data-testid="group-state">{{ group.state }}</span>
          <div class="title-actions">
            <label class="standby">
              <span class="sc-label">Standby replicas</span>
              <select
                :value="group.numStandbyReplicas"
                @change="send({ type: 'setStandbyReplicas', groupId: group.groupId, value: +($event.target as HTMLSelectElement).value })"
              >
                <option v-for="n in [0, 1, 2]" :key="n" :value="n">{{ n }}</option>
              </select>
            </label>
            <button class="sc-button sc-button--primary" @click="send({ type: 'addMember', groupId: group.groupId })">Start new process</button>
          </div>
        </div>
        <p class="description">{{ group.description }}</p>
        <small v-if="snapshot?.mode === 'real'" class="note" data-testid="standby-note">
          Standby changes apply at the next rebalance; only stateful tasks get standbys.
        </small>
        <div class="sc-metrics">
          <div class="sc-metric"><span class="sc-label">Group epoch</span><span class="sc-metric__value">{{ group.groupEpoch }}</span></div>
          <div class="sc-metric">
            <span class="sc-label">Target assignment epoch</span><span class="sc-metric__value">{{ group.targetAssignmentEpoch }}</span>
          </div>
          <div class="sc-metric">
            <span class="sc-label">Members</span><span class="sc-metric__value">{{ live.length }}</span>
            <span class="sc-metric__note">{{ processCount }} {{ processCount === 1 ? 'process' : 'processes' }}</span>
          </div>
          <div class="sc-metric">
            <span class="sc-label">Tasks</span><span class="sc-metric__value">{{ group.tasks.length }}</span>
            <span class="sc-metric__note">{{ group.topology.subtopologies.length }} subtopologies</span>
          </div>
          <div v-if="snapshot?.mode === 'real'" class="sc-metric">
            <span class="sc-label">Input rate</span>
            <span class="sc-metric__value" data-testid="input-rate">{{ formatRate(group.flow?.inputRate) }}</span>
          </div>
        </div>
      </section>

      <PipelineGraph :group="group" :selected="selectedSub" @select="selectedSub = $event" />
      <details class="dsl">
        <summary>Topology code</summary>
        <pre>{{ group.dsl }}</pre>
      </details>

      <section class="sc-panel inspector">
        <div class="tabs" role="tablist">
          <button
            v-for="t in tabs"
            :key="t.id"
            role="tab"
            class="tab"
            :aria-selected="tab === t.id"
            @click="tab = t.id"
          >
            {{ t.label }}
          </button>
          <span v-if="tab === 'tasks' && selectedSub !== null" class="filter-chip">
            Subtopology {{ selectedSub }}
            <button class="sc-button sc-button--small" @click="selectedSub = null">Show all</button>
          </span>
        </div>
        <AssignmentMatrix v-if="tab === 'tasks'" :group="group" :selected="selectedSub" :send="send" />
        <ConfigTable v-else-if="tab === 'config'" :configs="group.configs" :mode="snapshot!.mode" />
        <EventLog v-else :events="group.events" />
      </section>
    </main>
    <p v-else class="loading">Connecting to the console server…</p>
  </div>
</template>

<style>
body { margin: 0; background: var(--surface); }
</style>

<style scoped>
.shell { min-height: 100vh; }
.bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4);
  padding: var(--space-3) var(--space-6);
  background: var(--surface-raised); border-bottom: 1px solid var(--line);
}
.brand { display: flex; align-items: baseline; gap: var(--space-2); }
.brand strong { font-size: 16px; }
.groups { display: flex; flex-wrap: wrap; gap: var(--space-1); flex: 1; }
.group-tab {
  display: inline-flex; align-items: center; gap: var(--space-2);
  font: inherit; color: var(--ink); background: none; cursor: pointer;
  border: 1px solid transparent; border-radius: var(--radius-panel); padding: var(--space-1) var(--space-2);
}
.group-tab:hover { border-color: var(--line-strong); }
.group-tab[aria-current='page'] { border-color: var(--accent); box-shadow: inset 0 -2px 0 var(--accent); }
.bar-actions { display: flex; align-items: center; gap: var(--space-2); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--state-fenced); }
.dot.on { background: var(--state-active); }
.banner {
  margin: var(--space-4) var(--space-6) 0; padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-panel); border: 1px solid var(--state-fenced);
  background: var(--state-fenced-bg); color: var(--state-fenced);
}
.page { display: grid; gap: var(--space-6); padding: var(--space-6); }
.summary { display: grid; gap: var(--space-3); }
.title-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
h1 { margin: 0; font-size: 28px; line-height: 32px; font-weight: 700; letter-spacing: -0.01em; text-wrap: balance; }
.title-actions { margin-left: auto; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
.standby { display: inline-flex; align-items: center; gap: var(--space-2); }
select {
  font: 500 13px/18px var(--font-mono); color: var(--ink); background: var(--surface-raised);
  border: 1px solid var(--line-strong); border-radius: var(--radius-cell); padding: 2px var(--space-1);
}
.description { margin: 0; max-width: 72ch; color: var(--ink-muted); }
.note { color: var(--ink-muted); }
.dsl summary { cursor: pointer; color: var(--ink-muted); }
.dsl pre { font-family: var(--font-mono); font-size: 12px; background: var(--surface-sunken); padding: var(--space-3); border-radius: var(--radius-panel); overflow-x: auto; }
.inspector { display: grid; gap: var(--space-4); min-width: 0; }
.tabs { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4); border-bottom: 1px solid var(--line); }
.tab {
  font: 600 14px/20px var(--font-sans); color: var(--ink-muted); background: none; border: 0; cursor: pointer;
  padding: var(--space-2) 0; border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.tab[aria-selected='true'] { color: var(--ink); border-bottom-color: var(--accent); }
.filter-chip { margin-left: auto; display: inline-flex; align-items: center; gap: var(--space-2); color: var(--ink-muted); }
.loading { padding: var(--space-6); color: var(--ink-muted); }
@media (max-width: 720px) {
  .bar, .page { padding-left: var(--space-4); padding-right: var(--space-4); }
  .banner { margin-left: var(--space-4); margin-right: var(--space-4); }
}
</style>
