# CLAUDE.md

Guidance for Claude Code (or any agent) working in this repository.

## What this project is

**Energy Pilot** — a new energy planning tool, a sibling to the UK Retirement
Planner (https://github.com/aggallim/retirement-planner). The aim is the same
style of product: an illustrative, transparent calculator that projects
figures forward and explains its assumptions.

**Current state:** a free, clean-room UK solar and battery planning suite
(see `intent/done/001-solar-suite-foundation.md`). The Modeller is built;
Battery-only (002), Investment (003), Agile prices (004) and Forecast (005)
follow, and the public launch comes once all five have merged. Clean-room
rule: build from public feature descriptions and first principles only, and
never name or copy the product that inspired it.

**Repo:** https://github.com/aggallim/energy-pilot

## Settled decisions (intent 001)

- UK only. Free, no tiers. Brand: Energy Pilot.
- No-build, multi-file PWA (HTML, CSS, ES modules) on GitHub Pages. No
  backend, proxy, accounts or analytics.
- Reference data is fetched server-side by a GitHub Actions workflow into
  dated JSON in `data/`. The browser never calls third-party APIs, except
  where a later intent proves direct browser access works (004, 005).

## Repo layout

| Path | Purpose |
|---|---|
| `docs/TOOL_DOCUMENTATION.md` | Spec of record. Read before changing any calculation logic. |
| `CONTRIBUTING.md` | The requirement lifecycle in detail. |
| `CHANGELOG.md` | One entry per requirement, under a dated heading. |
| `intent/`, `intent/done/` | Requirement files; completed ones live in `done/`. |
| `tests/` | `node --test` suites (`npm test`); no dependencies. |
| `.claude/skills/` | `grill-me`/`grilling` and `conventional-branch`. |
| `index.html`, `src/app.js` | App shell and hash router. |
| `src/engine/` | Pure, DOM-free engine (time, pvgis, load, tariff, simulate, finance, scenario). Unit-tested. |
| `src/reference.js` | `UK_REFERENCE`: dated, cited reference figures (mirrored in docs §4.9). |
| `src/ui/`, `styles/app.css` | Pages, Chart.js wrapper and the design system (light and dark tokens). |
| `src/state.js`, `src/storage.js`, `src/data.js` | Scenario state, local storage/share/export, and data loading. |
| `data/` | Generated reference data. Do not hand-edit; re-run the fetcher. |
| `scripts/reference-data/` | Fetcher plus pure helpers (tested). |
| `.github/workflows/` | `test.yml`, `pages.yml` (deploy on `main`), `reference-data.yml` (monthly refresh PR). |
| `sw.js`, `manifest.webmanifest`, `assets/` | PWA. Bump `CACHE` in `sw.js` on every deploy-worthy change. |
| `vendor/` | Vendored Chart.js 4.5.0 (MIT). |

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

`.github/workflows/pages.yml` publishes the site on every push to `main`. The
owner sets two things once:

- Settings → Pages → Source: GitHub Actions.
- Settings → Actions → General → "Allow GitHub Actions to create and approve
  pull requests", for the monthly reference-data PR.

Local run: `python3 -m http.server`, then open the site. Tests: `npm test`.
