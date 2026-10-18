# Changelog

One entry per requirement, under a dated heading (the date the PR merges),
naming the intent file it implements.

## 2026-10-18

- **Solar suite foundation and Modeller** (`intent/done/001-solar-suite-foundation.md`).
  Energy Pilot becomes a free, private UK solar and battery planner. It adds:
  - an hourly full-year engine: PVGIS yield, illustrative load profiles,
    tariffs including Agile, rule-based battery, clipping and DC-coupled
    capture, export limit
  - lifetime finance: degradation, fade, replacements, inflation, payback, IRR
  - the Modeller UI with live charts
  - saved scenarios, Compare, share links, JSON export/import
  - an installable offline PWA with a light/dark design system
  - a monthly GitHub Actions job that refreshes Octopus tariff rates,
    12-month Agile history and PVGIS samples into `data/`
  - test and GitHub Pages workflows

- Repository scaffold: README, CLAUDE.md, CONTRIBUTING.md, docs skeleton,
  `intent/` structure and agent skills copied from retirement-planner. No tool
  code yet.
