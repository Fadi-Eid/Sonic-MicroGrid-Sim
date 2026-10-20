// Click-through dashboards: compound (all users), generator, solar + inverter, battery, single house.
// Period tiles are cumulative: Day = since 00:00, Month = since the 1st, Year = since 1 January,
// up to the time shown by the scene's sliders. The chart shows the whole period with the future faded.
import { h, fmt, stackedChart, tile } from './charts.js';
import { MONTH_START_DAY, DAYS_IN_MONTH, monthOfDay } from './solar.js';
import { MONTH_NAMES, derived } from './params.js';

const C = { solar: 'var(--c-solar)', diesel: 'var(--c-diesel)', bad: 'var(--c-bad)', ink: 'var(--ink-2)', batt: 'var(--c-batt)', curt: 'var(--c-curt)' };

const prefix = (arr) => { const c = new Float64Array(arr.length + 1); for (let i = 0; i < arr.length; i++) c[i + 1] = c[i] + arr[i]; return c; };

// per-user hourly energy by origin (solar/diesel/unserved), kW == kWh per hour
export function computeUserSeries(app) {
  const S = app.series, n = 8760;
  const solar = new Float32Array(n), diesel = new Float32Array(n), unserved = new Float32Array(n), total = new Float32Array(n);
  const scale = app.params.load.featuredUserScale, pu = app.ctx.load.perUser;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const kw = pu[i] * scale;
    total[i] = kw; if (kw > peak) peak = kw;
    const L = S.load[i];
    if (L > 1e-9) { solar[i] = kw * S.solarToLoad[i] / L; diesel[i] = kw * S.dieselToLoad[i] / L; unserved[i] = kw * S.unserved[i] / L; }
  }
  return { solar, diesel, unserved, total, peak };
}

// running totals so "since the start of the period" is an O(1) lookup
export function computeCumulative(app) {
  const S = app.series, U = app.user, cum = {};
  for (const k of ['load', 'pvAvail', 'pvUsed', 'pvCurt', 'solarToLoad', 'dieselToLoad', 'dieselOut', 'fuel', 'battChg', 'battDis', 'unserved', 'units']) cum[k] = prefix(S[k]);
  app.runFlag = Float32Array.from(S.units, (u) => (u > 0 ? 1 : 0)); // 1 in every hour a generator runs
  cum.running = prefix(app.runFlag);
  cum.uSolar = prefix(U.solar); cum.uDiesel = prefix(U.diesel); cum.uUnserved = prefix(U.unserved);
  return cum;
}

// ---- period handling --------------------------------------------------------------------
function ranges(period, day) {
  if (period === 'day') {
    return { r: Array.from({ length: 24 }, (_, i) => [day * 24 + i, day * 24 + i + 1]), x: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')), unit: 'kW', mode: 'area', tick: 3, label: 'today', since: 'since 00:00', h0: day * 24, h1: day * 24 + 24, pos: (T) => T - day * 24 - 0.5 };
  }
  if (period === 'month') {
    const m = monthOfDay(day), d0 = MONTH_START_DAY[m], d1 = MONTH_START_DAY[m + 1];
    return { r: Array.from({ length: d1 - d0 }, (_, i) => [(d0 + i) * 24, (d0 + i + 1) * 24]), x: Array.from({ length: d1 - d0 }, (_, i) => String(i + 1)), unit: 'kWh', mode: 'bar', tick: 5, label: MONTH_NAMES[m], since: `since 1 ${MONTH_NAMES[m]}`, h0: d0 * 24, h1: d1 * 24, pos: (T) => (T - d0 * 24) / 24 };
  }
  return {
    r: Array.from({ length: 12 }, (_, m) => [MONTH_START_DAY[m] * 24, MONTH_START_DAY[m + 1] * 24]), x: MONTH_NAMES.slice(), unit: 'kWh', mode: 'bar', tick: 1, label: 'this year', since: 'since 1 Jan', h0: 0, h1: 8760,
    pos: (T) => { const m = monthOfDay(Math.floor(T / 24)); return m + (T - MONTH_START_DAY[m] * 24) / (24 * DAYS_IN_MONTH[m]); },
  };
}
const sumArr = (arr, a, b) => { let s = 0; for (let i = a; i < b; i++) s += arr[i]; return s; };
const bucket = (R, arr) => R.r.map(([a, b]) => sumArr(arr, a, b));

// total of a series from the start of the period up to time T (hours, fractional)
function toDate(cum, arr, R, T) {
  const t = Math.min(Math.max(T, R.h0), R.h1);
  const i = Math.min(Math.floor(t), 8759);
  return cum[i] + arr[i] * (t - i) - cum[R.h0];
}
const elapsed = (R, T) => Math.min(Math.max(T, R.h0), R.h1) - R.h0;

function periodTabs(current, since, onPick) {
  return h('div', { class: 'dash-head' },
    h('div', { class: 'seg', role: 'tablist' }, [['day', 'Day'], ['month', 'Month'], ['year', 'Year']].map(([k, l]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': k === current, class: k === current ? 'on' : '', onclick: () => onPick(k) }, l))),
    h('span', { class: 'since' }, `Totals ${since}`));
}
const nowRow = (...t) => h('div', { class: 'tiles now' }, t.filter(Boolean));
const tilesRow = (...t) => h('div', { class: 'tiles' }, t.filter(Boolean));
const mark = (chart, R, L) => chart.setMarker(R.pos(L.T));

// ---- the dashboards --------------------------------------------------------------------
const DASH = {
  compound(app, period, day) {
    const p = app.params, S = app.series, R = ranges(period, day), d = derived(p), cum = app.cum;
    const tn = { load: tile('Demand now', '–'), solar: tile('Solar share now', '–'), diesel: tile('Diesel', '–'), batt: d.batt ? tile('Battery', '–') : null };
    const tp = { del: tile('Delivered', '–'), share: tile('Solar share', '–'), margin: tile('Operating margin', '–', 'before fixed costs'), un: tile('Unserved', '–') };
    const chart = stackedChart({
      title: `Supply and demand, ${R.label}`, x: R.x, tickEvery: R.tick, unit: R.unit, mode: R.mode,
      series: [{ name: 'Solar', color: C.solar, values: bucket(R, S.solarToLoad) }, { name: 'Diesel', color: C.diesel, values: bucket(R, S.dieselToLoad) }, ...(sumArr(S.unserved, R.h0, R.h1) > 0 ? [{ name: 'Unserved', color: C.bad, values: bucket(R, S.unserved) }] : [])],
      lines: [{ name: 'Demand', color: C.ink, values: bucket(R, S.load) }],
    });
    const el = h('div', { class: 'dash' }, nowRow(tn.load, tn.solar, tn.diesel, tn.batt), tilesRow(tp.del, tp.share, tp.margin, tp.un), chart.el);
    return { el, R, update(L) {
      const td = (k) => toDate(cum[k], S[k], R, L.T);
      const un = td('unserved'), served = td('load') - un, solar = td('solarToLoad'), uh = td('units');
      const sold = served * (1 - p.load.lossesPct / 100);
      const cost = td('fuel') * p.costs.fuelUsdPerL + uh * p.costs.dieselOmUsdPerUnitHour + (uh / p.costs.oilChangeIntervalH) * p.costs.oilChangeUsd;
      tn.load.set(fmt.n(L.load) + ' kW', `${fmt.pct(L.load / Math.max(1, L.peakLoad))} of peak`);
      tn.solar.set(fmt.pct(L.served > 0 ? L.solarToLoad / L.served : 0), `${fmt.n(L.solarToLoad)} kW`);
      tn.diesel.set(fmt.n(L.dieselToLoad) + ' kW', `${L.unitsOn} of ${L.unitsTotal} units`);
      if (tn.batt) tn.batt.set(fmt.n(L.soc) + '%', L.battDis > 0.5 ? 'discharging' : L.battChg > 0.5 ? 'charging' : 'idle');
      tp.del.set(fmt.n(served) + ' kWh', `${fmt.n(sold / p.load.subscribers, 1)} kWh per user`);
      tp.share.set(fmt.pct(served > 0 ? solar / served : 0, 0), `${p.load.subscribers.toLocaleString()} users`);
      tp.margin.set(fmt.usd(sold * p.finance.tariffUsdKwh - cost));
      tp.un.set(fmt.n(un, 0) + ' kWh'); tp.un.setTone(un > 0.5 ? 'bad' : '');
      mark(chart, R, L);
    } };
  },

  generator(app, period, day) {
    const p = app.params, S = app.series, R = ranges(period, day), T = app.totals, cum = app.cum;
    const rated = p.diesel.ratedKw, units = p.diesel.units, capKw = rated * units, firm = (units - 1) * rated;
    const tn = { out: tile('Output', '–'), units: tile('Units on', '–'), load: tile('Loading', '–') };
    const tp = { e: tile('Energy', '–'), eco: tile('Fuel economy', '–'), cost: tile('Cost per kWh', '–', 'fuel + run-hour O&M') };
    const n1 = p.battery.enabled || firm >= T.peakLoadKw;
    const chart = stackedChart({
      title: `Diesel output, ${R.label}`, x: R.x, tickEvery: R.tick, unit: R.unit, mode: R.mode,
      series: [{ name: 'Diesel', color: C.diesel, values: bucket(R, S.dieselOut) }],
      lines: R.unit === 'kW' ? [{ name: 'Installed', color: C.ink, values: R.x.map(() => capKw), dash: '5 4' }] : [],
    });
    const el = h('div', { class: 'dash' }, nowRow(tn.out, tn.units, tn.load),
      tilesRow(tp.e, tp.eco, tp.cost, tile('N−1 capacity', fmt.n(firm) + ' kW', n1 ? `covers ${fmt.n(T.peakLoadKw)} kW peak` : `below ${fmt.n(T.peakLoadKw)} kW peak`, n1 ? '' : 'bad')), chart.el);
    return { el, R, update(L) {
      const td = (k) => toDate(cum[k], S[k], R, L.T);
      const e = td('dieselOut'), fuel = td('fuel'), uh = td('units');
      tn.out.set(fmt.n(L.dieselOut) + ' kW', `of ${fmt.n(capKw)} kW`);
      tn.units.set(`${L.unitsOn} of ${L.unitsTotal}`, L.unitsOn ? `${fmt.n(L.fuel, 0)} L/h` : 'stopped');
      tn.load.set(L.unitsOn ? fmt.pct(L.dieselOut / (L.unitsOn * rated)) : '–', L.unitsOn ? `min ${p.diesel.minLoadPct}%` : '');
      tp.e.set(fmt.n(e) + ' kWh', `${fmt.n(fuel)} L of fuel`);
      tp.eco.set(e > 0 ? fmt.n(e / fuel, 2) + ' kWh/L' : '–', `${fmt.n(toDate(cum.running, app.runFlag, R, L.T))} h running`);
      tp.cost.set(e > 0 ? fmt.usd((fuel * p.costs.fuelUsdPerL + uh * p.costs.dieselOmUsdPerUnitHour) / e, 3) : '–');
      mark(chart, R, L);
    } };
  },

  solar(app, period, day) {
    const p = app.params, S = app.series, R = ranges(period, day), d = derived(p), cum = app.cum;
    const tn = { pw: tile('Output', '–'), g: tile('Sunlight', '–'), inv: tile('Inverter', '–') };
    const tp = { e: tile('Energy', '–'), curt: tile('Curtailed', '–'), cf: tile('Capacity factor', '–') };
    const chart = stackedChart({
      title: `Solar production, ${R.label}`, x: R.x, tickEvery: R.tick, unit: R.unit, mode: R.mode,
      series: [{ name: 'Used', color: C.solar, values: bucket(R, S.pvUsed) }, { name: 'Curtailed', color: C.curt, values: bucket(R, S.pvCurt) }],
      lines: [{ name: 'Demand', color: C.ink, values: bucket(R, S.load) }],
    });
    const el = h('div', { class: 'dash' }, nowRow(tn.pw, tn.g, tn.inv),
      tilesRow(tp.e, tp.curt, tp.cf, tile('Plant', fmt.n(d.kWp, 0) + ' kWp', `${fmt.n(p.pv.panelCount)} panels · ${fmt.n(d.areaM2)} m²`)), chart.el);
    return { el, R, update(L) {
      const td = (k) => toDate(cum[k], S[k], R, L.T);
      const gen = td('pvAvail'), curt = td('pvCurt'), hrs = elapsed(R, L.T);
      tn.pw.set(fmt.n(L.pvAvail) + ' kW', L.pvCurt > 0.5 ? `${fmt.n(L.pvCurt)} kW curtailed` : `${fmt.n(L.pvUsed)} kW used`);
      tn.g.set(fmt.n(L.poa) + ' W/m²', L.poa > 5 ? `cells ${fmt.n(L.tcell, 0)} °C` : 'night');
      tn.inv.set(d.acKw > 0 ? fmt.pct(L.pvAvail / d.acKw) : '–', `${fmt.n(d.acKw, 0)} kW rated`);
      tp.e.set(fmt.n(gen) + ' kWh', `${fmt.n(d.kWp > 0 ? gen / d.kWp : 0, 2)} kWh per kWp`);
      tp.curt.set(fmt.pct(gen > 0 ? curt / gen : 0, 0), `${fmt.n(curt)} kWh`);
      tp.cf.set(d.kWp > 0 && hrs > 0 ? fmt.pct(gen / (d.kWp * hrs), 0) : '–');
      mark(chart, R, L);
    } };
  },

  battery(app, period, day) {
    const p = app.params, S = app.series, R = ranges(period, day), d = derived(p), cum = app.cum;
    const usable = d.battKwh * (p.battery.socMaxPct - p.battery.socMinPct) / 100;
    const rows = app.cmp.hy.rows;
    const tn = { soc: tile('Charge', '–'), pw: tile('Power', '–') };
    const tp = { chg: tile('Charged', '–'), dis: tile('Delivered', '–'), cyc: tile('Cycles', '–') };
    const socVals = R.unit === 'kW' ? R.r.map(([a]) => S.soc[a]) : R.r.map(([a, b]) => sumArr(S.soc, a, b) / (b - a));
    const chart = stackedChart({ title: `State of charge, ${R.label}`, x: R.x, tickEvery: R.tick, unit: '%', mode: R.mode, yMax: 100, height: 150, series: [{ name: R.unit === 'kW' ? 'Charge' : 'Average charge', color: C.batt, values: socVals }] });
    const el = h('div', { class: 'dash' }, nowRow(tn.soc, tn.pw),
      tilesRow(tp.chg, tp.dis, tp.cyc, tile('Size', fmt.n(d.battKwh) + ' kWh', `${fmt.n(d.battKw)} kW · ${fmt.pct(rows[rows.length - 1].battCap, 0)} left at end`)), chart.el);
    return { el, R, update(L) {
      const dis = toDate(cum.battDis, S.battDis, R, L.T);
      tn.soc.set(fmt.n(L.soc) + '%', `${fmt.n(d.battKwh * L.soc / 100)} kWh stored`);
      tn.pw.set(L.battDis > 0.5 ? fmt.n(L.battDis) + ' kW' : L.battChg > 0.5 ? fmt.n(L.battChg) + ' kW' : 'idle', L.battDis > 0.5 ? 'discharging' : L.battChg > 0.5 ? 'charging' : '');
      tp.chg.set(fmt.n(toDate(cum.battChg, S.battChg, R, L.T)) + ' kWh');
      tp.dis.set(fmt.n(dis) + ' kWh');
      tp.cyc.set(usable > 0 ? fmt.n(dis / usable, 1) : '–', `${fmt.n(app.totals.cycles, 0)} per year`);
      mark(chart, R, L);
    } };
  },

  house(app, period, day) {
    const p = app.params, U = app.user, R = ranges(period, day), cum = app.cum;
    const tn = { kw: tile('Using', '–'), mix: tile('From solar', '–') };
    const tp = { all: tile('Consumed', '–'), s: tile('From solar', '–'), d: tile('From diesel', '–'), un: tile('Not supplied', '–') };
    const tariff = p.finance.tariffUsdKwh;
    const chart = stackedChart({
      title: `This house, ${R.label}`, x: R.x, tickEvery: R.tick, unit: R.unit, mode: R.mode, digits: 2,
      series: [{ name: 'Solar', color: C.solar, values: bucket(R, U.solar) }, { name: 'Diesel', color: C.diesel, values: bucket(R, U.diesel) }, ...(sumArr(U.unserved, R.h0, R.h1) > 0 ? [{ name: 'Unserved', color: C.bad, values: bucket(R, U.unserved) }] : [])],
    });
    const el = h('div', { class: 'dash' }, nowRow(tn.kw, tn.mix), tilesRow(tp.all, tp.s, tp.d, tp.un), chart.el);
    return { el, R, update(L) {
      const s = toDate(cum.uSolar, U.solar, R, L.T), dz = toDate(cum.uDiesel, U.diesel, R, L.T), un = toDate(cum.uUnserved, U.unserved, R, L.T), all = s + dz;
      tn.kw.set(fmt.n(L.houseKw, 2) + ' kW', `${fmt.pct(L.houseKw / Math.max(1e-6, U.peak))} of its peak`);
      tn.mix.set(fmt.pct(L.served > 0 ? L.solarToLoad / L.served : 0), 'of current supply');
      tp.all.set(fmt.n(all, 1) + ' kWh', fmt.usd(all * tariff, 2));
      tp.s.set(fmt.n(s, 1) + ' kWh', fmt.pct(all > 0 ? s / all : 0, 0));
      tp.d.set(fmt.n(dz, 1) + ' kWh', fmt.pct(all > 0 ? dz / all : 0, 0));
      tp.un.set(fmt.n(un, 2) + ' kWh'); tp.un.setTone(un > 0.01 ? 'bad' : '');
      mark(chart, R, L);
    } };
  },
};

export const DASH_TITLES = {
  compound: 'Compound', generator: 'Diesel generators', solar: 'Solar array', inverter: 'Solar array', battery: 'Battery', house: 'House',
};

export function createDashboards(app, mount) {
  let kind = null, period = 'day', built = null, key = '';
  const dayKey = (per, day) => (per === 'day' ? day : per === 'month' ? monthOfDay(day) : 0);
  const keyNow = () => [kind, period, dayKey(period, Math.floor(app.T / 24)), app.version].join('|');

  function render() {
    key = keyNow();
    const day = Math.floor(app.T / 24);
    built = DASH[kind === 'inverter' ? 'solar' : kind](app, period, day);
    mount.replaceChildren(periodTabs(period, built.R.since, (pp) => { period = pp; render(); }), built.el);
    built.update(app.live);
  }
  return {
    open(k) { kind = k; render(); },
    get kind() { return kind; },
    close() { kind = null; built = null; mount.replaceChildren(); },
    tick(live) { if (!kind || !built) return; if (keyNow() !== key) render(); else built.update(live); },
    rerender() { if (kind) render(); },
  };
}
