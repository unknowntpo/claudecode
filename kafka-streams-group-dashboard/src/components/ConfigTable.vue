<script setup lang="ts">
import type { ConfigEntry } from '../../shared/types'

defineProps<{ configs: ConfigEntry[]; mode: 'sim' | 'real' }>()
</script>

<template>
  <div>
    <p v-if="mode === 'sim'" class="note">The simulator has no broker configuration.</p>
    <p v-else-if="configs.length === 0" class="note">No configuration reported yet.</p>
    <table v-else class="sc-config">
      <thead>
        <tr><th>Key</th><th>Value</th><th>Scope</th></tr>
      </thead>
      <tbody>
        <tr v-for="c in configs" :key="c.key">
          <td>{{ c.key }}</td>
          <td>{{ c.value ?? '—' }}</td>
          <td>
            <span class="sc-scope" :class="{ 'sc-scope--override': c.source === 'group' }">{{ c.source === 'group' ? 'group' : 'broker default' }}</span>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="mode === 'real'" class="note">
      A change to <code>streams.num.standby.replicas</code> applies at the next rebalance; only stateful tasks get standbys.
    </p>
  </div>
</template>

<style scoped>
.note { color: var(--ink-muted); margin: var(--space-3) 0 0; }
code { font-family: var(--font-mono); font-size: 12px; }
</style>
