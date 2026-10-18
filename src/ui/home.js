import { h, icon } from './dom.js';

const TOOLS = [
  { href: '#/modeller', icon: 'panel', title: 'Solar + battery modeller', text: 'Model your roof, battery and smart tariff hour by hour for a full year, then see the bill, payback and lifetime return.', live: true },
  { icon: 'battery', title: 'Battery only', text: 'Is a battery worth it without panels? Payback from charging cheap and using or exporting at peak times.' },
  { icon: 'piggy', title: 'Solar vs investing', text: 'Compare putting the money into panels with leaving it in savings or an index fund.' },
  { icon: 'bolt', title: 'Agile prices', text: 'Today’s and tomorrow’s Octopus Agile prices for your region, with the cheapest times highlighted.' },
  { icon: 'cloud', title: 'Solar forecast', text: 'Expected generation for the week ahead, to plan when to run the washing or charge the car.' },
];

export function renderHome(root) {
  root.replaceChildren(h('div', { class: 'page' },
    h('section', { class: 'hero' },
      h('div', { class: 'hero-mark', 'aria-hidden': 'true', html: '<svg viewBox="0 0 64 64" width="56" height="56"><use href="#mark"/></svg>' }),
      h('h1', {}, 'Plan solar and batteries ', h('span', {}, 'with clear numbers.')),
      h('p', { class: 'lede' }, 'Free, independent tools for UK homes. Model your roof, battery and smart tariff hour by hour, with every assumption visible. No sign-up and no adverts, and your figures never leave your device.'),
      h('div', { class: 'row' },
        h('a', { class: 'btn btn-primary btn-lg', href: '#/modeller' }, 'Open the modeller'),
        h('a', { class: 'btn btn-lg', href: '#/about' }, 'How it works'))),
    h('section', { class: 'stack', style: { '--gap': '14px' } },
      h('div', { class: 'eyebrow' }, 'Tools'),
      h('div', { class: 'tools' }, TOOLS.map((t) => {
        const inner = [
          h('div', { class: 'row', style: { justifyContent: 'space-between' } },
            h('span', { class: 'icon' }, icon(t.icon)),
            t.live ? null : h('span', { class: 'badge' }, 'Coming soon')),
          h('h3', {}, t.title),
          h('p', {}, t.text),
        ];
        return t.live ? h('a', { class: 'card tool', href: t.href }, inner) : h('div', { class: 'card tool soon', 'aria-disabled': 'true' }, inner);
      }))),
    h('section', { class: 'principles' },
      [['lock', 'Private by design', 'No accounts, no tracking, no server. Calculations run in your browser and scenarios are saved only on this device.'],
        ['eye', 'Transparent', 'Hourly simulation with the rules written down. Every rate, cost and assumption is shown and can be changed.'],
        ['tariff', 'Real UK data', 'Regional Octopus tariff rates, a year of Agile prices and PVGIS solar data, each dated and cited.'],
        ['offline', 'Works offline', 'Install it like an app. Once loaded, it keeps working without a connection.'],
      ].map(([ic, title, text]) => h('div', {}, h('span', { class: 'p-icon' }, icon(ic)), h('h3', {}, title), h('p', {}, text))))));
}
