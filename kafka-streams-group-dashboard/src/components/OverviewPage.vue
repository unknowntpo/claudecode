<script setup lang="ts">
import { computed } from 'vue'
import { pipelineLayout } from '../../shared/pipeline'
import type { GroupView } from '../../shared/types'
import { isBehind, maxLag, processCards } from '../console'
import { badgeClass, formatCount, formatRate } from '../format'
import { useI18n } from '../i18n'
import type { Route } from '../route'

const props = defineProps<{ groups: GroupView[] }>()
const emit = defineEmits<{ navigate: [route: Route] }>()
const { tr } = useI18n()

const cards = computed(() => props.groups.map((g) => ({ g, cards: processCards(g) })))
const processTotal = computed(() => cards.value.reduce((n, c) => n + c.cards.filter((x) => x.status !== 'joining').length, 0))
const crashed = computed(() => cards.value.flatMap(({ g, cards }) => cards.filter((c) => c.status === 'crashed').map((c) => ({ g, c }))))
const stable = computed(() => props.groups.filter((g) => g.state === 'STABLE').length)
const moving = computed(() => props.groups.filter((g) => ['RECONCILING', 'ASSIGNING'].includes(g.state)).length)
const rates = computed(() => props.groups.map((g) => g.flow?.inputRate).filter((r): r is number => r != null))
const totalRate = computed(() => (rates.value.length ? rates.value.reduce((a, b) => a + b, 0) : null))
const worst = computed(() =>
  props.groups.reduce<{ g: GroupView; lag: number } | null>((best, g) => {
    const lag = maxLag(g)
    return lag !== null && (best === null || lag > best.lag) ? { g, lag } : best
  }, null),
)

const crashedCount = (g: GroupView) => processCards(g).filter((c) => c.status === 'crashed').length
const liveMembers = (g: GroupView) => g.members.filter((m) => m.status !== 'joining').length
const chain = (g: GroupView) => {
  const sinks = g.flow?.topics.filter((t) => t.kind === 'sink').map((t) => t.name) ?? []
  const layout = pipelineLayout(g.topology.subtopologies, sinks)
  if (!layout.steps.length) return '—'
  const name = (id: string) => g.topology.subtopologies.find((s) => s.id === id)?.name ?? id
  return [layout.sources.join(' + '), ...layout.steps.map((s) => name(s.id)), sinks.join(' + ')].filter(Boolean).join(' → ')
}
const open = (g: GroupView) => emit('navigate', { page: 'group', groupId: g.groupId })
</script>

<template>
  <main class="page">
    <header class="head">
      <h1>{{ tr('overview.title') }}</h1>
    </header>

    <p v-if="groups.length === 0" class="empty">{{ tr('overview.empty') }}</p>
    <template v-else>
      <div class="sc-metrics">
        <div class="sc-metric">
          <span class="sc-label">{{ tr('metric.groups') }}</span><span class="sc-metric__value">{{ groups.length }}</span>
          <span class="sc-metric__note">{{ tr('metric.groupsNote', { stable, moving }) }}</span>
        </div>
        <div class="sc-metric">
          <span class="sc-label">{{ tr('metric.processes') }}</span><span class="sc-metric__value">{{ processTotal }}</span>
          <span v-if="crashed.length" class="sc-metric__note bad">{{ tr('metric.crashed', { n: crashed.length }) }}</span>
        </div>
        <div class="sc-metric">
          <span class="sc-label">{{ tr('metric.inputRate') }}</span>
          <span class="sc-metric__value" data-testid="total-rate">{{ formatRate(totalRate) }}</span>
        </div>
        <div class="sc-metric">
          <span class="sc-label">{{ tr('metric.largestLag') }}</span>
          <span class="sc-metric__value" :class="{ warn: worst && isBehind(worst.g) }">{{ formatCount(worst?.lag) }}</span>
          <span v-if="worst" class="sc-metric__note sc-mono">{{ worst.g.groupId }}</span>
        </div>
      </div>

      <div v-for="{ g, c } in crashed" :key="`${g.groupId}/${c.processId}`" class="alert" role="alert" data-testid="crash-alert">
        <span class="sc-badge sc-badge--fenced">{{ tr('status.crashed') }}</span>
        <span class="alert-text">
          <span class="sc-mono">{{ g.groupId }}</span> ·
          {{ c.silentMs ? tr('alert.crashedSince', { process: c.processId, s: Math.round(c.silentMs / 1000) }) : tr('alert.crashed', { process: c.processId }) }}
        </span>
        <button class="sc-button sc-button--small" @click="open(g)">{{ tr('alert.viewProcesses') }}</button>
      </div>

      <section class="sc-panel table-panel">
        <table class="sc-groups">
          <thead>
            <tr>
              <th>{{ tr('table.group') }}</th>
              <th>{{ tr('table.state') }}</th>
              <th class="sc-num">{{ tr('table.members') }}</th>
              <th class="sc-num">{{ tr('table.inputRate') }}</th>
              <th class="sc-num">{{ tr('table.largestLag') }}</th>
              <th class="sc-num">{{ tr('table.groupEpoch') }}</th>
              <th>{{ tr('table.topology') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="g in groups" :key="g.groupId" :data-testid="`row-${g.groupId}`" tabindex="0" @click="open(g)" @keydown.enter="open(g)">
              <td class="sc-group-name">{{ g.groupId }}</td>
              <td><span :class="badgeClass(g.state)">{{ g.state }}</span></td>
              <td class="sc-num" :class="{ 'sc-bad': crashedCount(g) }">
                {{ liveMembers(g) }}<template v-if="crashedCount(g)"> · {{ tr('metric.crashed', { n: crashedCount(g) }) }}</template>
              </td>
              <td class="sc-num">{{ formatRate(g.flow?.inputRate) }}</td>
              <td class="sc-num" :class="{ 'sc-warn': isBehind(g) }">{{ formatCount(maxLag(g)) }}</td>
              <td class="sc-num">{{ g.groupEpoch }}</td>
              <td class="chain sc-mono">{{ chain(g) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
      <p class="hint">{{ tr('overview.hint') }}</p>
    </template>
  </main>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: var(--space-6); padding: var(--space-6) var(--space-8); min-width: 0; }
.head h1 { margin: 0; font-size: 28px; line-height: 32px; font-weight: 700; letter-spacing: -0.01em; }
.empty, .hint { margin: 0; color: var(--ink-muted); }
.hint { font-size: 13px; }
.bad { color: var(--state-fenced); }
.warn { color: var(--state-revoking); }
.alert {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3);
  padding: var(--space-3) var(--space-4); border: 1px solid var(--state-fenced); border-radius: var(--radius-panel);
  background: var(--state-fenced-bg); color: var(--state-fenced);
}
.alert-text { flex: 1 1 320px; }
.table-panel { padding: 0; overflow-x: auto; }
.chain { font-size: 12px; color: var(--ink-muted); }
@media (max-width: 720px) { .page { padding: var(--space-4); } }
</style>
