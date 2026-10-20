// Shared world definition: layout, island shape/height, noise and small helpers.
// Coordinates: x = east, y = up, z = south (north is -z). Units are metres.
import * as THREE from 'three';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const POS = {
  solar: new THREE.Vector3(-58, 0, 10),
  inverter: new THREE.Vector3(-22, 0, 10),
  battery: new THREE.Vector3(-8, 0, 28),
  diesel: new THREE.Vector3(46, 0, 12),
  bus: new THREE.Vector3(0, 0, 4),
  compound: new THREE.Vector3(2, 0, -50),
  house: new THREE.Vector3(66, 0, -42),
};
export const COL = { solar: 0xffc21a, diesel: 0x4f8cff, battery: 0x2fd1a0 };
export const SEA_Y = -0.45;

export function rngFrom(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- value noise -------------------------------------------------------------------------
function h2(ix, iy) {
  let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, y) {
  return 0.5 * vnoise(x, y) + 0.25 * vnoise(x * 2.03 + 5.2, y * 2.03 + 1.3) + 0.125 * vnoise(x * 4.07 - 3.1, y * 4.07 + 7.7) + 0.0625 * vnoise(x * 8.1 + 9.4, y * 8.1 - 2.2);
}

// ---- layout footprints (used to keep the ground flat where things stand) ---------------------
export const ZONES = [
  { x: -58, z: 10, rx: 54, rz: 36 },   // solar field
  { x: 46, z: 12, rx: 30, rz: 24 },    // diesel plant
  { x: 2, z: -50, rx: 40, rz: 34 },    // compound
  { x: 66, z: -42, rx: 22, rz: 22 },   // house
  { x: -8, z: 28, rx: 14, rz: 12 },    // battery
  { x: 0, z: 4, rx: 22, rz: 14 },      // substation
  { x: -22, z: 10, rx: 10, rz: 8 },    // inverter
];
// [x0, z0, x1, z1, width]
export const ROADS = [
  [POS.bus.x, POS.bus.z - 4, POS.compound.x, POS.compound.z + 14, 5],
  [POS.diesel.x - 6, POS.diesel.z + 14, POS.bus.x + 6, POS.bus.z + 6, 5],
  [POS.compound.x + 26, POS.compound.z, POS.house.x + 2, POS.house.z + 2, 4],
];
function segDist(px, pz, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - x0) * dx + (pz - z0) * dz) / l2, 0, 1);
  return Math.hypot(px - (x0 + t * dx), pz - (z0 + t * dz));
}
// 0 inside a facility or beside a road (ground must be flat), 1 far from everything
export function flatFactor(x, z) {
  let f = 1;
  for (const o of ZONES) {
    const d = Math.hypot((x - o.x) / o.rx, (z - o.z) / o.rz);
    f = Math.min(f, smooth(1.0, 1.55, d));
  }
  for (const r of ROADS) f = Math.min(f, smooth(r[4] * 0.8, r[4] * 0.8 + 10, segDist(x, z, r[0], r[1], r[2], r[3])));
  return f;
}
export function inZone(x, z, pad = 1) {
  for (const o of ZONES) if (Math.hypot((x - o.x) / (o.rx * pad), (z - o.z) / (o.rz * pad)) < 1) return true;
  for (const r of ROADS) if (segDist(x, z, r[0], r[1], r[2], r[3]) < r[4] * 0.9 + 3) return true;
  return false;
}

// ---- island ---------------------------------------------------------------------------------
export function coastR(a) {
  return 112 + 7 * Math.sin(3 * a + 1.0) + 4 * Math.sin(5 * a + 2.3) + 3 * Math.sin(9 * a + 0.4);
}
export function inlandDist(x, z) { return coastR(Math.atan2(z, x)) - Math.hypot(x, z); }

export function islandHeight(x, z) {
  const d = Math.hypot(x, z), t = coastR(Math.atan2(z, x)) - d;
  let base;
  if (t < 0) base = SEA_Y - 4.6 * (1 - smooth(-26, 0, t));
  else if (t < 7) base = lerp(SEA_Y, 0.35, smooth(0, 7, t));
  else base = lerp(0.35, 0, smooth(7, 16, t));
  const ff = flatFactor(x, z);
  const inland = smooth(10, 34, t), rim = smooth(64, 100, d);
  const n = fbm(x * 0.028 + 11, z * 0.028 - 7);
  const hill = inland * rim * ff * (1.5 + 15 * Math.pow(n, 1.4));
  const micro = (fbm(x * 0.22, z * 0.22) - 0.5) * 0.32 * ff * ff * inland;
  return base + hill + micro;
}
export function slopeAt(x, z) {
  const e = 1.2;
  const dx = islandHeight(x + e, z) - islandHeight(x - e, z), dz = islandHeight(x, z + e) - islandHeight(x, z - e);
  return Math.hypot(dx, dz) / (2 * e); // rise over run
}

// Place a mesh-local origin on the ground
export const groundY = (x, z) => Math.max(islandHeight(x, z), SEA_Y);
