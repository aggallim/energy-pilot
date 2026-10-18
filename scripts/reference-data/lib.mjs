// Pure helpers for the reference-data fetcher (unit-tested; no network).

import { HOURS, hourOfYearLocal, ukLocal } from '../../src/engine/time.js';

const HALF_HOUR = 1800e3;
export const round2 = (v) => Math.round(v * 100) / 100;

// Map half-hourly rates [{ valid_from, valid_to, value_inc_vat }] onto the
// reference year by UK local month/day/hour, averaging the two half-hours in
// each hour. Gaps are filled from the same hour on the nearest earlier day.
export function ratesToHourOfYear(rates) {
  const sum = new Float64Array(HOURS);
  const n = new Uint16Array(HOURS);
  for (const r of rates) {
    const from = Date.parse(r.valid_from);
    const to = r.valid_to ? Date.parse(r.valid_to) : from + HALF_HOUR;
    for (let t = from; t < to; t += HALF_HOUR) {
      const l = ukLocal(t);
      const h = hourOfYearLocal(l.month, l.day, l.hour);
      if (h < 0) continue;
      sum[h] += r.value_inc_vat;
      n[h]++;
    }
  }
  const hourly = new Array(HOURS).fill(null);
  for (let h = 0; h < HOURS; h++) if (n[h]) hourly[h] = sum[h] / n[h];
  let filled = 0;
  const firstKnown = hourly.findIndex((v) => v !== null);
  if (firstKnown < 0) throw new Error('No rates to map.');
  for (let h = 0; h < HOURS; h++) {
    if (hourly[h] !== null) continue;
    let v = null;
    for (let back = h - 24; back >= 0 && v === null; back -= 24) v = hourly[back];
    for (let fwd = h + 24; fwd < HOURS && v === null; fwd += 24) v = hourly[fwd];
    hourly[h] = v ?? hourly[firstKnown];
    filled++;
  }
  return { hourly: hourly.map(round2), filledHours: filled };
}

// 48 half-hourly prices for one UK local date ('YYYY-MM-DD'), from rates with
// any validity spans (fixed-rate products have one long-running rate).
export function dayProfile(rates, localDate) {
  const [y, m, d] = localDate.split('-').map(Number);
  const spans = rates.map((r) => ({
    from: Date.parse(r.valid_from),
    to: r.valid_to ? Date.parse(r.valid_to) : Infinity,
    v: r.value_inc_vat,
  }));
  const out = new Array(48).fill(null);
  for (let t = Date.UTC(y, m - 1, d) - 2 * 3600e3; t < Date.UTC(y, m - 1, d) + 26 * 3600e3; t += HALF_HOUR) {
    const l = ukLocal(t);
    if (l.year !== y || l.month !== m - 1 || l.day !== d) continue;
    const slot = l.hour * 2 + (l.minute >= 30 ? 1 : 0);
    const hit = spans.filter((s) => s.from <= t && t < s.to).sort((a, b) => b.from - a.from)[0];
    if (hit) out[slot] = round2(hit.v);
  }
  if (out.some((v) => v === null)) return null;
  return out;
}

// Pick the newest non-business product whose code matches one of the
// prefixes (in priority order) and the wanted direction.
export function pickProduct(products, prefixes, direction, exclude = []) {
  for (const prefix of prefixes) {
    const hits = products
      .filter((p) => p.code.startsWith(prefix))
      .filter((p) => !exclude.some((x) => p.code.includes(x)))
      .filter((p) => !p.is_business && !p.is_prepay)
      .filter((p) => !direction || !p.direction || p.direction.toUpperCase() === direction.toUpperCase())
      .sort((a, b) => String(b.available_from).localeCompare(String(a.available_from)));
    if (hits.length) return hits[0];
  }
  return null;
}

// Agile product versions, newest first, so newer versions win when the
// history spans a product change.
export function agileVersions(products, direction) {
  return products
    .filter((p) => p.code.startsWith('AGILE-') && !p.is_business)
    .filter((p) => (direction === 'EXPORT' ? p.code.includes('OUTGOING') : !p.code.includes('OUTGOING')))
    .filter((p) => !/-BB-/.test(p.code))
    .sort((a, b) => String(b.available_from).localeCompare(String(a.available_from)));
}

// Merge several rate lists, keeping the first list's value for any slot.
export function mergeRates(lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const r of list) {
      if (seen.has(r.valid_from)) continue;
      seen.add(r.valid_from);
      out.push(r);
    }
  }
  return out;
}

// The UK local date before the given instant, as 'YYYY-MM-DD'.
export function previousLocalDate(nowMs) {
  const l = ukLocal(nowMs - 86400e3);
  return `${l.year}-${String(l.month + 1).padStart(2, '0')}-${String(l.day).padStart(2, '0')}`;
}
