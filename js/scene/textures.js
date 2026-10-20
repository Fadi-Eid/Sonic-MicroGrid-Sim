// Procedural canvas textures (no image assets, so the site stays a few static files).
import * as THREE from 'three';
import { rngFrom } from './world.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = true, srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}
// Fill with per-pixel noise around a base grey (0..255) with +-amp variation
function noiseCanvas(size, base, amp, seed, tint = [1, 1, 1]) {
  const c = canvas(size, size), g = c.getContext('2d'), img = g.createImageData(size, size), r = rngFrom(seed);
  for (let i = 0; i < size * size; i++) {
    const v = base + (r() - 0.5) * 2 * amp;
    img.data[i * 4] = v * tint[0]; img.data[i * 4 + 1] = v * tint[1]; img.data[i * 4 + 2] = v * tint[2]; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
function blotches(g, size, n, seed, alpha, color, rMin, rMax) {
  const r = rngFrom(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * size, y = r() * size, rad = rMin + r() * (rMax - rMin);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, color.replace('A', String(alpha * r()))); grd.addColorStop(1, color.replace('A', '0'));
    g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

export function grainTexture() {
  const c = noiseCanvas(256, 205, 28, 11), g = c.getContext('2d');
  blotches(g, 256, 60, 5, 0.18, 'rgba(120,120,110,A)', 10, 40);
  blotches(g, 256, 40, 6, 0.14, 'rgba(255,255,240,A)', 10, 36);
  return tex(c);
}
export function gravelTexture() {
  const c = noiseCanvas(256, 168, 46, 21, [1.0, 0.95, 0.84]), g = c.getContext('2d');
  const r = rngFrom(22);
  for (let i = 0; i < 700; i++) { const v = 120 + r() * 100; g.fillStyle = `rgb(${v},${v * 0.95},${v * 0.85})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2.5, 1 + r() * 2); }
  return tex(c);
}
export function concreteTexture() {
  const c = noiseCanvas(256, 176, 14, 31), g = c.getContext('2d');
  blotches(g, 256, 40, 32, 0.2, 'rgba(90,90,90,A)', 14, 50);
  g.strokeStyle = 'rgba(70,70,70,.55)'; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254);
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.lineWidth = 1; g.stroke();
  return tex(c);
}
// asphalt strip: u across the road, v along it; dashed centre line
export function asphaltTexture(dashed = true) {
  const c = noiseCanvas(256, 62, 14, 41), g = c.getContext('2d');
  blotches(g, 256, 30, 42, 0.18, 'rgba(0,0,0,A)', 14, 50);
  g.fillStyle = 'rgba(210,210,200,.75)'; g.fillRect(0, 0, 4, 256); g.fillRect(252, 0, 4, 256);
  if (dashed) { g.fillStyle = 'rgba(235,225,150,.9)'; g.fillRect(124, 20, 8, 100); }
  return tex(c);
}
export function plasterTexture(hex) {
  const col = new THREE.Color(hex), base = 255;
  const c = noiseCanvas(256, base, 10, 51, [col.r, col.g, col.b].map((v) => Math.pow(v, 1 / 2.2))), g = c.getContext('2d');
  blotches(g, 256, 50, 52, 0.16, 'rgba(70,60,50,A)', 12, 60);
  const grd = g.createLinearGradient(0, 200, 0, 256); grd.addColorStop(0, 'rgba(60,50,40,0)'); grd.addColorStop(1, 'rgba(60,50,40,.28)');
  g.fillStyle = grd; g.fillRect(0, 200, 256, 56);
  return tex(c);
}
export function roofTileTexture(hex = 0xb4553b) {
  const col = new THREE.Color(hex), c = canvas(256, 256), g = c.getContext('2d'), r = rngFrom(61);
  for (let row = 0; row < 16; row++) {
    for (let k = 0; k < 16; k++) {
      const v = 0.82 + r() * 0.3;
      g.fillStyle = `rgb(${Math.min(255, col.r * 255 * v)},${Math.min(255, col.g * 255 * v)},${Math.min(255, col.b * 255 * v)})`;
      g.fillRect(k * 16 + (row % 2) * 8, row * 16, 16, 16);
    }
    g.fillStyle = 'rgba(40,15,10,.35)'; g.fillRect(0, row * 16 + 13, 256, 3);
  }
  return tex(c);
}
export function louverTexture() {
  const c = canvas(128, 128), g = c.getContext('2d');
  g.fillStyle = '#5f7160'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 16; i++) { g.fillStyle = 'rgba(20,28,22,.55)'; g.fillRect(0, i * 8 + 4, 128, 3); g.fillStyle = 'rgba(190,205,190,.18)'; g.fillRect(0, i * 8, 128, 2); }
  return tex(c);
}
export function chainlinkTexture() {
  const c = canvas(64, 64), g = c.getContext('2d');
  g.strokeStyle = 'rgba(205,210,215,1)'; g.lineWidth = 2.2;
  for (let i = -64; i <= 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
  return tex(c, { aniso: 8 });
}
export function panelTexture() {
  const c = canvas(128, 256), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 128, 256); grd.addColorStop(0, '#1a3a73'); grd.addColorStop(1, '#0f2550');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 256);
  g.strokeStyle = 'rgba(165,195,240,.5)'; g.lineWidth = 1.6;
  for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(i * 128 / 6, 0); g.lineTo(i * 128 / 6, 256); g.stroke(); }
  for (let i = 1; i < 10; i++) { g.beginPath(); g.moveTo(0, i * 25.6); g.lineTo(128, i * 25.6); g.stroke(); }
  g.strokeStyle = 'rgba(210,220,235,.35)'; g.lineWidth = 1;
  for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(0, i * 85); g.lineTo(128, i * 85); g.stroke(); }
  g.strokeStyle = '#d3dae3'; g.lineWidth = 8; g.strokeRect(0, 0, 128, 256);
  return tex(c, { aniso: 8 });
}
export function softDot() {
  const c = canvas(64, 64), g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return tex(c, { repeat: false });
}
// puffy cloud billboard (soft, lit from above-left)
export function cloudTexture(seed) {
  const size = 256, c = canvas(size, size), g = c.getContext('2d'), r = rngFrom(seed);
  g.clearRect(0, 0, size, size);
  const blobs = [];
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * 70;
    blobs.push({ x: 128 + Math.cos(a) * d * 1.3, y: 140 + Math.sin(a) * d * 0.55 - r() * 14, r: 22 + r() * 30 });
  }
  for (const b of blobs) { // shadow side first
    const grd = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    grd.addColorStop(0, 'rgba(176,186,200,.55)'); grd.addColorStop(1, 'rgba(176,186,200,0)');
    g.fillStyle = grd; g.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
  }
  for (const b of blobs) { // lit top
    const grd = g.createRadialGradient(b.x - b.r * 0.25, b.y - b.r * 0.35, 0, b.x - b.r * 0.2, b.y - b.r * 0.3, b.r * 0.95);
    grd.addColorStop(0, 'rgba(255,255,255,.95)'); grd.addColorStop(0.6, 'rgba(250,252,255,.55)'); grd.addColorStop(1, 'rgba(250,252,255,0)');
    g.fillStyle = grd; g.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
  }
  return tex(c, { repeat: false });
}
