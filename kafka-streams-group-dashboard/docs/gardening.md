# Gardening list

Known workarounds and follow-ups. No new workaround lands without an entry; prefer deleting one to explaining it.

| Item | Why it exists | Exit |
| --- | --- | --- |
| `KAFKA_UNSTABLE_*_ENABLE` in `docker-compose.yml` | streams groups are early access in Kafka 4.1 | drop when the image is a release where the streams protocol is GA |
| Inspector sets `streams.session.timeout.ms` / `streams.heartbeat.interval.ms` per group | broker-level `group.streams.*` values were not applied to new groups (Spec 001 Evidence) | re-check on a newer broker; delete if the broker defaults apply |
| Member state (UNREVOKED/UNRELEASED) is derived from assignment vs target | `StreamsGroupDescribe` does not report it | use the broker field if a later KIP exposes it |
| `streams-app/gradle/gradle-daemon-jvm.properties` pins JDK 21 | Homebrew Gradle runs on JDK 25, where the Kotlin DSL fails | remove once Gradle supports JDK 25 |
| Shutdown hook calls `Runtime.halt(0)` | plain SIGTERM exits 143 | harmless; keep unless exit codes stop mattering |
| Inspector treats `Topology information is missing` as EMPTY | Kafka 4.1 describes an empty group without topology after a broker restart; the official CLI fails the same way (RB17) | re-check on a newer broker; report upstream if it persists (needs the human's approval) |
| Inspector exits if the broker is down when it starts | topics and group configs are set once at startup | restart `bun run dev`; add a retry if it becomes annoying |
| No `verify:*` CLI yet | the verifier uses `bun run test:e2e` and a browser for RB14/RB16 | add a screenshot command when a second spec needs browser checks |
