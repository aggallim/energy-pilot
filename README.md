# Energy Pilot

An energy planning tool, built as a sibling to the [UK Retirement Planner](https://github.com/aggallim/retirement-planner) and following the same ways of working.

> **Status: repository scaffold only.** No tool code exists yet. The scope, inputs and model are still to be defined through the first intent (`intent/001-…`).

## What's in the repo

| Path | Purpose |
|---|---|
| `CLAUDE.md` | Guidance and working conventions for Claude Code / any agent. |
| `CONTRIBUTING.md` | Step-by-step walkthrough of the intent → branch → draft PR → implement → merge lifecycle. |
| `CHANGELOG.md` | Chronological "what shipped when", one entry per requirement. |
| `docs/TOOL_DOCUMENTATION.md` | Spec of record: requirements, user guide, model, architecture, known limitations. Currently a skeleton. |
| `intent/` | One file per requirement, written before any code. Finished ones move to `intent/done/`. |
| `tests/` | Test harness (empty until there is logic to test). |
| `.claude/skills/` | `grill-me` / `grilling` (intent gathering) and `conventional-branch` (branch naming), copied from the retirement-planner repo. |

## Working here

Read `CLAUDE.md` and `CONTRIBUTING.md` first. Every change, bug fixes included, starts with a grilled intent file.

## Licence

AGPL-3.0 — see `LICENSE`.
