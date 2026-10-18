import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultScenario, runScenario, requiredSamples, resolveTariff, sampleKey } from '../src/engine/scenario.js';
import { syntheticWhPerKwp, near } from './helpers.mjs';

const wh = syntheticWhPerKwp();
const data = { samples: { [sampleKey('south', 'S')]: { whPerKwp: wh } }, tariffs: {} };

test('default scenario runs on fallback tariffs and saves money', () => {
  const s = defaultScenario('C');
  assert.deepEqual(requiredSamples(s), ['south-S']);
  const t0 = performance.now();
  const r = runScenario(s, data);
  const ms = performance.now() - t0;
  assert.equal(r.tariffs.proposedImport.source.type, 'fallback');
  assert.ok(r.annualSaving > 0, `saving ${r.annualSaving}`);
  assert.ok(r.batteryValue > 0, 'battery adds value on Flux');
  assert.equal(r.lifetime.table.length, 25);
  assert.ok(r.lifetime.capex === 10000);
  assert.ok(r.lifetime.paybackYears > 0 && r.lifetime.paybackYears < 25);
  assert.ok(r.lifetime.irr > 0);
  // Flux rules derived from the tariff shape.
  assert.deepEqual(r.rules.forcedCharge, [{ from: 2, to: 5, targetPct: 100 }]);
  assert.ok(ms < 2000, `runScenario took ${ms} ms`);
});

test('battery replacement and inverter replacement show as outlays', () => {
  const s = defaultScenario('C');
  const r = runScenario(s, data);
  const y13 = r.lifetime.table.find((row) => row.year === 13);
  const y16 = r.lifetime.table.find((row) => row.year === 16);
  assert.deepEqual(y13.notes, ['Inverter replaced']);
  assert.ok(y16.notes.includes('Battery replaced'));
  assert.equal(y16.outlay, s.finance.batteryReplaceCost);
});

test('removing the battery drops its cost and its value', () => {
  const s = defaultScenario('C');
  s.battery.enabled = false;
  const r = runScenario(s, data);
  assert.equal(r.lifetime.capex, s.finance.solarCost);
  assert.ok(near(r.batteryValue, 0));
});

test('custom tariffs and custom battery rules are honoured', () => {
  const s = defaultScenario('C');
  s.tariffs.proposedImport = 'custom-import';
  s.tariffs.custom['custom-import'] = { name: 'Night saver', standingChargeP: 40, bands: [{ from: 0, to: 24, rate: 30 }, { from: 0, to: 4, rate: 7 }] };
  s.battery.rulesMode = 'custom';
  s.battery.forcedCharge = [{ from: 0, to: 4, targetPct: 90 }];
  s.battery.forcedDischarge = [];
  s.battery.holdInChargeWindow = true;
  const r = runScenario(s, data);
  assert.equal(r.tariffs.proposedImport.name, 'Night saver');
  assert.deepEqual(r.rules.forcedCharge, [{ from: 0, to: 4, targetPct: 90 }]);
  assert.ok(r.withSystem.sim.totals.gridToBatt > 0);
});

test('Agile needs bundled history; with it the series is used', () => {
  const s = defaultScenario('C');
  assert.throws(() => resolveTariff('agile', s, data), /price history/);
  const hourly = new Array(8760).fill(20);
  const t = resolveTariff('agile', s, { tariffs: { agile: { kind: 'series', hourly, standingChargeP: 50 } } });
  assert.equal(t.kind, 'series');
});

test('uploaded arrays use their own yield and scale by kWp', () => {
  const s = defaultScenario('C');
  s.arrays = [
    { label: 'East', kwp: 2, source: { type: 'upload', name: 'east.csv', whPerKwp: wh } },
    { label: 'West', kwp: 2, source: { type: 'upload', name: 'west.csv', whPerKwp: wh } },
  ];
  const r = runScenario(s, { tariffs: {} });
  const one = runScenario(defaultScenario('C'), data);
  assert.ok(near(r.withSystem.sim.totals.pv, one.withSystem.sim.totals.pv));
});
