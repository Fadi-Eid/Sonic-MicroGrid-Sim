// Parametric demand model: season x weekday/weekend 24-hour shapes, scaled per subscriber.
import { HOURS, MONTH_START_DAY, monthOfDay, makeRng } from './solar.js';
import { normalise } from './load-shapes.js';

// Calendar used to place weekends: 1 January 2027 (a Friday). The model has 365 days, so the exact year is irrelevant.
export const REFERENCE_YEAR = 2027;

const NORTH_SEASON = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0]; // month -> index into SEASONS
const SEASON_KEYS = ['winter', 'spring', 'summer', 'autumn'];

export function seasonOfMonth(month, lat) {
  const i = NORTH_SEASON[month];
  return SEASON_KEYS[lat >= 0 ? i : (i + 2) % 4];
}

export function weekdayOfDay(day, year, firstDayWeekdayCache) {
  // 0 = Sunday. Jan 1 weekday from the calendar, then simple modulo (365-day year).
  const first = firstDayWeekdayCache != null ? firstDayWeekdayCache : new Date(Date.UTC(year, 0, 1)).getUTCDay();
  return (first + day) % 7;
}

// Returns:
//  station   - Float64Array(8760) station load in kW at year-1 demand (incl. losses)
//  perUser   - Float64Array(8760) average kW of one subscriber (excl. losses)
//  dayType   - Uint8Array(365) 1 = weekend
export function buildLoadYear(p) {
  const { load, site } = p;
  const station = new Float64Array(HOURS), perUser = new Float64Array(HOURS);
  const dayType = new Uint8Array(365);
  const first = new Date(Date.UTC(REFERENCE_YEAR, 0, 1)).getUTCDay();
  const rng = makeRng(site.seed * 104729 + 3);
  // noise (mean-normalised so annual energy is unchanged)
  const dayN = new Float64Array(365), hourN = new Float64Array(HOURS);
  let sd = 0, sh = 0;
  for (let d = 0; d < 365; d++) { dayN[d] = Math.exp(load.dayNoisePct / 100 * rng.normal()); sd += dayN[d]; }
  for (let h = 0; h < HOURS; h++) { hourN[h] = Math.exp(load.hourNoisePct / 100 * rng.normal()); sh += hourN[h]; }
  sd /= 365; sh /= HOURS;

  const norm = {};
  for (const s of SEASON_KEYS) {
    norm[s] = {
      weekday: { kwh: load.seasons[s].weekday.kwh, shape: normalise(load.seasons[s].weekday.shape) },
      weekend: { kwh: load.seasons[s].weekend.kwh, shape: normalise(load.seasons[s].weekend.shape) },
    };
  }
  const lossK = 1 / (1 - load.lossesPct / 100);
  for (let d = 0; d < 365; d++) {
    const wd = (first + d) % 7;
    const weekend = load.weekendDays.includes(wd);
    dayType[d] = weekend ? 1 : 0;
    const m = monthOfDay(d);
    const sdef = norm[seasonOfMonth(m, site.lat)][weekend ? 'weekend' : 'weekday'];
    for (let hh = 0; hh < 24; hh++) {
      const h = d * 24 + hh;
      const kw = sdef.kwh * sdef.shape[hh] * (dayN[d] / sd) * (hourN[h] / sh); // per-user average kW
      perUser[h] = kw;
      station[h] = kw * load.subscribers * lossK;
    }
  }
  return { station, perUser, dayType };
}

export function seasonalTable(p) {
  // Convenience for the UI: annual kWh per user and peak/avg of the station load.
  const l = buildLoadYear(p);
  let e = 0, pk = 0;
  for (let h = 0; h < HOURS; h++) { e += l.station[h]; if (l.station[h] > pk) pk = l.station[h]; }
  return { annualKwh: e, peakKw: pk, avgKw: e / HOURS };
}
