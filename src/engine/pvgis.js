// Parse PVGIS hourly output (the "Hourly data" CSV or JSON from the PVGIS web
// tool or its seriescalc API) into per-kWp hourly yield for the reference year.

import { HOURS, hourOfYearUtc } from './time.js';

const num = (s) => {
  const v = parseFloat(String(s).trim());
  return Number.isFinite(v) ? v : null;
};

function emptyYear() {
  return new Float64Array(HOURS);
}

// Fold rows of {month, day, hour, watts} into Wh per kWp, one array per year.
function foldRows(rows, kwp) {
  const years = new Map();
  for (const r of rows) {
    const h = hourOfYearUtc(r.month, r.day, r.hour);
    if (h < 0) continue;
    if (!years.has(r.year)) years.set(r.year, emptyYear());
    years.get(r.year)[h] = r.watts / kwp; // one hour at W = Wh
  }
  return [...years.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, wh]) => ({ year, wh, kwhPerKwp: wh.reduce((s, v) => s + v, 0) / 1000 }));
}

function parseStamp(stamp) {
  const m = /^(\d{4})(\d{2})(\d{2}):(\d{2})(\d{2})$/.exec(stamp.trim());
  if (!m) return null;
  return { year: +m[1], month: +m[2] - 1, day: +m[3], hour: +m[4] };
}

export function parsePvgisCsv(text) {
  const lines = text.split(/\r?\n/);
  const meta = { lat: null, lon: null, slope: null, azimuth: null, kwp: null, losses: null, database: null };
  const grab = (re) => {
    for (const l of lines) {
      const m = re.exec(l);
      if (m) return m[1];
    }
    return null;
  };
  meta.lat = num(grab(/^Latitude[^:]*:\s*([-\d.]+)/i));
  meta.lon = num(grab(/^Longitude[^:]*:\s*([-\d.]+)/i));
  meta.slope = num(grab(/^Slope:\s*([-\d.]+)/i));
  meta.azimuth = num(grab(/^Azimuth:\s*([-\d.]+)/i));
  meta.kwp = num(grab(/^Nominal power[^:]*:\s*([-\d.]+)/i));
  meta.losses = num(grab(/^System losses[^:]*:\s*([-\d.]+)/i));
  meta.database = grab(/^Radiation database:\s*(\S+)/i);

  const headerIdx = lines.findIndex((l) => /^time\s*,/i.test(l.trim()));
  if (headerIdx < 0) throw new Error('No "time," header row found. Download the hourly data as CSV from PVGIS.');
  const cols = lines[headerIdx].split(',').map((c) => c.trim());
  const pCol = cols.indexOf('P');
  const gCol = cols.indexOf('G(i)');
  if (pCol < 0 && gCol < 0) throw new Error('The file has no PV power (P) or irradiance (G(i)) column.');
  const usesIrradiance = pCol < 0;
  const kwp = usesIrradiance ? 1 : meta.kwp || 1;
  const lossFactor = 1 - (meta.losses ?? 14) / 100;

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const t = parseStamp(parts[0] || '');
    if (!t) {
      if (rows.length) break; // footer starts after the last data row
      continue;
    }
    const raw = num(parts[usesIrradiance ? gCol : pCol]);
    if (raw === null) continue;
    rows.push({ ...t, watts: usesIrradiance ? raw * lossFactor : raw });
  }
  if (!rows.length) throw new Error('No hourly rows found in the file.');
  return { meta: { ...meta, estimatedFromIrradiance: usesIrradiance }, years: foldRows(rows, kwp) };
}

export function parsePvgisJson(data) {
  const hourly = data?.outputs?.hourly;
  if (!Array.isArray(hourly)) throw new Error('No outputs.hourly array in the JSON.');
  const inp = data.inputs || {};
  const fixed = inp.mounting_system?.fixed || {};
  const meta = {
    lat: inp.location?.latitude ?? null,
    lon: inp.location?.longitude ?? null,
    slope: fixed.slope?.value ?? null,
    azimuth: fixed.azimuth?.value ?? null,
    kwp: inp.pv_module?.peak_power ?? null,
    losses: inp.pv_module?.system_loss ?? null,
    database: inp.meteo_data?.radiation_db ?? null,
  };
  const usesIrradiance = hourly.length && hourly[0].P === undefined;
  const kwp = usesIrradiance ? 1 : meta.kwp || 1;
  const lossFactor = 1 - (meta.losses ?? 14) / 100;
  const rows = [];
  for (const r of hourly) {
    const t = parseStamp(r.time || '');
    if (!t) continue;
    const raw = usesIrradiance ? r['G(i)'] : r.P;
    if (typeof raw !== 'number') continue;
    rows.push({ ...t, watts: usesIrradiance ? raw * lossFactor : raw });
  }
  if (!rows.length) throw new Error('No hourly rows found in the JSON.');
  return { meta: { ...meta, estimatedFromIrradiance: !!usesIrradiance }, years: foldRows(rows, kwp) };
}

export function parsePvgis(text) {
  const t = text.trimStart();
  if (t.startsWith('{')) return parsePvgisJson(JSON.parse(t));
  return parsePvgisCsv(text);
}

// Use the year with the median annual yield so a multi-year file models a
// typical year rather than a smoothed average of all years (averaging hides
// the cloudy and sunny days that drive battery behaviour).
export function typicalYear(parsed) {
  const full = parsed.years.filter((y) => y.wh.some((v) => v > 0));
  if (!full.length) throw new Error('The file contains no generation.');
  const sorted = [...full].sort((a, b) => a.kwhPerKwp - b.kwhPerKwp);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

// Compact form stored with a scenario: whole Wh per kWp per hour.
export function toStored(yearData, meta, name) {
  return {
    name,
    year: yearData.year,
    meta,
    whPerKwp: Array.from(yearData.wh, (v) => Math.round(v)),
  };
}
