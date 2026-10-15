// Three example Kafka Streams applications. Each one is its own streams group.
// In KIP-1071 the client sends this topology to the broker in its first heartbeat;
// the broker derives the tasks (one per input partition per subtopology).

import type { Topology } from '../shared/types'
import { StreamsGroup } from './coordinator'

export interface AppInfo {
  groupId: string
  description: string
  dsl: string
  topology: Topology
}

export const APPS: AppInfo[] = [
  {
    groupId: 'word-count',
    description: 'Classic word count: split lines into words, re-key by word (repartition), count in a state store.',
    dsl: `builder.stream("text-lines")
  .flatMapValues(line -> List.of(line.split("\\\\W+")))
  .groupBy((key, word) -> word)          // repartition
  .count(Materialized.as("counts-store"))
  .toStream().to("word-counts");`,
    topology: {
      epoch: 0,
      subtopologies: [
        {
          id: '0',
          name: 'split & re-key',
          sourceTopics: ['text-lines'],
          repartitionSourceTopics: [],
          repartitionSinkTopics: ['word-count-counts-store-repartition'],
          stateChangelogTopics: [],
          sinkTopics: [],
          stores: [],
          partitions: 4,
        },
        {
          id: '1',
          name: 'count',
          sourceTopics: [],
          repartitionSourceTopics: ['word-count-counts-store-repartition'],
          repartitionSinkTopics: [],
          stateChangelogTopics: ['word-count-counts-store-changelog'],
          sinkTopics: ['word-counts'],
          stores: ['counts-store'],
          partitions: 4,
        },
      ],
    },
  },
  {
    groupId: 'order-enrichment',
    description: 'Join an order stream with a customer table (co-partitioned topics) and emit enriched orders.',
    dsl: `KTable<String, Customer> customers = builder.table("customers");
builder.stream("orders")
  .join(customers, Order::enrich)
  .to("enriched-orders");`,
    topology: {
      epoch: 0,
      subtopologies: [
        {
          id: '0',
          name: 'stream-table join',
          sourceTopics: ['orders', 'customers'],
          repartitionSourceTopics: [],
          repartitionSinkTopics: [],
          stateChangelogTopics: ['order-enrichment-customers-STATE-STORE-changelog'],
          sinkTopics: ['enriched-orders'],
          stores: ['customers-STATE-STORE'],
          partitions: 3,
        },
      ],
    },
  },
  {
    groupId: 'page-view-sessions',
    description: 'Session-window page views per user (30 min inactivity gap) and count views per session.',
    dsl: `builder.stream("page-views")
  .groupByKey()
  .windowedBy(SessionWindows.ofInactivityGapWithNoGrace(Duration.ofMinutes(30)))
  .count(Materialized.as("sessions-store"))
  .toStream().to("user-sessions");`,
    topology: {
      epoch: 0,
      subtopologies: [
        {
          id: '0',
          name: 'sessionize',
          sourceTopics: ['page-views'],
          repartitionSourceTopics: [],
          repartitionSinkTopics: [],
          stateChangelogTopics: ['page-view-sessions-sessions-store-changelog'],
          sinkTopics: ['user-sessions'],
          stores: ['sessions-store'],
          partitions: 6,
        },
      ],
    },
  },
]

/** Simulator groups with a few initial members. */
export function createGroups(now = Date.now()): StreamsGroup[] {
  const [wordCount, orders, sessions] = APPS.map((a) => new StreamsGroup(a.groupId, a.description, a.dsl, a.topology))

  // Initial members: process-A runs two stream threads, process-B one.
  wordCount.addMember(now)
  wordCount.addMember(now, 'process-A')
  wordCount.addMember(now)
  orders.addMember(now)
  sessions.addMember(now)
  sessions.addMember(now)
  sessions.setStandbyReplicas(1)

  return [wordCount, orders, sessions]
}
