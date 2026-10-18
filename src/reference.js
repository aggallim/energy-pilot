// UK_REFERENCE: every reference figure the engine uses, dated and cited in
// one place, and mirrored in docs/TOOL_DOCUMENTATION.md section 4.
//
// Live tariff rates, Agile price history and sample solar yields are not
// typed in here. They come from dated JSON in data/, fetched by
// scripts/reference-data/fetch.mjs (see the reference-data workflow). The
// figures below are the defaults and the fallbacks.

export const UK_REFERENCE = {
  asOf: '2026-10-18',

  // Octopus Energy / DNO electricity regions (GSP groups).
  regions: {
    A: 'Eastern England',
    B: 'East Midlands',
    C: 'London',
    D: 'Merseyside & North Wales',
    E: 'West Midlands',
    F: 'North East England',
    G: 'North West England',
    H: 'Southern England',
    J: 'South East England',
    K: 'South Wales',
    L: 'South West England',
    M: 'Yorkshire',
    N: 'South Scotland',
    P: 'North Scotland',
  },

  // Household use. Ofgem's typical domestic consumption value (TDCV) for a
  // medium electricity user is 2,700 kWh a year.
  // Source: Ofgem, "Review of typical domestic consumption values" (2023).
  typicalAnnualKwh: 2700,

  // Illustrative hourly shapes (relative weights by local hour 00-23). They
  // follow the usual UK domestic pattern but are not Elexon coefficients.
  loadProfiles: {
    out: {
      label: 'Out during the day',
      weekday: [0.45, 0.38, 0.35, 0.33, 0.33, 0.36, 0.55, 0.95, 0.95, 0.7, 0.55, 0.5, 0.52, 0.5, 0.5, 0.58, 0.8, 1.15, 1.35, 1.3, 1.15, 1.0, 0.8, 0.6],
      weekend: [0.5, 0.42, 0.38, 0.35, 0.34, 0.35, 0.42, 0.6, 0.85, 1.0, 1.0, 0.95, 0.95, 0.9, 0.85, 0.85, 0.95, 1.15, 1.3, 1.25, 1.1, 0.95, 0.8, 0.62],
    },
    home: {
      label: 'Home most of the day',
      weekday: [0.48, 0.4, 0.36, 0.34, 0.34, 0.36, 0.5, 0.8, 0.95, 0.95, 0.9, 0.92, 0.95, 0.88, 0.85, 0.88, 0.98, 1.15, 1.3, 1.25, 1.1, 0.95, 0.8, 0.6],
      weekend: [0.5, 0.42, 0.38, 0.35, 0.34, 0.35, 0.42, 0.6, 0.85, 1.0, 1.0, 0.95, 0.95, 0.9, 0.85, 0.85, 0.95, 1.15, 1.3, 1.25, 1.1, 0.95, 0.8, 0.62],
    },
    night: {
      label: 'Night-heavy (Economy 7 style)',
      weekday: [0.45, 0.38, 0.35, 0.33, 0.33, 0.36, 0.55, 0.95, 0.95, 0.7, 0.55, 0.5, 0.52, 0.5, 0.5, 0.58, 0.8, 1.15, 1.35, 1.3, 1.15, 1.0, 0.8, 0.6],
      weekend: [0.5, 0.42, 0.38, 0.35, 0.34, 0.35, 0.42, 0.6, 0.85, 1.0, 1.0, 0.95, 0.95, 0.9, 0.85, 0.85, 0.95, 1.15, 1.3, 1.25, 1.1, 0.95, 0.8, 0.62],
      nightShare: 0.4, // share of annual use between 00:00 and 07:00
    },
  },
  // Monthly multiplier on the daily shape (Jan-Dec): higher use in winter.
  loadSeasonality: [1.25, 1.18, 1.08, 0.97, 0.88, 0.82, 0.8, 0.82, 0.88, 0.98, 1.12, 1.22],

  // Bundled sample yields: PVGIS hourly output per kWp, fetched by the
  // reference-data script. Source: European Commission JRC, PVGIS 5.3,
  // https://re.jrc.ec.europa.eu/pvg_tools/en/ (seriescalc API).
  samplePv: {
    tilt: 35,
    lossesPct: 14,
    locations: {
      south: { label: 'South England (London)', lat: 51.507, lon: -0.128 },
      midlands: { label: 'Midlands (Birmingham)', lat: 52.486, lon: -1.89 },
      north: { label: 'North England (Leeds)', lat: 53.8, lon: -1.549 },
      scotland: { label: 'Scotland (Edinburgh)', lat: 55.953, lon: -3.189 },
    },
    // PVGIS azimuth convention: 0 = south, -90 = east, 90 = west.
    aspects: { S: 0, SE: -45, SW: 45, E: -90, W: 90 },
  },
  // Default sample per region (nearest of the four sample locations).
  regionSample: { A: 'south', B: 'midlands', C: 'south', D: 'north', E: 'midlands', F: 'north', G: 'north', H: 'south', J: 'south', K: 'south', L: 'south', M: 'north', N: 'scotland', P: 'scotland' },

  // Tariff presets. Live rates come from data/tariffs/<region>.json (Octopus
  // Energy public API). `fallback` bands are used only when that file is
  // missing: approximate late-2025 figures entered by hand, not live rates.
  tariffs: {
    flexible: {
      name: 'Flexible Octopus (variable, price-cap tracker)',
      direction: 'import',
      match: ['VAR-'],
      fallback: { standingChargeP: 51, bands: [{ from: 0, to: 24, rate: 24.5 }] },
    },
    go: {
      name: 'Octopus Go',
      direction: 'import',
      match: ['GO-VAR-', 'GO-'],
      fallback: { standingChargeP: 51, bands: [{ from: 0.5, to: 5.5, rate: 8.5 }, { from: 5.5, to: 24.5, rate: 27 }] },
    },
    intelligent: {
      name: 'Intelligent Octopus Go',
      direction: 'import',
      match: ['INTELLI-VAR-', 'INTELLI-'],
      fallback: { standingChargeP: 51, bands: [{ from: 23.5, to: 5.5, rate: 7 }, { from: 5.5, to: 23.5, rate: 27 }] },
    },
    cosy: {
      name: 'Cosy Octopus',
      direction: 'import',
      match: ['COSY-'],
      fallback: {
        standingChargeP: 51,
        bands: [
          { from: 0, to: 4, rate: 25 }, { from: 4, to: 7, rate: 13 }, { from: 7, to: 13, rate: 25 },
          { from: 13, to: 16, rate: 13 }, { from: 16, to: 19, rate: 37 }, { from: 19, to: 22, rate: 25 },
          { from: 22, to: 24, rate: 13 },
        ],
      },
    },
    flux: {
      name: 'Octopus Flux (import)',
      direction: 'import',
      match: ['FLUX-IMPORT-'],
      fallback: { standingChargeP: 51, bands: [{ from: 2, to: 5, rate: 16 }, { from: 5, to: 16, rate: 27 }, { from: 16, to: 19, rate: 38 }, { from: 19, to: 26, rate: 27 }] },
    },
    agile: {
      name: 'Octopus Agile (import)',
      direction: 'import',
      series: true, // half-hourly prices from data/agile/
    },
    'flux-export': {
      name: 'Octopus Flux (export)',
      direction: 'export',
      match: ['FLUX-EXPORT-'],
      fallback: { standingChargeP: 0, bands: [{ from: 2, to: 5, rate: 6 }, { from: 5, to: 16, rate: 16.5 }, { from: 16, to: 19, rate: 29 }, { from: 19, to: 26, rate: 16.5 }] },
    },
    outgoing: {
      name: 'Outgoing Octopus (fixed export)',
      direction: 'export',
      match: ['OUTGOING-VAR-', 'OUTGOING-FIX-', 'OUTGOING-'],
      fallback: { standingChargeP: 0, bands: [{ from: 0, to: 24, rate: 15 }] },
    },
    'agile-export': {
      name: 'Agile Outgoing (export)',
      direction: 'export',
      series: true,
    },
    seg: {
      name: 'Basic Smart Export Guarantee',
      direction: 'export',
      // A typical low SEG rate from the larger suppliers; edit to your offer.
      fallback: { standingChargeP: 0, bands: [{ from: 0, to: 24, rate: 4.1 }] },
    },
    none: {
      name: 'No export payment',
      direction: 'export',
      fallback: { standingChargeP: 0, bands: [{ from: 0, to: 24, rate: 0 }] },
    },
  },

  // Hardware defaults (illustrative typical UK domestic system).
  defaults: {
    arrayKwp: 4,
    inverterKw: 5,
    // ENA G98 limit for a single-phase connection without DNO application
    // is 16 A per phase, about 3.68 kW. Source: ENA Engineering Recommendation G98.
    exportLimitKw: 3.68,
    batteryKwh: 10,
    batteryKw: 5,
    roundTripPct: 90,
    reservePct: 10,
  },

  // Lifetime finance defaults: editable assumptions, not forecasts.
  finance: {
    lifetimeYears: 25,
    solarCost: 6000, // 4 kWp installed, illustrative
    batteryCost: 4000, // 10 kWh added at the same install, illustrative
    panelDegradationPct: 0.5, // per year; typical manufacturer linear warranty figure
    batteryFadePct: 2, // capacity loss per year
    batteryLifeYears: 15, // replaced after this many years
    batteryReplaceCost: 3000,
    inverterLifeYears: 12,
    inverterReplaceCost: 1000,
    importInflationPct: 3,
    exportInflationPct: 2,
    maintenancePerYear: 0,
  },
};

export const REGION_CODES = Object.keys(UK_REFERENCE.regions);
