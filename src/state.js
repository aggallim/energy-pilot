// App state: the scenario being edited, persisted on every change.

import { defaultScenario } from './engine/scenario.js';
import { loadCurrent, saveCurrent } from './storage.js';

let scenario = loadCurrent() || defaultScenario('C');
const listeners = new Set();

export const getScenario = () => scenario;

export function setScenario(next, { silent = false } = {}) {
  scenario = next;
  saveCurrent(scenario);
  if (!silent) for (const fn of listeners) fn(scenario);
}

// Apply a mutation to a copy of the scenario.
export function update(mutate, opts) {
  const next = structuredClone(scenario);
  mutate(next);
  setScenario(next, opts);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
