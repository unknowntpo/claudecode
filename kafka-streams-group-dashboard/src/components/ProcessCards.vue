<script setup lang="ts">
import { computed } from 'vue'
import type { ClientMessage, GroupView } from '../../shared/types'
import { processCards } from '../console'
import { badgeClass } from '../format'
import { useI18n } from '../i18n'

const props = defineProps<{ group: GroupView; send: (msg: ClientMessage) => void }>()
const { tr } = useI18n()
const cards = computed(() => processCards(props.group))
const shortId = (id: string) => (id.length > 8 ? `${id.slice(0, 6)}…` : id)
const memberState = (memberId: string) => props.group.members.find((m) => m.memberId === memberId)?.state ?? 'STABLE'
</script>

<template>
  <p v-if="cards.length === 0" class="empty">{{ tr('processes.empty') }}</p>
  <div v-else class="sc-processes">
    <article
      v-for="c in cards"
      :key="c.processId"
      class="sc-process"
      :class="{ 'sc-process--crashed': c.status === 'crashed' }"
      :data-testid="`process-${c.processId}`"
    >
      <div class="sc-process__head">
        <span class="sc-process__name">{{ c.processId }}</span>
        <span v-if="c.status === 'crashed'" :class="badgeClass('crashed')">{{ tr('status.crashed') }}</span>
        <span v-else-if="c.status === 'joining'" :class="badgeClass('joining')">{{ tr('status.joining') }}</span>
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
      <p v-if="c.status === 'crashed'" class="note bad">
        {{ c.silentMs ? tr('processes.crashedSince', { s: Math.round(c.silentMs / 1000) }) : tr('processes.crashed') }}
      </p>
      <p v-else-if="c.status === 'joining'" class="note">{{ tr('processes.starting') }}</p>
      <div v-if="c.status === 'alive'" class="sc-process__actions">
        <button class="sc-button sc-button--small" :title="tr('action.threadTitle')" @click="send({ type: 'addMember', groupId: group.groupId, processId: c.processId })">{{ tr('action.thread') }}</button>
        <button class="sc-button sc-button--small" :title="tr('action.stopTitle')" @click="send({ type: 'stopProcess', groupId: group.groupId, processId: c.processId })">{{ tr('action.stop') }}</button>
        <button class="sc-button sc-button--small sc-button--danger" :title="tr('action.killTitle')" @click="send({ type: 'killProcess', groupId: group.groupId, processId: c.processId })">{{ tr('action.kill') }}</button>
      </div>
    </article>
  </div>
</template>

<style scoped>
.empty { margin: 0; color: var(--ink-muted); }
.note { margin: 0; font-size: 12px; line-height: 16px; color: var(--ink-muted); }
.note.bad { color: var(--state-fenced); }
</style>
