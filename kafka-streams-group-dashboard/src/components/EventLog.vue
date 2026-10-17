<script setup lang="ts">
import { computed, ref } from 'vue'
import type { LogEvent } from '../../shared/types'
import { useI18n } from '../i18n'

const props = defineProps<{ events: LogEvent[] }>()
const hideHeartbeats = ref(true)
const { tr } = useI18n()

const shown = computed(() =>
  [...props.events]
    .reverse()
    .filter((e) => !hideHeartbeats.value || e.kind !== 'heartbeat' || !/memberEpoch=\d+\)$/.test(e.message)),
)
const time = (t: number) => new Date(t).toLocaleTimeString([], { hour12: false })
</script>

<template>
  <div>
    <label class="filter"><input v-model="hideHeartbeats" type="checkbox" /> {{ tr('log.hideHeartbeats') }}</label>
    <p v-if="shown.length === 0" class="empty">{{ tr('log.empty') }}</p>
    <ol class="sc-log">
      <li v-for="e in shown" :key="e.id">
        <time>{{ time(e.time) }}</time>
        <span class="sc-kind" :class="`sc-kind--${e.kind}`">{{ e.kind }}</span>
        <span>{{ e.message }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.filter { display: inline-flex; gap: var(--space-1); align-items: center; color: var(--ink-muted); margin-bottom: var(--space-2); }
.sc-log { max-height: 360px; overflow-y: auto; }
.empty { margin: 0; color: var(--ink-muted); }
</style>
