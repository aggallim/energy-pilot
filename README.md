# Energy Pilot

Free, private planning tools for UK solar and batteries, built as a sibling to
the [UK Retirement Planner](https://github.com/aggallim/retirement-planner) and
following the same ways of working.

The **Modeller** simulates your roof, battery and smart tariff hour by hour for
a full year. It then shows the bill, how much of your electricity comes from
solar, battery and grid, and the payback and return over the system's life.
It uses regional Octopus rates, a year of Agile prices and PVGIS solar data,
each dated and cited. There are no accounts, no tracking and no backend:
calculations run in the browser and your figures stay on your device.

More tools follow before the public launch: battery-only payback, solar vs
investing, Agile prices, and a solar forecast.

## Run it locally

No build step and no dependencies:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
npm test                      # engine and data-pipeline tests (node:test)
```

## What's in the repo

| Path | Purpose |
|---|---|
| `index.html`, `src/`, `styles/` | The app: hash-routed pages, a pure engine in `src/engine/`, and reference figures in `src/reference.js` |
| `data/` | Dated reference data (Octopus tariffs, Agile history, PVGIS samples), refreshed monthly by a workflow |
| `scripts/reference-data/` | The fetcher that builds `data/` (runs in GitHub Actions) |
| `docs/TOOL_DOCUMENTATION.md` | Spec of record: user guide, model, data, architecture, limitations |
| `CLAUDE.md`, `CONTRIBUTING.md` | Working conventions and the intent → branch → PR lifecycle |
| `intent/` | One file per requirement; finished ones move to `intent/done/` |
| `tests/` | `node --test` suites |

## Licence

AGPL-3.0, see `LICENSE`. Bundles Chart.js (MIT, `vendor/chart.js-LICENSE.md`)
and the Inter font (SIL OFL, `assets/fonts/Inter-LICENSE.txt`).
