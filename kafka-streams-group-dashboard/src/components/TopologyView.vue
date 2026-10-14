<script setup lang="ts">
import type { GroupView } from '../../shared/types'

defineProps<{ group: GroupView }>()
</script>

<template>
  <section>
    <h2>Topology (sent to the broker in the first heartbeat)</h2>
    <pre class="dsl">{{ group.dsl }}</pre>
    <div class="subs">
      <div v-for="s in group.topology.subtopologies" :key="s.id" class="sub">
        <div class="title">
          <strong>Subtopology {{ s.id }}</strong> <span class="muted">· {{ s.name }} · {{ s.partitions }} tasks</span>
        </div>
        <div class="flow mono">
          <span v-for="t in s.sourceTopics" :key="t" class="topic">⟶ {{ t }}</span>
          <span v-for="t in s.repartitionSourceTopics" :key="t" class="topic repartition">⟶ {{ t }}</span>
          <span v-for="st in s.stores" :key="st" class="store">🗄 {{ st }}</span>
          <span v-for="t in s.stateChangelogTopics" :key="t" class="topic changelog">↺ {{ t }}</span>
          <span v-for="t in s.repartitionSinkTopics" :key="t" class="topic repartition">{{ t }} ⟶</span>
          <span v-for="t in s.sinkTopics" :key="t" class="topic">{{ t }} ⟶</span>
        </div>
        <div class="tasks mono">
          <span v-for="p in s.partitions" :key="p">{{ s.id }}_{{ p - 1 }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dsl { margin: 0 0 12px; padding: 10px; border-radius: 8px; background: var(--bg); overflow-x: auto; }
.subs { display: flex; flex-direction: column; gap: 10px; }
.sub { border: 1px solid var(--border); border-radius: 8px; padding: 10px; }
.title { margin-bottom: 6px; }
.flow, .tasks { display: flex; flex-wrap: wrap; gap: 6px; }
.flow { margin-bottom: 6px; }
.topic, .store, .tasks span { padding: 2px 6px; border-radius: 4px; background: var(--bg); border: 1px solid var(--border); }
.repartition { border-style: dashed; }
.changelog { color: var(--muted); }
.store { border-color: var(--accent); }
.tasks span { color: var(--muted); }
</style>
