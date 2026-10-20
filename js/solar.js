// Solar geometry, clear-sky irradiance, synthetic weather and PV yield.
// Hourly resolution, 8760 hours (365 days), local clock time.

export const HOURS = 8760;
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTH_START_DAY = (() => {
  const a = [0];
  for (let m = 0; m < 12; m++) a.push(a[m] + DAYS_IN_MONTH[m]);
  return a; // length 13
})();
export const monthOfDay = (day) => {
  for (let m = 11; m >= 0; m--) if (day >= MONTH_START_DAY[m]) return m;
  return 0;
};

const D2R = Math.PI / 180;

// Deterministic PRNG (mulberry32) + Box-Muller normal.
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  const uni = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    let u = 0;
    while (u === 0) u = uni();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uni());
  };
  return { uni, normal };
}

// Sun direction in local East-North-Up axes (unit vector) plus angles.
// day: 1..365 day of year (fractions ok), hourLocal: local clock hours 0..24.
export function solarPosition(lat, lon, tz, dayOfYear, hourLocal) {
  const phi = lat * D2R;
  const B = (2 * Math.PI * (dayOfYear - 81)) / 364;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // minutes
  const decl = 23.45 * D2R * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
  const lst = hourLocal + (4 * (lon - 15 * tz) + eot) / 60;
  const omega = 15 * D2R * (lst - 12);
  const cd = Math.cos(decl), sd = Math.sin(decl), cp = Math.cos(phi), sp = Math.sin(phi), co = Math.cos(omega);
  const up = sp * sd + cp * cd * co;
  const north = cp * sd - sp * cd * co;
  const east = -cd * Math.sin(omega);
  return { east, north, up, elevation: Math.asin(Math.max(-1, Math.min(1, up))), declination: decl, hourAngle: omega };
}

// Clear-sky plane-of-array irradiance (W/m2) for a tilted surface.
// sun: result of solarPosition. Model: Meinel direct beam, 10 % diffuse, isotropic sky, ground reflection.
export function clearSkyPoa(sun, dayOfYear, lat, tiltDeg, azimuthDeg, albedo) {
  if (sun.up <= 0.0) return { poa: 0, ghi: 0, dni: 0 };
  const elevDeg = sun.elevation / D2R;
  const am = 1 / (sun.up + 0.50572 * Math.pow(elevDeg + 6.07995, -1.6364)); // Kasten-Young
  const e0 = 1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365);
  const dni = 1361 * e0 * Math.pow(0.7, Math.pow(am, 0.678));
  const dhi = 0.1 * dni;
  const ghi = dni * sun.up + dhi;
  const beta = tiltDeg * D2R, gam = azimuthDeg * D2R;
  const eqN = lat >= 0 ? -1 : 1; // north component of the equator-facing horizontal direction
  // normal = cos(b)*up + sin(b)*(cos(g)*equatorFacing + sin(g)*west)
  const nUp = Math.cos(beta);
  const nNorth = Math.sin(beta) * Math.cos(gam) * eqN;
  const nEast = -Math.sin(beta) * Math.sin(gam);
  const cosT = Math.max(0, nUp * sun.up + nNorth * sun.north + nEast * sun.east);
  const poa = dni * cosT + dhi * (1 + Math.cos(beta)) / 2 + ghi * albedo * (1 - Math.cos(beta)) / 2;
  return { poa, ghi, dni };
}

// Daily & hourly "cloud factor" series (share of clear-sky sun that gets through, 0.08..1).
export function buildCloudSeries(site) {
  const rng = makeRng(site.seed * 7919 + 17);
  const v = site.cloudVariability;
  const daily = new Float64Array(365);
  for (let m = 0; m < 12; m++) {
    const kc = site.monthlyClearness[m];
    const d0 = MONTH_START_DAY[m], d1 = MONTH_START_DAY[m + 1];
    for (let d = d0; d < d1; d++) daily[d] = Math.min(1, Math.max(0.12, kc + v * 0.35 * rng.normal() * Math.min(1, 1.6 * (1 - kc) + 0.15)));
    for (let pass = 0; pass < 3; pass++) { // re-centre the month on its mean
      let mean = 0;
      for (let d = d0; d < d1; d++) mean += daily[d];
      mean /= d1 - d0;
      if (mean <= 0) break;
      const k = kc / mean;
      for (let d = d0; d < d1; d++) daily[d] = Math.min(1, Math.max(0.12, daily[d] * k));
    }
  }
  const hourly = new Float32Array(HOURS);
  let ar = 0;
  for (let h = 0; h < HOURS; h++) {
    ar = 0.7 * ar + Math.sqrt(1 - 0.49) * rng.normal();
    const d = Math.floor(h / 24);
    hourly[h] = Math.min(1, Math.max(0.08, daily[d] * (1 + v * 0.25 * ar)));
  }
  return { daily, hourly };
}

// Full-year solar context for the site: per-hour arrays.
//  poa  - plane-of-array irradiance incl. clouds (W/m2)
//  tamb / tcell - temperatures (°C)
//  cloud - cloud factor (share of clear sky)
//  yieldKw - DC kW per kWp after temperature, soiling, wiring and availability losses (before inverter)
export function buildSolarYear(p) {
  const { site, pv } = p;
  const cloudSeries = buildCloudSeries(site);
  const poa = new Float32Array(HOURS), tamb = new Float32Array(HOURS), tcell = new Float32Array(HOURS);
  const yieldKw = new Float32Array(HOURS);
  const loss = (1 - pv.soilingPct / 100) * (1 - pv.mismatchWiringPct / 100) * (pv.availabilityPct / 100);
  const tc = pv.tempCoeffPctPerC / 100;
  for (let h = 0; h < HOURS; h++) {
    const day = Math.floor(h / 24), hod = h % 24;
    const m = monthOfDay(day);
    const ta = site.monthlyTempC[m] + (site.diurnalRangeC / 2) * Math.cos((2 * Math.PI * (hod + 0.5 - 15)) / 24);
    tamb[h] = ta;
    const sun = solarPosition(site.lat, site.lon, site.tzOffset, day + 1, hod + 0.5);
    const cs = clearSkyPoa(sun, day + 1, site.lat, site.tilt, site.azimuth, site.albedo);
    const g = cs.poa * cloudSeries.hourly[h];
    poa[h] = g;
    const tcl = ta + ((pv.noct - 20) / 800) * g;
    tcell[h] = tcl;
    yieldKw[h] = Math.max(0, (g / 1000) * (1 + tc * (tcl - 25)) * loss);
  }
  return { poa, tamb, tcell, cloud: cloudSeries.hourly, cloudDaily: cloudSeries.daily, yieldKw };
}
