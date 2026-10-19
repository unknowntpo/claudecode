// Spec 008 CL2: the cluster view from the inspector's GET /cluster.
import { expect, test } from 'bun:test'
import { type InspectorCluster, toClusterView } from './cluster'
import { testPlanRows } from './cluster.cases'

function cluster(row: (typeof testPlanRows)[number]): InspectorCluster {
  const topics = new Map<string, { partition: number; leader: number; replicas: number[]; isr: number[] }[]>()
  for (const spec of row.partitions.split(';').map((s) => s.trim()).filter(Boolean)) {
    const [tp, l, r, i] = spec.split(' ')
    const dash = tp.lastIndexOf('-')
    const ids = (s: string) => s.slice(1).split(',').filter(Boolean).map(Number)
    const list = topics.get(tp.slice(0, dash)) ?? []
    list.push({ partition: Number(tp.slice(dash + 1)), leader: Number(l.slice(1)), replicas: ids(r), isr: ids(i) })
    topics.set(tp.slice(0, dash), list)
  }
  return {
    clusterId: 'c',
    controllerId: row.controller === '-' ? null : Number(row.controller),
    brokers: row.brokers.split(' ').map((b) => {
      const [id, rack] = b.split(':')
      return { id: Number(id), host: 'localhost', port: 9092, rack: rack === '-' ? null : `rack-${rack}` }
    }),
    topics: [...topics].map(([name, partitions]) => ({ name, internal: false, partitions })),
    logDirBytes: row.disk === '-' ? null : Object.fromEntries(row.disk.split(' ').map((d) => d.split('=')).map(([id, b]) => [id, Number(b)])),
  }
}

test.each(testPlanRows)('$id: $case', (row) => {
  const v = toClusterView(cluster(row))
  const cards = v.brokers
    .map((b) => `${b.id}${b.online ? '' : ' offline'}${b.controller ? ' ctl' : ''} ${b.rack?.replace('rack-', '') ?? '-'} L${b.leaders} R${b.replicas} d${b.diskBytes ?? '-'}`)
    .join(' | ')
  expect(cards).toBe(row.cards)
  const t = v.totals
  expect(`brokers ${t.brokersOnline}/${t.brokers} topics ${t.topics} partitions ${t.partitions} ur ${t.underReplicated} off ${t.offline}`).toBe(row.totals)
  expect(v.attention.map((a) => `${a.topic}-${a.partition} ${a.issue === 'offline' ? 'offline' : `ur ${a.missing.map((m) => `-${m}`).join(' ')}`}`).join(' | ')).toBe(row.attention)
  // each issue keeps its leader (Behavior 4): -1 exactly when offline
  for (const a of v.attention) expect(a.issue === 'offline' ? a.leader === -1 : a.leader >= 0).toBe(true)
  const leaders = cluster(row).topics.flatMap((t) => t.partitions.map((p) => [`${t.name}-${p.partition}`, p.leader]))
  for (const a of v.attention) expect(a.leader).toBe(Object.fromEntries(leaders)[`${a.topic}-${a.partition}`])
})
