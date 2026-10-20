// Browser-run sanity tests for the engine. Open tests.html (served over http) to run.
import { defaultParams, sanitize, toJSON, fromJSON, clone } from './params.js';
import { solarPosition, clearSkyPoa, HOURS } from './solar.js';
import { getContext, simulateYear } from './engine.js';
import { lifecycle, compare, irr, dieselOnlyParams } from './economics.js';
import { GUIDE } from './manual.js';
import { GROUPS, ADVANCED } from './params.js';
import { solveForSolarFraction, sweep, panelsForKwp, rankCells, dieselOptions, tornado, monteCarlo } from './sizing.js';

const lines = [];
let fails = 0;
const log = (ok, name, info = '') => { if (!ok) fails++; lines.push(`<span class="${ok ? 'pass' : 'fail'}">${ok ? 'PASS' : 'FAIL'}</span> ${name} ${info}`); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const info = (s) => lines.push('      ' + s);

try {
  // ---- params -------------------------------------------------------------------
  const p0 = defaultParams();
  const rt = fromJSON(toJSON(p0));
  log(JSON.stringify(rt.params) === JSON.stringify(p0), 'params JSON round-trip is lossless', `warnings=${rt.warnings.length}`);
  const bad = sanitize({ pv: { panelWp: -5, panelCount: 'abc' }, site: { monthlyClearness: [1, 2] }, junk: 1 });
  log(bad.params.pv.panelWp === 50 && bad.params.pv.panelCount === defaultParams().pv.panelCount && bad.warnings.length >= 3, 'sanitize clamps / rejects bad input', bad.warnings.join(' | '));
  let threw = false; try { fromJSON('{not json'); } catch { threw = true; }
  log(threw, 'invalid JSON throws a readable error');

  // ---- manual covers every parameter ----------------------------------------------
  const paths = GROUPS.flatMap((g) => [...g.fields, ...(g.arrays || [])].map((f) => f.path)).concat(['load.weekendDays', 'load.seasons']);
  const missing = paths.filter((pp) => !GUIDE[pp]);
  const badAdv = [...ADVANCED].filter((a) => !paths.includes(a));
  log(badAdv.length === 0, 'every Advanced entry is a real parameter', badAdv.join(', '));
  log(missing.length === 0, `manual has guidance for all ${paths.length} parameters`, missing.join(', '));

  // ---- solar geometry -----------------------------------------------------------
  const eq = solarPosition(33.89, 35.5, 3, 80, 12 - (35.5 - 45) * 4 / 60 + 0); // ~solar noon at equinox (tz 3 => 45E)
  info(`equinox solar-noon elevation = ${(eq.elevation * 180 / Math.PI).toFixed(1)}° (expect ~56)`);
  log(near(eq.elevation * 180 / Math.PI, 56.1, 1.5), 'solar elevation at equinox noon');
  const sunJun = solarPosition(33.89, 35.5, 3, 172, 12.5);
  const sunDec = solarPosition(33.89, 35.5, 3, 355, 12.5);
  log(sunJun.elevation > sunDec.elevation + 0.5, 'summer sun higher than winter sun');
  const night = solarPosition(33.89, 35.5, 3, 172, 1);
  log(night.up < 0, 'sun below horizon at 01:00');
  const cs = clearSkyPoa(eq, 80, 33.89, 25, 0, 0.2);
  info(`clear-sky POA at equinox noon = ${cs.poa.toFixed(0)} W/m2`);
  log(cs.poa > 850 && cs.poa < 1150, 'clear-sky POA plausible (850..1150 W/m2)');

  // ---- context ------------------------------------------------------------------
  const p = defaultParams();
  let t0 = performance.now();
  const ctx = getContext(p);
  info(`context build ${(performance.now() - t0).toFixed(1)} ms`);
  let sumY = 0, nightMax = 0;
  for (let h = 0; h < HOURS; h++) { sumY += ctx.solar.yieldKw[h]; if (h % 24 === 2) nightMax = Math.max(nightMax, ctx.solar.yieldKw[h]); }
  info(`DC specific yield = ${sumY.toFixed(0)} kWh/kWp/yr`);
  log(sumY > 1400 && sumY < 2000, 'annual PV specific yield plausible for 34°N (1400..2000)');
  log(nightMax === 0, 'zero PV output at night');
  let tot = 0, pk = 0, pkH = 0;
  for (let h = 0; h < HOURS; h++) { tot += ctx.load.station[h]; if (ctx.load.station[h] > pk) { pk = ctx.load.station[h]; pkH = h % 24; } }
  const perUserDay = tot * (1 - 0.08) / 365 / 400;
  info(`load: ${perUserDay.toFixed(2)} kWh/user/day, peak ${pk.toFixed(0)} kW at hour ${pkH}`);
  log(near(perUserDay, 8.3, 0.7), 'average kWh/user/day close to input');
  log(pkH >= 19 && pkH <= 22, 'evening peak hour');

  // ---- engine invariants --------------------------------------------------------
  function checkBalance(q, name) {
    const c2 = getContext(q);
    const t1 = performance.now();
    const r = simulateYear(q, c2, { record: true });
    const dt = performance.now() - t1;
    const S = r.series, T = r.totals;
    let maxErr = 0, socBad = 0, penBad = 0;
    for (let h = 0; h < HOURS; h++) {
      maxErr = Math.max(maxErr,
        Math.abs(S.load[h] - S.unserved[h] - S.solarToLoad[h] - S.dieselToLoad[h]),
        Math.abs(S.pvAvail[h] - S.pvUsed[h] - S.pvCurt[h]));
      if (q.battery.enabled) {
        if (S.soc[h] < q.battery.socMinPct - 0.01 || S.soc[h] > q.battery.socMaxPct + 0.01) socBad++;
      } else if (S.pvUsed[h] > S.load[h] * q.pv.maxPenetrationPct / 100 + 1e-3) penBad++;
    }
    log(maxErr < 1e-3, `${name}: hourly energy balance closes`, `max err ${maxErr.toExponential(1)}`);
    log(socBad === 0 && penBad === 0, `${name}: SoC bounds / solar cap respected`);
    info(`${name}: solar ${(T.solarFraction * 100).toFixed(1)}%, curtailed ${(T.curtailFraction * 100).toFixed(1)}%, fuel ${T.fuelL.toFixed(0)} L (${T.fuelPerKwh.toFixed(3)} L/kWh), unserved ${(T.unservedFraction * 100).toFixed(2)}%, gen ${T.genHours} h, sim ${dt.toFixed(1)} ms`);
    return T;
  }
  const Thy = checkBalance(p, 'hybrid');
  const pd = dieselOnlyParams(p);
  const Td = checkBalance(pd, 'diesel-only');
  log(Td.solarFraction === 0 && Td.unservedKwh === 0, 'diesel-only: no solar, all load served');
  log(Td.fuelPerKwh > 0.28 && Td.fuelPerKwh < 0.42, 'diesel-only fuel use 0.28..0.42 L/kWh');
  log(Thy.fuelL < Td.fuelL, 'solar reduces fuel burn');
  log(Td.genHours === HOURS, 'no battery: generator runs every hour');

  const pb = clone(p); pb.battery.enabled = true; pb.battery.capacityKwh = 800;
  const Tb = checkBalance(pb, 'hybrid + battery');
  log(Tb.solarFraction > Thy.solarFraction, 'battery raises solar share');
  log(Tb.genHours < HOURS, 'battery lets the generator switch off');
  log(Tb.cycles > 20 && Tb.cycles < 600, 'battery cycles plausible', Tb.cycles.toFixed(0));

  const pc = clone(pb); pc.diesel.cycleCharging = true;
  const Tc = checkBalance(pc, 'battery + cycle charging');
  log(Tc.genHours <= Tb.genHours + 1, 'cycle charging does not add generator hours');

  const pu = clone(p); pu.diesel.units = 1; pu.diesel.ratedKw = 100;
  const Tu = checkBalance(pu, 'undersized diesel');
  log(Tu.unservedKwh > 0, 'undersized generator produces unserved energy');

  // ---- edge cases: nothing may produce NaN or throw --------------------------------
  const edge = (name, mut) => {
    const q = clone(p); mut(q);
    const c2 = getContext(q);
    const r = simulateYear(q, c2, { record: true });
    const lc = lifecycle(q, c2);
    const bad = Object.entries(r.totals).filter(([, v]) => !Number.isFinite(v)).map(([k]) => k);
    const okFlows = lc.flows.every(Number.isFinite);
    log(bad.length === 0 && okFlows, `edge case: ${name}`, bad.join(','));
  };
  edge('zero panels', (q) => { q.pv.panelCount = 0; });
  edge('battery enabled with 0 kWh', (q) => { q.battery.enabled = true; q.battery.capacityKwh = 0; });
  edge('single subscriber', (q) => { q.load.subscribers = 1; });
  edge('southern hemisphere', (q) => { q.site.lat = -33; });
  edge('equatorial site', (q) => { q.site.lat = 0; q.site.lon = 0; q.site.tzOffset = 0; });
  edge('polar-ish latitude', (q) => { q.site.lat = 64; });
  edge('no weather variability', (q) => { q.site.cloudVariability = 0; });
  edge('huge battery + cycle charging', (q) => { q.battery.enabled = true; q.battery.capacityKwh = 50000; q.diesel.cycleCharging = true; });
  edge('1-year project, 0 % discount', (q) => { q.finance.projectYears = 1; q.finance.discountRatePct = 0; });
  edge('maximum penetration 95 %, minimum load 0', (q) => { q.pv.maxPenetrationPct = 95; q.diesel.minLoadPct = 0; });
  const pS = clone(p); pS.site.lat = -33;
  const S2 = simulateYear(pS, getContext(pS), { yearIdx: 0 }).totals;
  log(S2.solarFraction > 0.1, 'southern hemisphere still produces solar (panels face north)', (S2.solarFraction * 100).toFixed(1) + '%');
  // ---- economics ----------------------------------------------------------------
  log(near(irr([-100, 60, 60]), 0.1307, 0.001), 'IRR of [-100,60,60] = 13.07 %');
  const cmp = compare(p, ctx);
  info(`hybrid capex $${cmp.hy.capex.total.toFixed(0)}, LCOE ${cmp.hy.lcoe.toFixed(3)} $/kWh (diesel-only ${cmp.base.lcoe.toFixed(3)}), incremental NPV $${cmp.incNpv.toFixed(0)}, payback ${cmp.incPayback == null ? 'n/a' : cmp.incPayback.toFixed(1)} y`);
  log(cmp.hy.lcoe > 0.1 && cmp.hy.lcoe < 0.6, 'LCOE in a plausible range for diesel/solar microgrid');
  log(cmp.base.rows[0].fuelL > cmp.hy.rows[0].fuelL, 'baseline burns more fuel than hybrid');
  const y1 = cmp.hy.rows[0];
  const manualCash = y1.revenue - y1.opexTotal - y1.replTotal - y1.tax;
  log(near(manualCash, y1.cash, 1e-6), 'cash-flow row adds up');

  // ---- sizing -------------------------------------------------------------------
  log(panelsForKwp(200, 550) === 364, 'panelsForKwp(200 kWp, 550 W) = 364');
  const sol = solveForSolarFraction(p, 0.2, ctx);
  info(`solve 20% solar -> ${sol.panels} panels (${sol.kWp.toFixed(0)} kWp), achieved ${(sol.achieved * 100).toFixed(1)}%, ceiling ${(sol.ceiling * 100).toFixed(0)}%`);
  log(sol.reachable && sol.achieved >= 0.2 && sol.achieved < 0.23, 'solver hits a 20 % target');
  const unreachable = solveForSolarFraction(p, 0.99, ctx);
  log(!unreachable.reachable, 'solver reports an unreachable target (no battery)');
  const opts = dieselOptions(330);
  log(opts.every((o) => o.firmKw >= 330), 'N+1 options keep firm capacity above peak');
  t0 = performance.now();
  const sw = await sweep(p, { pvMin: 0, pvMax: 600, pvSteps: 5, batMin: 0, batMax: 1000, batSteps: 3 });
  info(`sweep 15 candidates in ${(performance.now() - t0).toFixed(0)} ms`);
  log(sw.cells.length === 15, 'sweep returns all cells');
  const best = rankCells(sw.cells, 'lcoe', { maxUnservedPct: 0.1 });
  log(best.length > 0, 'ranking returns feasible cells', best[0] ? `best: ${best[0].kWp.toFixed(0)} kWp + ${best[0].battKwh} kWh, LCOE ${best[0].lcoe.toFixed(3)}` : '');
  const torn = await tornado(p, 0.2);
  log(torn.items.length >= 10, 'tornado runs');
  const mc = await monteCarlo(p, 12);
  log(mc.incNpv.p10 <= mc.incNpv.p50 && mc.incNpv.p50 <= mc.incNpv.p90, 'Monte-Carlo percentiles ordered', `incNPV P10..P90 = $${mc.incNpv.p10.toFixed(0)}..$${mc.incNpv.p90.toFixed(0)}`);
} catch (e) {
  log(false, 'unexpected exception', e && e.stack ? e.stack : String(e));
}
lines.push(`\n<b>${fails === 0 ? 'ALL TESTS PASSED' : fails + ' TEST(S) FAILED'}</b>`);
document.getElementById('out').innerHTML = lines.join('\n');
document.title = fails === 0 ? 'ALL PASS' : 'FAILED ' + fails;
