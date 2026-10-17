<script setup lang="ts">
// Spec 005: an explanation that cannot be shown by the UI itself, revealed on hover or keyboard focus only.
import { useId } from 'vue'
import { useI18n } from '../i18n'

defineProps<{ text: string }>()
const { tr } = useI18n()
const id = useId()
const hide = (e: KeyboardEvent) => (e.currentTarget as HTMLElement).blur()
</script>

<template>
  <span class="tip">
    <button type="button" class="tip__button" :aria-label="tr('tip.more')" :aria-describedby="id" data-testid="info-tip" @keydown.escape="hide">
      ⓘ
    </button>
    <span :id="id" role="tooltip" class="tip__body">{{ text }}</span>
  </span>
</template>

<style scoped>
.tip { position: relative; display: inline-flex; }
.tip__button {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%;
  background: none; color: var(--ink-muted); font-size: 14px; line-height: 1; cursor: help;
}
.tip__button:hover, .tip__button:focus-visible { color: var(--ink); }
.tip__body {
  position: absolute; z-index: 10; top: calc(100% + var(--space-1)); right: 0;
  width: max-content; max-width: 260px; padding: var(--space-2) var(--space-3);
  background: var(--surface-raised); color: var(--ink); border: 1px solid var(--line-strong);
  border-radius: var(--radius-panel); box-shadow: var(--shadow-popover);
  font-size: 12px; line-height: 18px; text-align: left;
  visibility: hidden; opacity: 0; transition: opacity 120ms;
}
.tip__button:hover + .tip__body, .tip__button:focus-visible + .tip__body { visibility: visible; opacity: 1; }
@media (prefers-reduced-motion: reduce) { .tip__body { transition: none; } }
</style>
