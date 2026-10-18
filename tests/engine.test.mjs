import test from 'node:test';
import assert from 'node:assert/strict';

import { HOURS, bstRange, timeAxis, hourOfYearLocal, hourOfYearUtc, inWindow, ukLocal } from '../src/engine/time.js';
import { hourlyLoad } from '../src/engine/load.js';
import { bandCovers, bandsToHalfHourly, defaultRules, hourlyPrices, resolveBands, dailyHourly } from '../src/engine/tariff.js';
import { simulate } from '../src/engine/simulate.js';
import { irr, npv, paybackYears, cashflowTable } from '../src/engine/finance.js';
import { parsePvgisCsv, parsePvgisJson, typicalYear } from '../src/engine/pvgis.js';
import { constant, near, sum } from './helpers.mjs';

// --- time -----------------------------------------------------------------

test('BST runs from the last Sunday of March to the last Sunday of October', () => {
  const [s, e] = bstRange(2025);
  assert.equal(new Date(s).toISOString(), '2025-03-30T01:00:00.000Z');
  assert.equal(new Date(e).toISOString(), '2025-10-26T01:00:00.000Z');
  assert.equal(ukLocal(Date.UTC(2025, 6, 1, 12)).hour, 13);
  assert.equal(ukLocal(Date.UTC(2025, 0, 1, 12)).hour, 12);
});

test('time axis covers 8,760 hours with local hours shifted in summer', () => {
  const ax = timeAxis();
  assert.equal(ax.localHour.length, HOURS);
  const july1noonUtc = hourOfYearUtc(6, 1, 12);
  assert.equal(ax.localHour[july1noonUtc], 13);
  assert.equal(ax.month[july1noonUtc], 6);
  assert.equal(hourOfYearUtc(1, 29, 0), -1);
});

test('local index skips the missing spring-forward hour', () => {
  assert.equal(hourOfYearLocal(2, 30, 1), -1); // 01:00 local does not exist on 30 March 2025
  assert.equal(hourOfYearLocal(6, 1, 13), hourOfYearUtc(6, 1, 12));
});

test('windows wrap past midnight', () => {
  assert.ok(inWindow(23, 22, 5));
  assert.ok(inWindow(2, 22, 5));
  assert.ok(!inWindow(5, 22, 5));
  assert.ok(!inWindow(3, 4, 4));
});

// --- load -----------------------------------------------------------------

test('hourly load sums to the annual total for each profile', () => {
  for (const p of ['out', 'home', 'night']) {
    const l = hourlyLoad(3200, p);
    assert.ok(near(sum(l), 3200), p);
  }
});

test('night-heavy profile puts 40% of use before 07:00', () => {
  const l = hourlyLoad(4000, 'night');
  const { localHour } = timeAxis();
  let night = 0;
  for (let h = 0; h < HOURS; h++) if (localHour[h] < 7) night += l[h];
  assert.ok(near(night / 4000, 0.4, 1e-9));
});

// --- tariffs --------------------------------------------------------------

test('bands cover half-hours, wrap, and later bands win', () => {
  assert.ok(bandCovers(23.5, 23.5, 5.5));
  assert.ok(bandCovers(5, 23.5, 5.5));
  assert.ok(!bandCovers(5.5, 23.5, 5.5));
  assert.ok(bandCovers(12, 0, 24));
  const hh = bandsToHalfHourly([{ from: 0, to: 24, rate: 30 }, { from: 0.5, to: 5.5, rate: 8 }]);
  assert.equal(hh[0], 30);
  assert.equal(hh[1], 8);
  assert.equal(hh[10], 8);
  assert.equal(hh[11], 30);
  const hourly = dailyHourly(hh);
  assert.equal(hourly[0], 19); // 00:00-00:30 at 30p, 00:30-01:00 at 8p
});

test('uncovered bands are rejected', () => {
  assert.throws(() => bandsToHalfHourly([{ from: 0, to: 12, rate: 10 }]), /12:00 uncovered/);
});

test('daily tariffs follow local time across BST', () => {
  const t = resolveBands({ standingChargeP: 0, bands: [{ from: 0, to: 24, rate: 20 }, { from: 2, to: 5, rate: 5 }] });
  const p = hourlyPrices(t);
  assert.equal(p[hourOfYearLocal(0, 15, 2)], 5);
  assert.equal(p[hourOfYearLocal(6, 15, 2)], 5);
  assert.equal(p[hourOfYearUtc(6, 15, 4)], 20); // 05:00 local in July
});

test('default rules: charge in a cheap window, discharge into a high export peak', () => {
  const flux = hourlyPrices(resolveBands({ bands: [{ from: 0, to: 24, rate: 27 }, { from: 2, to: 5, rate: 16 }, { from: 16, to: 19, rate: 38 }] }));
  const fluxExp = hourlyPrices(resolveBands({ bands: [{ from: 0, to: 24, rate: 16.5 }, { from: 2, to: 5, rate: 6 }, { from: 16, to: 19, rate: 29 }] }));
  const r = defaultRules(flux, fluxExp, 90);
  assert.deepEqual(r.forcedCharge, [{ from: 2, to: 5, targetPct: 100 }]);
  assert.deepEqual(r.forcedDischarge, [{ from: 16, to: 19, minPct: 20 }]);
  const flat = hourlyPrices(resolveBands({ bands: [{ from: 0, to: 24, rate: 25 }] }));
  const seg = hourlyPrices(resolveBands({ bands: [{ from: 0, to: 24, rate: 15 }] }));
  const r2 = defaultRules(flat, seg, 90);
  assert.deepEqual(r2.forcedCharge, []);
  assert.deepEqual(r2.forcedDischarge, []);
});

// --- simulation -----------------------------------------------------------

const zero = constant(0);
const flat = (v) => constant(v);

function balance(sim) {
  const t = sim.totals;
  // Every kWh of demand is met, and every kWh of solar is accounted for.
  assert.ok(near(t.pvToLoad + t.battToLoad + t.gridToLoad, t.load, 1e-9), 'load balance');
  assert.ok(near(t.pvToLoad + t.pvToBatt + t.pvExport + t.clipped + t.curtailed, t.pv, 1e-9), 'pv balance');
  assert.ok(near(t.import, t.gridToLoad + t.gridToBatt, 1e-9));
  assert.ok(near(t.export, t.pvExport + t.battToGrid, 1e-9));
}

test('no solar, no battery: everything is imported', () => {
  const sim = simulate({ pv: zero, load: flat(0.5), importPrices: flat(20), exportPrices: zero, system: { inverterKw: 5 }, battery: null });
  assert.ok(near(sim.totals.import, 0.5 * HOURS));
  assert.ok(near(sim.totals.importCostP, 0.5 * HOURS * 20));
  balance(sim);
});

test('solar only: direct use first, surplus exported up to the export limit', () => {
  const sim = simulate({ pv: flat(3), load: flat(1), importPrices: flat(20), exportPrices: flat(10), system: { inverterKw: 5, exportLimitKw: 1.5 }, battery: null });
  assert.ok(near(sim.totals.pvToLoad, HOURS));
  assert.ok(near(sim.totals.pvExport, 1.5 * HOURS));
  assert.ok(near(sim.totals.curtailed, 0.5 * HOURS));
  assert.equal(sim.totals.import, 0);
  balance(sim);
});

test('AC-coupled inverter clips solar above its rating', () => {
  const sim = simulate({ pv: flat(6), load: flat(1), importPrices: flat(20), exportPrices: flat(10), system: { inverterKw: 4 }, battery: null });
  assert.ok(near(sim.totals.clipped, 2 * HOURS));
  assert.ok(near(sim.totals.pvExport, 3 * HOURS));
  balance(sim);
});

test('hybrid inverter stores solar above its AC rating on the DC side', () => {
  const pv = new Float64Array(HOURS);
  pv[100] = 7; // one big hour
  const battery = { capacityKwh: 10, maxChargeKw: 5, maxDischargeKw: 5, roundTripPct: 100, reservePct: 0, initialSocPct: 0 };
  const hybrid = simulate({ pv, load: zero, importPrices: flat(20), exportPrices: flat(10), system: { inverterKw: 3, hybrid: true }, battery, detail: true });
  // 5 kWh goes to the battery (charge-rate limit), 2 kWh exports (inside the 3 kW AC limit).
  assert.ok(near(hybrid.hourly.pvToBatt[100], 5));
  assert.ok(near(hybrid.hourly.pvExport[100], 2));
  assert.equal(hybrid.hourly.clipped[100], 0);
  pv[100] = 10;
  const big = simulate({ pv, load: zero, importPrices: flat(20), exportPrices: flat(10), system: { inverterKw: 3, hybrid: true }, battery, detail: true });
  assert.ok(near(big.hourly.pvToBatt[100], 5));
  assert.ok(near(big.hourly.pvExport[100], 3));
  assert.ok(near(big.hourly.clipped[100], 2));
  balance(big);
});

test('battery shifts surplus solar to the evening and respects the reserve', () => {
  const { localHour } = timeAxis();
  const pv = new Float64Array(HOURS);
  const load = new Float64Array(HOURS);
  for (let h = 0; h < HOURS; h++) {
    if (localHour[h] >= 10 && localHour[h] < 14) pv[h] = 2;
    if (localHour[h] >= 18 && localHour[h] < 22) load[h] = 1;
  }
  const battery = { capacityKwh: 5, maxChargeKw: 3, maxDischargeKw: 3, roundTripPct: 81, reservePct: 20, initialSocPct: 20 };
  const sim = simulate({ pv, load, importPrices: flat(30), exportPrices: flat(5), system: { inverterKw: 5, hybrid: true }, battery, detail: true });
  balance(sim);
  const minSoc = Math.min(...sim.hourly.soc);
  assert.ok(minSoc >= 1 - 1e-9, `soc fell below reserve: ${minSoc}`);
  assert.ok(Math.max(...sim.hourly.soc) <= 5 + 1e-9);
  // Usable 4 kWh stored, 0.9 x 0.9 round trip => 4 * 0.9 = 3.6 kWh out per day
  assert.ok(sim.totals.battToLoad > 3.5 * 365 && sim.totals.battToLoad < 3.61 * 365);
});

test('forced charge window imports to the target; hold stops discharge during it', () => {
  const battery = {
    capacityKwh: 10, maxChargeKw: 5, maxDischargeKw: 5, roundTripPct: 100, reservePct: 0, initialSocPct: 0,
    forcedCharge: [{ from: 2, to: 5, targetPct: 80 }], forcedDischarge: [], holdInChargeWindow: true,
  };
  const sim = simulate({ pv: zero, load: flat(0.5), importPrices: flat(20), exportPrices: zero, system: { inverterKw: 5, hybrid: true }, battery, detail: true });
  balance(sim);
  const { localHour } = timeAxis();
  for (let h = 48; h < 72; h++) {
    if (localHour[h] >= 2 && localHour[h] < 5) assert.equal(sim.hourly.battToLoad[h], 0);
    if (localHour[h] === 5) assert.ok(near(sim.hourly.soc[h - 1], 8));
  }
});

test('forced discharge exports down to the window floor', () => {
  const battery = {
    capacityKwh: 10, maxChargeKw: 5, maxDischargeKw: 2, roundTripPct: 100, reservePct: 0, initialSocPct: 100,
    forcedCharge: [], forcedDischarge: [{ from: 16, to: 19, minPct: 50 }],
  };
  const sim = simulate({ pv: zero, load: zero, importPrices: flat(20), exportPrices: flat(30), system: { inverterKw: 5, hybrid: true, exportLimitKw: 3.68 }, battery, detail: true });
  // first evening: 3 hours at 2 kW until 50% (5 kWh) is reached => 5 kWh in total
  assert.ok(near(sim.totals.battToGrid, 5));
  balance(sim);
});

// --- finance --------------------------------------------------------------

test('IRR, NPV and payback', () => {
  const flows = [-1000, 300, 300, 300, 300, 300];
  const r = irr(flows);
  assert.ok(Math.abs(npv(r, flows)) < 1e-6);
  assert.ok(near(r, 0.1524, 1e-3));
  assert.ok(near(paybackYears(flows), 3 + 100 / 300));
  assert.equal(paybackYears([-1000, 10, 10]), null);
  assert.equal(irr([-1000, 10, 10]), irr([-1000, 10, 10])); // stable
  const t = cashflowTable(1000, [{ year: 1, saving: 600, outlay: 0 }, { year: 2, saving: 600, outlay: 100 }]);
  assert.equal(t.totalReturn, 100);
  assert.equal(t.table[1].cumulative, 100);
});

// --- PVGIS parsing ----------------------------------------------------------

const CSV = `Latitude (decimal degrees):\t52.486
Longitude (decimal degrees):\t-1.890
Elevation (m):\t140
Radiation database:\tPVGIS-SARAH3


Slope: 35 deg.
Azimuth: 0 deg.
Nominal power of the PV system (c-Si) (kWp):\t4.0
System losses (%):\t14.0
time,P,G(i),H_sun,T2m,WS10m,Int
20200101:0010,0.0,0.0,0.0,4.93,3.31,0.0
20200101:1210,1200.0,350.0,13.0,6.1,2.2,0.0
20200229:1210,999.0,350.0,13.0,6.1,2.2,0.0
20210101:1210,2000.0,350.0,13.0,6.1,2.2,0.0

P: PV system power (W)
`;

test('PVGIS CSV: metadata, per-kWp scaling, leap day dropped, years split', () => {
  const p = parsePvgisCsv(CSV);
  assert.equal(p.meta.kwp, 4);
  assert.equal(p.meta.slope, 35);
  assert.equal(p.meta.database, 'PVGIS-SARAH3');
  assert.equal(p.years.length, 2);
  assert.equal(p.years[0].year, 2020);
  assert.equal(p.years[0].wh[12], 300); // 1200 W / 4 kWp
  assert.equal(sum(p.years[0].wh), 300); // 29 Feb dropped
  assert.equal(typicalYear(p).year, 2020); // median of two = lower
});

test('PVGIS JSON with irradiance only falls back to G(i) x (1 - losses)', () => {
  const p = parsePvgisJson({
    inputs: { pv_module: { peak_power: 2, system_loss: 10 } },
    outputs: { hourly: [{ time: '20190601:1110', 'G(i)': 800 }] },
  });
  assert.ok(p.meta.estimatedFromIrradiance);
  assert.ok(near(p.years[0].wh[hourOfYearUtc(5, 1, 11)], 720));
});

test('PVGIS CSV without a header is rejected with a helpful message', () => {
  assert.throws(() => parsePvgisCsv('hello'), /time,/);
});
