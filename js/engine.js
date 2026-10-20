// Hourly dispatch engine for an islanded diesel / solar / (optional) battery microgrid.
//
// Rules (see README):
//  * No battery: a diesel set always runs to form the grid. Solar can only displace diesel down to
//    the generators' minimum loading and up to the stability cap (max instantaneous share). The
//    rest is curtailed. Online diesel capacity must cover the whole load (ride-through if the sun drops).
//  * Battery: the battery inverter forms the grid. Solar serves load first, surplus charges the
//    battery, the battery covers deficits, diesel only covers what is left (optionally cycle-charging).
//  * Energy is tracked by origin (solar / diesel) through the battery so each kWh delivered to a user
//    can be labelled solar or diesel.

import { HOURS } from './solar.js';
import { derived } from './params.js';
import { buildSolarYear } from './solar.js';
import { buildLoadYear } from './load.js';

// ---- context (the expensive per-site arrays), memoised ---------------------------------
const cache = new Map();
function key(p) {
  return JSON.stringify([p.site, p.load,
    p.pv.tempCoeffPctPerC, p.pv.noct, p.pv.soilingPct, p.pv.mismatchWiringPct, p.pv.availabilityPct]);
}
export function getContext(p) {
  const k = key(p);
  let c = cache.get(k);
  if (c) { cache.delete(k); cache.set(k, c); return c; }
  c = { solar: buildSolarYear(p), load: buildLoadYear(p) };
  cache.set(k, c);
  if (cache.size > 6) cache.delete(cache.keys().next().value);
  return c;
}

export const SERIES = ['load', 'pvAvail', 'pvUsed', 'pvCurt', 'solarToLoad', 'dieselToLoad', 'dieselOut',
  'fuel', 'battChg', 'battDis', 'soc', 'unserved'];

// ---- one simulated year ---------------------------------------------------------------
// opts: yearIdx (0 = first year), record (keep hourly series), battCapFactor (ageing, 0..1)
export function simulateYear(p, ctx, opts = {}) {
  const yearIdx = opts.yearIdx || 0;
  const record = !!opts.record;
  const d = derived(p);
  const growth = Math.pow(1 + p.load.growthPctYr / 100, yearIdx);
  const deg = Math.pow(1 - p.pv.degradationPctYr / 100, yearIdx);
  const kWp = d.kWp * deg;
  const acKw = d.acKw;
  const etaInv = p.pv.inverterEffPct / 100;
  const maxPen = p.pv.maxPenetrationPct / 100;
  const rated = p.diesel.ratedKw, units = p.diesel.units;
  const noLoadL = p.diesel.fuelA * rated; // L/h per running unit
  const marg = p.diesel.fuelB;
  const minPct = p.diesel.minLoadPct / 100;
  const cycleOn = p.diesel.cycleCharging;
  const cycleTarget = p.diesel.cycleChargeLoadPct / 100;

  const batt = d.batt;
  const capFactor = opts.battCapFactor == null ? 1 : opts.battCapFactor;
  const Ceff = d.battKwh * capFactor;
  const P = d.battKw;
  const eta = Math.sqrt(p.battery.roundTripEffPct / 100);
  const eMin = Ceff * p.battery.socMinPct / 100, eMax = Ceff * p.battery.socMaxPct / 100;
  let E = Math.min(eMax, Math.max(eMin, Ceff * p.battery.socInitPct / 100));
  const E0 = E;
  let Es = 0; // solar-origin part of stored energy
  let withdrawnTotal = 0;

  const yieldKw = ctx.solar.yieldKw, loadBase = ctx.load.station;
  let S = null;
  if (record) {
    S = {};
    for (const k of SERIES) S[k] = new Float32Array(HOURS);
    S.units = new Uint8Array(HOURS);
  }

  const T = {
    loadKwh: 0, servedKwh: 0, unservedKwh: 0, pvAvailKwh: 0, pvDcKwh: 0, clippedKwh: 0, pvUsedKwh: 0, pvCurtKwh: 0,
    solarToLoadKwh: 0, dieselToLoadKwh: 0, dieselKwh: 0, fuelL: 0, unitHours: 0, genHours: 0,
    lowLoadHours: 0, lolHours: 0, battChargeKwh: 0, battDischargeKwh: 0, battLossKwh: 0, peakLoadKw: 0, peakDieselKw: 0,
    dieselRunLoadSum: 0, curtailHours: 0,
  };

  for (let h = 0; h < HOURS; h++) {
    const L = loadBase[h] * growth;
    const pvDc = kWp * yieldKw[h];
    const pvEff = pvDc * etaInv;
    const pvAvail = Math.min(pvEff, acKw);
    T.pvDcKwh += pvDc; T.clippedKwh += pvEff - pvAvail;

    let pvUsed = 0, curt = 0, dieselOut = 0, nOn = 0, unserved = 0, chg = 0, dis = 0;
    let solarToLoad = 0, dieselToLoad = 0, extraCharge = 0;

    if (!batt) {
      if (L > 0) {
        nOn = Math.min(units, Math.max(1, Math.ceil(L / rated - 1e-9)));
        const onCap = nOn * rated;
        const pvMax = Math.min(L * maxPen, Math.max(0, L - minPct * onCap));
        pvUsed = Math.min(pvAvail, pvMax);
        dieselOut = Math.min(L - pvUsed, onCap);
        unserved = L - pvUsed - dieselOut;
        curt = pvAvail - pvUsed;
        solarToLoad = pvUsed; dieselToLoad = dieselOut;
      } else { curt = pvAvail; }
    } else {
      const pvDirect = Math.min(pvAvail, L);
      const net = L - pvDirect;
      const surplus = pvAvail - pvDirect;
      // charge from solar surplus
      chg = Math.min(surplus, P, Math.max(0, (eMax - E) / eta));
      if (chg > 0) { E += chg * eta; Es += chg * eta; }
      curt = surplus - chg;
      pvUsed = pvDirect + chg;
      // discharge to cover the deficit
      let solarOutFrac = 0;
      dis = Math.min(net, P, Math.max(0, (E - eMin) * eta));
      if (dis > 0) {
        const withdrawn = dis / eta;
        solarOutFrac = E > 0 ? Es / E : 0;
        Es -= withdrawn * solarOutFrac; E -= withdrawn;
        withdrawnTotal += withdrawn;
      }
      const R = net - dis;
      if (R > 1e-9) {
        nOn = Math.min(units, Math.max(1, Math.ceil(R / rated - 1e-9)));
        const onCap = nOn * rated;
        dieselOut = Math.min(R, onCap);
        unserved = R - dieselOut;
        // raise loading to the minimum (or cycle-charging target) when the battery can absorb it
        const target = Math.min(onCap, (cycleOn ? cycleTarget : minPct) * onCap);
        if (target > dieselOut) {
          const room = Math.max(0, Math.min(P - chg, (eMax - E) / eta));
          extraCharge = Math.min(target - dieselOut, room);
          if (extraCharge > 0) {
            dieselOut += extraCharge; E += extraCharge * eta; chg += extraCharge;
          }
        }
      }
      solarToLoad = pvDirect + dis * solarOutFrac;
      dieselToLoad = dieselOut - extraCharge + dis * (1 - solarOutFrac);
    }

    // fuel & bookkeeping
    const fuel = nOn > 0 ? nOn * noLoadL + marg * dieselOut : 0;
    const served = L - unserved;
    T.loadKwh += L; T.servedKwh += served; T.unservedKwh += unserved;
    T.pvAvailKwh += pvAvail; T.pvUsedKwh += pvUsed; T.pvCurtKwh += curt;
    if (curt > 1e-6) T.curtailHours++;
    T.solarToLoadKwh += solarToLoad; T.dieselToLoadKwh += dieselToLoad;
    T.dieselKwh += dieselOut; T.fuelL += fuel; T.unitHours += nOn;
    if (nOn > 0) {
      T.genHours++;
      const ld = dieselOut / (nOn * rated);
      T.dieselRunLoadSum += ld;
      if (ld < minPct - 1e-6) T.lowLoadHours++;
    }
    if (unserved > 1e-6) T.lolHours++;
    T.battChargeKwh += chg; T.battDischargeKwh += dis;
    if (L > T.peakLoadKw) T.peakLoadKw = L;
    if (dieselOut > T.peakDieselKw) T.peakDieselKw = dieselOut;

    if (S) {
      S.load[h] = L; S.pvAvail[h] = pvAvail; S.pvUsed[h] = pvUsed; S.pvCurt[h] = curt;
      S.solarToLoad[h] = solarToLoad; S.dieselToLoad[h] = dieselToLoad; S.dieselOut[h] = dieselOut;
      S.fuel[h] = fuel; S.battChg[h] = chg; S.battDis[h] = dis; S.unserved[h] = unserved;
      S.soc[h] = batt && Ceff > 0 ? (E / Ceff) * 100 : 0; S.units[h] = nOn;
    }
  }

  // derived metrics
  T.battLossKwh = batt ? T.battChargeKwh - T.battDischargeKwh - (E - E0) : 0; // AC in - AC out - change in stored energy
  T.solarFraction = T.servedKwh > 0 ? T.solarToLoadKwh / T.servedKwh : 0;
  T.curtailFraction = T.pvAvailKwh > 0 ? T.pvCurtKwh / T.pvAvailKwh : 0;
  T.specificYield = kWp > 0 ? T.pvAvailKwh / kWp : 0; // kWh per kWp per year
  T.capacityFactor = T.specificYield / HOURS;
  T.avgDieselLoading = T.genHours > 0 ? T.dieselRunLoadSum / T.genHours : 0;
  T.fuelPerKwh = T.dieselKwh > 0 ? T.fuelL / T.dieselKwh : 0;
  T.unservedFraction = T.loadKwh > 0 ? T.unservedKwh / T.loadKwh : 0;
  const usable = Ceff * (p.battery.socMaxPct - p.battery.socMinPct) / 100;
  T.cycles = batt && usable > 0 ? withdrawnTotal / usable : 0;
  T.endSoc = batt && Ceff > 0 ? E / Ceff : 0;
  return { totals: T, series: S, kWp, growth, deg };
}

// ---- helpers for the visualiser / dashboards -------------------------------------------
export function sumRange(arr, h0, h1) {
  let s = 0;
  for (let h = h0; h < h1; h++) s += arr[h];
  return s;
}

// Aggregate all series over [h0,h1)
export function aggregate(series, h0, h1) {
  const o = {};
  for (const k of SERIES) o[k] = sumRange(series[k], h0, h1);
  o.unitHours = sumRange(series.units, h0, h1);
  let run = 0;
  for (let h = h0; h < h1; h++) if (series.units[h] > 0) run++;
  o.runHours = run;
  return o;
}
