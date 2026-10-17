<script setup lang="ts">
import { computed } from 'vue'
import type { GroupView } from '../../shared/types'
import { fencedCards, processCards } from '../console'
import { badgeClass } from '../format'
import { useI18n } from '../i18n'

const props = defineProps<{ group: GroupView }>()
const { tr } = useI18n()
const cards = computed(() => processCards(props.group))
const fenced = computed(() => fencedCards(props.group))
const shortId = (id: string) => (id.length > 8 ? `${id.slice(0, 6)}…` : id)
const memberState = (memberId: string) => props.group.members.find((m) => m.memberId === memberId)?.state ?? 'STABLE'
const secs = (ms: number) => Math.round(ms / 1000)
</script>

<template>
  <p v-if="cards.length === 0 && fenced.length === 0" class="empty">{{ tr('processes.empty') }}</p>
  <div v-else class="sc-processes">
    <article
      v-for="c in cards"
      :key="c.processId"
      class="sc-process"
      :class="{ stalled: c.status === 'stalled' }"
      :data-testid="`process-${c.processId}`"
    >
      <div class="sc-process__head">
        <span class="sc-process__name">{{ c.processId }}</span>
        <span v-if="c.status === 'stalled'" :class="badgeClass('stalled')">{{ tr('status.stalled') }}</span>
        <span v-else :class="badgeClass(memberState(c.threads[0].memberId))">{{ memberState(c.threads[0].memberId) }}</span>
      </div>
      <div v-for="th in c.threads" :key="th.memberId" class="sc-thread">
        <div class="sc-thread__head">
          <span class="sc-mono" :title="th.memberId">{{ shortId(th.memberId) }}</span>
          <span class="sc-mono">epoch {{ th.memberEpoch }}</span>
        </div>
        <div class="sc-thread__tasks">
          <span v-for="x in th.tasks" :key="x.task + x.role" class="sc-chip" :class="x.role === 'active' ? 'sc-chip--active' : 'sc-chip--standby'">{{ x.task }}</span>
        </div>
      </div>
      <p v-if="c.stalledMs" class="note warn">{{ tr('processes.stalled', { s: secs(c.stalledMs) }) }}</p>
    </article>

    <article v-for="f in fenced" :key="`fenced-${f.processId}`" class="sc-process fenced" :data-testid="`fenced-${f.processId}`">
      <div class="sc-process__head">
        <span class="sc-process__name">{{ f.processId }}</span>
        <span :class="badgeClass('fenced')">{{ tr('status.fenced') }}</span>
      </div>
      <p class="note">{{ tr('processes.fenced', { s: secs(f.stalledMs) }) }}</p>
      <ul class="moves">
        <li v-for="t in f.tasks" :key="t.task">
          <span class="sc-mono">{{ t.task }}</span> →
          <span v-if="t.nowOwnedBy" class="sc-mono">{{ t.nowOwnedBy }}</span>
          <span v-else class="muted">{{ tr('processes.noOwner') }}</span>
        </li>
      </ul>
    </article>
  </div>
</template>

<style scoped>
.empty { margin: 0; color: var(--ink-muted); }
.note { margin: 0; font-size: 12px; line-height: 16px; color: var(--ink-muted); }
.note.warn { color: var(--state-revoking); }
.sc-process.stalled { border-color: var(--state-revoking); }
.sc-process.fenced { background: var(--surface-sunken); border-style: dashed; color: var(--ink-muted); }
.moves { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; font-size: 12px; }
.muted { color: var(--ink-muted); }
</style>
