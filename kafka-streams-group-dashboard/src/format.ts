// Small view helpers shared by the console components.
import type { GroupState, MemberView } from '../shared/types'

/** StateBadge modifier for a group or member state (design system: State language). */
export function badgeClass(state: GroupState | MemberView['state'] | MemberView['status'] | 'fenced'): string {
  switch (state) {
    case 'STABLE':
    case 'alive':
      return 'sc-badge sc-badge--active'
    case 'RECONCILING':
    case 'ASSIGNING':
    case 'UNREVOKED_TASKS':
    case 'UNRELEASED_TASKS':
    case 'stalled':
      return 'sc-badge sc-badge--revoking'
    case 'fenced':
      return 'sc-badge sc-badge--fenced'
    default:
      return 'sc-badge sc-badge--idle'
  }
}

/** "5.0 rec/s", "42 rec/s", or "—" when the rate is unknown (never 0 for unknown, Spec 002 CS7). */
export function formatRate(rate: number | null | undefined): string {
  if (rate == null) return '—'
  return `${rate < 10 ? rate.toFixed(1) : Math.round(rate).toLocaleString('en-US')} rec/s`
}

export function formatCount(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('en-US')
}
