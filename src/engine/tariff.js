// Tariffs: expand a tariff definition into hourly prices (p/kWh) for the
// reference year, and derive default battery rules from a tariff's shape.
//
// A resolved tariff is one of:
//   { kind: 'daily',  halfHourly: [48 x p/kWh, local time], standingChargeP }
//   { kind: 'series', hourly: [8760 x p/kWh], standingChargeP }
// Custom and fallback tariffs are written as bands: [{ from, to, rate }] in
// local hours (half-hours allowed, wrapping past midnight).

import { HOURS, timeAxis } from './time.js';

// Does local time t (hours) fall in [from, to), wrapping?
export function bandCovers(t, from, to) {
  const span = to - from;
  const len = span >= 24 ? 24 : (((span % 24) + 24) % 24) || (span !== 0 ? 24 : 0);
  const d = (((t - from) % 24) + 24) % 24;
  return d < len;
}

export function bandsToHalfHourly(bands) {
  const out = new Array(48).fill(null);
  for (let s = 0; s < 48; s++) {
    const t = s / 2;
    // Later bands win, so a custom builder can layer a cheap window over a base rate.
    for (const b of bands) if (bandCovers(t, b.from, b.to)) out[s] = b.rate;
  }
  if (out.some((v) => v === null)) {
    const missing = out.findIndex((v) => v === null);
    throw new Error(`Tariff bands leave ${String(Math.floor(missing / 2)).padStart(2, '0')}:${missing % 2 ? '30' : '00'} uncovered.`);
  }
  return out;
}

export function resolveBands(def) {
  return {
    kind: 'daily',
    halfHourly: bandsToHalfHourly(def.bands),
    standingChargeP: def.standingChargeP ?? 0,
  };
}

// 24 hourly prices from 48 half-hourly ones.
export function dailyHourly(halfHourly) {
  const out = new Array(24);
  for (let h = 0; h < 24; h++) out[h] = (halfHourly[2 * h] + halfHourly[2 * h + 1]) / 2;
  return out;
}

export function hourlyPrices(tariff) {
  if (tariff.kind === 'series') {
    if (tariff.hourly.length !== HOURS) throw new Error('Price series must have 8,760 hourly values.');
    return Float64Array.from(tariff.hourly);
  }
  const day = dailyHourly(tariff.halfHourly);
  const { localHour } = timeAxis();
  const out = new Float64Array(HOURS);
  for (let h = 0; h < HOURS; h++) out[h] = day[localHour[h]];
  return out;
}

// Average price for each local hour across the year.
export function averageDay(prices) {
  const { localHour } = timeAxis();
  const sum = new Array(24).fill(0);
  const n = new Array(24).fill(0);
  for (let h = 0; h < HOURS; h++) {
    sum[localHour[h]] += prices[h];
    n[localHour[h]]++;
  }
  return sum.map((s, i) => s / n[i]);
}

// Longest circular run of hours where pick(hour) is true, as [from, to).
function longestRun(pick) {
  const flags = Array.from({ length: 24 }, (_, h) => pick(h));
  if (flags.every(Boolean)) return null;
  let best = null;
  for (let start = 0; start < 24; start++) {
    if (!flags[start] || flags[(start + 23) % 24]) continue;
    let len = 0;
    while (len < 24 && flags[(start + len) % 24]) len++;
    if (!best || len > best.len) best = { from: start, to: (start + len) % 24, len };
  }
  return best;
}

// Default battery rules for a tariff pair. The rules stay transparent so a
// user can match them to their own inverter settings:
//  - Charge from the grid in the cheapest import window when the tariff has a
//    meaningful cheap window (at least 5p below its average).
//  - Discharge to the grid in the best export window when that export price
//    beats the cost of the stored energy by a margin.
export function defaultRules(importPrices, exportPrices, roundTripPct) {
  const imp = averageDay(importPrices);
  const exp = averageDay(exportPrices);
  const min = Math.min(...imp);
  const mean = imp.reduce((s, v) => s + v, 0) / 24;
  const rules = { forcedCharge: [], forcedDischarge: [], holdInChargeWindow: false };
  if (mean - min >= 5) {
    const run = longestRun((h) => imp[h] <= min + 1.5);
    if (run) {
      rules.forcedCharge.push({ from: run.from, to: run.to, targetPct: 100 });
      rules.holdInChargeWindow = true;
    }
  }
  const maxExp = Math.max(...exp);
  const storedCost = min / (roundTripPct / 100);
  if (maxExp - storedCost >= 5 && maxExp > Math.min(...exp) + 1) {
    const run = longestRun((h) => exp[h] >= maxExp - 1);
    if (run) rules.forcedDischarge.push({ from: run.from, to: run.to, minPct: 20 });
  }
  return rules;
}
