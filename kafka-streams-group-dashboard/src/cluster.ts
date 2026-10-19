// Spec 008: view helpers for the cluster page and its sidebar item.
import type { ClusterView } from '../shared/types'

/** CL4: red when a broker or a partition is offline, amber when partitions are under-replicated. */
export function clusterDot(t: ClusterView['totals'] | null): string {
  if (!t) return 'sc-dot--idle'
  if (t.brokersOnline < t.brokers || t.offline > 0) return 'sc-dot--fenced'
  return t.underReplicated > 0 ? 'sc-dot--revoking' : 'sc-dot--active'
}

/** 417524 → "408 KB"; null → "—". */
export function formatBytes(n: number | null): string {
  if (n === null) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${i === 0 || v >= 10 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}
