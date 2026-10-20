// Sizing helpers: panel count from a target, diesel N+1 advice, solar-fraction solver,
// design-space sweep, tornado sensitivity and Monte-Carlo uncertainty.
import { clone, derived } from './params.js';
import { getContext, simulateYear } from './engine.js';
import { lifecycle, compare, dieselOnlyParams } from './economics.js';
import { buildSolarYear } from './solar.js';
import { buildLoadYear } from './load.js';

export const panelsForKwp = (kWp, panelWp) => Math.max(0, Math.ceil((kWp * 1000) / panelWp - 1e-9));

export function peakLoadKw(ctx, p) {
  let pk = 0;
  const g = 1; // year 1
  for (let h = 0; h < ctx.load.station.length; h++) if (ctx.load.station[h] > pk) pk = ctx.load.station[h] * g;
  return pk;
}

export function pvDesignNumbers(p) {
  const d = derived(p);
  return { panels: p.pv.panelCount, kWp: d.kWp, acKw: d.acKw, areaM2: d.areaM2, areaHa: d.areaM2 / 10000 };
}

const STD_SIZES = [20, 30, 40, 50, 60, 80, 100, 125, 150, 200, 250, 300, 350, 400, 500, 600, 750, 1000, 1250, 1500, 2000];

// N+1 generator options: with n units, the system must still carry the peak after losing the largest.
export function dieselOptions(peakKw, margin = 0.1) {
  const out = [];
  for (let n = 2; n <= 6; n++) {
    const need = (peakKw * (1 + margin)) / (n - 1);
    const size = STD_SIZES.find((s) => s >= need) || Math.ceil(need / 100) * 100;
    out.push({ units: n, ratedKw: size, installedKw: n * size, firmKw: (n - 1) * size, minLoadAtPeakPct: null });
  }
  return out;
}

export function firmDieselKw(p) {
  return (p.diesel.units - 1) * p.diesel.ratedKw;
}

// Smallest panel count whose year-1 solar fraction reaches `target` (0..1).
export function solveForSolarFraction(p, target, ctx = getContext(p)) {
  const q = clone(p);
  const pk = peakLoadKw(ctx, p);
  const maxKwp = Math.max(50, pk * 12);
  const maxPanels = panelsForKwp(maxKwp, p.pv.panelWp);
  const frac = (n) => { q.pv.panelCount = n; return simulateYear(q, ctx, { yearIdx: 0 }).totals.solarFraction; };
  const fMax = frac(maxPanels);
  if (fMax < target) return { reachable: false, panels: maxPanels, kWp: (maxPanels * p.pv.panelWp) / 1000, achieved: fMax, ceiling: fMax };
  let lo = 0, hi = maxPanels;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frac(mid) >= target) hi = mid; else lo = mid;
  }
  return { reachable: true, panels: hi, kWp: (hi * p.pv.panelWp) / 1000, achieved: frac(hi), ceiling: fMax };
}

export function candidate(p, kWp, battKwh) {
  const q = clone(p);
  q.pv.panelCount = panelsForKwp(kWp, q.pv.panelWp);
  q.battery.enabled = battKwh > 0;
  if (battKwh > 0) q.battery.capacityKwh = battKwh;
  return q;
}

function linspace(a, b, n) {
  if (n <= 1) return [a];
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

// spec: { pvMin, pvMax, pvSteps, batMin, batMax, batSteps }  (kWp, kWh)
// Returns { cells: [...], pvAxis, batAxis, baseline }. Each cell has KPIs and the full candidate params.
export async function sweep(p, spec, onProgress, shouldCancel) {
  const ctx = getContext(p);
  const baseline = lifecycle(dieselOnlyParams(p), ctx);
  const pvAxis = linspace(spec.pvMin, spec.pvMax, spec.pvSteps).map((v) => Math.round(v * 10) / 10);
  const batAxis = linspace(spec.batMin, spec.batMax, spec.batSteps).map((v) => Math.round(v));
  const cells = [];
  const total = pvAxis.length * batAxis.length;
  let done = 0;
  for (let j = 0; j < batAxis.length; j++) {
    for (let i = 0; i < pvAxis.length; i++) {
      if (shouldCancel && shouldCancel()) return { cells, pvAxis, batAxis, baseline, cancelled: true };
      const q = candidate(p, pvAxis[i], batAxis[j]);
      const c = compare(q, ctx, {}, baseline);
      const y1 = c.hy.rows[0];
      cells.push({
        i, j, kWp: (q.pv.panelCount * q.pv.panelWp) / 1000, panels: q.pv.panelCount, battKwh: batAxis[j],
        capex: c.hy.capex.total, lcoe: c.hy.lcoe, npv: c.hy.npv, incNpv: c.incNpv, incPayback: c.incPayback, incIrr: c.incIrr,
        solarFraction: c.hy.avgSolarFraction, solarFraction1: y1.solarFraction,
        unservedPct: (y1.unservedKwh / (y1.servedKwh + y1.unservedKwh)) * 100,
        fuelL1: y1.fuelL, fuelSavedL1: c.fuelSavedL1, curtailPct: null,
      });
      done++;
      if (done % 8 === 0) { if (onProgress) onProgress(done / total); await yieldToUi(); }
    }
  }
  if (onProgress) onProgress(1);
  return { cells, pvAxis, batAxis, baseline };
}

export const OBJECTIVES = {
  lcoe: { label: 'Lowest cost per kWh (LCOE)', better: 'min', get: (c) => c.lcoe },
  incNpv: { label: 'Highest NPV gain vs diesel-only', better: 'max', get: (c) => c.incNpv },
  npv: { label: 'Highest project NPV', better: 'max', get: (c) => c.npv },
  solar: { label: 'Highest solar share', better: 'max', get: (c) => c.solarFraction },
  payback: { label: 'Shortest payback vs diesel-only', better: 'min', get: (c) => (c.incPayback == null ? Infinity : c.incPayback) },
};

export function rankCells(cells, objective, constraints = {}) {
  const o = OBJECTIVES[objective];
  const ok = cells.filter((c) =>
    (constraints.maxUnservedPct == null || c.unservedPct <= constraints.maxUnservedPct) &&
    (constraints.minSolarPct == null || c.solarFraction * 100 >= constraints.minSolarPct) &&
    (constraints.maxCapex == null || c.capex <= constraints.maxCapex) &&
    (constraints.maxPaybackYears == null || (c.incPayback != null && c.incPayback <= constraints.maxPaybackYears)) &&
    o.get(c) != null && Number.isFinite(o.get(c)));
  ok.sort((a, b) => (o.better === 'min' ? o.get(a) - o.get(b) : o.get(b) - o.get(a)));
  return ok;
}

// ---- tornado sensitivity -------------------------------------------------------------
const scaleSeasons = (q, f) => { for (const s of Object.values(q.load.seasons)) { s.weekday.kwh *= f; s.weekend.kwh *= f; } };

export const SENSITIVITY_ITEMS = [
  { label: 'Tariff', apply: (q, f) => { q.finance.tariffUsdKwh *= f; } },
  { label: 'Diesel price', apply: (q, f) => { q.costs.fuelUsdPerL *= f; } },
  { label: 'Fuel escalation (×)', apply: (q, f) => { q.costs.fuelEscalationPctYr *= f; } },
  { label: 'Demand per subscriber', apply: scaleSeasons },
  { label: 'Subscribers', apply: (q, f) => { q.load.subscribers = Math.max(1, Math.round(q.load.subscribers * f)); } },
  { label: 'Sunshine (clearness)', apply: (q, f) => { q.site.monthlyClearness = q.site.monthlyClearness.map((v) => Math.min(1, v * f)); } },
  { label: 'Solar capex', apply: (q, f) => { q.costs.panelUsdPerWp *= f; q.costs.pvInstallUsdPerKwp *= f; q.costs.pvInverterUsdPerKw *= f; } },
  { label: 'Battery capex', apply: (q, f) => { q.costs.battUsdPerKwh *= f; q.costs.battInverterUsdPerKw *= f; } },
  { label: 'Generator fuel use', apply: (q, f) => { q.diesel.fuelB *= f; q.diesel.fuelA *= f; } },
  { label: 'Generator O&M', apply: (q, f) => { q.costs.dieselOmUsdPerUnitHour *= f; q.costs.oilChangeUsd *= f; } },
  { label: 'Collection rate', apply: (q, f) => { q.finance.collectionPct = Math.min(100, q.finance.collectionPct * f); } },
  { label: 'Discount rate', apply: (q, f) => { q.finance.discountRatePct *= f; } },
  { label: 'Panel degradation', apply: (q, f) => { q.pv.degradationPctYr *= f; } },
];

export async function tornado(p, spread = 0.2, onProgress) {
  const out = [];
  const evalP = (q) => { const c = compare(q, getContext(q)); return { incNpv: c.incNpv, lcoe: c.hy.lcoe, npv: c.hy.npv }; };
  const base = evalP(p);
  for (let i = 0; i < SENSITIVITY_ITEMS.length; i++) {
    const it = SENSITIVITY_ITEMS[i];
    const lo = clone(p), hi = clone(p);
    it.apply(lo, 1 - spread); it.apply(hi, 1 + spread);
    out.push({ label: it.label, low: evalP(lo), high: evalP(hi) });
    if (onProgress) onProgress((i + 1) / SENSITIVITY_ITEMS.length);
    await yieldToUi();
  }
  return { base, items: out, spread };
}

// ---- Monte-Carlo ---------------------------------------------------------------------
export async function monteCarlo(p, n = 60, onProgress, uncertainty = { demand: 0.12, fuel: 0.2, sun: 0.06 }) {
  const { makeRng } = await import('./solar.js');
  const rng = makeRng(p.site.seed * 31 + 7);
  const res = [];
  for (let k = 0; k < n; k++) {
    const q = clone(p);
    q.site.seed = p.site.seed + 1000 + k; // new weather & noise year
    const demand = Math.max(0.5, 1 + uncertainty.demand * rng.normal());
    const fuel = Math.max(0.4, 1 + uncertainty.fuel * rng.normal());
    const sun = Math.max(0.7, 1 + uncertainty.sun * rng.normal());
    scaleSeasons(q, demand);
    q.costs.fuelUsdPerL *= fuel;
    const ctx = { solar: buildSolarYear(q), load: buildLoadYear(q) };
    for (let h = 0; h < ctx.solar.yieldKw.length; h++) ctx.solar.yieldKw[h] *= sun;
    const c = compare(q, ctx);
    res.push({ incNpv: c.incNpv, lcoe: c.hy.lcoe, solarFraction: c.hy.rows[0].solarFraction, npv: c.hy.npv, fuelL: c.hy.rows[0].fuelL });
    if (onProgress && k % 4 === 0) { onProgress((k + 1) / n); await yieldToUi(); }
  }
  const pct = (arr, q) => { const s = [...arr].sort((a, b) => a - b); const i = (s.length - 1) * q, f = Math.floor(i); return s[f] + (s[Math.min(s.length - 1, f + 1)] - s[f]) * (i - f); };
  const stat = (key) => { const a = res.map((r) => r[key]).filter(Number.isFinite); return { p10: pct(a, 0.1), p50: pct(a, 0.5), p90: pct(a, 0.9), min: Math.min(...a), max: Math.max(...a) }; };
  return { n, runs: res, incNpv: stat('incNpv'), lcoe: stat('lcoe'), solarFraction: stat('solarFraction'), npv: stat('npv'), fuelL: stat('fuelL'), uncertainty };
}
