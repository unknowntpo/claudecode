# Feature map

Where each feature lives, how to reach it, and which acceptance IDs cover it. Update it in the same change
that alters behavior.

## Environments

| Name | Start | URL |
| --- | --- | --- |
| Broker | `docker compose up -d` | `localhost:9092` |
| Dashboard (dev, real) | `bun run build:java && bun run dev` | <http://localhost:5173> (Bun server `:3000`, inspector `:8085`) |
| Dashboard (dev, sim) | `MODE=sim bun run dev` | <http://localhost:5173> |
| E2E | `bun run test:e2e` | inspector `:18085`, group `word-count` |

## Server

| Feature | Code | Covered by |
| --- | --- | --- |
| Inspector `GET /groups?ids=` | `streams-app/src/main/java/ksgd/Inspector.java` | RB1, RB2, RB17 |
| Inspector `POST /groups/<id>/standby` | same | RB5 |
| Group configs (session timeout 10 s, heartbeat 2 s) | `Inspector.configureGroups` | RB7, RB13 |
| `streams-app run` (one process, stdin `add-thread`, SIGTERM leave) | `streams-app/src/main/java/ksgd/StreamsRunner.java` | RB3, RB4, RB8 |
| Process manager + polling | `server/real/backend.ts` | RB3–RB5, RB7–RB11, RB13 |
| Broker JSON → `GroupView` | `server/real/mapping.ts` (`toGroupView`, `memberState`, `processLabel`) | RB6, RB12 |
| Coordinator log events | `server/real/mapping.ts` (`diffEvents`) | RB15 |
| Simulator | `server/sim.ts`, `server/coordinator.ts`, `server/assignor.ts` | `server/coordinator.test.ts` |

## UI

| Element | Selector | Data | Covered by |
| --- | --- | --- | --- |
| Mode label | `[data-testid=mode]` | `snapshot.mode` | — |
| Error banner | `[data-testid=error-banner]` | `snapshot.error` | RB14 |
| Standby selector note | `[data-testid=standby-note]` | real mode only | RB16 |
| Group tabs | `nav button` | `snapshot.groups[].state` | — |
| Process header: `+ thread`, `stop`, `kill` | `th.process button` | `addMember` / `stopProcess` / `killProcess` | RB4, RB7, RB8 |
| Matrix cell | `td i.active`, `.standby`, `.warmup`, `.target`, `.revoke` | member assignment / target / pending revocation | RB6 |
| Coordinator log | `section.log li` | `group.events` | RB15 |
