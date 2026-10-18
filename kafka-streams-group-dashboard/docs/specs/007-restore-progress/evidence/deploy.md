# RP6 / RP7 on the local stack (2026-10-18, Kafka 4.4.0 clients, broker apache/kafka:4.4.0-rc4)

## Spike (before the spec)
Kafka 4.1 members report empty `taskOffsets`; with 4.4.0 clients and broker, `describeStreamsGroups` returns
them for restoring tasks (word-count-1 restoring 8 tasks, 1_0: 135,539 → 314,319 → 493,203 → 715,550 of 833,228,
then not reported once RUNNING). Steady state reports nothing (RUNNING active tasks are removed by
`TaskManager#maybeUpdateTaskOffsetSumSnapshot`).

## RP6 [measure]
`bun run test:e2e`: 15 pass, 0 fail. The first run failed RB3/RB4/RO5 because killed containers left from a
manual session shifted the labels after `--scale word-count=1`; the E2E now removes the word-count containers
first (`docker compose rm -f -s word-count`). RB1's member key list gained `taskOffsets`, `taskEndOffsets` (RP1).

## RP7 [deploy]
10 M seeded words; kill word-count-1 and -2, word-count-3 takes 8 stateful tasks it never owned:

    12.2s STABLE | wc3:restoring | restoring[1_0,1_2,1_4,1_8,1_10] progress[]            (Spec 006 until the first report)
    14.3s STABLE | wc3:restoring | progress[1_0:16% 1_1:38% 1_2:27% 1_3:32% 1_4:45% 1_6:22% 1_8:27% 1_10:22%]
    16.3s STABLE | wc3:restoring | progress[1_0:59% 1_1:81% 1_2:70% 1_3:75% 1_4:86% 1_6:65% 1_8:70% 1_10:64%]
    18.3s STABLE | wc3:alive     | restoring[] progress[]

Drawer rows showed `↻ 3 s` with a bar and `16 %`; process-card chips `↻ 1_0 16%`. A later round logged
`1_11 restoring … restored after 5 s` and then again `restoring … restored after 1 s`: a report still present
after the first commit. Fixed (RP3 row "a report still seen after the first commit is stale") and re-run:
one restoring and one restored line per task.
