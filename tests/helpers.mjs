// Shared fixtures for engine tests.
import { HOURS, timeAxis } from '../src/engine/time.js';

// A deterministic synthetic yield (Wh per kWp per hour) of about 950 kWh/kWp
// a year: a sine-shaped day around solar noon, longer and stronger in summer.
export function syntheticWhPerKwp() {
  const { month } = timeAxis();
  const peak = [180, 280, 420, 560, 650, 700, 680, 600, 470, 320, 200, 150];
  const half = [3.5, 4.5, 5.5, 6.5, 7.5, 8, 8, 7, 6, 5, 4, 3.5];
  const out = new Array(HOURS);
  for (let h = 0; h < HOURS; h++) {
    const utcHour = h % 24;
    const m = month[h];
    const x = (utcHour + 0.5 - 12) / half[m];
    out[h] = Math.abs(x) < 1 ? Math.round(peak[m] * Math.cos((x * Math.PI) / 2)) : 0;
  }
  return out;
}

export const constant = (v) => new Float64Array(HOURS).fill(v);

export const sum = (a) => a.reduce((s, v) => s + v, 0);

export const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
