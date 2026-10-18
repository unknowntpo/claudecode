# RS7 / RS8 on the local stack (2026-10-18)

## RS7 [measure]
`for i in $(seq 1 20); do curl -s -o /dev/null -w "%{time_total}\n" http://localhost:8085/groups; done`
(three demo groups, word-count with 12 partitions): median 16 ms, max 23 ms (limit 500 ms).

## RS8 [deploy]
`docker compose --profile restore run --rm seed` (2,000,000 words, 3.7 s); word-count at 3 instances caught up
(counts-store changelog 2,022,076 records). `docker kill kafka-streams-group-dashboard-word-count-2`.
WebSocket snapshots (word-count):

    0.0s  STABLE      | wc1:alive:8 wc2:alive:8 wc3:alive:8       | restoring[]          stalled[]
    12.1s STABLE      | wc1:alive:8 wc2:stalled:8 wc3:alive:8     | restoring[]          stalled[1_4,1_10]
    17.2s ASSIGNING   | wc1:alive:8 wc3:alive:8                   | restoring[]          stalled[]
    18.2s RECONCILING | wc1:restoring:12 wc3:alive:8              | restoring[1_10,1_11] stalled[]
    19.2s STABLE      | wc1:restoring:12 wc3:restoring:12         | restoring[1_4,1_10]  stalled[]
    21.2s STABLE      | wc1:alive:12 wc3:alive:12                 | restoring[]          stalled[]

Log tab: `1_4 restoring on word-count-3 (changelog ≤ 171,877)` … `1_4 restored on word-count-3 after 2 s`;
`word-count-2 fenced after no progress for 9 s`. Process cards showed the restoring badge, ↻ chips,
"重建 state 中，已 1 秒。" and "Changelog ≤ 1,012,088".

The first run of this check found tasks marked restoring while nobody owned them (ASSIGNING); fixed with two
RS3 rows ("a task nobody owns is not restoring", "after a gap without owner…") seen failing first.
