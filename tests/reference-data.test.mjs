import test from 'node:test';
import assert from 'node:assert/strict';

import { agileVersions, dayProfile, mergeRates, pickProduct, previousLocalDate, ratesToHourOfYear } from '../scripts/reference-data/lib.mjs';
import { hourOfYearLocal } from '../src/engine/time.js';

function halfHours(startIso, count, value) {
  const start = Date.parse(startIso);
  return Array.from({ length: count }, (_, i) => ({
    valid_from: new Date(start + i * 1800e3).toISOString(),
    valid_to: new Date(start + (i + 1) * 1800e3).toISOString(),
    value_inc_vat: typeof value === 'function' ? value(i) : value,
  }));
}

test('Agile rates map onto the reference year by local time, averaging halves', () => {
  // 2026-07-10 16:00-17:00 BST is 15:00-16:00 UTC
  const rates = halfHours('2026-07-10T15:00:00Z', 2, (i) => (i ? 30 : 20));
  const { hourly, filledHours } = ratesToHourOfYear(rates);
  assert.equal(hourly[hourOfYearLocal(6, 10, 16)], 25);
  assert.equal(filledHours, 8760 - 1);
});

test('gaps are filled from the same hour on another day', () => {
  const rates = [
    ...halfHours('2026-01-05T07:00:00Z', 2, 10),
    ...halfHours('2026-01-06T08:00:00Z', 2, 99),
  ];
  const { hourly } = ratesToHourOfYear(rates);
  assert.equal(hourly[hourOfYearLocal(0, 7, 7)], 10); // filled from 5 Jan 07:00
  assert.equal(hourly[hourOfYearLocal(0, 7, 8)], 99);
});

test('day profile handles banded and fixed-rate products', () => {
  // Go-style: 00:30-05:30 cheap, BST day
  const rates = [
    { valid_from: '2026-07-09T23:30:00Z', valid_to: '2026-07-10T04:30:00Z', value_inc_vat: 8.5 },
    { valid_from: '2026-07-10T04:30:00Z', valid_to: '2026-07-10T23:30:00Z', value_inc_vat: 27.1 },
    { valid_from: '2026-07-09T04:30:00Z', valid_to: '2026-07-09T23:30:00Z', value_inc_vat: 27.1 },
  ];
  const p = dayProfile(rates, '2026-07-10');
  assert.equal(p[0], 27.1); // 00:00-00:30 local belongs to the previous day's day-rate
  assert.equal(p[1], 8.5);
  assert.equal(p[10], 8.5);
  assert.equal(p[11], 27.1);
  const fixed = dayProfile([{ valid_from: '2025-04-01T00:00:00Z', valid_to: null, value_inc_vat: 15 }], '2026-10-01');
  assert.ok(fixed.every((v) => v === 15));
  assert.equal(dayProfile([], '2026-10-01'), null);
});

test('product picking prefers newest, skips business and wrong direction', () => {
  const products = [
    { code: 'GO-VAR-22-10-14', direction: 'IMPORT', available_from: '2022-10-14' },
    { code: 'GO-VAR-BB-23-02-07', direction: 'IMPORT', is_business: true, available_from: '2023-02-07' },
    { code: 'FLUX-EXPORT-23-02-14', direction: 'EXPORT', available_from: '2023-02-14' },
    { code: 'VAR-22-11-01', direction: 'IMPORT', available_from: '2022-11-01' },
    { code: 'VAR-24-04-01', direction: 'IMPORT', available_from: '2024-04-01' },
  ];
  assert.equal(pickProduct(products, ['GO-VAR-'], 'IMPORT').code, 'GO-VAR-22-10-14');
  assert.equal(pickProduct(products, ['VAR-'], 'IMPORT').code, 'VAR-24-04-01');
  assert.equal(pickProduct(products, ['FLUX-EXPORT-'], 'IMPORT'), null);
});

test('Agile versions: import vs export, newest first', () => {
  const products = [
    { code: 'AGILE-23-12-06', available_from: '2023-12-06' },
    { code: 'AGILE-24-10-01', available_from: '2024-10-01' },
    { code: 'AGILE-OUTGOING-19-05-13', available_from: '2019-05-13' },
    { code: 'AGILE-OUTGOING-BB-23-02-28', available_from: '2023-02-28' },
  ];
  assert.deepEqual(agileVersions(products, 'IMPORT').map((p) => p.code), ['AGILE-24-10-01', 'AGILE-23-12-06']);
  assert.deepEqual(agileVersions(products, 'EXPORT').map((p) => p.code), ['AGILE-OUTGOING-19-05-13']);
});

test('merge keeps the first list for duplicate slots', () => {
  const a = halfHours('2026-01-01T00:00:00Z', 2, 1);
  const b = halfHours('2026-01-01T00:30:00Z', 2, 2);
  const m = mergeRates([a, b]);
  assert.equal(m.length, 3);
  assert.deepEqual(m.map((r) => r.value_inc_vat), [1, 1, 2]);
});

test('previous local date', () => {
  assert.equal(previousLocalDate(Date.parse('2026-07-10T23:30:00Z')), '2026-07-10'); // 00:30 BST on 11th
  assert.equal(previousLocalDate(Date.parse('2026-01-10T12:00:00Z')), '2026-01-09');
});
