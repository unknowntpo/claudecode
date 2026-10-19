# CL6 / CL7 on the local stack (2026-10-19, three KRaft nodes, Kafka 4.4.0-rc4)

## CL6 [measure]
`for i in $(seq 1 20); do curl -s -o /dev/null -w "%{time_total}\n" http://localhost:8085/cluster; done`:
median 17 ms, max 30 ms (limit 200 ms); 12 topics, 110 partitions.

## CL7 [deploy]
WebSocket snapshots while `docker compose stop kafka-3` and later `start kafka-3`:

    0.0s  1:ctl L36  2 L37  3 L37          ur=0   off=0  groups=SSS
    5.1s  1:ctl L61  2 L49  3 L0           ur=110 off=0  groups=SSS
    7.2s  1:ctl L61  2 L49  3:offline L0   ur=110 off=0  groups=SSS
    46.9s 1:ctl L61  2 L49  3 L0           ur=0   off=0  groups=SSS   (start at ~22 s)

Screen: metric Brokers 2 / 3 (red), Under-replicated 110 (amber), card Broker 3 dashed with the offline badge,
issues table with `__consumer_offsets` … rows, "Not in ISR 3"; sidebar Cluster dot red with 2/3.

The first check found the controller badge jumping between brokers on each poll: `describeCluster().controller()`
is a random live broker in KRaft (see red-controller.txt). Fixed with `describeMetadataQuorum().leaderId()`;
CL1's E2E now checks the same controller on repeated calls and equals `kafka-metadata-quorum.sh` LeaderId.
CL8: bun run test:e2e on the three-broker demo → 16 pass, 0 fail (2026-10-19).
After the verifier's findings (2026-10-19): bun run test:e2e → 16 pass, 0 fail; /cluster 22 ms with leaders {1: 110} after broker restarts (no preferred leader election yet).
