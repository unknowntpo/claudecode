<script setup lang="ts">
import { computed } from 'vue'
import type { GroupView, Subtopology } from '../../shared/types'
import { taskRows } from '../console'
import { formatCount, formatRate } from '../format'
import { useI18n } from '../i18n'
import InfoTip from './InfoTip.vue'

const props = defineProps<{ group: GroupView; sub: Subtopology }>()
const emit = defineEmits<{ close: [] }>()
const { tr } = useI18n()

const rows = computed(() => taskRows(props.group, props.sub.id))
const stateful = computed(() => props.sub.stateChangelogTopics.length > 0)
const pct = (f: number) => Math.round(f * 100)
const bound = (n: number | null | undefined) => (n == null ? '—' : n === 0 ? '0' : `≤ ${formatCount(n)}`)
const inputs = computed(() => [...props.sub.sourceTopics, ...props.sub.repartitionSourceTopics])
const outputs = computed(() => {
  // sink topics are unknown to the broker (Spec 004), so only repartition outputs are shown
  return props.sub.repartitionSinkTopics
})
const inputRate = computed(() => {
  const rates = inputs.value.map((n) => props.group.flow?.topics.find((t) => t.name === n)?.rate ?? null)
  return rates.length && rates.every((r) => r !== null) ? rates.reduce((a, b) => a! + b!, 0) : null
})
</script>

<template>
  <aside class="sc-drawer drawer" :aria-label="`Subtopology ${sub.id}`" data-testid="drawer">
    <div class="sc-drawer__head">
      <div>
        <div class="sc-label">Subtopology {{ sub.id }}</div>
        <h2 class="sc-drawer__title">{{ sub.name }}</h2>
      </div>
      <button class="sc-button sc-button--small" :aria-label="tr('drawer.close')" @click="emit('close')">×</button>
    </div>
    <div class="sc-metrics metrics">
      <div class="sc-metric"><span class="sc-label">{{ tr('drawer.input') }}</span><span class="sc-metric__value">{{ inputRate === null ? '—' : formatRate(inputRate).replace(' rec/s', '') }}<small v-if="inputRate !== null">rec/s</small></span></div>
      <div class="sc-metric"><span class="sc-label">{{ tr('drawer.lag') }}</span><span class="sc-metric__value">{{ formatCount(group.flow?.lag[sub.id]) }}</span></div>
      <div class="sc-metric"><span class="sc-label">{{ tr('drawer.tasks') }}</span><span class="sc-metric__value">{{ sub.partitions }}</span></div>
    </div>
    <section class="sc-drawer__section">
      <div class="sc-label">{{ tr('drawer.topics') }}</div>
      <dl class="sc-kv">
        <template v-for="t in inputs" :key="`in-${t}`"><dt>{{ tr('drawer.in') }}</dt><dd>{{ t }}</dd></template>
        <template v-for="t in outputs" :key="`out-${t}`"><dt>{{ tr('drawer.out') }}</dt><dd>{{ t }}</dd></template>
        <template v-for="(store, i) in sub.stores" :key="`store-${store}`">
          <dt>{{ tr('drawer.store') }}</dt><dd>↻ {{ store }}</dd>
          <dt>{{ tr('drawer.changelog') }}</dt><dd>{{ sub.stateChangelogTopics[i] }}</dd>
        </template>
      </dl>
    </section>
    <section class="sc-drawer__section">
      <div class="sc-label">{{ tr('drawer.tasks') }}</div>
      <table class="sc-tasklist">
        <thead><tr><th>{{ tr('drawer.task') }}</th><th>{{ tr('drawer.active') }}</th><th>{{ tr('drawer.standby') }}</th><th v-if="stateful" class="sc-num">{{ tr('drawer.changelog') }} <InfoTip :text="tr('tip.changelog')" /></th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.task">
            <td>
              {{ r.task }}
              <span v-if="r.unowned" class="sc-unowned" :title="tr('tasks.unowned')">!</span>
              <span v-else-if="r.stalledMs !== null" class="sc-unowned stalled-mark" :title="tr('tasks.stalled', { s: Math.round(r.stalledMs / 1000) })">!</span>
              <span v-else-if="r.restoringMs !== null" class="restoring" :title="tr('tasks.restoring', { s: Math.round(r.restoringMs / 1000) })">↻ {{ Math.round(r.restoringMs / 1000) }} s</span>
              <span v-if="r.progress" class="progress" data-testid="restore-progress">
                <span class="bar" role="progressbar" :aria-valuenow="pct(r.progress.fraction)" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: `${pct(r.progress.fraction)}%` }" /></span>
                {{ pct(r.progress.fraction) }} %<template v-if="r.progress.ageMs >= 10000"> · {{ tr('tasks.progressAge', { s: Math.round(r.progress.ageMs / 1000) }) }}</template>
              </span>
            </td>
            <td>
              <template v-if="r.move"><span class="sc-chip sc-chip--revoking">A</span> {{ r.move }}</template>
              <template v-else-if="r.active.length">
                <span v-for="a in r.active" :key="a" class="owner"><span class="sc-chip sc-chip--active">A</span> {{ a }}</span>
              </template>
              <template v-else>—</template>
            </td>
            <td>
              <template v-if="r.standby.length"><span class="sc-chip sc-chip--standby">S</span> {{ r.standby.join(', ') }}</template>
              <template v-else>—</template>
            </td>
            <td v-if="stateful" class="sc-num sc-mono nowrap" data-testid="changelog-size">{{ bound(r.changelog) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </aside>
</template>

<style scoped>
.drawer { width: auto; flex: 1 1 360px; max-width: 480px; border-radius: 0; align-self: stretch; }
.metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-4); }
.owner { display: inline-flex; align-items: center; gap: var(--space-1); margin-right: var(--space-2); white-space: nowrap; }
.stalled-mark { background: var(--state-revoking); }
.restoring { color: var(--state-warmup); font-weight: 700; white-space: nowrap; }
.nowrap { white-space: nowrap; }
.progress { display: flex; align-items: center; gap: var(--space-1); font-size: 12px; color: var(--state-warmup); white-space: nowrap; }
.bar { display: inline-block; width: 64px; height: 6px; border-radius: 3px; background: var(--state-warmup-bg); overflow: hidden; }
.bar > span { display: block; height: 100%; background: var(--state-warmup); transition: width 0.4s; }
@media (prefers-reduced-motion: reduce) { .bar > span { transition: none; } }
@media (max-width: 900px) { .drawer { max-width: none; flex-basis: 100%; border-left: 0; border-top: 1px solid var(--line); } }
</style>
