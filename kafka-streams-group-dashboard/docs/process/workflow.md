# Workflow

AI spec-driven development, adapted from `unknowntpo/oss-knowledge-base` `docs/process/workflow.md`.
The human owns intent and the definition of done; agents implement and verify; tests and the running
system decide.

## Roles

- **Human:** reviews a spec's Intent, Example, simplification review and test plan, and the verifier's verdict.
- **Implementer agent:** smallest change for an accepted spec, tests first (each seen failing), self-review.
- **Independent verifier:** a different agent, given only the spec path, the commit and how to run it.

## Specs

`docs/specs/NNN-name/spec.md`, from `docs/specs/_template/spec.md`.

1. Example from real data (captured from a running broker, with time).
2. Simplification review in order: question, delete, simplify, shorten the cycle, automate.
3. Acceptance IDs per class (Behavior, Failure and retry, Budget, Observability). Each untagged ID has a test
   whose name contains `ID:`; `[deploy]` / `[measure]` items are proven by a command and listed in the PR.
4. Table-shaped cases live in a `*.cases.ts` file exporting `testPlanRows`; tests run it with `test.each`,
   and `bun run docs:test-plan` renders it into the spec between `test-plan` markers.

A new or changed spec is accepted by the human before implementation.

## Gates

| Gate | Command | Where |
| --- | --- | --- |
| Unit tests (sim, mapping, gates) | `bun test` | local |
| Types + build | `bun run build` | local |
| Traceability | `bun run check:traceability` | local |
| Test plan drift | `bun run check:test-plan` | local |
| Real broker E2E | `bun run test:e2e` (needs `docker compose up -d` and `bun run build:java`) | local |

All gates run locally (`bun run check`): this project lives in a shared playground repository, so there is
no CI of its own (human decision, 2026-10-15). There is no deployed environment either: `[deploy]` items are
checked on the running local stack (broker + dashboard) by the verifier.

## Merge

User-owned repo: an implementation of an accepted spec may be merged when all gates are green and the
verifier passed the final commit. New specs, contracts and anything irreversible are aligned with the human first.
