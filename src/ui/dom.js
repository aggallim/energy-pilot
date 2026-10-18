// Tiny DOM helpers: h() builds elements, and a few formatters.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function icon(name) {
  const span = document.createElement('span');
  span.innerHTML = ICONS[name] || '';
  return span.firstElementChild;
}

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const ICONS = {
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  home: svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
  panel: svg('<path d="M4 4h16l-2 10H6z"/><path d="M5 9h14M12 4l-1 10M9 18h6M12 14v4"/>'),
  battery: svg('<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2M6 10v4M10 10v4"/>'),
  tariff: svg('<path d="M3 17l5-5 4 3 8-8"/><path d="M14 7h6v6"/>'),
  pound: svg('<path d="M17 20H7c2-1.5 3-3.5 3-6V8a4 4 0 0 1 7.5-2"/><path d="M6 13h9"/>'),
  chevron: svg('<path d="m6 9 6 6 6-6"/>'),
  upload: svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  alert: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>'),
  share: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'),
  save: svg('<path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M8 3v5h8M8 21v-7h8v7"/>'),
  download: svg('<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>'),
  compare: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  bolt: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  chart: svg('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
  cloud: svg('<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1 0 8z"/>'),
  piggy: svg('<path d="M19 9c1 1 1.5 2 1.5 3.5 0 3-3 5.5-7.5 5.5S5 15.5 5 12.5 8 7 13 7c2 0 4 .5 6 2z"/><path d="M8 17v3M16 17v3M5 12H3M15 10h.01"/>'),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  offline: svg('<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
};

const gbp0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const gbp2 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const n1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

export const fmt = {
  gbp: (v) => (v === null || !Number.isFinite(v) ? '–' : gbp0.format(Math.round(v)).replace('-', '−')),
  gbp2: (v) => (v === null || !Number.isFinite(v) ? '–' : gbp2.format(v).replace('-', '−')),
  kwh: (v) => `${n0.format(v)} kWh`,
  n0: (v) => n0.format(v),
  n1: (v) => n1.format(v),
  pct: (v) => (v === null || !Number.isFinite(v) ? '–' : `${n0.format(v * 100)}%`),
  pct1: (v) => (v === null || !Number.isFinite(v) ? '–' : `${n1.format(v * 100)}%`),
  years: (v) => (v === null || !Number.isFinite(v) ? 'Not within lifetime' : `${n1.format(v)} yrs`),
  pence: (v) => `${n1.format(v)}p`,
  hour: (v) => `${String(Math.floor(v)).padStart(2, '0')}:${v % 1 ? '30' : '00'}`,
};

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
