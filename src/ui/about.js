import { h } from './dom.js';
import { loadManifest } from '../data.js';
import { UK_REFERENCE } from '../reference.js';

export async function renderAbout(root) {
  const m = await loadManifest();
  const date = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'not yet fetched');
  const f = UK_REFERENCE.finance;
  root.replaceChildren(h('div', { class: 'page' }, h('article', { class: 'prose' },
    h('div', { class: 'eyebrow' }, 'How it works'),
    h('h1', { style: { fontSize: 'clamp(26px, 4vw, 34px)', color: 'var(--text)' } }, 'Method, data and privacy'),
    h('p', {}, 'Energy Pilot gives illustrative estimates to help you compare options. It is not a quote, a survey or financial advice. Real results depend on your roof, shading, habits, equipment settings and future prices.'),

    h('h2', {}, 'The hourly model'),
    h('p', {}, 'The modeller simulates every hour of a year (8,760 steps) in UK local time. In each hour:'),
    h('ul', {},
      h('li', {}, 'Solar powers the home first.'),
      h('li', {}, 'Surplus solar charges the battery, then exports up to your export limit. Anything left is lost: clipped if the inverter is the limit, curtailed if the export limit is.'),
      h('li', {}, 'The battery powers the home down to its reserve level, unless a charge window says to hold it.'),
      h('li', {}, 'In a forced discharge window the battery also exports, down to that window’s floor. In a forced charge window it charges from the grid up to the target.'),
      h('li', {}, 'The grid covers the rest.')),
    h('p', {}, 'With a hybrid (DC-coupled) inverter the panels and battery share one inverter, so solar above the inverter rating can still charge the battery. With an AC-coupled battery, the solar inverter clips anything above its rating.'),
    h('p', {}, 'When battery rules are “set from tariff”, Energy Pilot charges from the grid in the tariff’s cheapest window (if it is at least 5p below the average) and exports from the battery in the best export window, if that pays at least 5p more than the stored energy cost. You can switch to your own rules at any time.'),

    h('h2', {}, 'Money over the lifetime'),
    h('p', {}, `Year by year, the model re-runs the simulation with panels losing ${f.panelDegradationPct}% a year and the battery fading ${f.batteryFadePct}% a year (reset when it is replaced after ${f.batteryLifeYears} years). Import prices rise ${f.importInflationPct}% a year and export prices ${f.exportInflationPct}% a year. The saving is the bill you would have paid on your current tariff without the system, minus the bill with it. Payback is when cumulative savings cover the upfront cost and replacements. IRR is the annual rate that makes the cashflows net to zero. All of these are editable defaults, not forecasts.`),

    h('h2', {}, 'Data sources'),
    h('ul', {},
      h('li', {}, h('strong', {}, 'Solar yield: '), 'European Commission JRC, PVGIS 5.3 (SARAH3 satellite data). Bundled samples cover four UK locations and five orientations at 35°, using each location’s median-yield year between 2014 and 2023. Fetched ', date(m?.pvgis?.fetchedAt), '. Upload your own PVGIS hourly file for your exact roof.'),
      h('li', {}, h('strong', {}, 'Tariffs: '), 'Octopus Energy public API, regional unit rates and standing charges including VAT, from one recent day. Fetched ', date(m?.tariffs?.fetchedAt), '. Agile and Agile Outgoing use the previous 12 months of half-hourly prices, averaged into hours.'),
      h('li', {}, h('strong', {}, 'Typical use: '), `Ofgem’s typical domestic consumption value for a medium electricity user (${UK_REFERENCE.typicalAnnualKwh.toLocaleString('en-GB')} kWh a year).`),
      h('li', {}, h('strong', {}, 'Export limit: '), 'ENA Engineering Recommendation G98 (16 A per phase, about 3.68 kW single phase).'),
      h('li', {}, h('strong', {}, 'Fallbacks: '), 'If live rates are missing, hand-entered approximate rates are used and clearly flagged.')),
    h('p', {}, 'The data is refreshed monthly by an automated job that runs on GitHub’s servers. Your browser only ever loads the bundled files.'),

    h('h2', {}, 'Privacy'),
    h('p', {}, 'There are no accounts, cookies, analytics or adverts. Calculations run in your browser. Scenarios and uploaded files are kept in this browser’s storage and leave it only if you export a file or copy a share link. Share links contain your inputs (not your uploaded files) in the link itself; no server stores them.'),

    h('h2', {}, 'Known limitations'),
    h('ul', {},
      h('li', {}, 'Home use follows an illustrative daily shape (low overnight, morning and evening peaks, higher in winter), not your real meter data. Real days vary more, so real self-consumption is usually a little lower.'),
      h('li', {}, 'Time steps are hourly, so tariff windows that start on the half-hour (e.g. 23:30) average the two rates in that hour.'),
      h('li', {}, 'Battery rules use fixed daily windows. Agile is modelled with the same windows every day, not a daily optimiser, so it shows what simple timer settings achieve.'),
      h('li', {}, 'Shading, snow and equipment faults are not modelled beyond PVGIS’s system loss figure.'),
      h('li', {}, 'Tariffs are taken as constant (plus inflation) over the lifetime; real tariffs change.')),

    h('h2', {}, 'Open source'),
    h('p', {}, 'The engine is a small, unit-tested JavaScript module. Code, method notes and data scripts: ', h('a', { href: 'https://github.com/aggallim/energy-pilot', target: '_blank', rel: 'noopener' }, 'github.com/aggallim/energy-pilot'), '.'))));
}
