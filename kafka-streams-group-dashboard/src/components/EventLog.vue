<script setup lang="ts">
import { computed, ref } from 'vue'
import type { LogEvent } from '../../shared/types'

const props = defineProps<{ events: LogEvent[] }>()
const hideHeartbeats = ref(false)

const shown = computed(() =>
  [...props.events]
    .reverse()
    .filter((e) => !hideHeartbeats.value || e.kind !== 'heartbeat' || !/memberEpoch=\d+\)$/.test(e.message)),
)
const time = (t: number) => new Date(t).toLocaleTimeString([], { hour12: false })
</script>

<template>
  <section>
    <div class="head">
      <h2>Coordinator log (newest first)</h2>
      <label class="muted"><input v-model="hideHeartbeats" type="checkbox" /> hide plain heartbeats</label>
    </div>
    <ol class="mono">
      <li v-for="e in shown" :key="e.id" :class="e.kind">
        <span class="muted">{{ time(e.time) }}</span>
        <span class="kind">{{ e.kind }}</span>
        <span>{{ e.message }}</span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: baseline; }
ol { list-style: none; margin: 0; padding: 0; max-height: 320px; overflow-y: auto; }
li { display: grid; grid-template-columns: 70px 80px 1fr; gap: 8px; padding: 3px 0; border-bottom: 1px solid var(--border); }
.kind { font-weight: 600; }
.epoch .kind { color: var(--accent); }
.assignor .kind { color: var(--standby); }
.member .kind { color: var(--danger); }
.heartbeat .kind { color: var(--muted); }
@media (max-width: 800px) {
  li { grid-template-columns: 1fr; gap: 0; }
}
</style>
