// A scenario is a plain, JSON-serialisable description of a home, a system
// and its tariffs. runScenario turns one into results using the reference
// data the UI has loaded (sample solar yields and resolved tariffs).

import { HOURS } from './time.js';
import { hourlyLoad } from './load.js';
import { simulate } from './simulate.js';
import { defaultRules, hourlyPrices, resolveBands } from './tariff.js';
import { cashflowTable } from './finance.js';
import { UK_REFERENCE } from '../reference.js';

export const SCENARIO_VERSION = 1;

export function defaultScenario(region = 'C') {
  const d = UK_REFERENCE.defaults;
  return {
    v: SCENARIO_VERSION,
    name: 'My home',
    region,
    arrays: [
      { label: 'Main roof', kwp: d.arrayKwp, source: { type: 'sample', location: UK_REFERENCE.regionSample[region], aspect: 'S' } },
    ],
    inverterKw: d.inverterKw,
    hybrid: true,
    exportLimitKw: d.exportLimitKw,
    annualKwh: UK_REFERENCE.typicalAnnualKwh,
    profile: 'out',
    battery: {
      enabled: true,
      capacityKwh: d.batteryKwh,
      maxChargeKw: d.batteryKw,
      maxDischargeKw: d.batteryKw,
      roundTripPct: d.roundTripPct,
      reservePct: d.reservePct,
      rulesMode: 'auto',
      forcedCharge: [],
      forcedDischarge: [],
      holdInChargeWindow: false,
    },
    tariffs: {
      currentImport: 'flexible',
      proposedImport: 'flux',
      proposedExport: 'flux-export',
      custom: {
        'custom-import': { name: 'Custom import', standingChargeP: 50, bands: [{ from: 0, to: 24, rate: 25 }] },
        'custom-export': { name: 'Custom export', standingChargeP: 0, bands: [{ from: 0, to: 24, rate: 15 }] },
      },
    },
    finance: { ...UK_REFERENCE.finance },
  };
}

export const sampleKey = (location, aspect) => `${location}-${aspect}`;

export function requiredSamples(s) {
  return [...new Set(s.arrays.filter((a) => a.source.type === 'sample').map((a) => sampleKey(a.source.location, a.source.aspect)))];
}

export function requiredTariffs(s) {
  const t = s.tariffs;
  return [...new Set([t.currentImport, t.proposedImport, t.proposedExport])];
}

export function tariffName(id, s) {
  if (id.startsWith('custom')) return s.tariffs.custom[id]?.name || 'Custom';
  return UK_REFERENCE.tariffs[id]?.name || id;
}

// Resolve a tariff id to prices. Live data for the region wins; otherwise the
// hand-entered fallback is used and flagged so the UI can say so.
export function resolveTariff(id, s, data) {
  if (id.startsWith('custom')) {
    const def = s.tariffs.custom[id];
    if (!def) throw new Error(`Missing custom tariff ${id}`);
    return { ...resolveBands(def), name: def.name, source: { type: 'custom' } };
  }
  const ref = UK_REFERENCE.tariffs[id];
  if (!ref) throw new Error(`Unknown tariff ${id}`);
  const live = data?.tariffs?.[id];
  if (live) return { ...live, name: ref.name };
  if (ref.series) throw new Error(`${ref.name} needs the bundled price history, which is not available yet.`);
  return { ...resolveBands(ref.fallback), name: ref.name, source: { type: 'fallback' } };
}

export function arraySeries(arr, data) {
  let whPerKwp;
  if (arr.source.type === 'upload') whPerKwp = arr.source.whPerKwp;
  else {
    const sample = data?.samples?.[sampleKey(arr.source.location, arr.source.aspect)];
    if (!sample) throw new Error(`Sample solar data for ${arr.source.location} ${arr.source.aspect} is not loaded.`);
    whPerKwp = sample.whPerKwp;
  }
  if (!whPerKwp || whPerKwp.length !== HOURS) throw new Error(`Solar data for "${arr.label}" must have 8,760 hourly values.`);
  const out = new Float64Array(HOURS);
  const k = arr.kwp / 1000;
  for (let h = 0; h < HOURS; h++) out[h] = whPerKwp[h] * k;
  return out;
}

export function pvSeries(s, data) {
  const total = new Float64Array(HOURS);
  const perArray = s.arrays.map((a) => arraySeries(a, data));
  for (const arr of perArray) for (let h = 0; h < HOURS; h++) total[h] += arr[h];
  return { total, perArray };
}

function scaled(series, k) {
  if (k === 1) return series;
  const out = new Float64Array(series.length);
  for (let i = 0; i < series.length; i++) out[i] = series[i] * k;
  return out;
}

export function batteryRules(s, importPrices, exportPrices) {
  const b = s.battery;
  if (b.rulesMode === 'custom') {
    return { forcedCharge: b.forcedCharge, forcedDischarge: b.forcedDischarge, holdInChargeWindow: b.holdInChargeWindow };
  }
  return defaultRules(importPrices, exportPrices, b.roundTripPct);
}

function batteryFor(s, rules, capacityScale = 1) {
  const b = s.battery;
  if (!b.enabled || !(b.capacityKwh > 0)) return null;
  return {
    capacityKwh: b.capacityKwh * capacityScale,
    maxChargeKw: b.maxChargeKw,
    maxDischargeKw: b.maxDischargeKw,
    roundTripPct: b.roundTripPct,
    reservePct: b.reservePct,
    ...rules,
  };
}

function bill(sim, standingP) {
  const standing = standingP * 365;
  return {
    importCostP: sim.totals.importCostP,
    exportIncomeP: sim.totals.exportIncomeP,
    standingP: standing,
    netP: sim.totals.importCostP + standing - sim.totals.exportIncomeP,
  };
}

export function runScenario(s, data, { detail = true } = {}) {
  const load = hourlyLoad(s.annualKwh, s.profile);
  const pv = pvSeries(s, data);
  const tCur = resolveTariff(s.tariffs.currentImport, s, data);
  const tImp = resolveTariff(s.tariffs.proposedImport, s, data);
  const tExp = resolveTariff(s.tariffs.proposedExport, s, data);
  const curPrices = hourlyPrices(tCur);
  const impPrices = hourlyPrices(tImp);
  const expPrices = hourlyPrices(tExp);
  const zeros = new Float64Array(HOURS);
  const system = { inverterKw: s.inverterKw, hybrid: s.hybrid, exportLimitKw: s.exportLimitKw };
  const rules = batteryRules(s, impPrices, expPrices);

  const baselineSim = simulate({ pv: zeros, load, importPrices: curPrices, exportPrices: zeros, system, battery: null });
  const withSystem = simulate({ pv: pv.total, load, importPrices: impPrices, exportPrices: expPrices, system, battery: batteryFor(s, rules), detail });
  const solarOnly = simulate({ pv: pv.total, load, importPrices: impPrices, exportPrices: expPrices, system, battery: null });

  const baseBill = bill(baselineSim, tCur.standingChargeP);
  const sysBill = bill(withSystem, tImp.standingChargeP);
  const solarBill = bill(solarOnly, tImp.standingChargeP);

  const monthlyBills = Array.from({ length: 12 }, (_, m) => ({
    baseline: (baselineSim.monthly.importCostP[m] + (tCur.standingChargeP * 365) / 12) / 100,
    system: (withSystem.monthly.importCostP[m] + (tImp.standingChargeP * 365) / 12 - withSystem.monthly.exportIncomeP[m]) / 100,
  }));

  const lifetime = runLifetime(s, { load, pv: pv.total, impPrices, expPrices, system, rules, baseBill, tImp });

  return {
    tariffs: { current: tCur, proposedImport: tImp, proposedExport: tExp },
    rules,
    load,
    pv,
    prices: { current: curPrices, import: impPrices, export: expPrices },
    baseline: { sim: baselineSim, bill: baseBill },
    withSystem: { sim: withSystem, bill: sysBill },
    solarOnly: { sim: solarOnly, bill: solarBill },
    annualSaving: (baseBill.netP - sysBill.netP) / 100,
    batteryValue: (solarBill.netP - sysBill.netP) / 100,
    monthlyBills,
    lifetime,
  };
}

function capex(s) {
  const f = s.finance;
  const hasSolar = s.arrays.some((a) => a.kwp > 0);
  const hasBatt = s.battery.enabled && s.battery.capacityKwh > 0;
  return (hasSolar ? f.solarCost : 0) + (hasBatt ? f.batteryCost : 0);
}

// Year-by-year: re-simulate with degraded panels and a fading battery, then
// apply price inflation. Replacement costs are in today's money.
export function runLifetime(s, ctx) {
  const f = s.finance;
  const hasBatt = s.battery.enabled && s.battery.capacityKwh > 0;
  const rows = [];
  for (let y = 1; y <= f.lifetimeYears; y++) {
    const pvScale = (1 - f.panelDegradationPct / 100) ** (y - 1);
    const age = f.batteryLifeYears > 0 ? (y - 1) % f.batteryLifeYears : y - 1;
    const capScale = (1 - f.batteryFadePct / 100) ** age;
    const sim = simulate({
      pv: scaled(ctx.pv, pvScale),
      load: ctx.load,
      importPrices: ctx.impPrices,
      exportPrices: ctx.expPrices,
      system: ctx.system,
      battery: batteryFor(s, ctx.rules, capScale),
    });
    const ki = (1 + f.importInflationPct / 100) ** (y - 1);
    const ke = (1 + f.exportInflationPct / 100) ** (y - 1);
    const baseline = ctx.baseBill.netP * ki;
    const withSys = (sim.totals.importCostP + ctx.tImp.standingChargeP * 365) * ki - sim.totals.exportIncomeP * ke;
    let outlay = f.maintenancePerYear || 0;
    const notes = [];
    if (hasBatt && f.batteryLifeYears > 0 && y > 1 && (y - 1) % f.batteryLifeYears === 0) {
      outlay += f.batteryReplaceCost;
      notes.push('Battery replaced');
    }
    if (f.inverterLifeYears > 0 && y > 1 && (y - 1) % f.inverterLifeYears === 0) {
      outlay += f.inverterReplaceCost;
      notes.push('Inverter replaced');
    }
    rows.push({ year: y, saving: (baseline - withSys) / 100, outlay, notes, pvKwh: sim.totals.pv, exportKwh: sim.totals.export, importKwh: sim.totals.import });
  }
  return { capex: capex(s), ...cashflowTable(capex(s), rows) };
}
