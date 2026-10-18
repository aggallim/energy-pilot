// App shell: hash router, theme toggle, service worker.

import { renderHome } from './ui/home.js';
import { renderModeller, rerenderModellerResults } from './ui/modeller.js';
import { renderCompare } from './ui/compare.js';
import { renderAbout } from './ui/about.js';
import { destroyAll } from './ui/charts.js';
import { icon } from './ui/dom.js';

const ROUTES = {
  '': { render: renderHome, title: 'Energy Pilot: free UK solar and battery planner' },
  modeller: { render: renderModeller, title: 'Modeller · Energy Pilot' },
  compare: { render: renderCompare, title: 'Compare · Energy Pilot' },
  about: { render: renderAbout, title: 'How it works · Energy Pilot' },
};

const app = document.getElementById('app');
let currentRoute = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { name: ROUTES[path] ? path : '', params: new URLSearchParams(query) };
}

async function route() {
  const { name, params } = parseHash();
  const r = ROUTES[name];
  destroyAll();
  document.title = r.title;
  for (const a of document.querySelectorAll('.nav a')) {
    if (a.dataset.route === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (currentRoute !== name) window.scrollTo(0, 0);
  currentRoute = name;
  await r.render(app, params);
}

// ------------------------------------------------------------ theme

const toggle = document.getElementById('theme-toggle');
const systemDark = matchMedia('(prefers-color-scheme: dark)');
const effectiveTheme = () => document.documentElement.dataset.theme || (systemDark.matches ? 'dark' : 'light');

function paintToggle() {
  const dark = effectiveTheme() === 'dark';
  toggle.replaceChildren(icon(dark ? 'sun' : 'moon'));
  toggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
}

function themeChanged() {
  paintToggle();
  // Charts read colours from CSS when drawn, so redraw them.
  if (currentRoute === 'modeller') rerenderModellerResults();
  else if (currentRoute === 'compare') route();
}

toggle.addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('ep.theme', next);
  } catch {}
  themeChanged();
});
systemDark.addEventListener('change', () => !document.documentElement.dataset.theme && themeChanged());

// ------------------------------------------------------------ boot

window.addEventListener('hashchange', route);
paintToggle();
route();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
