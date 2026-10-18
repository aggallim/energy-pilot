// Loads the bundled reference data (static JSON in data/) that a scenario
// needs. Nothing is fetched from third parties at run time.

import { requiredSamples } from './engine/scenario.js';

const cache = new Map();

function getJson(path) {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(path).then((r) => {
        if (!r.ok) throw new Error(`${r.status} for ${path}`);
        return r.json();
      }).catch((e) => {
        cache.delete(path);
        throw e;
      }),
    );
  }
  return cache.get(path);
}

export async function loadManifest() {
  try {
    return await getJson('data/manifest.json');
  } catch {
    return null;
  }
}

export async function loadRegionTariffs(region) {
  try {
    return await getJson(`data/tariffs/${region}.json`);
  } catch {
    return null;
  }
}

export async function loadSample(key) {
  try {
    return await getJson(`data/pvgis/${key}.json`);
  } catch {
    return null;
  }
}

// Everything runScenario needs, plus what was missing so the UI can say so.
export async function dataFor(scenario) {
  const keys = requiredSamples(scenario);
  const [tariffFile, ...samples] = await Promise.all([loadRegionTariffs(scenario.region), ...keys.map(loadSample)]);
  const out = { samples: {}, tariffs: tariffFile?.tariffs || {}, tariffFile, missingSamples: [] };
  keys.forEach((k, i) => {
    if (samples[i]) out.samples[k] = samples[i];
    else out.missingSamples.push(k);
  });
  return out;
}
