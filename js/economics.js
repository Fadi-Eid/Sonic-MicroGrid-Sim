// Capex, multi-year cash flow, LCOE, NPV/IRR/payback, and the diesel-only comparison.
import { derived, clone } from './params.js';
import { simulateYear } from './engine.js';

export function capex(p) {
  const d = derived(p), c = p.costs;
  const items = {
    panels: p.pv.panelCount * p.pv.panelWp * c.panelUsdPerWp,
    pvInstall: d.kWp * c.pvInstallUsdPerKwp,
    pvInverter: d.acKw * c.pvInverterUsdPerKw,
    battery: d.battKwh * c.battUsdPerKwh,
    battInverter: d.battKw * c.battInverterUsdPerKw,
    diesel: c.dieselCapexIncluded ? d.dieselKw * c.dieselUsdPerKw : 0,
    network: c.networkCapexUsd,
    subscribers: p.load.subscribers * c.perSubscriberCapexUsd,
    other: c.otherCapexUsd,
  };
  let total = 0;
  for (const k in items) total += items[k];
  return { total, items };
}

export function irr(flows) {
  // flows[0] is year 0 (negative). Scan for the first sign change of NPV(r), then bisect.
  const npvAt = (r) => flows.reduce((sum, f, i) => sum + f / Math.pow(1 + r, i), 0);
  if (!(flows[0] < 0) || !flows.some((f) => f > 0)) return null;
  const grid = [-0.9, -0.5, -0.2, -0.05, 0, 0.02, 0.05, 0.08, 0.1, 0.15, 0.2, 0.3, 0.5, 1, 2, 5, 10];
  let lo = null, hi = null, prev = npvAt(grid[0]);
  for (let i = 1; i < grid.length; i++) {
    const cur = npvAt(grid[i]);
    if (prev > 0 && cur <= 0) { lo = grid[i - 1]; hi = grid[i]; break; }
    prev = cur;
  }
  if (lo == null) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (npvAt(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function paybackOf(flows, rate) {
  let cum = flows[0];
  if (cum >= 0) return 0;
  for (let y = 1; y < flows.length; y++) {
    const f = flows[y] / Math.pow(1 + rate, y);
    if (cum + f >= 0) return y - 1 + (-cum) / f;
    cum += f;
  }
  return null; // never within project life
}

// Full lifecycle. opts.recordFirst keeps the hourly series of year 1.
export function lifecycle(p, ctx, opts = {}) {
  const N = Math.round(p.finance.projectYears);
  const d = derived(p), c = p.costs, f = p.finance, b = p.battery;
  const cap = capex(p);
  const battCapex = d.battKwh * c.battUsdPerKwh + d.battKw * c.battInverterUsdPerKw;
  const rate = f.discountRatePct / 100;
  const rows = [];
  let capFactor = 1, age = 0, fade = 0, cumHours = 0;
  let first = null;

  for (let y = 1; y <= N; y++) {
    const replacements = { battery: 0, inverter: 0, diesel: 0 };
    if (d.batt) {
      if (y > 1 && y <= N - 1 && (age >= b.calendarLifeYears || capFactor <= b.eolCapacityPct / 100)) {
        replacements.battery = d.battKwh * c.battReplaceUsdPerKwh;
        capFactor = 1; age = 0; fade = 0;
      }
    }
    if (y === Math.round(c.inverterReplaceYear) && y < N) {
      replacements.inverter = d.acKw * c.pvInverterUsdPerKw + (d.batt ? d.battKw * c.battInverterUsdPerKw : 0);
    }
    const sim = simulateYear(p, ctx, { yearIdx: y - 1, record: !!opts.recordFirst && y === 1, battCapFactor: capFactor });
    if (y === 1) first = sim;
    const T = sim.totals;
    cumHours += T.unitHours;
    if (cumHours / p.diesel.units >= p.diesel.lifetimeHours && y < N) {
      replacements.diesel = d.dieselKw * c.dieselReplaceUsdPerKw;
      cumHours = 0;
    }
    if (d.batt) {
      fade += b.calendarFadePctYr / 100 + (T.cycles * (1 - b.eolCapacityPct / 100)) / b.cycleLife;
      capFactor = Math.max(0, 1 - fade);
      age++;
    }

    const fuelPrice = c.fuelUsdPerL * Math.pow(1 + c.fuelEscalationPctYr / 100, y - 1);
    const tariff = f.tariffUsdKwh * Math.pow(1 + f.tariffEscalationPctYr / 100, y - 1);
    const soldKwh = T.servedKwh * (1 - p.load.lossesPct / 100);
    const billed = soldKwh * tariff + f.feeUsdPerSubMonth * 12 * p.load.subscribers;
    const revenue = billed * f.collectionPct / 100;
    const opex = {
      fuel: T.fuelL * fuelPrice,
      dieselOm: T.unitHours * c.dieselOmUsdPerUnitHour + (T.unitHours / c.oilChangeIntervalH) * c.oilChangeUsd,
      solarOm: d.kWp * c.pvOmUsdPerKwpYr,
      battOm: battCapex * c.battOmPctYr / 100,
      fixed: c.fixedOpexUsdMonth * 12,
      insurance: cap.total * c.insurancePctCapexYr / 100,
    };
    const opexTotal = opex.fuel + opex.dieselOm + opex.solarOm + opex.battOm + opex.fixed + opex.insurance;
    const replTotal = replacements.battery + replacements.inverter + replacements.diesel;
    const ebitda = revenue - opexTotal;
    const tax = f.taxPct / 100 * Math.max(0, ebitda - cap.total / N);
    const residual = y === N ? cap.total * f.residualPct / 100 : 0;
    const cash = ebitda - replTotal - tax + residual;
    rows.push({
      year: y, soldKwh, servedKwh: T.servedKwh, unservedKwh: T.unservedKwh, solarFraction: T.solarFraction,
      fuelL: T.fuelL, dieselKwh: T.dieselKwh, solarToLoadKwh: T.solarToLoadKwh, unitHours: T.unitHours,
      revenue, opex, opexTotal, replacements, replTotal, ebitda, tax, residual, cash, battCap: capFactor,
      cycles: T.cycles, curtailKwh: T.pvCurtKwh,
    });
  }

  const flows = [-cap.total, ...rows.map((r) => r.cash)];
  let npv = 0, pvCost = cap.total, pvEnergy = 0;
  rows.forEach((r, i) => {
    const df = 1 / Math.pow(1 + rate, i + 1);
    npv += r.cash * df;
    pvCost += (r.opexTotal + r.replTotal) * df;
    pvEnergy += r.soldKwh * df;
  });
  npv -= cap.total;
  const r1 = rows[0];
  return {
    capex: cap, rows, flows,
    npv, irr: irr(flows), payback: paybackOf(flows, 0), discPayback: paybackOf(flows, rate),
    lcoe: pvEnergy > 0 ? pvCost / pvEnergy : null,
    year1: r1, first,
    avgSolarFraction: rows.reduce((s, r) => s + r.solarFraction, 0) / rows.length,
    totalFuelL: rows.reduce((s, r) => s + r.fuelL, 0),
  };
}

export function dieselOnlyParams(p) {
  const q = clone(p);
  q.pv.panelCount = 0;
  q.battery.enabled = false;
  return q;
}

// Hybrid vs the same system with diesel only (existing generators, no solar, no battery).
export function compare(p, ctx, opts = {}, baseline = null) {
  const hy = lifecycle(p, ctx, opts);
  const base = baseline || lifecycle(dieselOnlyParams(p), ctx);
  const extraCapex = hy.capex.total - base.capex.total;
  const flows = [-extraCapex, ...hy.rows.map((r, i) => r.cash - base.rows[i].cash)];
  const rate = p.finance.discountRatePct / 100;
  const npv = flows.reduce((s, v, i) => s + v / Math.pow(1 + rate, i), 0);
  return {
    hy, base, extraCapex, flows,
    incNpv: npv, incIrr: irr(flows), incPayback: paybackOf(flows, 0), incDiscPayback: paybackOf(flows, rate),
    year1Saving: flows[1],
    fuelSavedL1: base.rows[0].fuelL - hy.rows[0].fuelL,
  };
}
