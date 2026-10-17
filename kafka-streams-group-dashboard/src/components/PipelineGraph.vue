<script setup lang="ts">
import { computed } from 'vue'
import { pipelineLayout, tasksOf } from '../../shared/pipeline'
import type { GroupView } from '../../shared/types'
import { formatCount, formatRate } from '../format'
import { useI18n } from '../i18n'

const props = defineProps<{ group: GroupView; selected: string | null }>()
const emit = defineEmits<{ select: [id: string | null] }>()
const { tr } = useI18n()

const subs = computed(() => props.group.topology.subtopologies)
// the broker does not know sink topics (Spec 004), so the graph ends at the last subtopology
const layout = computed(() => pipelineLayout(subs.value, []))
const sub = (id: string) => subs.value.find((s) => s.id === id)!
const rate = (topic: string) => props.group.flow?.topics.find((t) => t.name === topic)?.rate ?? null
const edgeRate = (topics: string[]) => {
  const rates = topics.map(rate)
  return rates.length && rates.every((r) => r !== null) ? rates.reduce((a, b) => a! + b!, 0) : null
}
/** Tasks some member owns; an owned task without progress is marked stalled instead (Spec 004). */
const owned = computed(() => new Set(props.group.members.flatMap((m) => m.assignment.active)))
const toggle = (id: string) => emit('select', props.selected === id ? null : id)
</script>

<template>
  <section class="sc-graph" :aria-label="tr('pipeline.label')">
    <p v-if="layout.steps.length === 0" class="empty">
      {{ tr('pipeline.empty') }}
    </p>
    <div v-else class="sc-graph__row">
      <div class="topics">
        <span v-for="t in layout.sources" :key="t" class="sc-topic">{{ t }}<small>{{ formatRate(rate(t)) }}</small></span>
      </div>
      <template v-for="(step, i) in layout.steps" :key="step.id">
        <span v-if="i === 0" class="sc-edge"><span class="sc-edge__label">{{ formatRate(edgeRate(layout.sources)) }}</span></span>
        <div
          class="sc-node"
          role="button"
          tabindex="0"
          :aria-selected="selected === step.id"
          :data-testid="`node-${step.id}`"
          @click="toggle(step.id)"
          @keydown.enter.prevent="toggle(step.id)"
          @keydown.space.prevent="toggle(step.id)"
        >
          <div class="sc-label">Subtopology {{ step.id }}</div>
          <div class="sc-node__title">{{ sub(step.id).name }}</div>
          <div class="sc-node__meta">
            <span>{{ tr('pipeline.tasks', { n: sub(step.id).partitions }) }}</span>
            <span class="sc-mono" :data-testid="`lag-${step.id}`">lag {{ formatCount(group.flow?.lag[step.id]) }}</span>
          </div>
          <div class="sc-node__tasks">
            <i
              v-for="t in tasksOf(group.tasks, step.id)"
              :key="t"
              :class="{ 'sc-unowned-cell': !owned.has(t), stalled: owned.has(t) && group.stalledTasks[t] !== undefined }"
              :title="!owned.has(t) ? `${t} — ${tr('tasks.unowned')}` : group.stalledTasks[t] !== undefined ? `${t} — ${tr('tasks.stalled', { s: Math.round(group.stalledTasks[t] / 1000) })}` : t"
            />
          </div>
          <div v-for="(store, k) in sub(step.id).stores" :key="store" class="sc-node__store">
            ↻ {{ store }}<small>{{ sub(step.id).stateChangelogTopics[k] }}</small>
          </div>
        </div>
        <span v-if="i < layout.steps.length - 1" class="sc-edge sc-edge--repartition">
          <span class="sc-edge__label">{{ step.out.join(', ') }} · {{ formatRate(edgeRate(step.out)) }}</span>
        </span>
      </template>
    </div>
  </section>
</template>

<style scoped>
.topics { display: flex; flex-direction: column; gap: var(--space-2); align-self: center; }
.sc-topic small { display: block; color: var(--ink-muted); font-size: 11px; }
.empty { margin: 0; color: var(--ink-muted); }
.sc-node__tasks i.stalled { background: var(--state-revoking); }
</style>
