// Hourly energy-flow simulation of solar + battery + grid for one year.
//
// Each hour, in order:
//  1. Solar serves the home directly.
//  2. Surplus solar charges the battery, then exports (during a forced
//     discharge window: exports first, then charges with what can't export).
//  3. Solar that can't go anywhere is lost: "clipped" when the inverter is the
//     limit, "curtailed" when the export limit is.
//  4. The battery covers the remaining demand, unless it is held during a
//     forced charge window or already at its reserve.
//  5. In a forced discharge window the battery also exports, down to the
//     window's floor.
//  6. In a forced charge window the battery charges from the grid up to the
//     window's target.
//  7. The grid covers whatever demand is left.
//
// Inverter models:
//  - hybrid (DC-coupled): one inverter carries solar and battery output to AC,
//    so their sum is capped at inverterKw. Solar can charge the battery on the
//    DC side, which captures generation above the inverter limit.
//  - AC-coupled: the solar inverter caps solar output at inverterKw (the
//    excess is clipped) and the battery has its own inverter, capped only by
//    its charge and discharge rates.

import { HOURS, inWindow, timeAxis } from './time.js';

const FLOWS = [
  'pv', 'load', 'pvToLoad', 'pvToBatt', 'pvExport', 'battToLoad', 'battToGrid',
  'gridToLoad', 'gridToBatt', 'clipped', 'curtailed', 'import', 'export',
  'importCostP', 'exportIncomeP',
];

function activeWindow(windows, hour) {
  for (const w of windows || []) if (inWindow(hour, w.from, w.to)) return w;
  return null;
}

export function simulate({ pv, load, importPrices, exportPrices, system, battery, detail = false }) {
  const { localHour, month } = timeAxis();
  const inv = system.inverterKw > 0 ? system.inverterKw : Infinity;
  const hybrid = !!system.hybrid;
  const exportLimit = system.exportLimitKw > 0 ? system.exportLimitKw : Infinity;

  const hasBatt = !!battery && battery.capacityKwh > 0;
  const cap = hasBatt ? battery.capacityKwh : 0;
  const eta = hasBatt ? Math.sqrt(battery.roundTripPct / 100) : 1;
  const reserve = hasBatt ? (cap * battery.reservePct) / 100 : 0;
  const maxC = hasBatt ? battery.maxChargeKw : 0;
  const maxD = hasBatt ? battery.maxDischargeKw : 0;
  let soc = hasBatt ? Math.max(reserve, cap * ((battery.initialSocPct ?? 50) / 100)) : 0;

  const F = FLOWS.length;
  const acc = new Float64Array(12 * F); // monthly sums, flow-major within each month
  const hourly = detail
    ? Object.fromEntries([...FLOWS, 'soc'].map((k) => [k, new Float64Array(HOURS)]))
    : null;
  const row = new Float64Array(F);
  const forcedCharge = hasBatt ? battery.forcedCharge || [] : [];
  const forcedDischarge = hasBatt ? battery.forcedDischarge || [] : [];
  const hold = hasBatt && !!battery.holdInChargeWindow;

  for (let h = 0; h < HOURS; h++) {
    const hr = localHour[h];
    const demand = load[h];
    let g = pv[h];
    let clipped = 0;
    let curtailed = 0;
    let acRoom = hybrid ? inv : Infinity;
    if (!hybrid && g > inv) {
      clipped = g - inv;
      g = inv;
    }

    const chargeW = forcedCharge.length ? activeWindow(forcedCharge, hr) : null;
    const dischargeW = forcedDischarge.length ? activeWindow(forcedDischarge, hr) : null;

    const pvToLoad = Math.min(g, demand, acRoom);
    acRoom -= pvToLoad;
    let pvLeft = g - pvToLoad;
    let deficit = demand - pvToLoad;
    let expRoom = exportLimit;
    let chargeRoom = hasBatt ? Math.min(maxC, Math.max(0, cap - soc) / eta) : 0;
    let dischargeRoom = maxD;

    let pvToBatt = 0;
    let pvExport = 0;
    // Normal hours store surplus solar before exporting it; forced discharge
    // hours export first and store only what cannot be exported.
    for (let step = 0; step < 2; step++) {
      const store = dischargeW ? step === 1 : step === 0;
      if (store) {
        const a = Math.min(pvLeft, chargeRoom);
        if (a > 0) {
          pvToBatt = a;
          soc += a * eta;
          chargeRoom -= a;
          pvLeft -= a;
        }
      } else {
        const a = Math.min(pvLeft, expRoom, acRoom);
        if (a > 0) {
          pvExport = a;
          pvLeft -= a;
          expRoom -= a;
          acRoom -= a;
        }
      }
    }
    if (pvLeft > 1e-12) {
      // Lost solar: whichever limit was binding.
      if (hybrid && acRoom <= expRoom) clipped += pvLeft;
      else curtailed += pvLeft;
    }

    let battToLoad = 0;
    if (hasBatt && deficit > 0 && !(hold && chargeW)) {
      const avail = Math.max(0, soc - reserve) * eta;
      const a = Math.min(deficit, dischargeRoom, avail, acRoom);
      if (a > 0) {
        battToLoad = a;
        soc -= a / eta;
        deficit -= a;
        dischargeRoom -= a;
        acRoom -= a;
      }
    }

    let battToGrid = 0;
    if (dischargeW) {
      const floor = Math.max(reserve, (cap * (dischargeW.minPct ?? 0)) / 100);
      const avail = Math.max(0, soc - floor) * eta;
      const a = Math.min(dischargeRoom, avail, expRoom, acRoom);
      if (a > 0) {
        battToGrid = a;
        soc -= a / eta;
        expRoom -= a;
        acRoom -= a;
      }
    }

    let gridToBatt = 0;
    if (chargeW) {
      const target = (cap * (chargeW.targetPct ?? 100)) / 100;
      const need = Math.max(0, target - soc) / eta;
      const a = Math.min(need, chargeRoom, hybrid ? inv : Infinity);
      if (a > 0) {
        gridToBatt = a;
        soc += a * eta;
      }
    }
    if (soc > cap) soc = cap;
    if (soc < 0) soc = 0;

    const imp = deficit + gridToBatt;
    const exp = pvExport + battToGrid;
    row[0] = pv[h]; row[1] = demand; row[2] = pvToLoad; row[3] = pvToBatt; row[4] = pvExport;
    row[5] = battToLoad; row[6] = battToGrid; row[7] = deficit; row[8] = gridToBatt;
    row[9] = clipped; row[10] = curtailed; row[11] = imp; row[12] = exp;
    row[13] = imp * importPrices[h]; row[14] = exp * exportPrices[h];
    const base = month[h] * F;
    for (let k = 0; k < F; k++) acc[base + k] += row[k];
    if (hourly) {
      for (let k = 0; k < F; k++) hourly[FLOWS[k]][h] = row[k];
      hourly.soc[h] = soc;
    }
  }

  const totals = {};
  const monthly = {};
  FLOWS.forEach((k, i) => {
    monthly[k] = Array.from({ length: 12 }, (_, m) => acc[m * F + i]);
    totals[k] = monthly[k].reduce((s, v) => s + v, 0);
  });

  totals.selfSufficiency = totals.load > 0 ? 1 - totals.gridToLoad / totals.load : 0;
  totals.selfConsumption = totals.pv > 0 ? (totals.pvToLoad + totals.pvToBatt) / totals.pv : 0;
  totals.batteryCycles = cap > 0 ? (totals.battToLoad + totals.battToGrid) / eta / cap : 0;
  return { totals, monthly, hourly, capacityKwh: cap };
}
