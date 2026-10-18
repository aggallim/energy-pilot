# CLAUDE.md

Guidance for Claude Code (or any agent) working in this repository.

## What this project is

**Energy Pilot** — a new energy planning tool, a sibling to the UK Retirement
Planner (https://github.com/aggallim/retirement-planner). The aim is the same
style of product: an illustrative, transparent calculator that projects
figures forward and explains its assumptions.

**Current state: scaffold only.** There is no application code, no defined
scope and no financial/energy model yet. The first piece of work is to settle
what the tool is, via `grilling` and `intent/001-…`. Do not start building
before that intent exists.

**Repo:** https://github.com/aggallim/energy-pilot

## Open decisions (settle in the first intent)

These are deliberately *not* decided by the scaffold:

- Which energy question the tool answers (household bills? solar/battery/heat
  pump payback? tariff comparison? EV charging?) and for which country.
- Stack. The retirement planner is a single-file, no-build PWA on GitHub
  Pages; that is the default starting assumption here, but confirm it.
- Data sources for reference figures (tariffs, price cap, grid carbon, etc.)
  and how they are dated and cited.
- Whether it needs any backend, accounts, feedback pipeline or MCP server
  (the retirement planner has all three; none are assumed here).

## Repo layout

| Path | Purpose |
|---|---|
| `docs/TOOL_DOCUMENTATION.md` | Spec of record. Read before changing any calculation logic. |
| `CONTRIBUTING.md` | The requirement lifecycle in detail. |
| `CHANGELOG.md` | One entry per requirement, under a dated heading. |
| `intent/`, `intent/done/` | Requirement files; completed ones live in `done/`. |
| `tests/` | Dependency-free `node` test harness (once there is an engine). |
| `.claude/skills/` | `grill-me`/`grilling` and `conventional-branch`. |

Update this table as the layout grows.

## Working conventions (inherited from retirement-planner)

- **Data stays on the device by default.** Never put a token or secret in any
  file the site serves. Keep personal figures, tokens and credentials out of
  the repo.
- **Keep calculation logic a pure, unit-tested function** separate from UI.
- **Reference figures live in one dated, cited object** (like `UK_REFERENCE`
  in the retirement planner) and are mirrored in the docs.
- **Update `docs/TOOL_DOCUMENTATION.md` in the same PR** as any change it
  describes, and **add a `CHANGELOG.md` entry** naming the intent file.
- If a user-facing "What's new" view is added, add an entry only for
  user-facing changes.
- If a service worker is added, bump its cache version on every deploy-worthy
  change.

## Requirement lifecycle

Applies to bug fixes as much as features. See `CONTRIBUTING.md`.

1. **Intent** — run the `grilling` skill until the user confirms a shared
   understanding (the only approval checkpoint). Then write
   `intent/NNN-slug.md` as the **first commit on the requirement's branch**.
   Never commit it to `main`.
2. **Branch** — `<type>/NNN-slug` off `main` (`feature`, `bugfix`, `hotfix`,
   `release`, `chore`; see `.claude/skills/conventional-branch/`). One branch
   per requirement. If a harness assigns a different branch, use the assigned
   one only if pushing the correct branch is rejected, and say why.
3. **Draft PR** into `main` straight after the intent commit.
4. **Plan** — optional `plan.md`, branch-only; delete it in the same PR.
5. **Implement**, 6. **Test & document**, 7. **Mark ready**.
8. **Move the intent to `intent/done/` in the same PR.**
9. **Merge**, sync `main`, delete the local branch; the remote branch is
   deleted by the user at https://github.com/aggallim/energy-pilot/branches.

Subscribe to each PR's activity as soon as it is opened and watch it to merge.

## Branch protection

`main` should only change via a reviewed, green PR. This is a GitHub setting
an agent cannot apply; the owner needs to enable it once (Settings → Branches
→ require a PR, and require status checks once a test workflow exists).

## Deployment

Not set up yet. If this follows the retirement planner, add a
`.github/workflows/pages.yml` that publishes the repo root to GitHub Pages and
set Settings → Pages → Source: GitHub Actions.
