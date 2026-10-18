# Energy Pilot: Tool Documentation

This file is the spec of record. Update it in the same PR as any change it
describes.

## 1. Overview

Energy Pilot is a free, public, clean-room suite of UK solar and battery
planning tools. It is a no-build Progressive Web App on GitHub Pages: no
backend, no accounts, no analytics. Calculations run in the browser, and the
user's figures stay on their device.

| Tool | Status | Intent |
|---|---|---|
| Solar + battery Modeller | Live | `intent/done/001-solar-suite-foundation.md` |
| Battery only (payback without panels) | Planned | 002 |
| Solar vs investing | Planned | 003 |
| Agile prices (today / tomorrow) | Planned; only if the Octopus API can be called from a browser | 004 |
| Solar forecast (7 days, Forecast.Solar) | Planned; same condition as 004 | 005 |

The suite is a clean-room re-imagining of a paid product's feature set. It was
built only from public feature descriptions and first principles, and it
copies no code, copy, layout or branding from that product. The public launch
follows once 001–005 have merged.

## 2. Requirements

- `intent/done/001-solar-suite-foundation.md`: product decisions, the shared
  engine, the design system and the Modeller (with its 2026-10-18 addendum).

## 3. User guide

### 3.1 Modeller inputs

| Section | Inputs | Notes |
|---|---|---|
| Home | Region (14 UK electricity regions), annual kWh, usage pattern (out during the day / home most of the day / night-heavy) | Region selects regional tariff rates and the default sample location |
| Solar panels | Up to 3 arrays: name, kWp, and either a bundled sample (location × facing) or an uploaded PVGIS hourly file; inverter kW; export limit kW (0 = none); inverter type (hybrid DC-coupled / AC-coupled) | Upload help explains how to export the file from PVGIS |
| Battery | On/off, usable kWh, max charge and discharge kW, round-trip %, reserve %, rules "set from tariff" or "my own rules" (charge windows with target %, discharge windows with floor %, hold during charge windows) | Switching to own rules seeds them from the tariff-derived rules |
| Tariffs | Current import tariff, import tariff with the system, export tariff; custom import/export tariffs with standing charge and time bands | Each tariff shows its source badge: live Octopus rates (with date), fallback, or "your rates" |
| Costs and finance | Solar and battery cost, lifetime, maintenance, panel degradation, battery fade, battery and inverter life and replacement cost, import and export price rises | All editable |

### 3.2 Modeller outputs

- **Sticky summary**: year-one saving, payback, IRR, self-sufficiency.
- **Headline**: year-one saving, with the bill now vs with the system
  (including standing charges and export income).
- **Tiles**: solar generated (and % used at home), exported (and income),
  imported (and how much went to the battery), battery value per year and
  cycles, lifetime return and ROI, lost generation (clipped and over the export
  limit) when material.
- **Charts**: monthly electricity by source (solar direct, battery, grid);
  monthly bill now vs with the system; an average day for any month (home use,
  solar, grid import, export, and the battery level as a separate chart);
  lifetime cumulative cashflow with the payback point. The cashflow also has a
  year-by-year table.
- **Energy balance**: every flow for year one, plus the tariffs and battery
  rules in use.

### 3.3 Scenarios

- **Save**: the scenario goes to this browser's storage. Use **Open saved**
  to switch.
- **Compare**: up to four scenarios side by side (key figures, with the best
  in each row highlighted, plus lifetime cashflow lines). Each scenario keeps
  its colour while selected.
- **Share link**: the inputs are deflate-compressed and base64url-encoded into
  the URL fragment (`#/modeller?s=…`). Uploaded PVGIS files are too large for a
  URL, so a shared link falls back to the region's sample data and says so.
- **Export / Import**: a JSON bundle of the current and saved scenarios
  (uploaded files included).

## 4. Model and technicals

### 4.1 Time axis

The engine runs 8,760 hourly steps of a non-leap reference year (2025) in UTC.
Load profiles and tariff windows are evaluated in UK local time: BST runs
from 01:00 UTC on the last Sunday of March to 01:00 UTC on the last Sunday of
October. Monthly figures use local months. (`src/engine/time.js`)

### 4.2 Solar yield

- **Source**: PVGIS 5.3 hourly output (`P`, W), from either the user's file
  (CSV or JSON from the "Hourly data" tool) or a bundled sample. It is
  normalised to Wh per kWp using the file's nominal power.
- If a file has no `P` column, yield is estimated as `G(i) × (1 − losses)`,
  which ignores temperature effects. This is flagged in the UI.
- **Multi-year files**: the model uses the **median-yield year**, not an
  average. Averaging hides the cloudy and sunny days that drive battery
  behaviour. 29 February is dropped.
- **Bundled samples**: 4 locations × 5 facings at 35°, 14% system loss,
  PVGIS-SARAH3, median year of 2014–2023:
  - South (London 51.507, −0.128)
  - Midlands (Birmingham 52.486, −1.89)
  - North (Leeds 53.8, −1.549)
  - Scotland (Edinburgh 55.953, −3.189)

  Each region maps to its nearest sample location. (`src/engine/pvgis.js`)

### 4.3 Household load

Annual kWh is spread over the year by an **illustrative** hourly shape:
weekday and weekend weights by local hour, times a monthly seasonality factor
(Jan 1.25 … Jul 0.80 … Dec 1.22). The result is scaled to the annual total.
The night-heavy profile adds a flat block between 00:00 and 07:00 so that 40%
of annual use falls in that window. These shapes follow the usual UK domestic
pattern but are **not** Elexon profile coefficients (see section 7).
(`src/engine/load.js`, `UK_REFERENCE.loadProfiles`)

### 4.4 Tariffs

- A tariff resolves to either 48 half-hourly local-time prices (daily
  pattern) or an 8,760-value hourly series (Agile). Hourly prices are the mean
  of the hour's two half-hours.
- Custom tariffs are bands `{from, to, rate}` in local hours (half-hours
  allowed, wrapping past midnight). Later bands override earlier ones, and
  uncovered half-hours are rejected.
- **Live rates**: `data/tariffs/<region>.json`, one recent day's half-hourly
  unit rates and the standing charge (inc. VAT) per product and region.
- **Agile**: the previous 12 months of half-hourly prices, mapped onto the
  reference year by local month, day and hour. Gaps are filled from the same
  hour on the nearest day.
- **Fallback**: if a region file is missing, hand-entered approximate rates in
  `UK_REFERENCE.tariffs` are used and flagged "Fallback figures, not live rates".

(`src/engine/tariff.js`)

### 4.5 Battery rules from a tariff

When rules are set from the tariff, they are derived from the year's average
price for each local hour:

- **Charge from the grid**: only if the import tariff's cheapest hour is at
  least 5p below its daily mean. The window is the longest run of hours within
  1.5p of the minimum. Target 100%, and the battery is held (not discharged to
  the home) during the window.
- **Export from the battery**: only if the best export price beats the cost of
  stored energy (cheapest import ÷ round-trip efficiency) by at least 5p and
  export prices vary. The window is the longest run within 1p of the maximum,
  with a floor of 20%.
- Otherwise the battery does self-consumption only.

### 4.6 Hourly dispatch

In each hour (`src/engine/simulate.js`):

1. Solar serves the home (within the inverter's AC capacity for hybrids).
2. Surplus solar charges the battery, then exports. In a forced discharge
   window the order flips: export first, then store what cannot be exported.
3. Solar left over is lost: **clipped** when the inverter is the binding
   limit, **curtailed** when the export limit is.
4. The battery covers the remaining demand, down to its reserve, unless held
   during a charge window.
5. In a forced discharge window the battery also exports, down to the
   window's floor (never below the reserve).
6. In a forced charge window the battery charges from the grid up to the
   target.
7. The grid supplies whatever demand is left.

Further rules:

- **Rate limits**: charging (solar + grid) is capped at the max charge rate,
  and discharging (home + grid) at the max discharge rate.
- **Efficiency**: applied as √(round-trip) on charge and on discharge.
- **Hybrid (DC-coupled)**: one inverter caps solar and battery AC output
  together. Solar can charge the battery on the DC side, which captures
  generation above the inverter rating. Grid charging is also capped by the
  inverter rating.
- **AC-coupled**: the solar inverter clips at its rating, and the battery's
  own inverter is limited only by the charge and discharge rates.
- The battery starts the year at 50%.
- Energy is conserved: tests check that home use = solar → home + battery →
  home + grid → home, and that generation = direct use + to battery + export +
  clipped + curtailed.

### 4.7 Bills and savings

- **Bill** = import cost + standing charge × 365 − export income.
- **Baseline** = the same home with no system, on the current tariff.
- **Year-one saving** = baseline bill − bill with the system, on the new
  import and export tariffs.
- **Battery value** = bill with solar only − bill with solar and battery, both
  on the new tariffs.

### 4.8 Lifetime finance

For each year *y* = 1…N (`src/engine/scenario.js` `runLifetime`,
`src/engine/finance.js`):

- **Physical changes**: solar is scaled by (1 − degradation)^(y−1), and
  battery capacity by (1 − fade)^age. The battery's age resets every
  `batteryLifeYears`. The full hourly simulation is re-run for each year.
- **Prices**: import costs and standing charges rise by (1 + import
  inflation)^(y−1), and export income by (1 + export inflation)^(y−1). The
  baseline rises with import inflation.
- **Outlays**: maintenance every year. Battery replacement in years
  `batteryLifeYears + 1`, `2 × batteryLifeYears + 1`, …, and the inverter
  likewise. Replacement costs are in today's money.
- **Upfront cost** = solar cost (if any kWp) + battery cost (if a battery is
  included).
- **Payback** = the year in which cumulative net cashflow reaches zero,
  interpolated within that year.
- **IRR** is found by bisection on [−99%, 100%].
- **ROI** = total net return ÷ upfront cost.

### 4.9 Reference figures (`src/reference.js`, `UK_REFERENCE`, as of 2026-10-18)

| Figure | Value | Source |
|---|---|---|
| Typical annual use | 2,700 kWh | Ofgem typical domestic consumption value (medium electricity), 2023 review |
| Export limit default | 3.68 kW | ENA Engineering Recommendation G98 (16 A per phase, single phase) |
| Sample tilt / losses | 35° / 14% | PVGIS defaults for a typical pitched roof |
| Default system | 4 kWp, 5 kW hybrid inverter, 10 kWh usable battery at 5 kW, 90% round trip, 10% reserve | Illustrative |
| Default costs | Solar £6,000, battery £4,000, battery replaced after 15 years for £3,000, inverter after 12 years for £1,000 | Illustrative; use your quotes |
| Degradation / fade | 0.5% a year panels, 2% a year battery | Typical warranty figures |
| Price rises | Import 3% a year, export 2% a year | Assumptions, not forecasts |
| Live tariffs | Flexible Octopus, Octopus Go, Intelligent Octopus Go, Cosy Octopus, Octopus Flux import/export, Outgoing Octopus, Agile and Agile Outgoing | Octopus Energy public API, all 14 regions, see `data/manifest.json` for the fetch date |
| SEG default | 4.1p/kWh | Typical low Smart Export Guarantee rate; edit to your offer |

### 4.10 Reference data pipeline

`scripts/reference-data/fetch.mjs` (pure helpers in `lib.mjs`, unit-tested)
writes:

- `data/tariffs/<A–P>.json`: tariff presets and the Agile/Agile Outgoing
  series, each with product code, tariff code and date.
- `data/pvgis/<location>-<aspect>.json`: hourly Wh/kWp with the year used and
  every year's yield.
- `data/manifest.json`: fetch dates, what is available, and any errors.

It runs in GitHub Actions (`.github/workflows/reference-data.yml`):

- **Monthly and on manual dispatch**: opens a PR with the refreshed data.
- **On a push to a non-main branch that changes the fetcher**: commits the
  data to that branch.

The browser only ever loads these static files.

## 5. Architecture and verification

### 5.1 Architecture

| Path | Role |
|---|---|
| `index.html` | App shell, theme bootstrap, brand mark |
| `src/app.js` | Hash router (`#/`, `#/modeller`, `#/compare`, `#/about`), theme toggle, service worker registration |
| `src/engine/*` | Pure, DOM-free engine: `time`, `pvgis`, `load`, `tariff`, `simulate`, `finance`, `scenario` |
| `src/reference.js` | `UK_REFERENCE`: every reference figure, dated and cited |
| `src/data.js` | Loads `data/` JSON for a scenario |
| `src/state.js`, `src/storage.js` | Current scenario, saved scenarios, export/import, share links |
| `src/ui/*` | DOM helpers, Chart.js wrapper, pages |
| `styles/app.css` | Design system: tokens (light and dark), components, layout |
| `vendor/chart.umd.min.js` | Chart.js 4.5.0 (MIT) |
| `assets/fonts/` | Inter variable (OFL) |
| `sw.js`, `manifest.webmanifest`, `assets/icons/` | PWA |

**Design system**:

- Calm "data-app" look: neutral warm-grey surfaces, one warm accent
  (`--accent`, burnt orange in light mode and soft orange in dark), Inter,
  light and dark themes (system default plus a manual toggle).
- Charts follow the house data-viz specs: validated categorical slots in fixed
  order (grid = blue, solar = orange, battery = aqua, fourth = amber), ≤ 24px
  bars with 4px rounded data-ends, 2px surface gaps in stacks, 2px lines,
  hairline grid, HTML legends, themed tooltips, no dual axes.

### 5.2 Build and release

- No build step. `npm test` runs `node --test`, with no dependencies.
- `.github/workflows/test.yml` runs the tests on every PR and on `main`, and
  checks that `data/` files are valid JSON.
- `.github/workflows/pages.yml` deploys the site on every push to `main`.
  It needs a one-time setting: Settings → Pages → Source: GitHub Actions.
- The reference-data workflow needs a one-time setting for its monthly PR:
  Settings → Actions → General → "Allow GitHub Actions to create and approve
  pull requests".
- **Service worker**: bump `CACHE` in `sw.js` on every deploy-worthy change.
  The app shell is cache-first; `data/` is network-first with a cache fallback.

### 5.3 Performance notes

- One year's simulation takes about 1–2 ms.
- A full Modeller run (baseline, system, solar-only and 25 lifetime years)
  takes about 40 ms in Node and is debounced 200 ms behind input.
- Data per region is about 100 KB, and sample files about 25 KB each, loaded
  on demand.

### 5.4 Verification checklist

- [ ] `npm test` passes: engine invariants (energy balance, reserve, rates,
  clipping, DC capture, windows), tariffs, BST, PVGIS parsing, finance and
  reference-data helpers.
- [ ] The Modeller renders results on first load with no input (bundled data).
- [ ] Uploading a PVGIS CSV sets kWp from the file and shows the year and
  yield.
- [ ] Switching tariffs updates the badges, the derived battery rules and the
  results. Agile shows its date range.
- [ ] Custom tariff bands and custom battery windows are honoured.
- [ ] Save, Open saved, Compare (≤ 4), Share link round trip, Export/Import
  all work.
- [ ] Light and dark themes; no horizontal scroll at 360px.
- [ ] The app installs and reloads offline.

## 6. Privacy and data

Data stays on the device:

- No accounts, cookies, analytics or third-party requests at run time.
- Scenarios and uploaded files live in `localStorage`. They leave the device
  only when the user exports a file or copies a share link (inputs in the URL
  fragment, never sent to a server).
- The only theme preference stored is `ep.theme`.

## 7. Known limitations

- **Load shape is illustrative**, not Elexon profile coefficients or the
  user's meter data. Real days vary more, so real self-consumption is usually
  somewhat lower. Smart-meter upload is out of scope for 001.
- **Hourly steps**: tariff windows starting on the half-hour (e.g. 23:30)
  give a blended price for that hour.
- **Fixed daily battery windows**: Agile is modelled with the same windows
  every day (derived from the average day), not a daily optimiser.
- Tariffs are held constant apart from inflation. Tariffs that change by day
  (other than Agile) are taken from one recent day.
- Shading, snow and faults are not modelled beyond PVGIS system losses.
  Temperature is ignored when only irradiance is provided.
- The battery starts the year at 50% charge, and there is no calendar ageing
  beyond the fade rate.
