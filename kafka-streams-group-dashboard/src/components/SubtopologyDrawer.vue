<script setup lang="ts">
import { computed } from 'vue'
import type { GroupView, Subtopology } from '../../shared/types'
import { taskRows } from '../console'
import { formatCount, formatRate } from '../format'
import { useI18n } from '../i18n'

const props = defineProps<{ group: GroupView; sub: Subtopology }>()
const emit = defineEmits<{ close: [] }>()
const { tr } = useI18n()

const rows = computed(() => taskRows(props.group, props.sub.id))
const inputs = computed(() => [...props.sub.sourceTopics, ...props.sub.repartitionSourceTopics])
const outputs = computed(() => {
  if (props.sub.repartitionSinkTopics.length) return props.sub.repartitionSinkTopics
  return props.group.flow?.topics.filter((t) => t.kind === 'sink').map((t) => t.name) ?? []
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
      <div class="sc-metric"><span class="sc-label">{{ tr('drawer.input') }}</span><span class="sc-metric__value">{{ formatRate(inputRate) }}</span></div>
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
        <thead><tr><th>{{ tr('drawer.task') }}</th><th>{{ tr('drawer.active') }}</th><th>{{ tr('drawer.standby') }}</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.task">
            <td>{{ r.task }} <span v-if="r.unowned" class="sc-unowned" :title="tr('tasks.unowned')">!</span></td>
            <td>
              <template v-if="r.move"><span class="sc-chip sc-chip--revoking">A</span> {{ r.move }}</template>
              <template v-else-if="r.active.length">
                <span v-for="a in r.active" :key="a.processId" class="owner">
                  <span v-if="a.crashed" class="sc-badge sc-badge--fenced">{{ a.processId }}</span>
                  <template v-else><span class="sc-chip sc-chip--active">A</span> {{ a.processId }}</template>
                </span>
              </template>
              <template v-else>—</template>
            </td>
            <td>
              <template v-if="r.standby.length">
                <span v-for="s in r.standby" :key="s.processId" class="owner">
                  <span class="sc-chip sc-chip--standby">S</span>
                  <span :class="{ fenced: s.crashed }">{{ s.processId }}<template v-if="s.crashed"> ×</template></span>
                </span>
              </template>
              <template v-else>—</template>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </aside>
</template>

<style scoped>
.drawer { width: auto; flex: 1 1 360px; max-width: 420px; border-radius: 0; align-self: stretch; }
.metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-4); }
.owner { display: inline-flex; align-items: center; gap: var(--space-1); margin-right: var(--space-2); }
.fenced { color: var(--state-fenced); }
@media (max-width: 900px) { .drawer { max-width: none; flex-basis: 100%; border-left: 0; border-top: 1px solid var(--line); } }
</style>
