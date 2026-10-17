// Flow math for Spec 002 Behavior 3: topic rates from two polls and subtopology lag.

import type { GroupFlow, TopicKind } from '../../shared/types'

/** Records per second between two end offsets; null when it cannot be known. */
export function topicRate(previous: number | null | undefined, next: number | null | undefined, elapsedMs: number): number | null {
  if (previous == null || next == null || elapsedMs <= 0 || next < previous) return null
  return ((next - previous) * 1000) / elapsedMs
}

/** Σ (end − committed) over a subtopology's input topics, each term ≥ 0; null if any input is unknown. */
export function subtopologyLag(inputs: { end?: number; committed?: number }[]): number | null {
  if (inputs.length === 0 || inputs.some((i) => i.end === undefined || i.committed === undefined)) return null
  return inputs.reduce((sum, i) => sum + Math.max(0, i.end! - i.committed!), 0)
}


export interface InspectorTopic {
  name: string
  kind: TopicKind
  /** Absent while the topic does not exist. */
  endOffset?: number
}

/** Rates and lag for one group from this poll and the previous poll's end offsets. */
export function computeFlow(
  g: {
    topics?: InspectorTopic[]
    committed?: Record<string, number>
    subtopologies: { id: string; sourceTopics: string[]; repartitionSourceTopics: string[] }[]
  },
  previous: Record<string, number> | null,
  elapsedMs: number,
): GroupFlow {
  const topics = (g.topics ?? []).map((t) => ({
    name: t.name,
    kind: t.kind,
    endOffset: t.endOffset ?? null,
    rate: topicRate(previous?.[t.name], t.endOffset, elapsedMs),
  }))
  const end = new Map(topics.map((t) => [t.name, t.endOffset ?? undefined]))
  const lag = Object.fromEntries(
    g.subtopologies.map((s) => [
      s.id,
      subtopologyLag(
        [...s.sourceTopics, ...s.repartitionSourceTopics].map((t) => ({ end: end.get(t), committed: g.committed?.[t] })),
      ),
    ]),
  )
  const sourceRates = topics.filter((t) => t.kind === 'source').map((t) => t.rate)
  const inputRate =
    sourceRates.length && sourceRates.every((r) => r !== null) ? sourceRates.reduce((a, b) => a! + b!, 0) : null
  return { topics, lag, inputRate }
}

/** CS7: when a poll fails, keep what we know about topics but never pretend a rate of 0. */
export function withoutRates(flow: GroupFlow): GroupFlow {
  return { ...flow, topics: flow.topics.map((t) => ({ ...t, rate: null })), inputRate: null }
}
