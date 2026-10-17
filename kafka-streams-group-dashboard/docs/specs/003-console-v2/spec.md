# Spec 003: Console v2 — screens, palette and EN / 繁中

Status: Accepted (2026-10-17, human: "畫面 ok，開 Spec 003 實作吧")
Date: 2026-10-17
Traceability: enforced
Builds on: Spec 002; design system v2 (<https://claude.ai/artifact/FBr69Pi42psrJXtz6wSZxy>, version 1792214555-094d);
screens (<https://claude.ai/artifact/VxjafokZM8DUfgPhzov8Zr>)

## Intent

Engineers who monitor Kafka Streams applications get the console the human reviewed on the design canvas:
an overview of every group, a group page with the pipeline first, a subtopology drawer and a process view,
in the 鼠と苔 palette (light and dark), in English or Traditional Chinese. Dense and quiet; loud only where
something is wrong.

## Evidence

- Human decisions (2026-10-17): monitoring use, pipeline first, light C′ / dark C palette, EN / 繁中 switch
  with protocol terms untranslated, left sidebar, right drawer, four screens approved on the canvas.
- The real backend already knows when it killed a process; that time is the only "since last heartbeat"
  value available (the broker does not report heartbeats).

## Example

The canvas's four artboards are the example, with this live scenario (values from the running stack,
2026-10-17): `page-view-sessions` has process-A (active `0_0..0_2`, standby `0_3..0_5`) and process-B
(active `0_3..0_5`, standby `0_0..0_2`); process-B is killed.

| Screen | Expected |
| --- | --- |
| Overview | `page-view-sessions` listed first with `RECONCILING` (or `STABLE` until the broker notices), members "2 · 1 crashed", growing lag; alert "process-B stopped heart-beating N s ago" |
| Sidebar | red dot on `page-view-sessions`; `lag N` once it is behind (with standbys the survivor takes over right after fencing, so the lag may never get there), else its input rate (`4.9/s`) |
| Drawer, subtopology 0 | rows `0_3`–`0_5`: active owner process-B shown crashed, standby process-A, `!` for no working owner |
| Processes | process-B card red, "stopped heart-beating N s ago; fenced at the 10 s session timeout" |
| 繁中 | 總覽, 群組, 成員, 輸入速率, 啟動新 process; `RECONCILING`, `0_3`, `page-views` unchanged |

## Behavior

1. **Shell**: a left `Sidebar` (Overview, then groups: crashed first, then RECONCILING/ASSIGNING/NOT_READY,
   then the rest, each by name; state dot; meta = `lag N` when the group is behind, else the input rate), the
   `LanguageToggle` at its foot; content on the right. The route is the URL hash: `#/` overview,
   `#/group/<id>`; an unknown id shows the overview.
2. **Overview**: `MetricStat`s (groups, processes with crashed count, total input rate, largest lag), one alert
   per crashed process, and the `GroupTable` in the sidebar's order.
3. **Group page**: header (id, `StateBadge`, standby selector with its note, "Start new process"), metrics,
   `PipelineGraph`, inspector tabs **Tasks**, **Processes**, **Configuration**, **Log**.
4. **Drawer**: selecting a pipeline node opens the subtopology drawer (input rate, lag, task count, topics,
   store and changelog, one row per task with active owner, standby owners, moves and `!`); it closes on ×,
   Escape, selecting the node again, or when that subtopology no longer exists. The pipeline stays visible.
5. **Processes tab**: one `ProcessCard` per process, alive first then crashed, each by label; threads with
   member id, epoch and task chips (active then standby, in task order); actions on live processes only; a
   crashed card says how long ago it stopped heart-beating (known for processes the console killed and JVMs that
   exited on their own; unknown for anything else).
6. **Behind**: a group is behind when its largest subtopology lag exceeds 5 seconds of its input rate
   (lag > 5 × input rate), or the input rate is unknown and lag > 0. This includes an EMPTY group whose input
   keeps arriving: nothing processes it, so the app may be down (human decision, 2026-10-17, after the verifier
   asked whether idle groups should be loud).
7. **Languages**: `en` and `zh-Hant` dictionaries with the same keys; a missing key falls back to English;
   protocol states, ids, topic/group/store/config names and units are never translated. The choice is
   remembered per viewer (`localStorage`, best effort) and defaults to `zh-Hant` when the browser prefers
   Chinese, else `en`. The root gets `lang`.
8. **Palette and type**: `src/styles/tokens.css` and `console.css` regenerated from design system v2; light
   and dark follow `prefers-color-scheme` unless the viewer picks a theme.
9. **Theme** (human, 2026-10-17: "ok go" to a System / Light / Dark switch): a segmented control at the
   sidebar foot next to the language toggle, options System, Light, Dark (系統、淺色、深色). System sets no
   `data-theme` on `<html>`; Light and Dark set `data-theme="light"` / `"dark"`. The choice is remembered per
   viewer (`localStorage`, best effort); an unknown stored value or storage that throws means System.

## Simplification review

1. **Question** — overview: the human chose it. Processes tab: the human chose it. Theme toggle: not asked;
   the system setting decides. Router library: not needed for two routes.
2. **Delete** — the separate "description" card, the topology-code `<details>` (the drawer shows topics),
   the old top tab bar, per-member leave/crash buttons (already gone).
3. **Simplify** — all sorting, "behind", drawer rows and process cards are pure functions over `GroupView`
   with case files; components only render them.
4. **Shorten the cycle** — no new server work except `msSinceHeartbeat` for killed processes.
5. **Automate** — the verifier checks the screens with a headless browser in both themes and languages.

## Acceptance

### Behavior
- CV1: sidebar / overview order rows below.
- CV2: "behind" rows below.
- CV3: drawer task rows below.
- CV4: process card rows below.
- CV5: every key exists in both dictionaries, and no dictionary value contains a protocol state, task id or topic name from the example apps.
- CV6: route parsing: `#/` → overview, `#/group/word-count` → that group, unknown id or junk → overview.

### Failure and retry
- CV7: a missing `zh-Hant` key falls back to the English text, never the key.
- CV8: a stored language that is not `en` / `zh-Hant`, or storage that throws → the browser default.
- CV9: the selected subtopology disappears (topology changed to one without it; an emptied group keeps its topology on a real broker) → the drawer closes.
- CV10: a crashed process without a known stop time (the console neither killed it nor saw its JVM exit) → its card has no "N s ago" text.
- CV11: [deploy] no groups or no members → overview and processes show their empty states, not a blank panel.
- CV12: the killed-at time survives polls: `msSinceHeartbeat` grows between two snapshots of a killed process.

- CV15: theme rows below: stored choice → `data-theme` value; unknown or throwing storage → System.

### Budget
- CV13: [measure] production JS ≤ 120 kB gzip (`bun run build`, read the gzip column).

### Observability
- CV16: [deploy] the theme switch at the sidebar foot changes the page between light and dark in both languages, and System follows the OS / emulated color scheme again.
- CV14: [deploy] the verifier renders overview, group, drawer and processes in light and dark, EN and 繁中, against the live stack, and compares them with the canvas.

### Test plan: order and behind (CV1, CV2)

<!-- test-plan:start src/console.cases.ts -->
| id | case | groups | lag | rate | expected |
| --- | --- | --- | --- | --- | --- |
| CV1 | crashed member first, then transitional states, then the rest | word-count:STABLE pvs:STABLE:crashed orders:RECONCILING |  |  | pvs orders word-count |
| CV1 | same rank sorts by id | zeta:STABLE alpha:STABLE |  |  | alpha zeta |
| CV1 | ASSIGNING and NOT_READY rank with RECONCILING | b:STABLE a:NOT_READY c:ASSIGNING |  |  | a c b |
| CV1 | EMPTY ranks with STABLE | b:EMPTY a:STABLE |  |  | a b |
| CV1 | no groups |  |  |  |  |
| CV2 | lag above 5 s of input |  | 30 | 5 | behind |
| CV2 | the largest of several subtopology lags counts |  | 2,30 | 5 | behind |
| CV2 | an EMPTY group whose input keeps arriving is behind (human, 2026-10-17) |  | 3013 | 9.9 | behind |
| CV2 | lag exactly 5 s of input is not behind |  | 25 | 5 | ok |
| CV2 | lag below 5 s of input |  | 4 | 5 | ok |
| CV2 | unknown rate and some lag |  | 3 | - | behind |
| CV2 | unknown rate and no lag |  | 0 | - | ok |
| CV2 | unknown lag |  | - | 5 | ok |
<!-- test-plan:end -->

### Test plan: theme (CV15)

<!-- test-plan:start src/theme.cases.ts -->
| id | case | stored | choice | dataTheme |
| --- | --- | --- | --- | --- |
| CV15 | nothing stored | (none) | system | (no attribute) |
| CV15 | light stored | light | light | light |
| CV15 | dark stored | dark | dark | dark |
| CV15 | system stored | system | system | (no attribute) |
| CV15 | unknown value | sepia | system | (no attribute) |
| CV15 | storage throws | (throws) | system | (no attribute) |
<!-- test-plan:end -->

### Test plan: drawer and processes (CV3, CV4)

<!-- test-plan:start src/detail.cases.ts -->
| id | case | members | subtopology | expected |
| --- | --- | --- | --- | --- |
| CV3 | stable owner and standby on another process | A/m1 alive a=0_0 \| B/m2 alive s=0_0 | 0 | 0_0 A:A S:B |
| CV3 | crashed owner: no working owner, standby elsewhere | A/m1 alive s=0_3 \| B/m2 crashed a=0_3 | 0 | 0_3 A:B× S:A ! |
| CV3 | owner revoking, new owner waiting: a move | A/m1 alive a=0_2 r=0_2 \| B/m2 alive t=0_2 | 0 | 0_2 A:A→B |
| CV3 | owner revoking with nobody waiting is no move | A/m1 alive a=0_2 r=0_2 | 0 | 0_2 A:A |
| CV3 | standby comes from the owned assignment, not the target | A/m1 alive a=0_1 \| B/m2 alive ts=0_1 | 0 | 0_1 A:A |
| CV3 | a crashed standby holder is marked | A/m1 alive a=0_0 \| B/m2 crashed s=0_0 | 0 | 0_0 A:A S:B× |
| CV3 | subtopology 1 does not include subtopology 10 | A/m1 alive a=1_0,10_0 | 1 | 1_0 A:A |
| CV3 | nobody owns it | A/m1 alive a=1_0 | 0 | 0_0 A:— ! |
| CV3 | other subtopologies are left out | A/m1 alive a=0_0,1_0 | 0 | 0_0 A:A |
| CV4 | alive before crashed, threads with tasks in task order, active then standby | B/m2 crashed a=0_3 ms=6000 \| A/m1 alive a=0_1,0_0 s=0_3 |  | A alive [m1: 0_0A 0_1A 0_3S] \| B crashed 6s [m2: 0_3A] |
| CV4 | alive first even when the crashed process sorts first by name | A/m1 crashed a=0_0 \| B/m2 alive a=0_1 |  | B alive [m2: 0_1A] \| A crashed [m1: 0_0A] |
| CV4 | starting before crashed | A/m1 crashed a=0_0 \| C/(starting) joining |  | C joining [(starting): ] \| A crashed [m1: 0_0A] |
| CV4 | a process with one starting thread is alive | A/m1 alive a=0_0 \| A/(starting) joining |  | A alive [m1: 0_0A] [(starting): ] |
| CV4 | tasks sort by subtopology, then partition | A/m1 alive a=1_0,0_1 |  | A alive [m1: 0_1A 1_0A] |
| CV4 | alive processes sort by label | B/m2 alive a=0_1 \| A/m1 alive a=0_0 |  | A alive [m1: 0_0A] \| B alive [m2: 0_1A] |
| CV4 | two threads in one process | A/m1 alive a=0_0 \| A/m3 alive a=0_1 |  | A alive [m1: 0_0A] [m3: 0_1A] |
| CV10 | crashed without a known kill time has no duration | B/m2 crashed a=0_0 |  | B crashed [m2: 0_0A] |
| CV4 | an alive process with a recent heartbeat shows no duration | A/m1 alive a=0_0 ms=1500 |  | A alive [m1: 0_0A] |
| CV4 | a starting process | C/(starting) joining |  | C joining [(starting): ] |
| CV4 | no members |  |  |  |
<!-- test-plan:end -->

## Non-goals

- More languages; editing configs beyond standby; per-task lag; charts.
