// Three example Kafka Streams applications. Each one is its own streams group.
// In KIP-1071 the client sends this topology to the broker in its first heartbeat;
// the broker derives the tasks (one per input partition per subtopology).

import { StreamsGroup } from './coordinator'

export function createGroups(now = Date.now()): StreamsGroup[] {
  const wordCount = new StreamsGroup(
    'word-count',
    'Classic word count: split lines into words, re-key by word (repartition), count in a state store.',
    `builder.stream("text-lines")
  .flatMapValues(line -> List.of(line.split("\\\\W+")))
  .groupBy((key, word) -> word)          // repartition
  .count(Materialized.as("counts-store"))
  .toStream().to("word-counts");`,
    {
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
  )

  const orders = new StreamsGroup(
    'order-enrichment',
    'Join an order stream with a customer table (co-partitioned topics) and emit enriched orders.',
    `KTable<String, Customer> customers = builder.table("customers");
builder.stream("orders")
  .join(customers, Order::enrich)
  .to("enriched-orders");`,
    {
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
  )

  const sessions = new StreamsGroup(
    'page-view-sessions',
    'Session-window page views per user (30 min inactivity gap) and count views per session.',
    `builder.stream("page-views")
  .groupByKey()
  .windowedBy(SessionWindows.ofInactivityGapWithNoGrace(Duration.ofMinutes(30)))
  .count(Materialized.as("sessions-store"))
  .toStream().to("user-sessions");`,
    {
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
  )

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
