// Hourly household consumption from an annual total and a profile shape.
// The shapes are illustrative: low overnight, a morning and an evening peak,
// and higher use in winter, which is the typical UK domestic pattern. They are
// not Elexon's published profile coefficients (see docs, section 7).

import { HOURS, timeAxis } from './time.js';
import { UK_REFERENCE } from '../reference.js';

export function profileShape(id) {
  const p = UK_REFERENCE.loadProfiles[id];
  if (!p) throw new Error(`Unknown load profile: ${id}`);
  return p;
}

export function hourlyLoad(annualKwh, profileId) {
  const p = profileShape(profileId);
  const { localHour, month, weekend } = timeAxis();
  const out = new Float64Array(HOURS);
  let total = 0;
  let night = 0;
  let nightHours = 0;
  for (let h = 0; h < HOURS; h++) {
    const day = weekend[h] ? p.weekend : p.weekday;
    const w = day[localHour[h]] * UK_REFERENCE.loadSeasonality[month[h]];
    out[h] = w;
    total += w;
    if (localHour[h] < 7) {
      night += w;
      nightHours++;
    }
  }
  // Night-heavy profiles (e.g. storage heating or hot water on Economy 7)
  // add a flat block between 00:00 and 07:00 so that the night share of
  // annual use equals p.nightShare.
  if (p.nightShare && night / total < p.nightShare) {
    const s = p.nightShare;
    const extra = (s * total - night) / (1 - s);
    const perHour = extra / nightHours;
    for (let h = 0; h < HOURS; h++) if (localHour[h] < 7) out[h] += perHour;
    total += extra;
  }
  const k = annualKwh / total;
  for (let h = 0; h < HOURS; h++) out[h] *= k;
  return out;
}
