<script setup lang="ts">
import { computed } from 'vue'
import { pipelineLayout, tasksOf } from '../../shared/pipeline'
import type { GroupView } from '../../shared/types'
import { formatCount, formatRate } from '../format'

const props = defineProps<{ group: GroupView; selected: string | null }>()
const emit = defineEmits<{ select: [id: string | null] }>()

const subs = computed(() => props.group.topology.subtopologies)
const sinks = computed(() => props.group.flow?.topics.filter((t) => t.kind === 'sink').map((t) => t.name) ?? [])
const layout = computed(() => pipelineLayout(subs.value, sinks.value))
const sub = (id: string) => subs.value.find((s) => s.id === id)!
const rate = (topic: string) => props.group.flow?.topics.find((t) => t.name === topic)?.rate ?? null
const edgeRate = (topics: string[]) => {
  const rates = topics.map(rate)
  return rates.length && rates.every((r) => r !== null) ? rates.reduce((a, b) => a! + b!, 0) : null
}
const isRepartition = (topics: string[]) => topics.length > 0 && topics.every((t) => !sinks.value.includes(t))
const owned = computed(() => new Set(props.group.members.flatMap((m) => m.assignment.active)))
const toggle = (id: string) => emit('select', props.selected === id ? null : id)
</script>

<template>
  <section class="sc-graph" aria-label="Pipeline">
    <p v-if="layout.steps.length === 0" class="empty">
      No topology yet. Start a process: its first heartbeat sends the topology to the broker.
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
            <span>{{ sub(step.id).partitions }} tasks</span>
            <span class="sc-mono" :data-testid="`lag-${step.id}`">lag {{ formatCount(group.flow?.lag[step.id]) }}</span>
          </div>
          <div class="sc-node__tasks">
            <i
              v-for="t in tasksOf(group.tasks, step.id)"
              :key="t"
              :class="{ 'sc-unowned-cell': !owned.has(t) }"
              :title="owned.has(t) ? `${t} active` : `${t} has no owner`"
            />
          </div>
          <div v-for="(store, k) in sub(step.id).stores" :key="store" class="sc-node__store">
            ↻ {{ store }}<small>{{ sub(step.id).stateChangelogTopics[k] }}</small>
          </div>
        </div>
        <span
          v-if="step.out.length"
          class="sc-edge"
          :class="{ 'sc-edge--repartition': isRepartition(step.out) && i < layout.steps.length - 1 }"
        >
          <span class="sc-edge__label">
            <template v-if="i < layout.steps.length - 1">{{ step.out.join(', ') }} · </template>{{ formatRate(edgeRate(step.out)) }}
          </span>
        </span>
        <div v-if="i === layout.steps.length - 1 && step.out.length" class="topics">
          <span v-for="t in step.out" :key="t" class="sc-topic">{{ t }}<small>sink</small></span>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.topics { display: flex; flex-direction: column; gap: var(--space-2); align-self: center; }
.sc-topic small { display: block; color: var(--ink-muted); font-size: 11px; }
.empty { margin: 0; color: var(--ink-muted); }
</style>
