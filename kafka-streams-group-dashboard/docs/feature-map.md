# Feature map

Where each feature lives, how to reach it, and which acceptance IDs cover it. Update it in the same change
that alters behavior.

## Environments

| Name | Start | URL |
| --- | --- | --- |
| Demo workload | `docker compose up -d --build` | broker `localhost:9092` (containers use `kafka:19092`) |
| Console (dev) | `bun run build:java && bun run dev` | <http://localhost:5173> (Bun server `:3000`, inspector `:8085`) |
| E2E | `bun run test:e2e` | inspector `:18085`, drives the compose demo |

## Demo workload (not the console)

| Service | What | Covered by |
| --- | --- | --- |
| `setup` | creates source topics, sets session timeout 10 s / heartbeat 2 s for the demo groups, exits | RB7→RO5 timing |
| `producer` | `streams-app produce`: demo records (Spec 002 Behavior 1) | CS6, CS8 |
| `word-count`, `order-enrichment`, `page-view-sessions` | `streams-app run <app>`; label = container name; `WORD_COUNT_THREADS` | RB3–RB5, RB13, RO2, RO5, RO6 |

## Console server

| Feature | Code | Covered by |
| --- | --- | --- |
| Inspector `GET /groups` (discovery; `?ids=` optional) | `streams-app/src/main/java/ksgd/Inspector.java` | RO1, RB1, RB2, RB17, RO7 |
| Inspector `POST /groups/<id>/standby` (the only write) | same | RB5, RO3 |
| Polling, discovery, fenced / left | `server/real/backend.ts` | RO3, RO8, RO11, RB10, RB11 |
| Stalled tasks, fenced vs left | `server/real/progress.ts` | RO4, RO11 |
| Broker JSON → `GroupView`, task samples, labels | `server/real/mapping.ts` | RB6, RB12, RO2, RO4 |
| Flow math (rates, lag) | `server/real/flow.ts` | CS2, CS3, CS7, CS9, CS10 |
| Pipeline layout, node filter | `shared/pipeline.ts` | CS1, CS4 |
| Coordinator log events | `server/real/mapping.ts` (`diffEvents`) | RB15 |

## UI (Spec 002, Streams Console design system)

| Element | Selector | Data | Covered by |
| --- | --- | --- | --- |
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
| Config table | `.sc-config` | `group.configs` | CS5 |
| Coordinator log | `.sc-log li` | `group.events` | RB15 |

## UI (Spec 003, console v2)

| Element | Selector | Data | Covered by |
| --- | --- | --- | --- |
| Route | URL hash `#/`, `#/group/<id>` | `parseRoute` | CV6 |
| Sidebar group item | `[data-testid=nav-<id>]` (`aria-current="page"`) | `sortGroups`, `isBehind` | CV1, CV2 |
| Language toggle | `[data-testid=lang-en]`, `[data-testid=lang-zh-Hant]` (`aria-pressed`) | `useI18n`, `detectLang` | CV5, CV7, CV8 |
| Theme toggle | `[data-testid=theme-system|theme-light|theme-dark]` (`aria-pressed`), sets `<html data-theme>` | `useTheme`, `detectTheme` | CV15, CV16 |
| Overview row | `[data-testid=row-<id>]` | `sortGroups`, `maxLag` | CV1, CV11 |
| Stalled / fenced alerts | `[data-testid=stalled-alert]`, `[data-testid=fenced-alert]` | `processCards`, `fencedCards` | RO4, RO11 |
| Total input rate | `[data-testid=total-rate]` | sum of `flow.inputRate` | CV14 |
| Inspector tabs | `[data-testid=tab-tasks|tab-processes|tab-config|tab-log]` | — | CV14 |
| Subtopology drawer | `[data-testid=drawer]` (Escape closes) | `taskRows`, `drawerSubtopology` | CV3, CV9 |
| Process card | `[data-testid=process-<label>]` (stalled: amber border) | `processCards` | CV4, RO4 |
| Fenced card | `[data-testid=fenced-<label>]` (60 s) | `fencedCards` | RO11 |
| Broker label | `[data-testid=broker]` | — | — |
| Changelog size (drawer, stateful subtopology) | `[data-testid=changelog-size]` | `taskRows().changelog` from `startOffsets` / `endOffsets` | RS2, RS5, RS6 |
| Restoring mark (matrix row) | `[data-testid=restoring-mark]` (↻, warm-up colour) | `restoringTasks` | RS3, RS5 |
| Process changelog total | `[data-testid=process-changelog]` | `processCards().changelog` | RS5 |
