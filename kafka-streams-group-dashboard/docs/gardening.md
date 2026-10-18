# Gardening list

Known workarounds and follow-ups. No new workaround lands without an entry; prefer deleting one to explaining it.

| Item | Why it exists | Exit |
| --- | --- | --- |
| `KAFKA_UNSTABLE_*_ENABLE` in `docker-compose.yml` | streams groups are early access in Kafka 4.1 | drop when the image is a release where the streams protocol is GA |
| Member state (UNREVOKED/UNRELEASED) is derived from assignment vs target | `StreamsGroupDescribe` does not report it | use the broker field if a later KIP exposes it |
| `streams-app/gradle/gradle-daemon-jvm.properties` pins JDK 21 | Homebrew Gradle runs on JDK 25, where the Kotlin DSL fails | remove once Gradle supports JDK 25 |
| Shutdown hook calls `Runtime.halt(0)` | plain SIGTERM exits 143 | harmless; keep unless exit codes stop mattering |
| Inspector treats `Topology information is missing` as EMPTY | Kafka 4.1 describes an empty group without topology after a broker restart; the official CLI fails the same way (RB17) | re-check on a newer broker; report upstream if it persists (needs the human's approval) |
| No `verify:*` CLI yet | the verifier uses `bun run test:e2e` and a browser for RB14/RB16 | add a screenshot command when a second spec needs browser checks |
| `scripts/dev.ts` runs Vite with `bunx vite` (Node), not `--bun` | under the Bun runtime Vite's `/ws` proxy never completes the WebSocket upgrade (found 2026-10-17) | re-check with a newer Bun; switch back if the upgrade works |
| `PipelineGraph.vue` adds `.topics` and `.sc-topic small` (stacked topic pills with a rate line) | the design system's `PipelineGraph` has no multi-topic stack or rate line yet | backport both into the Streams Console design system, then delete the local styles |
| `src/styles/tokens.css` and `console.css` are copies of the design system | the dashboard has no build step that pulls from the artifact | regenerate them when the design system changes (`tokens.css` header says so) |
| kafka-clients logs an ERROR per empty group per poll after a broker restart (`… missing the topology information`) | the inspector's `describeStreamsGroups` hits the same Kafka 4.1 gap as the RB17 entry above; the inspector already maps it to EMPTY, the client still logs it | re-check on a newer broker; otherwise lower that logger's level in the inspector |
| Independent subtopologies (no repartition topic between them) render as a chain joined by an empty edge | `pipelineLayout` builds one chain; branching layouts are a Spec 002 Non-goal (CS1 row "two independent subtopologies") | add parallel lanes if an app with independent subtopologies is added |
| A long repartition topic name makes the pipeline scroll sideways at 1440 px with the sidebar | edge labels never truncate, so topic names stay copyable | consider wrapping the label or showing it in the drawer only |
| `setLang` writing `<html lang>` is verified in the browser only | no DOM in unit tests | add a component test if a DOM test runner is introduced |
| `setup` (compose) sets `streams.session.timeout.ms` / `streams.heartbeat.interval.ms` per demo group | broker-level `group.streams.*` values were not applied to new groups (Spec 001 Evidence) | re-check on a newer broker; delete if the broker defaults apply |
| Container labels come from a reverse DNS lookup inside the container; the console cuts the compose project prefix | Docker's hostname is the container id | set `client.id` from the orchestrator (e.g. a pod name) in a real deployment |
| The console chrome still differs from the canvas: Pause bar at the top right, no "updated N s ago", sidebar foot "Broker" without the address | the address is not in the snapshot yet | add `bootstrap` to the snapshot |
| Stalled detection misreads a task whose commit interval is longer than 3 × the group median | the threshold is one value per group | per-task thresholds if real apps mix commit intervals |
| The demo broker runs `apache/kafka:4.4.0-rc4` (Spec 007) | Docker Hub had only RC images on 2026-10-18 while Maven and downloads.apache.org ship 4.4.0 | switch to `apache/kafka:4.4.0` once published |
