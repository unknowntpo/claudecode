<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { sortGroups } from './console'
import GroupPage from './components/GroupPage.vue'
import OverviewPage from './components/OverviewPage.vue'
import Sidebar from './components/Sidebar.vue'
import { useI18n } from './i18n'
import { parseRoute, type Route, routeHash } from './route'
import { useStreamsGroups } from './useStreamsGroups'

const { snapshot, connected, send } = useStreamsGroups()
const { tr } = useI18n()

/** Spec 003 CV1 / Spec 004: stalled or fenced first, then changing groups, then the rest. */
const groups = computed(() => sortGroups(snapshot.value?.groups ?? []))
const hash = ref(location.hash)
const onHash = () => (hash.value = location.hash)
onMounted(() => window.addEventListener('hashchange', onHash))
onBeforeUnmount(() => window.removeEventListener('hashchange', onHash))

const route = computed<Route>(() => parseRoute(hash.value, groups.value.map((g) => g.groupId)))
const group = computed(() => (route.value.page === 'group' ? groups.value.find((g) => g.groupId === (route.value as { groupId: string }).groupId) : undefined))
const navigate = (r: Route) => (location.hash = routeHash(r))
</script>

<template>
  <div class="sc-root shell">
    <Sidebar :groups="groups" :route="route" @navigate="navigate" />
    <div class="content">
      <div class="bar">
        <span class="dot" :class="{ on: connected }" :title="connected ? tr('app.connected') : tr('app.disconnected')" />
        <button class="sc-button sc-button--small" @click="send({ type: 'togglePause' })">{{ snapshot?.paused ? tr('app.resume') : tr('app.pause') }}</button>
      </div>
      <div v-if="snapshot?.error" class="banner" data-testid="error-banner" role="alert">{{ snapshot.error }}</div>
      <p v-if="!snapshot" class="loading">{{ tr('app.connecting') }}</p>
      <GroupPage v-else-if="group" :group="group" :send="send" />
      <OverviewPage v-else :groups="groups" @navigate="navigate" />
    </div>
  </div>
</template>

<style>
body { margin: 0; background: var(--surface); }
</style>

<style scoped>
.shell { display: grid; grid-template-columns: 232px minmax(0, 1fr); min-height: 100vh; }
.content { min-width: 0; display: flex; flex-direction: column; }
.bar { display: flex; justify-content: flex-end; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-8) 0; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--state-fenced); }
.dot.on { background: var(--state-active); }
.banner {
  margin: var(--space-3) var(--space-8) 0; padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-panel); border: 1px solid var(--state-fenced);
  background: var(--state-fenced-bg); color: var(--state-fenced);
}
.loading { padding: var(--space-6) var(--space-8); color: var(--ink-muted); }
@media (max-width: 900px) {
  .shell { grid-template-columns: 1fr; }
  .bar { padding: var(--space-3) var(--space-4) 0; }
  .banner { margin: var(--space-3) var(--space-4) 0; }
}
</style>
