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
| Demo producer + sink topics | `streams-app/src/main/java/ksgd/DemoProducer.java` | CS6, CS8 |
| Flow math (rates, lag) | `server/real/flow.ts` | CS2, CS3, CS7, CS9, CS10 |
| Pipeline layout, node filter | `shared/pipeline.ts` | CS1, CS4 |
| Group configs (session timeout 10 s, heartbeat 2 s) | `Inspector.configureGroups` | RB7, RB13 |
| `streams-app run` (one process, stdin `add-thread`, SIGTERM leave) | `streams-app/src/main/java/ksgd/StreamsRunner.java` | RB3, RB4, RB8 |
| Process manager + polling | `server/real/backend.ts` | RB3–RB5, RB7–RB11, RB13 |
| Broker JSON → `GroupView` | `server/real/mapping.ts` (`toGroupView`, `memberState`, `processLabel`) | RB6, RB12 |
| Coordinator log events | `server/real/mapping.ts` (`diffEvents`) | RB15 |
| Simulator | `server/sim.ts`, `server/coordinator.ts`, `server/assignor.ts` | `server/coordinator.test.ts` |

## UI (Spec 002, Streams Console design system)

| Element | Selector | Data | Covered by |
| --- | --- | --- | --- |
| Mode label | `[data-testid=mode]` | `snapshot.mode` | — |
| Error banner | `[data-testid=error-banner]` | `snapshot.error` | RB14 |
| Group tabs | `nav[aria-label="Streams groups"] button` | `snapshot.groups[].state` | — |
| Group state | `[data-testid=group-state]` | `group.state` | CS12 |
| Standby note | `[data-testid=standby-note]` | real mode only | RB16 |
| Input rate | `[data-testid=input-rate]` | `group.flow.inputRate` | CS2, CS12 |
| Pipeline node | `[data-testid=node-<id>]` (`aria-selected`) | subtopology, tasks, store | CS1, CS4 |
| Node lag | `[data-testid=lag-<id>]` | `group.flow.lag[id]` | CS3, CS8 |
| Edge label | `.sc-edge__label` | topic names, rate | CS2, CS6 |
| Inspector tabs | `[role=tab]` Tasks / Configuration / Log | — | CS4 |
| Matrix cell | `.sc-chip--active`, `--standby`, `--warmup`, `--target`, `--revoking` | assignment / target / revocation | RB6 |
| Process actions | `.sc-matrix thead .sc-button` (`+ thread`, `stop`, `kill`) | `addMember` / `stopProcess` / `killProcess` | RB4, RB7, RB8 |
| Config table | `.sc-config` | `group.configs` | CS5 |
| Coordinator log | `.sc-log li` | `group.events` | RB15 |
