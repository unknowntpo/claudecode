// Pipeline layout shared by the server tests and the Vue graph (Spec 002, Behavior 4).

export interface LayoutSubtopology {
  id: string
  sourceTopics: string[]
  repartitionSourceTopics: string[]
  repartitionSinkTopics: string[]
}

export interface PipelineLayout {
  /** Topics read from outside the application, left of the first node. */
  sources: string[]
  /** Nodes in data-flow order, each with the topics on its outgoing edge. */
  steps: { id: string; out: string[] }[]
}

/** Orders subtopologies so that one reading another's repartition topic comes after it. */
export function pipelineLayout(subs: LayoutSubtopology[], sinks: string[]): PipelineLayout {
  if (subs.length === 0) return { sources: [], steps: [] }
  const ordered: LayoutSubtopology[] = []
  const pending = [...subs].sort((a, b) => Number(a.id) - Number(b.id))
  while (pending.length) {
    const produced = new Set(ordered.flatMap((s) => s.repartitionSinkTopics))
    const upstream = new Set(pending.flatMap((s) => s.repartitionSinkTopics))
    // ready: every repartition input is produced already, or by nobody still pending
    const i = pending.findIndex((s) => s.repartitionSourceTopics.every((t) => produced.has(t) || !upstream.has(t)))
    ordered.push(...pending.splice(i < 0 ? 0 : i, 1))
  }
  return {
    sources: [...new Set(ordered.flatMap((s) => s.sourceTopics))],
    steps: ordered.map((s, i) => ({
      id: s.id,
      out: i === ordered.length - 1 ? sinks : s.repartitionSinkTopics,
    })),
  }
}

/** Compact text form used by tests: "[a] → 0 → [b] → 1 → [c]". */
export function layoutText({ sources, steps }: PipelineLayout): string {
  if (steps.length === 0) return ''
  return [`[${sources.join(', ')}]`, ...steps.flatMap((s) => [s.id, `[${s.out.join(', ')}]`])].join(' → ')
}

/** Tasks of one subtopology (`<id>_<partition>`), or all tasks when nothing is selected. */
export function tasksOf(tasks: string[], subtopologyId: string | null): string[] {
  return subtopologyId === null ? tasks : tasks.filter((t) => t.split('_')[0] === subtopologyId)
}
