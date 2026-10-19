// Spec 008: the cluster view, a pure mapping of the inspector's GET /cluster.
import type { BrokerView, ClusterView, PartitionIssue } from '../../shared/types'

export interface InspectorCluster {
  clusterId: string
  controllerId: number | null
  brokers: { id: number; host: string; port: number; rack: string | null }[]
  topics: { name: string; internal: boolean; partitions: { partition: number; leader: number; replicas: number[]; isr: number[] }[] }[]
  logDirBytes: Record<string, number> | null
}

export function toClusterView(c: InspectorCluster): ClusterView {
  const cards = new Map<number, BrokerView>()
  const card = (id: number) => {
    let b = cards.get(id)
    if (!b) cards.set(id, (b = { id, online: false, controller: false, host: null, rack: null, leaders: 0, replicas: 0, diskBytes: null }))
    return b
  }
  for (const b of c.brokers)
    Object.assign(card(b.id), { online: true, controller: b.id === c.controllerId, host: `${b.host}:${b.port}`, rack: b.rack, diskBytes: c.logDirBytes?.[String(b.id)] ?? null })

  const attention: PartitionIssue[] = []
  let partitions = 0
  for (const t of c.topics)
    for (const p of t.partitions) {
      partitions++
      if (p.leader >= 0) card(p.leader).leaders++
      for (const r of p.replicas) card(r).replicas++
      const missing = p.replicas.filter((r) => !p.isr.includes(r))
      // an offline partition is reported as offline only, not also as under-replicated
      if (p.leader < 0) attention.push({ topic: t.name, partition: p.partition, issue: 'offline', leader: -1, replicas: p.replicas, missing })
      else if (missing.length) attention.push({ topic: t.name, partition: p.partition, issue: 'under-replicated', leader: p.leader, replicas: p.replicas, missing })
    }
  attention.sort((a, b) => (a.issue === b.issue ? 0 : a.issue === 'offline' ? -1 : 1) || a.topic.localeCompare(b.topic) || a.partition - b.partition)

  const brokers = [...cards.values()].sort((a, b) => a.id - b.id)
  return {
    clusterId: c.clusterId,
    brokers,
    totals: {
      brokers: brokers.length,
      brokersOnline: brokers.filter((b) => b.online).length,
      topics: c.topics.length,
      partitions,
      underReplicated: attention.filter((a) => a.issue === 'under-replicated').length,
      offline: attention.filter((a) => a.issue === 'offline').length,
    },
    attention,
  }
}
