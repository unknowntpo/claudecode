<script setup lang="ts">
import type { GroupView } from '../../shared/types'
import { isBehind, maxLag } from '../console'
import { formatCount, formatRate } from '../format'
import { LANGS, useI18n } from '../i18n'
import type { Route } from '../route'

defineProps<{ groups: GroupView[]; route: Route; mode: 'sim' | 'real' | undefined }>()
const emit = defineEmits<{ navigate: [route: Route] }>()
const { lang, setLang, tr } = useI18n()

const dot = (g: GroupView) =>
  g.members.some((m) => m.status === 'crashed')
    ? 'sc-dot--fenced'
    : ['RECONCILING', 'ASSIGNING'].includes(g.state)
      ? 'sc-dot--revoking'
      : g.state === 'STABLE'
        ? 'sc-dot--active'
        : 'sc-dot--idle'
/** Lag while the group is behind (Spec 003 CV2), else its input rate. */
const meta = (g: GroupView) =>
  isBehind(g) ? `lag ${formatCount(maxLag(g))}` : g.flow?.inputRate != null ? formatRate(g.flow.inputRate).replace(' rec', '') : g.state
const langLabel = { en: 'EN', 'zh-Hant': '繁中' }
</script>

<template>
  <nav class="sc-sidebar sidebar" :aria-label="tr('nav.groups')">
    <div class="sc-sidebar__brand">Streams Console</div>
    <button class="sc-nav-item" :aria-current="route.page === 'overview' ? 'page' : undefined" @click="emit('navigate', { page: 'overview' })">
      <span class="sc-dot sc-dot--active" /><span>{{ tr('nav.overview') }}</span><span />
    </button>
    <div class="sc-label sc-sidebar__section">{{ tr('nav.groups') }}</div>
    <button
      v-for="g in groups"
      :key="g.groupId"
      class="sc-nav-item"
      :aria-current="route.page === 'group' && route.groupId === g.groupId ? 'page' : undefined"
      :title="g.groupId"
      :data-testid="`nav-${g.groupId}`"
      @click="emit('navigate', { page: 'group', groupId: g.groupId })"
    >
      <span class="sc-dot" :class="dot(g)" />
      <span class="sc-nav-item__name">{{ g.groupId }}</span>
      <span class="sc-nav-item__meta">{{ meta(g) }}</span>
    </button>
    <div class="spacer" />
    <div class="foot">
      <div class="sc-lang" role="group" :aria-label="tr('nav.language')">
        <button
          v-for="l in LANGS"
          :key="l"
          :lang="l"
          :aria-pressed="lang === l"
          :data-testid="`lang-${l}`"
          @click="setLang(l)"
        >
          {{ langLabel[l] }}
        </button>
      </div>
      <span class="sc-label" data-testid="mode">{{ mode === 'real' ? tr('app.live') : tr('app.sim') }}</span>
    </div>
  </nav>
</template>

<style scoped>
.sidebar { min-height: 100vh; box-sizing: border-box; }
.spacer { flex-grow: 1; min-height: var(--space-6); }
.foot { display: flex; flex-direction: column; gap: var(--space-2); padding: 0 var(--space-2); }
@media (max-width: 900px) { .sidebar { min-height: 0; } .spacer { display: none; } }
</style>
