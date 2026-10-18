#!/usr/bin/env node
// Fetch dated reference data into data/:
//   data/tariffs/<region>.json  Octopus tariff presets (one recent day's
//                               half-hourly rates) and 12 months of Agile and
//                               Agile Outgoing prices mapped onto the model year
//   data/pvgis/<loc>-<aspect>.json  PVGIS hourly yield per kWp (typical year)
//   data/manifest.json          what is available, when it was fetched, errors
//
// Runs in GitHub Actions (see .github/workflows/reference-data.yml), never in
// the browser. Usage:
//   node scripts/reference-data/fetch.mjs [--only=tariffs,pvgis] [--regions=A,C] [--out=data]

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { UK_REFERENCE, REGION_CODES } from '../../src/reference.js';
import { parsePvgisJson, typicalYear } from '../../src/engine/pvgis.js';
import { agileVersions, dayProfile, mergeRates, pickProduct, previousLocalDate, ratesToHourOfYear } from './lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const only = args.only ? args.only.split(',') : ['tariffs', 'pvgis'];
const regions = args.regions ? args.regions.split(',') : REGION_CODES;
const OUT = args.out || 'data';

const OCTOPUS = 'https://api.octopus.energy/v1';
const PVGIS = 'https://re.jrc.ec.europa.eu/api/v5_3/seriescalc';
const now = Date.now();
const fetchedAt = new Date(now).toISOString();
const errors = [];

// Known product codes, tried when the public product list does not show a
// product (some, e.g. Intelligent Octopus Go, are not always listed).
const KNOWN_CODES = {
  flexible: ['VAR-22-11-01'],
  go: ['GO-VAR-22-10-14'],
  intelligent: ['INTELLI-VAR-24-10-29', 'INTELLI-VAR-22-10-14'],
  cosy: ['COSY-22-12-08'],
  flux: ['FLUX-IMPORT-23-02-14'],
  'flux-export': ['FLUX-EXPORT-23-02-14'],
  outgoing: ['OUTGOING-VAR-24-10-26', 'OUTGOING-FIX-12M-19-05-13'],
};
const KNOWN_AGILE = { IMPORT: ['AGILE-24-10-01', 'AGILE-24-04-03', 'AGILE-23-12-06'], EXPORT: ['AGILE-OUTGOING-19-05-13'] };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 5) {
  for (let i = 0; ; i++) {
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': 'energy-pilot reference-data (github.com/aggallim/energy-pilot)' } });
    } catch (e) {
      if (i >= tries - 1) throw e;
      await sleep(1000 * 2 ** i);
      continue;
    }
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && i < tries - 1) {
      await sleep(1000 * 2 ** i);
      continue;
    }
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }
}

async function paged(url) {
  const out = [];
  for (let next = url; next; ) {
    const page = await getJson(next);
    out.push(...(page.results || []));
    next = page.next;
    if (next) await sleep(150);
  }
  return out;
}

async function writeJson(path, value) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(value) + '\n');
}

// ---------------------------------------------------------------- Octopus

async function listProducts() {
  const seen = new Map();
  const dates = [0, 3, 6, 9, 12].map((m) => new Date(now - m * 30.5 * 86400e3).toISOString());
  for (const [i, at] of dates.entries()) {
    const url = i === 0 ? `${OCTOPUS}/products/?page_size=100` : `${OCTOPUS}/products/?page_size=100&available_at=${at}`;
    try {
      for (const p of await paged(url)) if (!seen.has(p.code)) seen.set(p.code, p);
    } catch (e) {
      errors.push(`products list (${at}): ${e.message}`);
    }
  }
  console.log(`Products seen: ${[...seen.keys()].sort().join(', ')}`);
  return [...seen.values()];
}

const detailCache = new Map();
async function productDetail(code) {
  if (!detailCache.has(code)) detailCache.set(code, getJson(`${OCTOPUS}/products/${code}/`));
  return detailCache.get(code);
}

// Regional single-register tariff for a product: code and standing charge.
async function regionalTariff(code, region) {
  const d = await productDetail(code);
  const t = d.single_register_electricity_tariffs?.[`_${region}`];
  if (!t) return null;
  const pay = t.direct_debit_monthly || Object.values(t)[0];
  return { tariffCode: pay.code, standingChargeP: pay.standing_charge_inc_vat ?? 0, displayName: d.display_name, fullName: d.full_name };
}

async function unitRates(code, tariffCode, fromMs, toMs) {
  const q = `period_from=${new Date(fromMs).toISOString()}&period_to=${new Date(toMs).toISOString()}&page_size=1500`;
  return paged(`${OCTOPUS}/products/${code}/electricity-tariffs/${tariffCode}/standard-unit-rates/?${q}`);
}

async function presetFor(id, products, region) {
  const ref = UK_REFERENCE.tariffs[id];
  const listed = pickProduct(products, ref.match, ref.direction, ['AGILE']);
  const candidates = [...new Set([listed?.code, ...(KNOWN_CODES[id] || [])].filter(Boolean))];
  for (const code of candidates) {
    try {
      const rt = await regionalTariff(code, region);
      if (!rt) continue;
      const rates = await unitRates(code, rt.tariffCode, now - 4 * 86400e3, now);
      let date = previousLocalDate(now);
      let profile = dayProfile(rates, date);
      if (!profile) {
        date = previousLocalDate(now - 86400e3);
        profile = dayProfile(rates, date);
      }
      if (!profile) continue;
      return {
        kind: 'daily',
        halfHourly: profile,
        standingChargeP: rt.standingChargeP,
        source: { type: 'octopus', product: code, tariffCode: rt.tariffCode, date, displayName: rt.displayName },
      };
    } catch (e) {
      errors.push(`${id} ${code} ${region}: ${e.message}`);
    }
  }
  errors.push(`${id} ${region}: no usable product found (tried ${candidates.join(', ') || 'none'})`);
  return null;
}

async function agileFor(direction, products, region) {
  const versions = agileVersions(products, direction).map((p) => p.code);
  const codes = [...new Set([...versions, ...KNOWN_AGILE[direction]])];
  const to = now - (now % 1800e3);
  const from = to - 365 * 86400e3;
  const lists = [];
  const used = [];
  let standingChargeP = 0;
  for (const code of codes) {
    try {
      const rt = await regionalTariff(code, region);
      if (!rt) continue;
      const rates = await unitRates(code, rt.tariffCode, from, to);
      if (!rates.length) continue;
      if (!used.length) standingChargeP = rt.standingChargeP;
      lists.push(rates);
      used.push({ product: code, tariffCode: rt.tariffCode, count: rates.length });
    } catch (e) {
      errors.push(`agile ${direction} ${code} ${region}: ${e.message}`);
    }
    // Stop once the newest versions cover the year.
    if (lists.reduce((n, l) => n + l.length, 0) >= 17520) break;
  }
  if (!lists.length) {
    errors.push(`agile ${direction} ${region}: no rates`);
    return null;
  }
  const merged = mergeRates(lists);
  const { hourly, filledHours } = ratesToHourOfYear(merged);
  return {
    kind: 'series',
    hourly,
    standingChargeP,
    source: { type: 'octopus', products: used, from: new Date(from).toISOString(), to: new Date(to).toISOString(), halfHours: merged.length, filledHours },
  };
}

async function fetchTariffs() {
  const products = await listProducts();
  const done = [];
  for (const region of regions) {
    const tariffs = {};
    for (const id of Object.keys(KNOWN_CODES)) {
      const t = await presetFor(id, products, region);
      if (t) tariffs[id] = t;
    }
    const imp = await agileFor('IMPORT', products, region);
    if (imp) tariffs.agile = imp;
    const exp = await agileFor('EXPORT', products, region);
    if (exp) tariffs['agile-export'] = exp;
    if (!Object.keys(tariffs).length) continue;
    await writeJson(join(OUT, 'tariffs', `${region}.json`), {
      region,
      fetchedAt,
      source: 'Octopus Energy public API, https://api.octopus.energy/v1/ (unit rates and standing charges inc. VAT)',
      tariffs,
    });
    done.push(region);
    console.log(`Tariffs ${region}: ${Object.keys(tariffs).join(', ')}`);
  }
  return done;
}

// ---------------------------------------------------------------- PVGIS

async function fetchPvgis() {
  const { locations, aspects, tilt, lossesPct } = UK_REFERENCE.samplePv;
  const done = [];
  for (const [loc, l] of Object.entries(locations)) {
    for (const [aspect, az] of Object.entries(aspects)) {
      const q = new URLSearchParams({
        lat: l.lat, lon: l.lon, peakpower: 1, loss: lossesPct, angle: tilt, aspect: az,
        pvcalculation: 1, startyear: 2014, endyear: 2023, raddatabase: 'PVGIS-SARAH3', outputformat: 'json',
      });
      try {
        const json = await getJson(`${PVGIS}?${q}`);
        const parsed = parsePvgisJson(json);
        const y = typicalYear(parsed);
        await writeJson(join(OUT, 'pvgis', `${loc}-${aspect}.json`), {
          location: loc,
          aspect,
          lat: l.lat,
          lon: l.lon,
          tilt,
          azimuth: az,
          lossesPct,
          year: y.year,
          kwhPerKwp: Math.round(y.kwhPerKwp),
          yearsConsidered: parsed.years.map((x) => ({ year: x.year, kwhPerKwp: Math.round(x.kwhPerKwp) })),
          fetchedAt,
          source: `European Commission JRC, PVGIS 5.3 seriescalc (${parsed.meta.database || 'PVGIS-SARAH3'}), https://re.jrc.ec.europa.eu/pvg_tools/en/`,
          whPerKwp: Array.from(y.wh, (v) => Math.round(v)),
        });
        done.push(`${loc}-${aspect}`);
        console.log(`PVGIS ${loc}-${aspect}: ${Math.round(y.kwhPerKwp)} kWh/kWp (${y.year})`);
      } catch (e) {
        errors.push(`pvgis ${loc}-${aspect}: ${e.message}`);
      }
      await sleep(500);
    }
  }
  return done;
}

// ---------------------------------------------------------------- main

let manifest = {};
try {
  manifest = JSON.parse(await readFile(join(OUT, 'manifest.json'), 'utf8'));
} catch {}

if (only.includes('tariffs')) {
  const r = await fetchTariffs();
  manifest.tariffs = { fetchedAt, regions: [...new Set([...(manifest.tariffs?.regions || []), ...r])].sort() };
}
if (only.includes('pvgis')) {
  const p = await fetchPvgis();
  manifest.pvgis = { fetchedAt, samples: [...new Set([...(manifest.pvgis?.samples || []), ...p])].sort() };
}
manifest.errors = errors;
manifest.updatedAt = fetchedAt;
await writeJson(join(OUT, 'manifest.json'), manifest);

if (errors.length) console.log(`\n${errors.length} problem(s):\n${errors.join('\n')}`);
const nothing = (!only.includes('tariffs') || !manifest.tariffs?.regions?.length) && (!only.includes('pvgis') || !manifest.pvgis?.samples?.length);
if (nothing) {
  console.error('No reference data could be fetched.');
  process.exit(1);
}
