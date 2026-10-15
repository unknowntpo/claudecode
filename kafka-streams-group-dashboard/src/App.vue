<script setup lang="ts">
import { computed, ref } from 'vue'
import AssignmentMatrix from './components/AssignmentMatrix.vue'
import EventLog from './components/EventLog.vue'
import TopologyView from './components/TopologyView.vue'
import { useStreamsGroups } from './useStreamsGroups'

const { snapshot, connected, send } = useStreamsGroups()
const selectedId = ref('word-count')
const group = computed(() => snapshot.value?.groups.find((g) => g.groupId === selectedId.value))
</script>

<template>
  <header>
    <div>
      <h1>Streams Group Dashboard</h1>
      <span class="muted">
        KIP-1071 · broker-side task assignment for Kafka Streams ·
        <strong data-testid="mode">{{ snapshot?.mode === 'real' ? 'live broker' : 'simulated' }}</strong>
      </span>
    </div>
    <div class="actions">
      <span class="dot" :class="{ on: connected }" :title="connected ? 'connected' : 'disconnected'" />
      <button @click="send({ type: 'togglePause' })">{{ snapshot?.paused ? '▶ Resume' : '⏸ Pause' }}</button>
      <button @click="send({ type: 'reset' })">↺ Reset</button>
    </div>
  </header>

  <div v-if="snapshot?.error" class="banner" data-testid="error-banner" role="alert">{{ snapshot.error }}</div>

  <nav v-if="snapshot">
    <button
      v-for="g in snapshot.groups"
      :key="g.groupId"
      :class="{ selected: g.groupId === selectedId }"
      @click="selectedId = g.groupId"
    >
      {{ g.groupId }} <span class="badge" :class="g.state">{{ g.state }}</span>
    </button>
  </nav>

  <main v-if="group">
    <section class="panel summary">
      <h2>Group</h2>
      <p>{{ group.description }}</p>
      <dl>
        <dt>state</dt>
        <dd><span class="badge" :class="group.state">{{ group.state }}</span></dd>
        <dt>group epoch</dt>
        <dd class="mono">{{ group.groupEpoch }}</dd>
        <dt>target assignment epoch</dt>
        <dd class="mono">{{ group.targetAssignmentEpoch }}</dd>
        <dt>topology epoch</dt>
        <dd class="mono">{{ group.topology.epoch }}</dd>
        <dt>tasks</dt>
        <dd class="mono">{{ group.tasks.length }}</dd>
        <dt>num.standby.replicas</dt>
        <dd>
          <select
            :value="group.numStandbyReplicas"
            @change="send({ type: 'setStandbyReplicas', groupId: group.groupId, value: +($event.target as HTMLSelectElement).value })"
          >
            <option v-for="n in [0, 1, 2]" :key="n" :value="n">{{ n }}</option>
          </select>
          <small v-if="snapshot?.mode === 'real'" class="muted note" data-testid="standby-note">
            applies at the next rebalance; only stateful tasks get standbys
          </small>
        </dd>
      </dl>
      <button @click="send({ type: 'addMember', groupId: group.groupId })">+ Start new process</button>
    </section>

    <TopologyView class="panel topology" :group="group" />

    <AssignmentMatrix class="panel matrix" :group="group" :send="send" />

    <EventLog class="panel log" :events="group.events" />
  </main>
  <p v-else class="muted center">Connecting to simulator…</p>
</template>

<style scoped>
header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid var(--border); background: var(--panel); }
h1 { font-size: 18px; margin: 0 0 2px; }
.actions { display: flex; gap: 8px; align-items: center; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--danger); }
.dot.on { background: var(--active); }
nav { display: flex; gap: 8px; padding: 12px 24px 0; flex-wrap: wrap; }
nav button { padding: 6px 12px; font-size: 13px; }
nav button.selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
main { display: grid; grid-template-columns: minmax(260px, 1fr) 2fr; gap: 16px; padding: 16px 24px 24px; }
.matrix, .log { grid-column: 1 / -1; }
.summary p { margin: 0 0 12px; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0 0 14px; align-items: center; }
dt { color: var(--muted); }
dd { margin: 0; }
.center { text-align: center; padding: 40px; }
.banner { margin: 12px 24px 0; padding: 10px 14px; border-radius: 8px; background: var(--revoke-bg); color: var(--revoke); border: 1px solid var(--revoke); }
.note { display: block; margin-top: 4px; }
@media (max-width: 800px) {
  main { grid-template-columns: 1fr; padding: 12px 16px; }
  header, nav { padding-left: 16px; padding-right: 16px; }
}
</style>
