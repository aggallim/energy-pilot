// Scenario persistence. Everything stays in this browser (localStorage), and
// leaves it only when the user exports a file or copies a share link.

import { defaultScenario, SCENARIO_VERSION } from './engine/scenario.js';
import { UK_REFERENCE } from './reference.js';

const KEY_CURRENT = 'ep.current';
const KEY_SAVED = 'ep.scenarios';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Fill any fields missing from an older or hand-edited scenario with defaults.
function fill(target, defaults) {
  for (const [k, d] of Object.entries(defaults)) {
    if (target[k] === undefined) target[k] = structuredClone(d);
    else if (isObj(d) && isObj(target[k])) fill(target[k], d);
  }
  return target;
}

export function normalise(s) {
  if (!isObj(s)) throw new Error('Not a scenario.');
  const region = UK_REFERENCE.regions[s.region] ? s.region : 'C';
  const out = fill(structuredClone(s), defaultScenario(region));
  out.v = SCENARIO_VERSION;
  if (!Array.isArray(out.arrays) || !out.arrays.length) out.arrays = defaultScenario(region).arrays;
  out.arrays = out.arrays.slice(0, 3);
  return out;
}

export function loadCurrent() {
  const s = read(KEY_CURRENT, null);
  try {
    return s ? normalise(s) : null;
  } catch {
    return null;
  }
}

export const saveCurrent = (s) => write(KEY_CURRENT, s);

export function listSaved() {
  const list = read(KEY_SAVED, []);
  return Array.isArray(list) ? list.filter((x) => x && x.scenario) : [];
}

export function saveScenario(s) {
  const list = listSaved();
  const id = s.id || `s${Date.now().toString(36)}`;
  const entry = { id, name: s.name || 'Untitled', savedAt: new Date().toISOString(), scenario: { ...structuredClone(s), id } };
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list[i] = entry;
  else list.push(entry);
  return write(KEY_SAVED, list) ? entry : null;
}

export function deleteSaved(id) {
  write(KEY_SAVED, listSaved().filter((x) => x.id !== id));
}

// ------------------------------------------------------------ files

export function exportBundle(current) {
  return {
    app: 'energy-pilot',
    v: 1,
    exportedAt: new Date().toISOString(),
    current,
    saved: listSaved(),
  };
}

export function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Accepts a full export bundle or a single scenario. Saved scenarios are
// merged by id; returns the scenario to make current (if any).
export function importBundle(text) {
  const data = JSON.parse(text);
  if (data?.app === 'energy-pilot') {
    const list = listSaved();
    for (const entry of data.saved || []) {
      const s = normalise(entry.scenario);
      const i = list.findIndex((x) => x.id === entry.id);
      const e = { id: entry.id || s.id, name: entry.name || s.name, savedAt: entry.savedAt, scenario: s };
      if (i >= 0) list[i] = e;
      else list.push(e);
    }
    write(KEY_SAVED, list);
    return { current: data.current ? normalise(data.current) : null, count: (data.saved || []).length };
  }
  return { current: normalise(data), count: 0 };
}

// ------------------------------------------------------------ share links

const b64url = {
  encode(bytes) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  },
};

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

// Uploaded PVGIS files are too large for a URL, so shared arrays fall back to
// the nearest sample yield. Returns the link and whether anything was dropped.
export async function shareLink(s) {
  const copy = structuredClone(s);
  delete copy.id;
  let dropped = 0;
  for (const a of copy.arrays) {
    if (a.source.type === 'upload') {
      dropped++;
      a.source = { type: 'sample', location: UK_REFERENCE.regionSample[copy.region], aspect: 'S' };
    }
  }
  const bytes = new TextEncoder().encode(JSON.stringify(copy));
  const packed = await pipe(bytes, new CompressionStream('deflate-raw'));
  const url = new URL(location.href);
  url.hash = `#/modeller?s=${b64url.encode(packed)}`;
  return { url: url.toString(), dropped };
}

export async function readShare(param) {
  const bytes = await pipe(b64url.decode(param), new DecompressionStream('deflate-raw'));
  return normalise(JSON.parse(new TextDecoder().decode(bytes)));
}
