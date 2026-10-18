// Time axis for the hourly model. Every series in the engine is indexed by
// hour of a single non-leap reference year in UTC (8,760 steps), and tariff
// windows and load profiles are evaluated in UK local time (GMT/BST).

export const HOURS = 8760;
export const REFERENCE_YEAR = 2025; // non-leap; only used to place weekdays and BST

const HOUR_MS = 3600e3;

// Last Sunday of a month, as a UTC day-of-month.
function lastSunday(year, month) {
  const last = new Date(Date.UTC(year, month + 1, 0));
  return last.getUTCDate() - last.getUTCDay();
}

// UK clocks change at 01:00 UTC on the last Sunday of March and October.
export function bstRange(year) {
  return [
    Date.UTC(year, 2, lastSunday(year, 2), 1),
    Date.UTC(year, 9, lastSunday(year, 9), 1),
  ];
}

export function ukOffsetHours(utcMs) {
  const [start, end] = bstRange(new Date(utcMs).getUTCFullYear());
  return utcMs >= start && utcMs < end ? 1 : 0;
}

// Local (UK) calendar fields for a UTC instant.
export function ukLocal(utcMs) {
  const d = new Date(utcMs + ukOffsetHours(utcMs) * HOUR_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(), // 0-11
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(), // 0 = Sunday
  };
}

let axis = null;

// Precomputed local fields for every hour of the reference year.
export function timeAxis() {
  if (axis) return axis;
  const start = Date.UTC(REFERENCE_YEAR, 0, 1);
  const localHour = new Uint8Array(HOURS);
  const month = new Uint8Array(HOURS);
  const weekend = new Uint8Array(HOURS);
  const dayOfYear = new Uint16Array(HOURS);
  for (let h = 0; h < HOURS; h++) {
    const l = ukLocal(start + h * HOUR_MS);
    localHour[h] = l.hour;
    month[h] = l.month;
    weekend[h] = l.weekday === 0 || l.weekday === 6 ? 1 : 0;
    // Local day index; the first hours of 1 January are still 1 January in GMT.
    dayOfYear[h] = Math.floor((Date.UTC(REFERENCE_YEAR, l.month, l.day) - start) / 86400e3) % 365;
  }
  axis = { localHour, month, weekend, dayOfYear };
  return axis;
}

// Index into the reference year for a UTC month/day/hour, skipping 29 February.
export function hourOfYearUtc(month, day, hour) {
  if (month === 1 && day === 29) return -1;
  const ms = Date.UTC(REFERENCE_YEAR, month, day, hour) - Date.UTC(REFERENCE_YEAR, 0, 1);
  return Math.round(ms / HOUR_MS);
}

// Index into the reference year for a UK local month/day/hour. Returns -1 for
// the hour that does not exist when clocks go forward.
let localIndex = null;
export function hourOfYearLocal(month, day, hour) {
  if (!localIndex) {
    localIndex = new Map();
    const start = Date.UTC(REFERENCE_YEAR, 0, 1);
    for (let h = 0; h < HOURS; h++) {
      const l = ukLocal(start + h * HOUR_MS);
      if (l.year !== REFERENCE_YEAR) continue;
      const key = (l.month * 32 + l.day) * 24 + l.hour;
      if (!localIndex.has(key)) localIndex.set(key, h);
    }
  }
  if (month === 1 && day === 29) return -1;
  const v = localIndex.get((month * 32 + day) * 24 + hour);
  return v === undefined ? -1 : v;
}

// True when a local hour falls in [from, to), wrapping past midnight.
export function inWindow(hour, from, to) {
  if (from === to) return false;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
