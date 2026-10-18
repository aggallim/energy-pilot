// Money over the system's life: cashflow table, payback and IRR.
// cashflows[0] is the upfront cost (negative); cashflows[y] is year y's net.

export function npv(rate, cashflows) {
  let v = 0;
  for (let i = 0; i < cashflows.length; i++) v += cashflows[i] / (1 + rate) ** i;
  return v;
}

// Internal rate of return by bisection. Null when the cashflows never turn
// positive (no rate makes the NPV zero).
export function irr(cashflows) {
  let lo = -0.99;
  let hi = 1;
  let fLo = npv(lo, cashflows);
  const fHi = npv(hi, cashflows);
  if (!Number.isFinite(fLo) || fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const f = npv(mid, cashflows);
    if (Math.abs(f) < 1e-9) return mid;
    if (f * fLo > 0) {
      lo = mid;
      fLo = f;
    } else hi = mid;
  }
  return (lo + hi) / 2;
}

// Years until the cumulative cashflow first reaches zero, interpolated within
// the crossing year. Null if it never does.
export function paybackYears(cashflows) {
  let cum = cashflows[0];
  if (cum >= 0) return 0;
  for (let y = 1; y < cashflows.length; y++) {
    const next = cum + cashflows[y];
    if (next >= 0) return y - 1 + (cashflows[y] > 0 ? -cum / cashflows[y] : 1);
    cum = next;
  }
  return null;
}

// rows: [{ year, saving, outlay }] in pounds; capex in pounds.
export function cashflowTable(capex, rows) {
  const flows = [-capex];
  let cum = -capex;
  const table = rows.map((r) => {
    const net = r.saving - r.outlay;
    cum += net;
    flows.push(net);
    return { ...r, net, cumulative: cum };
  });
  const totalNet = cum;
  return {
    table,
    cashflows: flows,
    paybackYears: paybackYears(flows),
    irr: irr(flows),
    totalReturn: totalNet,
    roiPct: capex > 0 ? (totalNet / capex) * 100 : null,
  };
}
