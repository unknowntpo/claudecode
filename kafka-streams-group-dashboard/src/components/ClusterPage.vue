<script setup lang="ts">
import type { ClusterView } from '../../shared/types'
import { formatBytes } from '../cluster'
import { formatCount } from '../format'
import { useI18n } from '../i18n'

defineProps<{ cluster: ClusterView | null; error?: string }>()
const { tr } = useI18n()
</script>

<template>
  <main class="page">
    <header class="head">
      <h1>{{ tr('cluster.title') }}</h1>
      <span v-if="cluster" class="sc-mono id">{{ cluster.clusterId }}</span>
    </header>
    <div v-if="error" class="alert" role="alert" data-testid="cluster-error">{{ error }}</div>

    <template v-if="cluster">
      <div class="sc-metrics">
        <div class="sc-metric">
          <span class="sc-label">{{ tr('cluster.brokers') }}</span>
          <span class="sc-metric__value" :class="{ bad: cluster.totals.brokersOnline < cluster.totals.brokers }" data-testid="metric-brokers">{{ cluster.totals.brokersOnline }} / {{ cluster.totals.brokers }}</span>
        </div>
        <div class="sc-metric">
          <span class="sc-label">{{ tr('cluster.controller') }}</span>
          <span class="sc-metric__value">{{ cluster.brokers.find((b) => b.controller)?.id ?? '—' }}</span>
        </div>
        <div class="sc-metric">
          <span class="sc-label">{{ tr('cluster.topics') }}</span><span class="sc-metric__value">{{ formatCount(cluster.totals.topics) }}</span>
        </div>
        <div class="sc-metric">
          <span class="sc-label">{{ tr('cluster.partitions') }}</span><span class="sc-metric__value">{{ formatCount(cluster.totals.partitions) }}</span>
        </div>
        <div class="sc-metric">
          <span class="sc-label">{{ tr('cluster.underReplicated') }}</span>
          <span class="sc-metric__value" :class="{ warn: cluster.totals.underReplicated > 0 }" data-testid="metric-under-replicated">{{ formatCount(cluster.totals.underReplicated) }}</span>
        </div>
        <div class="sc-metric">
          <span class="sc-label">{{ tr('cluster.offline') }}</span>
          <span class="sc-metric__value" :class="{ bad: cluster.totals.offline > 0 }" data-testid="metric-offline">{{ formatCount(cluster.totals.offline) }}</span>
        </div>
      </div>

      <section class="brokers">
        <article v-for="b in cluster.brokers" :key="b.id" class="sc-panel broker" :class="{ offline: !b.online }" :data-testid="`broker-${b.id}`">
          <div class="broker__head">
            <span class="broker__name">Broker {{ b.id }}</span>
            <span v-if="b.controller" class="sc-badge sc-badge--active">{{ tr('status.controller') }}</span>
            <span v-if="!b.online" class="sc-badge sc-badge--fenced">{{ tr('status.offline') }}</span>
          </div>
          <div class="sc-mono meta">{{ b.rack ?? '—' }} · {{ b.host ?? '—' }}</div>
          <dl class="kv">
            <dt>{{ tr('broker.leaders') }}</dt><dd>{{ formatCount(b.leaders) }}</dd>
            <dt>{{ tr('broker.replicas') }}</dt><dd>{{ formatCount(b.replicas) }}</dd>
            <dt>{{ tr('broker.disk') }}</dt><dd>{{ formatBytes(b.diskBytes) }}</dd>
          </dl>
        </article>
      </section>

      <section class="sc-panel table-panel">
        <div class="sc-label section-label">{{ tr('cluster.issues') }}</div>
        <p v-if="cluster.attention.length === 0" class="empty">{{ tr('cluster.empty') }}</p>
        <table v-else class="sc-groups" data-testid="cluster-issues">
          <thead>
            <tr>
              <th>{{ tr('table.topic') }}</th>
              <th class="sc-num">{{ tr('table.partition') }}</th>
              <th>{{ tr('table.issue') }}</th>
              <th class="sc-num">{{ tr('table.leader') }}</th>
              <th>{{ tr('table.replicas') }}</th>
              <th>{{ tr('table.notInIsr') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in cluster.attention" :key="`${a.topic}-${a.partition}`">
              <td class="sc-mono">{{ a.topic }}</td>
              <td class="sc-num">{{ a.partition }}</td>
              <td><span class="sc-badge" :class="a.issue === 'offline' ? 'sc-badge--fenced' : 'sc-badge--revoking'">{{ tr(`issue.${a.issue}`) }}</span></td>
              <td class="sc-num">{{ a.leader < 0 ? '—' : a.leader }}</td>
              <td class="sc-mono">{{ a.replicas.join(', ') }}</td>
              <td class="sc-mono missing">{{ a.missing.join(', ') }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </main>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: var(--space-6); padding: var(--space-6) var(--space-8); min-width: 0; }
.head { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
.head h1 { margin: 0; font-size: 28px; line-height: 32px; font-weight: 700; letter-spacing: -0.01em; }
.id { font-size: 12px; color: var(--ink-muted); }
.alert {
  padding: var(--space-3) var(--space-4); border: 1px solid var(--state-fenced); border-radius: var(--radius-panel);
  background: var(--state-fenced-bg); color: var(--state-fenced);
}
.warn { color: var(--state-revoking); }
.bad { color: var(--state-fenced); }
.brokers { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-4); }
.broker { display: flex; flex-direction: column; gap: var(--space-2); }
.broker.offline { background: var(--surface-sunken); border-style: dashed; color: var(--ink-muted); }
.broker__head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.broker__name { font-weight: 700; margin-right: auto; }
.meta { font-size: 12px; color: var(--ink-muted); }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 2px var(--space-3); margin: 0; font-size: 13px; }
.kv dt { color: var(--ink-muted); }
.kv dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
.table-panel { padding: 0; overflow-x: auto; }
.section-label { padding: var(--space-4) var(--space-4) 0; }
.empty { margin: 0; padding: var(--space-3) var(--space-4) var(--space-4); color: var(--ink-muted); }
.missing { color: var(--state-revoking); }
@media (max-width: 720px) { .page { padding: var(--space-4); } }
</style>
