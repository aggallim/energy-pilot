# 001 — Solar suite foundation and Modeller

- **Status:** intent agreed 2026-10-18 (grilling session); implementation not started.
- **Branch:** `feature/001-solar-suite-foundation`
- **Follow-ups:** 002 Battery-only, 003 Investment, 004 Agile rates, 005 Forecast.

## Why

Energy Pilot becomes a **free, public, clean-room UK solar and battery
planning suite**, covering the same ground as the Solarazma Suite
(Gary Does Solar), which is a paid Patreon product. There is no free or paid
tier: everything is free. Alongside parity, the product gets a new brand and a
modern, high-quality design.

## Clean-room rules

- Built only from **public feature descriptions** and first-principles
  physics and finance. No source code, copy, layout, names or branding from
  Solarazma is copied, and the source tool was not inspected.
- The site **does not mention** Solarazma or Gary Does Solar. This avoids any
  implied affiliation or endorsement.
- The method is documented independently in `docs/TOOL_DOCUMENTATION.md`.
  Matching Solarazma's outputs is a non-goal.

## Product decisions

| Decision | Choice |
|---|---|
| Audience | Public, UK solar/battery buyers and owners |
| Market | UK only (GBP, UK tariffs, Octopus regions) |
| Name | **Energy Pilot** |
| Look & feel | Clean data-app: calm, minimal, neutral surfaces, one warm solar accent, strong type, light + dark mode; charts carry the page |
| Stack | No-build, multi-file: plain HTML, CSS and ES modules, one vendored chart library |
| Hosting | GitHub Pages default URL (`aggallim.github.io/energy-pilot`), via `.github/workflows/pages.yml` |
| Backend | None: no proxy, no accounts, no server |
| Analytics | None |
| Storage | Browser storage only. JSON export/import to move data between devices |

## The suite (delivery plan)

The public launch happens once 001–005 have merged.

| Intent | Tool | Notes |
|---|---|---|
| **001** (this) | Shell, design system, engine, **Modeller** | Details below |
| 002 | Battery-only payback | Battery with no PV, on the 001 engine and finance model |
| 003 | Investment | Solar cashflow vs the same sum compounding at a user-set rate (cited cash-ISA or index default); notes that solar savings are tax-free |
| 004 | Agile rates | Today's prices, plus tomorrow's once published (about 16:00 UK). **Ships only if** the Octopus public API can be called directly from a browser (CORS); otherwise it is parked |
| 005 | Forecast | 7-day generation from Forecast.Solar. **Same browser-call condition** as 004 |

## 001 scope: the Modeller

### Solar input
- **Hourly, full-year** simulation (8,760 steps).
- Up to **3 arrays**, each from an uploaded **PVGIS hourly CSV**. The PVGIS
  API blocks browser calls (no CORS, per JRC's API docs), and the
  no-backend rule rules out a proxy.
- **Bundled sample PVGIS files** (cited and dated) so the Modeller gives
  results before any upload.

### Consumption input
- **Annual kWh**, spread hour by hour with a standard UK load profile
  (Elexon Profile Class 1 for standard, Class 2 for Economy 7; cited).
- No smart-meter upload (out of scope).

### Battery and inverter
- **Transparent rules**, no optimiser. Self-consumption by default, plus:
  - separate max charge and discharge rates
  - forced charge and discharge windows, with rates and limits
  - minimum battery level (reserve)
  - an option to block discharge outside a forced-charge window
- Rules are **pre-filled from the chosen tariff preset** and stay editable.
- Inverter AC limit with **clipping**, and **DC-coupled battery charging**
  that captures energy above the inverter limit on oversized arrays.

### Tariffs
- A **dated, cited reference object** of common UK import and export
  tariffs (e.g. Flux, Go, Intelligent Octopus, Cosy, fixed SEG export),
  mirrored in the docs. Presets are editable.
- A **custom multi-rate builder**: any number of time-of-use bands.
- **Agile / Agile Outgoing:** a bundled, dated 12-month half-hourly price
  history for **all 14 regions**, as static JSON loaded only for the
  selected region. It is refreshed **monthly by a scheduled GitHub Action**
  that opens a PR. The Action runs on GitHub, so CORS does not apply.

### Finance
- **Lifetime cashflow**, year by year: panel degradation, battery capacity
  fade and one replacement, energy price inflation. Outputs are payback
  year, total return and IRR.
- Every assumption is visible and editable, with defaults in the cited
  reference object.

### Cross-cutting features (in 001, reused by later tools)
- **Side-by-side scenarios:** save several setups and compare them.
- **Shareable URL:** inputs encoded in the link, with no server.
- **Installable offline PWA:** manifest and service worker. Bump the cache
  version on every deploy-worthy change.
- **JSON export/import** of scenarios.

## Engineering rules

- The engine (solar aggregation, load profile, battery/tariff simulation,
  finance) is a **pure, unit-tested module**, separate from the UI. Tests
  use the dependency-free `node` harness in `tests/`.
- Reference figures (tariffs, load profiles, finance defaults, sample-file
  provenance) live in **one dated, cited object**.
- Update `docs/TOOL_DOCUMENTATION.md`, `CHANGELOG.md` and `CLAUDE.md`'s
  layout table in this PR.

## Out of scope for 001

- The tools in 002–005.
- Smart-meter consumption upload.
- Auto-optimised battery dispatch.
- Loan/finance repayments and NPV.
- Flux, diverter and generation-only calculators (separate, beyond Suite parity).
- Any backend, proxy, accounts, feedback pipeline or analytics.
- Countries other than the UK.

## Acceptance

- Opening the site with no input shows a complete Modeller result from
  bundled sample data.
- Uploading PVGIS hourly CSVs for 1–3 arrays changes the results.
- Switching tariff presets changes the battery rules and the results.
- Agile results draw on the selected region's bundled history.
- Scenarios can be saved, compared, shared by URL and exported/imported.
- The app installs and works offline.
- Engine tests pass under `node`.
- Docs and changelog are updated, and this file is moved to `intent/done/`
  in the same PR.

## Research notes

Public descriptions of the source suite, as reported by search indexes. The
source sites themselves were blocked from the build environment and not read
first-hand. Reported tools: daily modelling with PVGIS, 3 arrays, battery
rules, multi-rate tariffs, DC-coupled over-inverter charging, currency setting
and ROI; a 7-day solar forecast (Forecast.Solar); battery-only payback; Octopus
Agile rates; solar vs investment. Exact input fields, the time step and the
maths were not visible, so the method here is our own.
