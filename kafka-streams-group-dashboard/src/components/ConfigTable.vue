<script setup lang="ts">
import type { ConfigEntry } from '../../shared/types'
import { useI18n } from '../i18n'

defineProps<{ configs: ConfigEntry[]; mode: 'sim' | 'real' }>()
const { tr } = useI18n()
</script>

<template>
  <div>
    <p v-if="mode === 'sim'" class="note">{{ tr('config.sim') }}</p>
    <p v-else-if="configs.length === 0" class="note">{{ tr('config.none') }}</p>
    <table v-else class="sc-config">
      <thead>
        <tr><th>{{ tr('config.key') }}</th><th>{{ tr('config.value') }}</th><th>{{ tr('config.scope') }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="c in configs" :key="c.key">
          <td>{{ c.key }}</td>
          <td>{{ c.value ?? '—' }}</td>
          <td>
            <span class="sc-scope" :class="{ 'sc-scope--override': c.source === 'group' }">{{ c.source === 'group' ? tr('config.group') : tr('config.default') }}</span>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="mode === 'real'" class="note">{{ tr('group.standbyNote') }}</p>
  </div>
</template>

<style scoped>
.note { color: var(--ink-muted); margin: var(--space-3) 0 0; }
code { font-family: var(--font-mono); font-size: 12px; }
</style>
