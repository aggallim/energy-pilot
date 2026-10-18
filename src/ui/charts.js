// Chart.js wrapper that applies the design system's chart specs: thin marks,
// rounded data-ends square at the baseline, 2px surface gaps in stacks,
// recessive hairline grid, HTML legends, themed tooltips.

import { h } from './dom.js';

const live = new Set();

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function colors() {
  return {
    grid: css('--series-1'),
    solar: css('--series-2'),
    battery: css('--series-3'),
    s4: css('--series-4'),
    text: css('--text'),
    text2: css('--text-2'),
    muted: css('--muted'),
    gridline: css('--grid'),
    axis: css('--axis'),
    surface: css('--surface'),
    border: css('--border-strong'),
  };
}

// Canvas can't parse CSS color functions, so washes use rgba from hex.
export function alpha(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });

export function destroyAll() {
  for (const c of live) c.destroy();
  live.clear();
}

export function chart(canvas, { type, labels, datasets, yTitle, yFormat, tooltipFormat, stacked = false, xTitle, extra = {} }) {
  const c = colors();
  const fmtY = yFormat || ((v) => compact.format(v));
  const chartObj = new window.Chart(canvas, {
    type,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 6, right: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: c.surface,
          borderColor: c.border,
          borderWidth: 1,
          titleColor: c.text,
          bodyColor: c.text2,
          titleFont: { family: 'Inter', weight: '600', size: 13 },
          bodyFont: { family: 'Inter', size: 12 },
          padding: 10,
          cornerRadius: 10,
          boxPadding: 4,
          usePointStyle: true,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${(tooltipFormat || fmtY)(ctx.parsed.y)}`,
            labelColor: (ctx) => ({ borderColor: ctx.dataset.borderColor === c.surface ? ctx.dataset.backgroundColor : ctx.dataset.borderColor, backgroundColor: ctx.dataset.legendColor || ctx.dataset.backgroundColor, borderRadius: 3 }),
          },
        },
        ...(extra.plugins || {}),
      },
      scales: {
        x: {
          stacked,
          grid: { display: false },
          border: { color: c.axis },
          ticks: { color: c.muted, font: { family: 'Inter', size: 12 }, maxRotation: 0, autoSkipPadding: 12 },
          title: xTitle ? { display: true, text: xTitle, color: c.muted, font: { family: 'Inter', size: 12 } } : undefined,
        },
        y: {
          stacked,
          grid: { color: c.gridline, lineWidth: 1 },
          border: { display: false },
          ticks: { color: c.muted, font: { family: 'Inter', size: 12 }, callback: (v) => fmtY(v), maxTicksLimit: 6 },
          title: yTitle ? { display: true, text: yTitle, color: c.muted, font: { family: 'Inter', size: 12 } } : undefined,
          ...(extra.y || {}),
        },
      },
      ...(extra.options || {}),
    },
    plugins: extra.chartPlugins || [],
  });
  live.add(chartObj);
  return chartObj;
}

// Stacked or grouped column datasets with the bar specs.
export function barSet(label, data, color, { top = true, gap = true } = {}) {
  const c = colors();
  return {
    label,
    data,
    backgroundColor: color,
    legendColor: color,
    borderColor: c.surface,
    borderWidth: gap ? { top: 2, left: 0, right: 0, bottom: 0 } : 0,
    borderSkipped: 'start',
    borderRadius: top ? { topLeft: 4, topRight: 4 } : 0,
    maxBarThickness: 24,
    categoryPercentage: 0.7,
    barPercentage: 0.9,
  };
}

export function lineSet(label, data, color, { fill = false, dash = null, straight = false } = {}) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: fill ? alpha(color, 0.1) : color,
    legendColor: color,
    borderWidth: 2,
    borderDash: dash || [],
    borderCapStyle: 'round',
    borderJoinStyle: 'round',
    pointRadius: 0,
    pointHoverRadius: 5,
    pointHoverBorderWidth: 2,
    pointHoverBorderColor: colors().surface,
    pointHoverBackgroundColor: color,
    tension: straight ? 0 : 0.3,
    cubicInterpolationMode: straight ? 'default' : 'monotone',
    fill: fill ? 'origin' : false,
  };
}

export function legend(items) {
  return h('div', { class: 'legend' }, items.map(([label, color, kind]) =>
    h('span', {}, h('i', { class: kind === 'line' ? 'line' : '', style: { background: color } }), label)));
}

export function canvasBox(cls = '', label = '') {
  const canvas = h('canvas', { role: 'img', 'aria-label': label });
  return { box: h('div', { class: `chart-box ${cls}` }, canvas), canvas };
}
