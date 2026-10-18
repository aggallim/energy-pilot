// Compare saved scenarios side by side.

import { h, icon, fmt, toast } from './dom.js';
import { chart, lineSet, legend, canvasBox, colors, destroyAll } from './charts.js';
import { getScenario, setScenario } from '../state.js';
import { dataFor } from '../data.js';
import { runScenario, tariffName } from '../engine/scenario.js';
import { listSaved, deleteSaved } from '../storage.js';

const MAX = 4;
let selected = null;
// Each selected scenario keeps its colour slot while selected, so toggling
// another scenario never repaints it.
const slots = new Map();
function slotFor(id) {
  if (!slots.has(id)) {
    const used = new Set(slots.values());
    slots.set(id, [0, 1, 2, 3].find((i) => !used.has(i)) ?? 0);
  }
  return slots.get(id);
}

const ROWS = [
  ['Upfront cost', (r) => r.lifetime.capex, fmt.gbp, 'low'],
  ['Saving, year one', (r) => r.annualSaving, fmt.gbp, 'high'],
  ['Bill with system, year one', (r) => r.withSystem.bill.netP / 100, fmt.gbp, 'low'],
  ['Payback', (r) => r.lifetime.paybackYears, fmt.years, 'low'],
  ['Return (IRR)', (r) => r.lifetime.irr, fmt.pct1, 'high'],
  ['Lifetime return', (r) => r.lifetime.totalReturn, fmt.gbp, 'high'],
  ['Self-sufficiency', (r) => r.withSystem.sim.totals.selfSufficiency, fmt.pct, 'high'],
  ['Solar generated', (r) => r.withSystem.sim.totals.pv, fmt.kwh, null],
  ['Exported', (r) => r.withSystem.sim.totals.export, fmt.kwh, null],
  ['Battery adds', (r) => r.batteryValue, (v) => `${fmt.gbp(v)}/yr`, null],
];

export function renderCompare(root) {
  destroyAll();
  const saved = listSaved();
  const current = getScenario();
  const entries = [{ id: '__current', name: `${current.name} (current)`, scenario: current }, ...saved.filter((x) => x.id !== current.id)];
  if (!selected) selected = new Set(entries.slice(0, MAX).map((e) => e.id));
  for (const id of [...selected]) if (!entries.some((e) => e.id === id)) selected.delete(id);
  for (const id of [...slots.keys()]) if (!selected.has(id)) slots.delete(id);

  const out = h('div', { class: 'stack', style: { '--gap': '16px' } }, h('div', { class: 'loading' }, h('div', { class: 'spin' })));
  const list = h('div', { class: 'scen-list' }, entries.map((e) => h('div', { class: 'scen-item' },
    h('label', { class: 'switch' },
      h('input', {
        type: 'checkbox', checked: selected.has(e.id),
        onchange: (ev) => {
          if (ev.target.checked) {
            if (selected.size >= MAX) {
              ev.target.checked = false;
              return toast(`Compare up to ${MAX} at a time.`);
            }
            selected.add(e.id);
          } else {
            selected.delete(e.id);
            slots.delete(e.id);
          }
          draw();
        },
      }),
      h('span', { class: 'track' })),
    h('div', { class: 'grow' }, h('strong', {}, e.name), h('span', { class: 'small muted' }, `${tariffName(e.scenario.tariffs.proposedImport, e.scenario)} · ${fmt.n1(e.scenario.arrays.reduce((t, a) => t + a.kwp, 0))} kWp · ${e.scenario.battery.enabled ? `${fmt.n1(e.scenario.battery.capacityKwh)} kWh battery` : 'no battery'}`)),
    e.id === '__current' ? null : h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => { setScenario(structuredClone(e.scenario)); location.hash = '#/modeller'; } }, 'Open'),
    e.id === '__current' ? null : h('button', {
      class: 'icon-btn', type: 'button', 'aria-label': `Delete ${e.name}`,
      onclick: () => {
        if (!confirm(`Delete “${e.name}”?`)) return;
        deleteSaved(e.id);
        selected.delete(e.id);
        slots.delete(e.id);
        renderCompare(root);
      },
    }, icon('trash')))));

  root.replaceChildren(h('div', { class: 'page stack', style: { '--gap': '20px' } },
    h('div', {}, h('div', { class: 'eyebrow' }, 'Compare'), h('h1', { style: { fontSize: 'clamp(26px, 4vw, 34px)' } }, 'Scenarios side by side')),
    saved.length ? null : h('div', { class: 'note' }, icon('info'), h('span', {}, 'Save a few setups in the Modeller (for example 5 kWh vs 10 kWh battery, or Flux vs Agile) and they appear here.')),
    h('div', { class: 'card card-pad' }, h('div', { class: 'card-head' }, h('h2', {}, 'Choose up to four')), list),
    out));

  async function draw() {
    destroyAll();
    const chosen = entries.filter((e) => selected.has(e.id));
    if (!chosen.length) return out.replaceChildren(h('p', { class: 'muted' }, 'Pick at least one scenario.'));
    const results = [];
    for (const e of chosen) {
      try {
        results.push({ e, r: runScenario(e.scenario, await dataFor(e.scenario), { detail: false }) });
      } catch (err) {
        results.push({ e, error: err.message });
      }
    }
    const c = colors();
    const palette = [c.grid, c.solar, c.battery, c.s4];
    const series = results.map(({ e }) => palette[slotFor(e.id)]);
    const ok = results.filter((x) => x.r);
    const head = h('tr', {}, h('th', {}, ''), results.map(({ e }, i) => h('th', {}, h('span', { class: 'row', style: { '--gap': '6px', justifyContent: 'flex-end', flexWrap: 'nowrap' } }, h('i', { style: { width: '10px', height: '10px', borderRadius: '3px', background: series[i], display: 'inline-block' } }), e.name))));
    const body = ROWS.map(([label, get, f, better]) => {
      const vals = results.map((x) => (x.r ? get(x.r) : null));
      const finite = vals.filter((v) => v !== null && Number.isFinite(v));
      const best = better && finite.length > 1 ? (better === 'high' ? Math.max(...finite) : Math.min(...finite)) : null;
      return h('tr', {}, h('td', {}, label), vals.map((v, i) => h('td', { class: best !== null && v === best ? 'best' : '' }, results[i].error ? '–' : f(v))));
    });
    const errors = results.filter((x) => x.error).map((x) => h('div', { class: 'note note-error' }, icon('alert'), h('span', {}, `${x.e.name}: ${x.error}`)));
    const box = canvasBox('tall', 'Cumulative cashflow per scenario');
    out.replaceChildren(...errors,
      h('div', { class: 'card card-pad' }, h('div', { class: 'card-head' }, h('h2', {}, 'Key figures'), h('p', {}, 'Best value in each row in green')),
        h('div', { class: 'table-wrap', style: { maxHeight: 'none' } }, h('table', { class: 'data compare-table' }, h('thead', {}, head), h('tbody', {}, body)))),
      h('div', { class: 'card card-pad' }, h('div', { class: 'card-head' }, h('h2', {}, 'Lifetime cashflow'), h('p', {}, 'Cumulative, after upfront cost')),
        legend(results.map(({ e }, i) => [e.name, series[i], 'line'])), box.box));
    const years = Math.max(...ok.map((x) => x.r.lifetime.table.length), 1);
    chart(box.canvas, {
      type: 'line', labels: Array.from({ length: years + 1 }, (_, i) => String(i)), xTitle: 'Year',
      yFormat: (v) => `£${new Intl.NumberFormat('en-GB', { notation: 'compact' }).format(v)}`, tooltipFormat: (v) => fmt.gbp(v),
      datasets: results.map(({ e, r }, i) => (r ? { ...lineSet(e.name, [-r.lifetime.capex, ...r.lifetime.table.map((row) => row.cumulative)], series[i]), tension: 0 } : null)).filter(Boolean),
    });
  }
  draw();
}
