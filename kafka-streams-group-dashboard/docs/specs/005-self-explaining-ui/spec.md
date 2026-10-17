# Spec 005: Self-explaining UI

Status: Accepted (2026-10-18, human: "產品的 UI/UX 必須要能 self-explain … 真正必要用說明的話，可以用一些隱藏的方式，比如說 information on hover 才 display"; full topology deferred: "先不做，只改說明文字")
Date: 2026-10-18
Traceability: enforced
Builds on: Specs 003, 004

## Intent

The console explains itself through its structure, states and interactions, not through sentences addressed to
the reader. The few facts that cannot be shown (a setting that applies later) live behind an info button that
shows on hover or keyboard focus.

## Evidence

The human pointed at the group header: "Standby 設定會在下次 rebalance 生效；只有 stateful task 會有 standby。"
under the title. Other sentences of the same kind: the overview footer ("Groups with a stalled or fenced process
… are listed first"), the Tasks tab footer ("Select a pipeline node to open its details"), the note under the
configuration table, and empty states that tell the reader what to do ("Start an instance of the application…").

## Example

| Before | After |
| --- | --- |
| Group header: a grey sentence about standby under the title | the standby selector with an ⓘ beside it; hovering or focusing it shows "Applies at the next rebalance. Only stateful tasks get standbys." |
| Overview footer sentence about ordering | nothing: the order is visible (state dots, amber/red rows first) |
| Tasks tab footer "Select a pipeline node…" | nothing: nodes look and behave like buttons (pointer, hover border, focus ring) |
| Configuration note about standby | nothing (the ⓘ on the selector carries it) |
| Empty Processes tab "No processes. Start an instance…" | "No processes" |

## Behavior

1. No interface sentence explains how to read or use the console. Allowed text: labels, values, states, errors
   (what is wrong and how to fix it), and empty states that name the empty thing.
2. `InfoTip`: an ⓘ button next to the control it explains; its text shows on hover and on keyboard focus,
   is linked with `aria-describedby`, and hides on Escape or when focus leaves. Used for the standby selector only.
3. Interaction is shown by affordance: pipeline nodes keep the pointer cursor, hover border and focus ring
   (unchanged), group rows keep the pointer cursor and hover background.

## Simplification review

1. **Question** — each sentence: who needs it? The standby rule is the only fact not visible elsewhere → keep, as a tip.
2. **Delete** — overview hint, tasks hint, configuration note, standby note under the title, instructions in empty states.
3. **Simplify** — one `InfoTip` component, CSS-only show/hide.
4. **Shorten the cycle** — a unit test checks the dictionaries carry no hint or note texts and the tip exists in both languages.
5. **Automate** — none needed.

## Acceptance

### Behavior
- SX1: the dictionaries have no `*.hint`, `*Note` or instruction keys, both have `tip.standby`, and no component renders a removed key.
- SX2: [deploy] the ⓘ beside the standby selector shows its text on hover and on keyboard focus, hides on Escape, and is linked by `aria-describedby`, in EN and 繁中.

### Failure and retry
- SX3: empty states name the empty thing only ("No processes", "No members", "No events yet"); errors keep their fix ("Start it with …").

### Budget
- not applicable.

### Observability
- SX4: [deploy] no screen (overview, group, drawer, processes, configuration, log) shows an explanatory sentence, in EN and 繁中.

## Non-goals

- Full topology (sink topics, processor names): not done. It would need every application to publish its topology or expose an endpoint, and the human does not want features that require users to configure their applications (2026-10-18).
