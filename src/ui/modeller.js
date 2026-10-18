// The Modeller page: inputs on the left, live results on the right.

import { h, icon, fmt, toast, debounce } from './dom.js';
import { chart, barSet, lineSet, legend, canvasBox, colors, destroyAll } from './charts.js';
import { getScenario, setScenario, update } from '../state.js';
import { dataFor } from '../data.js';
import { runScenario, tariffName, defaultScenario } from '../engine/scenario.js';
import { parsePvgis, typicalYear, toStored } from '../engine/pvgis.js';
import { timeAxis, HOURS, MONTHS } from '../engine/time.js';
import { UK_REFERENCE } from '../reference.js';
import { listSaved, saveScenario, deleteSaved, shareLink, readShare, exportBundle, downloadJson, importBundle } from '../storage.js';

const REF = UK_REFERENCE;
let dayMonth = 5; // June
let lastResult = null;
let lastData = null;

// ------------------------------------------------------------ path helpers

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}

// ------------------------------------------------------------ fields

let onChange = () => {};
let rebuild = () => {};

function numberField({ label, path, unit, prefix, step = 'any', min, max, hint, full }) {
  const id = `f-${path.replace(/\W/g, '-')}`;
  const input = h('input', {
    class: 'input', id, type: 'number', inputmode: 'decimal', step, min, max,
    value: getPath(getScenario(), path),
    oninput: (e) => {
      const v = parseFloat(e.target.value);
      if (!Number.isFinite(v)) return;
      update((s) => setPath(s, path, v), { silent: true });
      onChange();
    },
  });
  return h('div', { class: `field${full ? ' full' : ''}` },
    h('label', { for: id }, label),
    h('div', { class: 'input-unit' }, prefix ? h('span', { class: 'prefix' }, prefix) : null, input, unit ? h('span', { class: 'unit' }, unit) : null),
    hint ? h('span', { class: 'hint' }, hint) : null);
}

function selectField({ label, path, options, structural = true, full, hint, onSet }) {
  const id = `f-${path.replace(/\W/g, '-')}`;
  const value = String(getPath(getScenario(), path));
  const sel = h('select', {
    class: 'input', id,
    onchange: (e) => {
      const raw = e.target.value;
      const v = /^-?\d+(\.\d+)?$/.test(raw) && typeof getPath(getScenario(), path) === 'number' ? Number(raw) : raw;
      update((s) => {
        setPath(s, path, v);
        onSet?.(s, v);
      }, { silent: true });
      structural ? rebuild() : onChange();
    },
  }, options.map((o) => (o.group
    ? h('optgroup', { label: o.group }, o.options.map(([v, l]) => h('option', { value: v, selected: String(v) === value }, l)))
    : h('option', { value: o[0], selected: String(o[0]) === value }, o[1]))));
  return h('div', { class: `field${full ? ' full' : ''}` }, label ? h('label', { for: id }, label) : null, sel, hint ? h('span', { class: 'hint' }, hint) : null);
}

function segmented({ label, path, options, structural = true, full = true, onSet }) {
  const name = `seg-${path.replace(/\W/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
  const value = getPath(getScenario(), path);
  return h('div', { class: `field${full ? ' full' : ''}` },
    label ? h('span', { class: 'label' }, label) : null,
    h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label || path },
      options.map(([v, l]) => h('label', {},
        h('input', {
          type: 'radio', name, checked: v === value,
          onchange: () => {
            update((s) => {
              setPath(s, path, v);
              onSet?.(s, v);
            }, { silent: true });
            structural ? rebuild() : onChange();
          },
        }),
        h('span', {}, l)))));
}

function switchField(label, path, { structural = true } = {}) {
  return h('label', { class: 'switch' },
    h('input', {
      type: 'checkbox', checked: !!getPath(getScenario(), path),
      onchange: (e) => {
        update((s) => setPath(s, path, e.target.checked), { silent: true });
        structural ? rebuild() : onChange();
      },
    }),
    h('span', { class: 'track' }), label);
}

function section(id, title, sub, iconName, body, open = false) {
  const d = h('details', { class: 'card section', id: `sec-${id}`, open: openSections.has(id) || open },
    h('summary', {},
      h('span', { class: 'sec-icon' }, icon(iconName)),
      h('span', { class: 'sec-text' }, h('span', { class: 'sec-title' }, title), h('span', { class: 'sec-sub' }, sub)),
      chevron()),
    h('div', { class: 'sec-body' }, body));
  d.addEventListener('toggle', () => (d.open ? openSections.add(id) : openSections.delete(id)));
  return d;
}
const openSections = new Set(['home', 'solar']);
function chevron() {
  const el = icon('chevron');
  el.classList.add('chev');
  return el;
}

const hourOptions = Array.from({ length: 24 }, (_, i) => [i, fmt.hour(i)]);
const halfHourOptions = Array.from({ length: 49 }, (_, i) => [i / 2, fmt.hour(i / 2)]);

// ------------------------------------------------------------ input sections

function homeSection() {
  const s = getScenario();
  return section('home', 'Home', `${REF.regions[s.region]} · ${fmt.n0(s.annualKwh)} kWh a year`, 'home', [
    selectField({
      label: 'Electricity region', path: 'region', full: true,
      options: Object.entries(REF.regions).map(([k, v]) => [k, `${v} (${k})`]),
      hint: 'Sets regional tariff rates and the default sample location.',
      onSet: (sc, v) => {
        for (const a of sc.arrays) if (a.source.type === 'sample') a.source.location = REF.regionSample[v];
      },
    }),
    h('div', { class: 'fields' },
      numberField({ label: 'Annual electricity use', path: 'annualKwh', unit: 'kWh', step: 50, min: 0, full: true, hint: `Check your bills. A typical UK home uses ${fmt.n0(REF.typicalAnnualKwh)} kWh (Ofgem).` })),
    segmented({
      label: 'When you use it', path: 'profile', structural: false,
      options: Object.entries(REF.loadProfiles).map(([k, p]) => [k, p.label.replace(' (Economy 7 style)', '')]),
    }),
  ], true);
}

function arrayCard(a, i, count) {
  const isUpload = a.source.type === 'upload';
  const loc = REF.samplePv.locations;
  const body = [
    h('div', { class: 'subcard-head' },
      h('input', {
        class: 'input', value: a.label, 'aria-label': 'Array name',
        oninput: (e) => update((s) => (s.arrays[i].label = e.target.value), { silent: true }),
        onchange: () => onChange(),
      }),
      count > 1 ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { update((s) => s.arrays.splice(i, 1), { silent: true }); rebuild(); } }, icon('x'), 'Remove') : null),
    h('div', { class: 'fields' },
      numberField({ label: 'Panel size', path: `arrays.${i}.kwp`, unit: 'kWp', step: 0.05, min: 0, full: true })),
    segmented({
      path: `arrays.${i}.source.type`,
      options: [['sample', 'Sample data'], ['upload', 'My PVGIS file']],
      onSet: (s, v) => {
        if (v === 'sample') s.arrays[i].source = { type: 'sample', location: REF.regionSample[s.region], aspect: 'S' };
        else s.arrays[i].source = { type: 'upload' };
      },
    }),
  ];
  if (!isUpload) {
    body.push(h('div', { class: 'fields' },
      selectField({ label: 'Location', path: `arrays.${i}.source.location`, options: Object.entries(loc).map(([k, v]) => [k, v.label]), structural: false }),
      selectField({ label: 'Roof faces', path: `arrays.${i}.source.aspect`, options: [['S', 'South'], ['SE', 'South-east'], ['SW', 'South-west'], ['E', 'East'], ['W', 'West']], structural: false })),
    h('p', { class: 'hint small muted' }, `PVGIS yield for a ${REF.samplePv.tilt}° roof. Upload your own file for your exact roof.`));
  } else {
    body.push(uploadControl(a, i));
  }
  return h('div', { class: 'subcard' }, body);
}

function uploadControl(a, i) {
  const input = h('input', { type: 'file', accept: '.csv,.json,text/csv,application/json' });
  const handle = async (file) => {
    try {
      const text = await file.text();
      const parsed = parsePvgis(text);
      const year = typicalYear(parsed);
      const stored = toStored(year, parsed.meta, file.name);
      update((s) => {
        s.arrays[i].source = { type: 'upload', ...stored };
        if (parsed.meta.kwp && !parsed.meta.estimatedFromIrradiance) s.arrays[i].kwp = parsed.meta.kwp;
      }, { silent: true });
      toast(`Loaded ${file.name}: ${fmt.n0(year.kwhPerKwp)} kWh/kWp in ${year.year}`);
      rebuild();
    } catch (e) {
      toast(e.message);
    }
  };
  input.addEventListener('change', () => input.files[0] && handle(input.files[0]));
  const drop = h('label', { class: 'file-drop' }, icon('upload'),
    h('span', {}, a.source.whPerKwp ? h('span', {}, h('strong', {}, a.source.name), h('br'), 'Drop a new file to replace it') : h('span', {}, h('strong', {}, 'Choose a PVGIS hourly CSV'), h('br'), 'or drop it here')),
    input);
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drag'); if (e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]); });

  const m = a.source.meta;
  const info = a.source.whPerKwp
    ? h('dl', { class: 'kv' },
      h('dt', {}, 'Year modelled'), h('dd', {}, `${a.source.year} (median-yield year)`),
      h('dt', {}, 'Yield'), h('dd', {}, `${fmt.n0(a.source.whPerKwp.reduce((x, y) => x + y, 0) / 1000)} kWh/kWp`),
      m?.slope != null ? [h('dt', {}, 'Slope / azimuth'), h('dd', {}, `${m.slope}° / ${m.azimuth}°`)] : null,
      m?.estimatedFromIrradiance ? [h('dt', {}, 'Note'), h('dd', {}, 'Estimated from irradiance (no P column)')] : null)
    : null;
  return h('div', { class: 'stack', style: { '--gap': '10px' } }, drop, info,
    h('details', { class: 'more' }, h('summary', {}, 'How to get your PVGIS file'),
      h('ol', { class: 'small text-2', style: { paddingLeft: '18px', margin: '8px 0 0' } },
        h('li', {}, 'Open ', h('a', { href: 'https://re.jrc.ec.europa.eu/pvg_tools/en/', target: '_blank', rel: 'noopener' }, 'PVGIS'), ' (European Commission, free) and find your address on the map.'),
        h('li', {}, 'Choose the “Hourly data” tab. Tick “PV power”.'),
        h('li', {}, 'Enter your panel size as installed peak power, 14% system loss, your roof slope, and azimuth (0 = south, −90 = east, 90 = west).'),
        h('li', {}, 'Pick a range of years (e.g. 2014–2023) and download the CSV.'),
        h('li', {}, 'Drop it here. Energy Pilot models the median-yield year. The file stays on your device.'))));
}

function solarSection() {
  const s = getScenario();
  const kwp = s.arrays.reduce((t, a) => t + a.kwp, 0);
  return section('solar', 'Solar panels', `${fmt.n1(kwp)} kWp across ${s.arrays.length} array${s.arrays.length > 1 ? 's' : ''}`, 'panel', [
    ...s.arrays.map((a, i) => arrayCard(a, i, s.arrays.length)),
    s.arrays.length < 3
      ? h('button', {
        class: 'btn btn-sm', type: 'button',
        onclick: () => {
          update((sc) => sc.arrays.push({ label: `Array ${sc.arrays.length + 1}`, kwp: 2, source: { type: 'sample', location: REF.regionSample[sc.region], aspect: 'W' } }), { silent: true });
          rebuild();
        },
      }, icon('plus'), 'Add another roof face')
      : h('p', { class: 'hint small muted' }, 'Up to three arrays.'),
    h('div', { class: 'fields' },
      numberField({ label: 'Inverter rating', path: 'inverterKw', unit: 'kW', step: 0.1, min: 0 }),
      numberField({ label: 'Export limit', path: 'exportLimitKw', unit: 'kW', step: 0.01, min: 0, hint: '0 = no limit. G98 single phase: 3.68 kW.' })),
    segmented({
      label: 'Inverter type', path: 'hybrid', structural: false,
      options: [[true, 'Hybrid (DC-coupled)'], [false, 'AC-coupled']],
    }),
    h('p', { class: 'hint small muted' }, s.hybrid
      ? 'One inverter for panels and battery. The battery can soak up solar above the inverter limit.'
      : 'Separate solar inverter (output above its rating is clipped) and battery inverter.'),
  ]);
}

function windowRows(kind) {
  const s = getScenario();
  const list = s.battery[kind];
  const isCharge = kind === 'forcedCharge';
  const pctKey = isCharge ? 'targetPct' : 'minPct';
  return h('div', { class: 'stack', style: { '--gap': '8px' } },
    h('span', { class: 'label small', style: { fontWeight: 600 } }, isCharge ? 'Charge from the grid' : 'Discharge to the grid'),
    list.length ? list.map((w, i) => h('div', { class: 'window-row' },
      selectField({ label: 'From', path: `battery.${kind}.${i}.from`, options: hourOptions, structural: false }),
      selectField({ label: 'To', path: `battery.${kind}.${i}.to`, options: hourOptions, structural: false }),
      numberField({ label: isCharge ? 'Up to' : 'Down to', path: `battery.${kind}.${i}.${pctKey}`, unit: '%', step: 5, min: 0, max: 100 }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove window', onclick: () => { update((sc) => sc.battery[kind].splice(i, 1), { silent: true }); rebuild(); } }, icon('x'))))
      : h('p', { class: 'hint small muted' }, 'None'),
    h('button', {
      class: 'btn btn-sm', type: 'button', style: { alignSelf: 'flex-start' },
      onclick: () => {
        update((sc) => sc.battery[kind].push(isCharge ? { from: 2, to: 5, targetPct: 100 } : { from: 16, to: 19, minPct: 20 }), { silent: true });
        rebuild();
      },
    }, icon('plus'), 'Add window'));
}

function batterySection() {
  const s = getScenario();
  const b = s.battery;
  const body = [switchField('Include a battery', 'battery.enabled')];
  if (b.enabled) {
    body.push(
      h('div', { class: 'fields' },
        numberField({ label: 'Usable capacity', path: 'battery.capacityKwh', unit: 'kWh', step: 0.1, min: 0, full: true }),
        numberField({ label: 'Max charge rate', path: 'battery.maxChargeKw', unit: 'kW', step: 0.1, min: 0 }),
        numberField({ label: 'Max discharge rate', path: 'battery.maxDischargeKw', unit: 'kW', step: 0.1, min: 0 }),
        numberField({ label: 'Round-trip efficiency', path: 'battery.roundTripPct', unit: '%', step: 1, min: 50, max: 100 }),
        numberField({ label: 'Minimum level (reserve)', path: 'battery.reservePct', unit: '%', step: 1, min: 0, max: 100 })),
      segmented({
        label: 'Charge and discharge rules', path: 'battery.rulesMode',
        options: [['auto', 'Set from tariff'], ['custom', 'My own rules']],
        onSet: (sc, v) => {
          if (v === 'custom' && lastResult && !sc.battery.forcedCharge.length && !sc.battery.forcedDischarge.length) {
            sc.battery.forcedCharge = structuredClone(lastResult.rules.forcedCharge);
            sc.battery.forcedDischarge = structuredClone(lastResult.rules.forcedDischarge);
            sc.battery.holdInChargeWindow = lastResult.rules.holdInChargeWindow;
          }
        },
      }),
    );
    if (b.rulesMode === 'custom') {
      body.push(windowRows('forcedCharge'), windowRows('forcedDischarge'),
        switchField('Don’t use the battery during charge windows', 'battery.holdInChargeWindow', { structural: false }));
    } else {
      body.push(h('div', { class: 'note', id: 'auto-rules' }, icon('info'), h('span', {}, 'Rules appear here once results are ready.')));
    }
  }
  return section('battery', 'Battery', b.enabled ? `${fmt.n1(b.capacityKwh)} kWh usable · ${b.rulesMode === 'auto' ? 'rules from tariff' : 'own rules'}` : 'No battery', 'battery', body);
}

function tariffOptions(direction) {
  const presets = Object.entries(REF.tariffs).filter(([, t]) => t.direction === direction);
  return [
    { group: 'Octopus Energy', options: presets.filter(([k]) => !['seg', 'none'].includes(k)).map(([k, t]) => [k, t.name]) },
    { group: 'Other', options: [...presets.filter(([k]) => ['seg', 'none'].includes(k)).map(([k, t]) => [k, t.name]), [`custom-${direction}`, 'Custom tariff…']] },
  ];
}

function tariffBadge(id) {
  return h('span', { class: 'tariff-badge', 'data-tariff': id });
}

function customEditor(id) {
  const s = getScenario();
  const def = s.tariffs.custom[id];
  const base = `tariffs.custom.${id}`;
  return h('div', { class: 'subcard' },
    h('div', { class: 'subcard-head' }, h('strong', { class: 'small' }, id === 'custom-import' ? 'Custom import tariff' : 'Custom export tariff')),
    h('div', { class: 'fields' },
      h('div', { class: 'field' }, h('label', {}, 'Name'), h('input', { class: 'input', value: def.name, oninput: (e) => { update((sc) => (sc.tariffs.custom[id].name = e.target.value), { silent: true }); onChange(); } })),
      numberField({ label: 'Standing charge', path: `${base}.standingChargeP`, unit: 'p/day', step: 0.01, min: 0 })),
    h('span', { class: 'hint' }, 'Later rows override earlier ones, so start with an all-day rate and add cheaper or dearer windows.'),
    def.bands.map((b, i) => h('div', { class: 'band-row' },
      selectField({ label: 'From', path: `${base}.bands.${i}.from`, options: halfHourOptions.slice(0, 48), structural: false }),
      selectField({ label: 'To', path: `${base}.bands.${i}.to`, options: halfHourOptions.slice(1), structural: false }),
      numberField({ label: 'Rate', path: `${base}.bands.${i}.rate`, unit: 'p/kWh', step: 0.01, min: 0 }),
      def.bands.length > 1 ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove band', onclick: () => { update((sc) => sc.tariffs.custom[id].bands.splice(i, 1), { silent: true }); rebuild(); } }, icon('x')) : h('span'))),
    h('button', { class: 'btn btn-sm', type: 'button', style: { alignSelf: 'flex-start' }, onclick: () => { update((sc) => sc.tariffs.custom[id].bands.push({ from: 2, to: 5, rate: 10 }), { silent: true }); rebuild(); } }, icon('plus'), 'Add time band'));
}

function tariffSection() {
  const s = getScenario();
  const t = s.tariffs;
  const usesCustom = [...new Set([t.currentImport, t.proposedImport, t.proposedExport])].filter((x) => x.startsWith('custom'));
  return section('tariffs', 'Tariffs', `${tariffName(t.currentImport, s)} → ${tariffName(t.proposedImport, s)}`, 'tariff', [
    selectField({ label: 'Your current tariff', path: 'tariffs.currentImport', options: tariffOptions('import'), full: true }),
    tariffBadge(t.currentImport),
    selectField({ label: 'Import tariff with the new system', path: 'tariffs.proposedImport', options: tariffOptions('import'), full: true }),
    tariffBadge(t.proposedImport),
    selectField({ label: 'Export tariff', path: 'tariffs.proposedExport', options: tariffOptions('export'), full: true }),
    tariffBadge(t.proposedExport),
    ...usesCustom.map(customEditor),
  ]);
}

function financeSection() {
  const s = getScenario();
  return section('finance', 'Costs and finance', `${fmt.gbp(s.finance.solarCost + (s.battery.enabled ? s.finance.batteryCost : 0))} upfront · ${s.finance.lifetimeYears} years`, 'pound', [
    h('div', { class: 'fields' },
      numberField({ label: 'Solar installed cost', path: 'finance.solarCost', prefix: '£', step: 100, min: 0 }),
      numberField({ label: 'Battery installed cost', path: 'finance.batteryCost', prefix: '£', step: 100, min: 0 }),
      numberField({ label: 'System lifetime', path: 'finance.lifetimeYears', unit: 'yrs', step: 1, min: 1, max: 40 }),
      numberField({ label: 'Maintenance', path: 'finance.maintenancePerYear', prefix: '£', unit: '/yr', step: 10, min: 0 }),
      numberField({ label: 'Panel degradation', path: 'finance.panelDegradationPct', unit: '%/yr', step: 0.1, min: 0 }),
      numberField({ label: 'Battery capacity fade', path: 'finance.batteryFadePct', unit: '%/yr', step: 0.1, min: 0 }),
      numberField({ label: 'Battery replaced after', path: 'finance.batteryLifeYears', unit: 'yrs', step: 1, min: 0 }),
      numberField({ label: 'Battery replacement', path: 'finance.batteryReplaceCost', prefix: '£', step: 100, min: 0 }),
      numberField({ label: 'Inverter replaced after', path: 'finance.inverterLifeYears', unit: 'yrs', step: 1, min: 0 }),
      numberField({ label: 'Inverter replacement', path: 'finance.inverterReplaceCost', prefix: '£', step: 50, min: 0 }),
      numberField({ label: 'Import price rise', path: 'finance.importInflationPct', unit: '%/yr', step: 0.1 }),
      numberField({ label: 'Export price rise', path: 'finance.exportInflationPct', unit: '%/yr', step: 0.1 })),
    h('p', { class: 'hint small muted' }, 'Replacement costs are in today’s money. Default costs are illustrative; use your quotes.'),
  ]);
}

// ------------------------------------------------------------ toolbar

function toolbar() {
  const s = getScenario();
  const saved = listSaved();
  const nameInput = h('input', {
    class: 'input name', value: s.name, 'aria-label': 'Scenario name',
    oninput: (e) => update((sc) => (sc.name = e.target.value), { silent: true }),
  });
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try {
      const { current, count } = importBundle(await f.text());
      if (current) setScenario(current, { silent: true });
      toast(`Imported${count ? ` ${count} saved scenario${count > 1 ? 's' : ''}` : ' scenario'}.`);
      rebuildAll();
    } catch (e) {
      toast(`Couldn’t import: ${e.message}`);
    }
  });
  return h('div', { class: 'card card-pad toolbar' },
    nameInput,
    h('button', {
      class: 'btn btn-primary', type: 'button',
      onclick: () => {
        const e = saveScenario(getScenario());
        if (!e) return toast('Couldn’t save: browser storage is unavailable.');
        update((sc) => (sc.id = e.id), { silent: true });
        toast(`Saved “${e.name}”.`);
        rebuildAll();
      },
    }, icon('save'), 'Save'),
    saved.length
      ? h('select', {
        class: 'input', style: { width: 'auto', maxWidth: '220px' }, 'aria-label': 'Open a saved scenario',
        onchange: (e) => {
          const entry = listSaved().find((x) => x.id === e.target.value);
          if (entry) {
            setScenario(structuredClone(entry.scenario), { silent: true });
            rebuildAll();
          }
        },
      }, h('option', { value: '' }, `Open saved (${saved.length})`), saved.map((x) => h('option', { value: x.id, selected: x.id === s.id }, x.name)))
      : null,
    h('span', { style: { flex: 1 } }),
    h('button', {
      class: 'btn btn-ghost', type: 'button',
      onclick: async () => {
        const { url, dropped } = await shareLink(getScenario());
        try {
          await navigator.clipboard.writeText(url);
          toast(dropped ? 'Link copied. Uploaded files aren’t included; the link uses sample data.' : 'Link copied to clipboard.');
        } catch {
          prompt('Copy this link', url);
        }
      },
    }, icon('share'), 'Share link'),
    h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => downloadJson(exportBundle(getScenario()), `energy-pilot-${new Date().toISOString().slice(0, 10)}.json`) }, icon('download'), 'Export'),
    h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => fileInput.click() }, icon('upload'), 'Import'),
    fileInput,
    h('button', {
      class: 'btn btn-ghost', type: 'button',
      onclick: () => {
        if (!confirm('Reset all inputs to the defaults? Saved scenarios are kept.')) return;
        setScenario(defaultScenario(getScenario().region), { silent: true });
        rebuildAll();
      },
    }, 'Reset'));
}

// ------------------------------------------------------------ results

function typicalDay(r, m) {
  const { localHour, month } = timeAxis();
  const hr = r.withSystem.sim.hourly;
  const keys = ['load', 'pv', 'import', 'export', 'soc'];
  const sum = Object.fromEntries(keys.map((k) => [k, new Array(24).fill(0)]));
  const n = new Array(24).fill(0);
  for (let h0 = 0; h0 < HOURS; h0++) {
    if (month[h0] !== m) continue;
    const lh = localHour[h0];
    n[lh]++;
    for (const k of keys) sum[k][lh] += hr[k][h0];
  }
  const cap = r.withSystem.sim.capacityKwh;
  return Object.fromEntries(keys.map((k) => [k, sum[k].map((v, i) => (k === 'soc' ? (cap ? (v / n[i] / cap) * 100 : 0) : v / n[i]))]));
}

function describeRules(rules, battery) {
  if (!battery.enabled) return 'No battery.';
  const parts = [];
  for (const w of rules.forcedCharge) parts.push(`Charge from the grid ${fmt.hour(w.from)}–${fmt.hour(w.to)} up to ${w.targetPct}%`);
  for (const w of rules.forcedDischarge) parts.push(`Export from the battery ${fmt.hour(w.from)}–${fmt.hour(w.to)} down to ${w.minPct}%`);
  if (rules.holdInChargeWindow) parts.push('Hold the battery during charge windows');
  parts.push(`Otherwise store surplus solar and power the home, keeping ${battery.reservePct}% in reserve`);
  return parts;
}

function sourceText(t) {
  if (t.source?.type === 'octopus') {
    if (t.kind === 'series') return { cls: 'badge-live', text: `Octopus · ${t.source.from.slice(0, 10)} to ${t.source.to.slice(0, 10)}` };
    return { cls: 'badge-live', text: `Octopus rates · ${t.source.date}` };
  }
  if (t.source?.type === 'custom') return { cls: '', text: 'Your rates' };
  return { cls: 'badge-warn', text: 'Fallback figures, not live rates' };
}

function updateBadges(r) {
  const map = { [getScenario().tariffs.currentImport]: r.tariffs.current, [getScenario().tariffs.proposedImport]: r.tariffs.proposedImport, [getScenario().tariffs.proposedExport]: r.tariffs.proposedExport };
  for (const el of document.querySelectorAll('.tariff-badge')) {
    const t = map[el.dataset.tariff];
    if (!t) continue;
    const { cls, text } = sourceText(t);
    const prices = t.kind === 'series' ? null : [...new Set(t.halfHourly)].sort((a, b) => a - b);
    el.replaceChildren(h('span', { class: `badge ${cls}` }, h('span', { class: 'dot' }), text),
      h('span', { class: 'small muted', style: { marginLeft: '8px' } },
        prices ? (prices.length === 1 ? `${fmt.pence(prices[0])}/kWh` : `${fmt.pence(prices[0])}–${fmt.pence(prices.at(-1))}/kWh`) : 'half-hourly prices',
        t.standingChargeP ? ` · ${fmt.pence(t.standingChargeP)}/day` : ''));
  }
  const auto = document.getElementById('auto-rules');
  if (auto) {
    const lines = describeRules(r.rules, getScenario().battery);
    auto.replaceChildren(icon('info'), h('div', {}, h('strong', {}, 'Rules from your new tariff'), h('ul', { style: { margin: '4px 0 0', paddingLeft: '18px' } }, lines.map((l) => h('li', {}, l)))));
  }
}

function tile(label, value, foot) {
  return h('div', { class: 'card tile' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), foot ? h('div', { class: 'foot' }, foot) : null);
}

function renderResults(container, r, data) {
  destroyAll();
  const s = getScenario();
  const c = colors();
  const t = r.withSystem.sim.totals;
  const life = r.lifetime;
  const notes = [];
  const fallbacks = [r.tariffs.current, r.tariffs.proposedImport, r.tariffs.proposedExport].filter((x) => x.source?.type === 'fallback');
  if (fallbacks.length) notes.push(h('div', { class: 'note note-warn' }, icon('alert'), h('span', {}, `Using hand-entered fallback rates for ${[...new Set(fallbacks.map((x) => x.name))].join(', ')}. Live regional rates aren’t bundled yet. Check them against your own tariff.`)));

  const summary = h('div', { class: 'summary-bar', 'aria-label': 'Summary' },
    h('div', {}, h('div', { class: 'k' }, 'Saving, year one'), h('div', { class: 'v' }, fmt.gbp(r.annualSaving))),
    h('div', {}, h('div', { class: 'k' }, 'Payback'), h('div', { class: 'v' }, life.paybackYears === null ? 'Not in lifetime' : fmt.years(life.paybackYears))),
    h('div', {}, h('div', { class: 'k' }, 'Return (IRR)'), h('div', { class: 'v' }, fmt.pct1(life.irr))),
    h('div', {}, h('div', { class: 'k' }, 'Self-sufficiency'), h('div', { class: 'v' }, fmt.pct(t.selfSufficiency))));

  const before = r.baseline.bill.netP / 100;
  const after = r.withSystem.bill.netP / 100;
  const maxAbs = Math.max(Math.abs(before), Math.abs(after), 1);
  const billbar = (label, v, color) => h('div', { class: 'billbar' },
    h('span', { class: 'text-2' }, label),
    h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: `${(Math.max(v, 0) / maxAbs) * 100}%`, background: color } })),
    h('span', { class: 'val' }, v < 0 ? `${fmt.gbp(-v)} credit` : fmt.gbp(v)));
  const headline = h('div', { class: 'card headline' },
    h('div', {},
      h('div', { class: 'eyebrow' }, 'Estimated saving'),
      h('div', { class: 'hero-figure' }, fmt.gbp(r.annualSaving), h('span', { class: 'per' }, 'a year')),
      h('p', { class: 'sub' }, `In year one, compared with your current bill on ${r.tariffs.current.name}. Over ${s.finance.lifetimeYears} years the system returns ${fmt.gbp(life.totalReturn)} after its ${fmt.gbp(life.capex)} cost.`)),
    h('div', { class: 'billcompare' },
      h('div', { class: 'eyebrow' }, 'Annual electricity bill'),
      billbar('Now', before, c.grid),
      billbar('With system', after, c.solar),
      h('p', { class: 'small muted' }, 'Includes standing charges and export payments.')));

  const tiles = h('div', { class: 'tiles' },
    tile('Solar generated', fmt.kwh(t.pv), `${fmt.pct(t.selfConsumption)} used at home`),
    tile('Exported', fmt.kwh(t.export), `${fmt.gbp(r.withSystem.bill.exportIncomeP / 100)} earned`),
    tile('Imported', fmt.kwh(t.import), t.gridToBatt > 0 ? `${fmt.kwh(t.gridToBatt)} to charge the battery` : 'All for the home'),
    s.battery.enabled ? tile('Battery adds', `${fmt.gbp(r.batteryValue)}/yr`, `${fmt.n0(t.batteryCycles)} cycles a year`) : null,
    tile('Lifetime return', fmt.gbp(life.totalReturn), life.roiPct === null ? '' : `${fmt.n0(life.roiPct)}% on ${fmt.gbp(life.capex)}`),
    t.clipped + t.curtailed > 1 ? tile('Lost generation', fmt.kwh(t.clipped + t.curtailed), `${fmt.kwh(t.clipped)} clipped · ${fmt.kwh(t.curtailed)} over export limit`) : null);

  // Monthly sources
  const mSrc = r.withSystem.sim.monthly;
  const srcBox = canvasBox('', 'Monthly electricity used at home, by source');
  const sources = h('div', { class: 'card card-pad' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Where your electricity comes from'), h('p', {}, 'kWh used at home each month')),
    legend([['Solar, direct', c.solar], ['Battery', c.battery], ['Grid', c.grid]]),
    srcBox.box);

  // Monthly bill
  const billBox = canvasBox('', 'Monthly bill now and with the system');
  const bills = h('div', { class: 'card card-pad' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Monthly bill'), h('p', {}, 'Year one, including standing charges, net of export')),
    legend([['Now', c.grid], ['With system', c.solar]]),
    billBox.box);

  // Typical day
  const dayBox = canvasBox('tall', 'Average day: home use, solar and grid import by hour');
  const socBox = canvasBox('short', 'Average battery level by hour');
  const tabs = h('div', { class: 'tabs', role: 'group', 'aria-label': 'Month' }, MONTHS.map((name, m) => h('button', {
    type: 'button', 'aria-pressed': String(m === dayMonth),
    onclick: () => { dayMonth = m; renderResults(container, r, data); },
  }, name)));
  const day = h('div', { class: 'card card-pad' },
    h('div', { class: 'card-head' }, h('h2', {}, `An average day in ${MONTHS[dayMonth]}`), tabs),
    legend([['Home use', c.text2, 'line'], ['Solar', c.solar, 'line'], ['Grid import', c.grid, 'line'], ['Export', c.s4, 'line']]),
    dayBox.box,
    s.battery.enabled ? [h('h3', { style: { marginTop: '8px' } }, 'Battery level'), socBox.box] : null);

  // Lifetime
  const lifeBox = canvasBox('', 'Cumulative cashflow over the system lifetime');
  const tableRows = life.table.map((row) => h('tr', { class: [row.cumulative < 0 ? 'neg' : '', life.paybackYears !== null && Math.ceil(life.paybackYears) === row.year ? 'payback' : ''].join(' ') },
    h('td', {}, row.year), h('td', {}, fmt.gbp(row.saving)), h('td', {}, row.outlay ? fmt.gbp(-row.outlay) : '–'), h('td', { class: 'cum' }, fmt.gbp(row.cumulative)), h('td', { style: { textAlign: 'left' }, class: 'muted' }, row.notes.join(', '))));
  const lifetime = h('div', { class: 'card card-pad' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Lifetime cashflow'), h('p', {}, `Upfront ${fmt.gbp(life.capex)}, then yearly savings less replacements`)),
    lifeBox.box,
    h('details', { class: 'more' }, h('summary', {}, 'Year-by-year table'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Year'), h('th', {}, 'Saving'), h('th', {}, 'Outlay'), h('th', {}, 'Cumulative'), h('th', { style: { textAlign: 'left' } }, 'Notes'))),
        h('tbody', {}, h('tr', {}, h('td', {}, '0'), h('td', {}, '–'), h('td', {}, fmt.gbp(-life.capex)), h('td', {}, fmt.gbp(-life.capex)), h('td', {})), tableRows)))));

  // Energy balance + tariffs in use
  const kv = (pairs) => h('dl', { class: 'kv' }, pairs.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
  const balance = h('div', { class: 'grid-2' },
    h('div', { class: 'card card-pad' }, h('div', { class: 'card-head' }, h('h2', {}, 'Energy balance'), h('p', {}, 'Year one')),
      kv([
        ['Home use', fmt.kwh(t.load)], ['Solar generated', fmt.kwh(t.pv)], ['Solar → home', fmt.kwh(t.pvToLoad)], ['Solar → battery', fmt.kwh(t.pvToBatt)],
        ['Solar → grid', fmt.kwh(t.pvExport)], ['Battery → home', fmt.kwh(t.battToLoad)], ['Battery → grid', fmt.kwh(t.battToGrid)],
        ['Grid → home', fmt.kwh(t.gridToLoad)], ['Grid → battery', fmt.kwh(t.gridToBatt)], ['Clipped by inverter', fmt.kwh(t.clipped)], ['Over export limit', fmt.kwh(t.curtailed)],
      ])),
    h('div', { class: 'card card-pad' }, h('div', { class: 'card-head' }, h('h2', {}, 'Tariffs and rules used')),
      h('div', { class: 'stack', style: { '--gap': '10px' } },
        [['Now', r.tariffs.current], ['Import with system', r.tariffs.proposedImport], ['Export', r.tariffs.proposedExport]].map(([label, tt]) => {
          const st = sourceText(tt);
          return h('div', {}, h('div', { class: 'small muted' }, label), h('div', { class: 'row', style: { '--gap': '8px' } }, h('strong', { class: 'small' }, tt.name), h('span', { class: `badge ${st.cls}` }, st.text)));
        }),
        s.battery.enabled ? h('div', {}, h('div', { class: 'small muted' }, 'Battery rules'), h('ul', { class: 'small', style: { margin: '4px 0 0', paddingLeft: '18px' } }, [].concat(describeRules(r.rules, s.battery)).map((l) => h('li', {}, l)))) : null)));

  container.replaceChildren(summary, ...notes, headline, tiles, sources, bills, day, lifetime, balance);

  // charts (after insertion so canvases have size)
  const monthKwh = (v) => `${fmt.n0(v)} kWh`;
  chart(srcBox.canvas, {
    type: 'bar', labels: MONTHS, stacked: true, yFormat: (v) => fmt.n0(v), tooltipFormat: monthKwh,
    datasets: [
      barSet('Solar, direct', mSrc.pvToLoad, c.solar, { top: false }),
      barSet('Battery', mSrc.battToLoad, c.battery, { top: false }),
      barSet('Grid', mSrc.gridToLoad, c.grid, { top: true }),
    ],
  });
  chart(billBox.canvas, {
    type: 'bar', labels: MONTHS, yFormat: (v) => `£${fmt.n0(v)}`, tooltipFormat: (v) => fmt.gbp2(v),
    datasets: [
      barSet('Now', r.monthlyBills.map((b) => b.baseline), c.grid, { gap: false }),
      barSet('With system', r.monthlyBills.map((b) => b.system), c.solar, { gap: false }),
    ],
  });
  const d = typicalDay(r, dayMonth);
  const hours = Array.from({ length: 24 }, (_, i) => fmt.hour(i));
  chart(dayBox.canvas, {
    type: 'line', labels: hours, yFormat: (v) => fmt.n1(v), tooltipFormat: (v) => `${fmt.n1(v)} kWh`, yTitle: 'kWh in the hour',
    datasets: [
      lineSet('Home use', d.load, c.text2),
      lineSet('Solar', d.pv, c.solar, { fill: true }),
      lineSet('Grid import', d.import, c.grid),
      lineSet('Export', d.export, c.s4),
    ],
  });
  if (s.battery.enabled) {
    chart(socBox.canvas, {
      type: 'line', labels: hours, yFormat: (v) => `${fmt.n0(v)}%`, tooltipFormat: (v) => `${fmt.n0(v)}%`,
      datasets: [lineSet('Battery level', d.soc, c.battery, { fill: true })],
      extra: { y: { min: 0, max: 100 } },
    });
  }
  const cum = [-life.capex, ...life.table.map((row) => row.cumulative)];
  chart(lifeBox.canvas, {
    type: 'line', labels: cum.map((_, i) => String(i)), xTitle: 'Year', yFormat: (v) => `£${new Intl.NumberFormat('en-GB', { notation: 'compact' }).format(v)}`, tooltipFormat: (v) => fmt.gbp(v),
    datasets: [lineSet('Cumulative', cum, c.solar, { fill: true, straight: true })],
    extra: {
      chartPlugins: [{
        id: 'zero',
        beforeDatasetsDraw(ch) {
          const y = ch.scales.y.getPixelForValue(0);
          const { left, right } = ch.chartArea;
          const ctx = ch.ctx;
          ctx.save();
          ctx.strokeStyle = c.axis;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
          ctx.stroke();
          if (life.paybackYears !== null) {
            const x = ch.scales.x.getPixelForValue(life.paybackYears);
            ctx.fillStyle = c.text2;
            ctx.font = '600 12px Inter, system-ui';
            ctx.textAlign = 'center';
            ctx.fillText(`Payback ${fmt.n1(life.paybackYears)} yrs`, x, y - 10);
            ctx.fillStyle = c.solar;
            ctx.strokeStyle = c.surface;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
        },
      }],
    },
  });
  updateBadges(r);
}

// ------------------------------------------------------------ page

export async function renderModeller(root, params) {
  if (params.get('s')) {
    try {
      setScenario(await readShare(params.get('s')), { silent: true });
      toast('Loaded a shared scenario.');
    } catch {
      toast('That share link couldn’t be read.');
    }
    history.replaceState(null, '', '#/modeller');
  }

  const inputs = h('aside', { class: 'inputs', 'aria-label': 'Inputs' });
  const results = h('section', { class: 'results', 'aria-label': 'Results', 'aria-live': 'polite' }, h('div', { class: 'loading' }, h('div', { class: 'spin' })));
  const bar = h('div');
  root.replaceChildren(h('div', { class: 'page stack', style: { '--gap': '20px' } },
    h('div', { class: 'row', style: { justifyContent: 'space-between' } },
      h('div', {}, h('div', { class: 'eyebrow' }, 'Solar + battery modeller'), h('h1', { style: { fontSize: 'clamp(26px, 4vw, 34px)' } }, 'Model your system, hour by hour')),
    ),
    bar,
    h('div', { class: 'modeller' }, inputs, results)));

  let seq = 0;
  const run = async () => {
    const my = ++seq;
    const s = getScenario();
    let data;
    try {
      data = await dataFor(s);
    } catch (e) {
      data = { samples: {}, tariffs: {}, missingSamples: [] };
    }
    if (my !== seq) return;
    try {
      if (data.missingSamples.length) throw new Error('Sample solar data isn’t available yet. Upload your own PVGIS file under Solar panels to see results.');
      const r = runScenario(s, data);
      lastResult = r;
      lastData = data;
      renderResults(results, r, data);
    } catch (e) {
      destroyAll();
      results.replaceChildren(h('div', { class: 'note note-error' }, icon('alert'), h('span', {}, e.message)));
    }
  };
  const runSoon = debounce(run, 200);
  const refreshSubtitles = debounce(() => {
    // keep section subtitles fresh without rebuilding inputs
    const s = getScenario();
    const kwp = s.arrays.reduce((t, a) => t + a.kwp, 0);
    const set = (id, text) => { const el = document.querySelector(`#sec-${id} .sec-sub`); if (el) el.textContent = text; };
    set('home', `${REF.regions[s.region]} · ${fmt.n0(s.annualKwh)} kWh a year`);
    set('solar', `${fmt.n1(kwp)} kWp across ${s.arrays.length} array${s.arrays.length > 1 ? 's' : ''}`);
    set('finance', `${fmt.gbp(s.finance.solarCost + (s.battery.enabled ? s.finance.batteryCost : 0))} upfront · ${s.finance.lifetimeYears} years`);
  }, 150);

  onChange = () => {
    runSoon();
    refreshSubtitles();
  };
  const buildInputs = () => {
    const scroll = inputs.scrollTop;
    inputs.replaceChildren(homeSection(), solarSection(), batterySection(), tariffSection(), financeSection());
    inputs.scrollTop = scroll;
    if (lastResult) updateBadges(lastResult);
  };
  rebuild = () => {
    buildInputs();
    run();
  };
  rebuildAllFn = () => {
    bar.replaceChildren(toolbar());
    rebuild();
  };
  rebuildAllFn();
}

let rebuildAllFn = () => {};
function rebuildAll() {
  rebuildAllFn();
}

export function rerenderModellerResults() {
  if (lastResult && document.querySelector('.results')) renderResults(document.querySelector('.results'), lastResult, lastData);
}
