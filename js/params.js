// Parameter model: defaults, field metadata (drives the UI), validation, JSON save/load.
// All money is in USD. Defaults are typical starting values.

import { SEASONS, defaultSeasonShape, DEFAULT_KWH } from './load-shapes.js';

export const SCHEMA_VERSION = 1;
export const FILE_KIND = 'microgrid-simulator-scenario';

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function defaultParams() {
  const seasons = {};
  for (const s of SEASONS) {
    seasons[s] = {
      weekday: { kwh: DEFAULT_KWH[s], shape: defaultSeasonShape(s, 'weekday') },
      weekend: { kwh: +(DEFAULT_KWH[s] * 1.08).toFixed(2), shape: defaultSeasonShape(s, 'weekend') },
    };
  }
  return {
    schema: SCHEMA_VERSION,
    meta: { name: 'New scenario', notes: '' },
    site: {
      lat: 33.89, lon: 35.5, tzOffset: 3,
      tilt: 25, azimuth: 0, albedo: 0.2,
      monthlyClearness: [0.62, 0.66, 0.72, 0.78, 0.84, 0.90, 0.93, 0.92, 0.88, 0.80, 0.70, 0.60],
      monthlyTempC: [14, 14, 16, 19, 22, 25, 28, 29, 27, 24, 19, 15],
      diurnalRangeC: 8,
      cloudVariability: 0.5,
      seed: 1,
    },
    load: {
      subscribers: 400,
      lossesPct: 8,
      growthPctYr: 2,
      dayNoisePct: 5,
      hourNoisePct: 3,
      weekendDays: [0, 6],
      featuredUserScale: 1,
      seasons,
    },
    pv: {
      panelWp: 550, panelCount: 364, panelAreaM2: 2.58,
      tempCoeffPctPerC: -0.35, noct: 45,
      soilingPct: 3, mismatchWiringPct: 3, availabilityPct: 99,
      dcAcRatio: 1.2, inverterEffPct: 97.5,
      degradationPctYr: 0.5,
      maxPenetrationPct: 70,
    },
    diesel: {
      units: 5, ratedKw: 125,
      minLoadPct: 30,
      fuelA: 0.0845, fuelB: 0.246,
      cycleCharging: false, cycleChargeLoadPct: 80,
      lifetimeHours: 40000,
    },
    battery: {
      enabled: false,
      capacityKwh: 500, cRate: 0.5,
      socMinPct: 10, socMaxPct: 100, socInitPct: 50,
      roundTripEffPct: 90,
      calendarFadePctYr: 1.5, cycleLife: 6000, eolCapacityPct: 70, calendarLifeYears: 15,
    },
    costs: {
      panelUsdPerWp: 0.20, pvInstallUsdPerKwp: 300, pvInverterUsdPerKw: 70,
      pvOmUsdPerKwpYr: 12,
      battUsdPerKwh: 250, battInverterUsdPerKw: 100, battOmPctYr: 1.5, battReplaceUsdPerKwh: 150,
      dieselCapexIncluded: false, dieselUsdPerKw: 250,
      dieselOmUsdPerUnitHour: 1.5, oilChangeIntervalH: 250, oilChangeUsd: 150, dieselReplaceUsdPerKw: 200,
      fuelUsdPerL: 0.9, fuelEscalationPctYr: 2,
      networkCapexUsd: 0, perSubscriberCapexUsd: 0, otherCapexUsd: 0,
      fixedOpexUsdMonth: 1000, insurancePctCapexYr: 0.5,
      inverterReplaceYear: 12,
    },
    finance: {
      tariffUsdKwh: 0.40, tariffEscalationPctYr: 2,
      feeUsdPerSubMonth: 0, collectionPct: 100,
      discountRatePct: 10, projectYears: 20, taxPct: 0, residualPct: 0,
    },
  };
}

// ---- field metadata for the UI ------------------------------------------------
const n = (path, label, unit, min, max, step, help) => ({ path, label, unit, min, max, step, help, type: 'number' });
const b = (path, label, help) => ({ path, label, help, type: 'bool' });

export const GROUPS = [
  {
    id: 'site', title: 'Site & weather', fields: [
      n('site.lat', 'Latitude', '°', -66, 66, 0.01, 'Decimal degrees, north positive.'),
      n('site.lon', 'Longitude', '°', -180, 180, 0.01, 'Decimal degrees, east positive.'),
      n('site.tzOffset', 'Time zone (UTC offset)', 'h', -12, 14, 0.5, 'Local clock offset. Daylight-saving shifts are ignored.'),
      n('site.tilt', 'Panel tilt', '°', 0, 90, 1, 'Roughly equal to latitude maximises annual yield.'),
      n('site.azimuth', 'Panel azimuth offset', '°', -90, 90, 1, '0 = facing the equator, +west / −east.'),
      n('site.albedo', 'Ground reflectance', '', 0, 1, 0.01, 'Typical 0.2 (grass/soil), up to 0.3 for light gravel.'),
      n('site.diurnalRangeC', 'Daily temperature swing', '°C', 0, 25, 0.5, 'Day-night difference in air temperature.'),
      n('site.cloudVariability', 'Cloud variability', '0–1', 0, 1, 0.05, '0 = every day is the monthly average; 1 = very changeable weather.'),
      n('site.seed', 'Random seed', '', 1, 99999, 1, 'Changes the synthetic weather & load noise. Same seed = same year.'),
    ],
    arrays: [
      { path: 'site.monthlyClearness', label: 'Monthly clearness (share of clear-sky sun that reaches the panel)', min: 0.2, max: 1, step: 0.01, months: true },
      { path: 'site.monthlyTempC', label: 'Monthly mean air temperature (°C)', min: -30, max: 55, step: 0.5, months: true },
    ],
  },
  {
    id: 'load', title: 'Demand', fields: [
      n('load.subscribers', 'Subscribers', '', 1, 20000, 1, 'Number of paying users (metered connections).'),
      n('load.lossesPct', 'Distribution losses', '%', 0, 40, 0.5, 'Energy lost between the station and the meters.'),
      n('load.growthPctYr', 'Demand growth', '%/yr', -10, 20, 0.5, 'Per-year growth in consumption for the lifecycle analysis.'),
      n('load.dayNoisePct', 'Day-to-day variation', '%', 0, 30, 0.5, 'Random day-to-day swing in total demand.'),
      n('load.hourNoisePct', 'Hour-to-hour variation', '%', 0, 20, 0.5, 'Random hourly scatter (a larger compound is smoother).'),
      n('load.featuredUserScale', 'Featured house vs average user', '×', 0.1, 10, 0.05, 'The single house in the 3D scene consumes this multiple of an average user.'),
    ],
    custom: 'load',
  },
  {
    id: 'pv', title: 'Solar panels & inverter', fields: [
      n('pv.panelWp', 'Panel rating', 'Wp', 50, 1000, 5, 'Nameplate power of one panel (STC).'),
      n('pv.panelCount', 'Number of panels', '', 0, 100000, 1, 'Total installed panels. The Sizing tab can compute this from a target.'),
      n('pv.panelAreaM2', 'Panel area', 'm²', 0.2, 5, 0.01, 'Used for the land/roof area estimate.'),
      n('pv.tempCoeffPctPerC', 'Temperature coefficient', '%/°C', -1, 0, 0.01, 'Power change per °C of cell temperature above 25 °C (datasheet value).'),
      n('pv.noct', 'NOCT', '°C', 35, 60, 1, 'Nominal operating cell temperature (datasheet).'),
      n('pv.soilingPct', 'Soiling loss', '%', 0, 30, 0.5, 'Dust/dirt. Use the average between cleanings.'),
      n('pv.mismatchWiringPct', 'Mismatch & DC wiring loss', '%', 0, 20, 0.5, ''),
      n('pv.availabilityPct', 'Plant availability', '%', 50, 100, 0.5, 'Share of time the plant is actually working.'),
      n('pv.dcAcRatio', 'DC/AC ratio', '×', 0.8, 2, 0.01, 'Panel kWp divided by inverter AC kW. >1 clips peak output but costs less.'),
      n('pv.inverterEffPct', 'Inverter efficiency', '%', 80, 100, 0.1, ''),
      n('pv.degradationPctYr', 'Panel degradation', '%/yr', 0, 3, 0.05, 'Yearly loss of output.'),
      n('pv.maxPenetrationPct', 'Max instantaneous solar share (no battery)', '%', 10, 95, 1, 'Without a battery the generator holds the grid; this caps solar as a share of load (stability margin).'),
    ],
  },
  {
    id: 'diesel', title: 'Diesel generators', fields: [
      n('diesel.units', 'Number of units', '', 1, 20, 1, 'Identical generator sets.'),
      n('diesel.ratedKw', 'Rating per unit', 'kW', 5, 5000, 5, 'Continuous (prime) electrical output per unit.'),
      n('diesel.minLoadPct', 'Minimum loading', '%', 0, 60, 1, 'Below this a running set wears out and wastes fuel; solar is curtailed to respect it.'),
      n('diesel.fuelA', 'Fuel curve: no-load coefficient', 'L/h per rated kW', 0, 0.2, 0.001, 'Fuel at zero output = this × rated kW. Typical 0.08.'),
      n('diesel.fuelB', 'Fuel curve: marginal coefficient', 'L/kWh', 0.1, 0.5, 0.001, 'Extra fuel per kWh produced. Typical 0.25.'),
      b('diesel.cycleCharging', 'Cycle charging (battery only)', 'When the generator starts, load it more heavily and store the surplus in the battery.'),
      n('diesel.cycleChargeLoadPct', 'Cycle-charging loading', '%', 30, 100, 1, 'Target generator loading while charging the battery.'),
      n('diesel.lifetimeHours', 'Engine life', 'h', 5000, 200000, 500, 'Running hours per unit before replacement.'),
    ],
  },
  {
    id: 'battery', title: 'Battery (optional)', fields: [
      b('battery.enabled', 'Include battery', 'The battery inverter then forms the grid, letting the generators switch off.'),
      n('battery.capacityKwh', 'Capacity (nameplate)', 'kWh', 0, 200000, 10, ''),
      n('battery.cRate', 'Power rating (C-rate)', '1/h', 0.1, 4, 0.05, 'Battery inverter kW = capacity × C-rate.'),
      n('battery.socMinPct', 'Minimum state of charge', '%', 0, 90, 1, ''),
      n('battery.socMaxPct', 'Maximum state of charge', '%', 20, 100, 1, ''),
      n('battery.socInitPct', 'Initial state of charge', '%', 0, 100, 1, ''),
      n('battery.roundTripEffPct', 'Round-trip efficiency', '%', 50, 100, 0.5, 'AC to AC, split equally between charge and discharge.'),
      n('battery.calendarFadePctYr', 'Calendar fade', '%/yr', 0, 10, 0.1, 'Capacity lost per year just from ageing.'),
      n('battery.cycleLife', 'Cycle life (to end of life)', 'cycles', 500, 20000, 100, 'Full equivalent cycles until capacity reaches the end-of-life level.'),
      n('battery.eolCapacityPct', 'End-of-life capacity', '%', 50, 95, 1, 'The pack is replaced when it falls to this share of nameplate.'),
      n('battery.calendarLifeYears', 'Calendar life', 'years', 3, 30, 1, 'Pack is replaced after this many years regardless of use.'),
    ],
  },
  {
    id: 'costs', title: 'Costs (USD)', fields: [
      n('costs.panelUsdPerWp', 'Panels', '$/Wp', 0, 5, 0.01, 'Module price only.'),
      n('costs.pvInstallUsdPerKwp', 'Mounting, BOS & installation', '$/kWp', 0, 3000, 5, 'Structures, cabling, labour, commissioning.'),
      n('costs.pvInverterUsdPerKw', 'PV inverter', '$/kW AC', 0, 1000, 1, ''),
      n('costs.pvOmUsdPerKwpYr', 'Solar O&M', '$/kWp/yr', 0, 200, 0.5, 'Cleaning, inspection, small repairs.'),
      n('costs.battUsdPerKwh', 'Battery', '$/kWh', 0, 2000, 5, 'Installed battery cells and enclosure.'),
      n('costs.battInverterUsdPerKw', 'Battery inverter / PCS', '$/kW', 0, 1000, 1, ''),
      n('costs.battOmPctYr', 'Battery O&M', '% of capex/yr', 0, 10, 0.1, ''),
      n('costs.battReplaceUsdPerKwh', 'Battery replacement', '$/kWh', 0, 2000, 5, 'Price when the pack is replaced (usually cheaper than today).'),
      b('costs.dieselCapexIncluded', 'Charge generator purchase to the project', 'Tick only if the generators still have to be bought. Default: they already exist.'),
      n('costs.dieselUsdPerKw', 'Generator (installed)', '$/kW', 0, 2000, 5, ''),
      n('costs.dieselOmUsdPerUnitHour', 'Generator O&M', '$/unit-hour', 0, 50, 0.1, 'Consumables and labour per running hour per unit.'),
      n('costs.oilChangeIntervalH', 'Oil-change interval', 'h', 50, 2000, 10, ''),
      n('costs.oilChangeUsd', 'Oil-change cost', '$', 0, 5000, 5, ''),
      n('costs.dieselReplaceUsdPerKw', 'Generator replacement', '$/kW', 0, 2000, 5, 'When engine life is reached.'),
      n('costs.fuelUsdPerL', 'Diesel price', '$/L', 0, 10, 0.01, ''),
      n('costs.fuelEscalationPctYr', 'Fuel price escalation', '%/yr', -10, 30, 0.5, 'Real (above inflation).'),
      n('costs.networkCapexUsd', 'Network / distribution capex', '$', 0, 1e8, 1000, 'Poles, cables, transformers, if part of the project.'),
      n('costs.perSubscriberCapexUsd', 'Capex per subscriber', '$', 0, 5000, 5, 'Meters, connection, etc.'),
      n('costs.otherCapexUsd', 'Other capex', '$', 0, 1e8, 1000, 'Land, permits, buildings.'),
      n('costs.fixedOpexUsdMonth', 'Fixed opex (staff, admin)', '$/month', 0, 1e6, 50, ''),
      n('costs.insurancePctCapexYr', 'Insurance', '% of capex/yr', 0, 10, 0.1, ''),
      n('costs.inverterReplaceYear', 'Inverter replacement year', 'year', 3, 40, 1, 'Inverters are replaced once, in this project year (if within project life).'),
    ],
  },
  {
    id: 'finance', title: 'Tariff & finance', fields: [
      n('finance.tariffUsdKwh', 'Tariff', '$/kWh', 0, 5, 0.005, 'Price charged to users per kWh (flat).'),
      n('finance.tariffEscalationPctYr', 'Tariff escalation', '%/yr', -10, 30, 0.5, 'Real. Default follows the fuel price escalation, i.e. a fuel-indexed tariff.'),
      n('finance.feeUsdPerSubMonth', 'Fixed fee per subscriber', '$/month', 0, 200, 0.5, ''),
      n('finance.collectionPct', 'Bill collection rate', '%', 0, 100, 1, 'Share of billed revenue actually collected.'),
      n('finance.discountRatePct', 'Discount rate', '%/yr', 0, 40, 0.5, 'Required return (real).'),
      n('finance.projectYears', 'Project life', 'years', 1, 40, 1, ''),
      n('finance.taxPct', 'Income tax', '%', 0, 60, 1, 'Applied to profit after straight-line depreciation.'),
      n('finance.residualPct', 'Residual value', '% of capex', 0, 50, 1, 'Recovered in the final year.'),
    ],
  },
];

// Parameters that sit behind each group's "Advanced" fold (sensible defaults exist for all of them).
export const ADVANCED = new Set([
  'site.azimuth', 'site.albedo', 'site.diurnalRangeC', 'site.cloudVariability', 'site.seed', 'site.monthlyTempC',
  'load.dayNoisePct', 'load.hourNoisePct', 'load.featuredUserScale',
  'pv.panelAreaM2', 'pv.tempCoeffPctPerC', 'pv.noct', 'pv.soilingPct', 'pv.mismatchWiringPct', 'pv.availabilityPct', 'pv.inverterEffPct', 'pv.degradationPctYr',
  'diesel.fuelA', 'diesel.fuelB', 'diesel.cycleCharging', 'diesel.cycleChargeLoadPct', 'diesel.lifetimeHours',
  'battery.socMinPct', 'battery.socMaxPct', 'battery.socInitPct', 'battery.roundTripEffPct', 'battery.calendarFadePctYr', 'battery.cycleLife', 'battery.eolCapacityPct', 'battery.calendarLifeYears',
  'costs.pvOmUsdPerKwpYr', 'costs.battOmPctYr', 'costs.battReplaceUsdPerKwh', 'costs.dieselUsdPerKw', 'costs.dieselOmUsdPerUnitHour', 'costs.oilChangeIntervalH', 'costs.oilChangeUsd',
  'costs.dieselReplaceUsdPerKw', 'costs.networkCapexUsd', 'costs.perSubscriberCapexUsd', 'costs.otherCapexUsd', 'costs.fixedOpexUsdMonth', 'costs.insurancePctCapexYr', 'costs.inverterReplaceYear',
  'finance.tariffEscalationPctYr', 'finance.feeUsdPerSubMonth', 'finance.taxPct', 'finance.residualPct',
]);

// ---- path helpers --------------------------------------------------------------
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
export function setPath(obj, path, value) {
  const ks = path.split('.');
  const last = ks.pop();
  const parent = ks.reduce((o, k) => o[k], obj);
  parent[last] = value;
}

export function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

// ---- validation / merging --------------------------------------------------------
const FIELD_INDEX = {};
for (const g of GROUPS) {
  for (const f of g.fields) FIELD_INDEX[f.path] = f;
  for (const a of g.arrays || []) FIELD_INDEX[a.path] = a;
}
export function fieldMeta(path) { return FIELD_INDEX[path]; }

function mergeInto(target, src, path, warnings) {
  for (const key of Object.keys(target)) {
    if (!(key in src)) continue;
    const p = path ? path + '.' + key : key;
    const t = target[key];
    const s = src[key];
    if (key === 'weekendDays') continue; // handled in sanitize()
    if (Array.isArray(t)) {
      if (!Array.isArray(s) || s.length !== t.length) { warnings.push(`${p}: expected ${t.length} values, kept default`); continue; }
      const meta = FIELD_INDEX[p];
      target[key] = s.map((v, i) => {
        const x = Number(v);
        if (!Number.isFinite(x)) { warnings.push(`${p}[${i}] is not a number, kept default`); return t[i]; }
        if (meta && meta.min != null) return Math.min(meta.max, Math.max(meta.min, x));
        if (p.endsWith('.shape')) return Math.max(0, x);
        return x;
      });
    } else if (t && typeof t === 'object') {
      if (s && typeof s === 'object') mergeInto(t, s, p, warnings);
    } else if (typeof t === 'number') {
      const x = Number(s);
      if (!Number.isFinite(x)) { warnings.push(`${p}: not a number, kept default`); continue; }
      const meta = FIELD_INDEX[p];
      let y = x;
      if (meta && meta.min != null) {
        y = Math.min(meta.max, Math.max(meta.min, x));
        if (y !== x) warnings.push(`${p}: ${x} is outside ${meta.min}…${meta.max}, clamped to ${y}`);
      } else if (p.endsWith('.kwh')) y = Math.min(500, Math.max(0, x));
      target[key] = y;
    } else if (typeof t === 'boolean') {
      target[key] = !!s;
    } else if (typeof t === 'string') {
      target[key] = String(s);
    }
  }
}

// Merge arbitrary input over the defaults. Unknown keys are ignored, missing keys default,
// numbers are clamped. Returns { params, warnings }.
export function sanitize(input) {
  const warnings = [];
  const params = defaultParams();
  if (input && typeof input === 'object') mergeInto(params, input, '', warnings);
  // cross-field consistency
  if (params.battery.socMinPct >= params.battery.socMaxPct) {
    params.battery.socMinPct = Math.max(0, params.battery.socMaxPct - 10);
    warnings.push('battery: minimum SoC must be below maximum, adjusted');
  }
  const wd = (input && input.load && input.load.weekendDays);
  if (Array.isArray(wd)) {
    params.load.weekendDays = [...new Set(wd.map(Number).filter((d) => d >= 0 && d <= 6))];
  }
  params.schema = SCHEMA_VERSION;
  return { params, warnings };
}

// ---- JSON save / load -------------------------------------------------------------
export function toJSON(params) {
  return JSON.stringify({ kind: FILE_KIND, ...params, schema: SCHEMA_VERSION, savedAt: new Date().toISOString() }, null, 2);
}

export function fromJSON(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('File is not valid JSON: ' + e.message); }
  if (!data || typeof data !== 'object') throw new Error('File does not contain a scenario.');
  if (data.kind && data.kind !== FILE_KIND) throw new Error('This JSON file is not a microgrid scenario.');
  const warnings = [];
  if (data.schema && data.schema > SCHEMA_VERSION) warnings.push(`File was saved by a newer version (schema ${data.schema}); unknown fields ignored.`);
  const r = sanitize(data);
  return { params: r.params, warnings: warnings.concat(r.warnings) };
}

// Derived quantities used throughout.
export function derived(p) {
  const kWp = (p.pv.panelCount * p.pv.panelWp) / 1000;
  const acKw = kWp / p.pv.dcAcRatio;
  const dieselKw = p.diesel.units * p.diesel.ratedKw;
  const batt = p.battery.enabled && p.battery.capacityKwh > 0;
  const battKwh = batt ? p.battery.capacityKwh : 0;
  const battKw = battKwh * p.battery.cRate;
  return { kWp, acKw, dieselKw, batt, battKwh, battKw, areaM2: p.pv.panelCount * p.pv.panelAreaM2 };
}
