// Trees, bushes and rocks as instanced meshes (a handful of draw calls), with a light wind sway.
import * as THREE from 'three';
import { rngFrom, islandHeight, slopeAt, inlandDist, inZone, smooth, clamp, POS } from './world.js';

const uniforms = { uTime: { value: 0 } };

function sway(material, halfHeight, amp) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  float swPh = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
  float swH = max(position.y + ${halfHeight.toFixed(2)}, 0.0);
  transformed.x += sin(uTime * 1.6 + swPh) * ${amp.toFixed(3)} * swH;
  transformed.z += cos(uTime * 1.2 + swPh * 1.3) * ${(amp * 0.7).toFixed(3)} * swH;
#endif`);
  };
  return material;
}

export function buildVegetation(scene) {
  const rnd = rngFrom(2024);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();

  // ---- sample positions ----
  function scatter(count, accept, maxTry = 40) {
    const out = [];
    for (let tries = 0; out.length < count && tries < count * maxTry; tries++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 122, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const t = inlandDist(x, z);
      if (t < 1) continue;
      const h = islandHeight(x, z), sl = slopeAt(x, z);
      if (accept(x, z, h, sl, t, Math.hypot(x, z))) out.push({ x, z, h });
    }
    return out;
  }
  const free = (x, z) => !inZone(x, z, 1.12);

  const forest = scatter(22, (x, z, h, sl, t, d) => free(x, z) && t > 9 && sl < 0.7 && rnd() < 0.08 + 0.92 * smooth(58, 100, d));
  const cypress = scatter(8, (x, z, h, sl, t, d) => free(x, z) && t > 12 && sl < 0.35 && rnd() < 0.5);
  const broad = scatter(12, (x, z, h, sl, t, d) => free(x, z) && t > 11 && sl < 0.5);
  const bushes = scatter(40, (x, z, h, sl, t) => free(x, z) && t > 3 && sl < 0.8 && h < 12);
  const rocks = scatter(30, (x, z, h, sl, t, d) => !inZone(x, z, 1.0) && ((t < 9 && t > -0.5) || sl > 0.45 || h > 9) && rnd() < 0.7);

  // hand-placed landscaping: cypress avenue to the compound, garden trees at the house, plaza trees
  const planted = [];
  for (let k = 0; k < 4; k++) { const z = -16 - k * 7; planted.push({ x: -5.2, z }); planted.push({ x: 9.2, z }); }
  [[74, -50], [76, -35]].forEach(([x, z]) => planted.push({ x, z }));
  [[-26, -64], [30, -66]].forEach(([x, z]) => planted.push({ x, z }));
  planted.forEach((p) => { p.h = islandHeight(p.x, p.z); });
  cypress.push(...planted);

  // ---- builders ----
  function inst(geo, material, list, place, colorFn, cast = true) {
    const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, list.length));
    list.forEach((p, i) => {
      place(p, i, v, q, s3);
      M.compose(v, q, s3); mesh.setMatrixAt(i, M);
      colorFn(col, p, i); mesh.setColorAt(i, col);
    });
    mesh.count = list.length;
    mesh.castShadow = cast; mesh.receiveShadow = true; mesh.frustumCulled = false;
    mesh.raycast = () => {}; // never pick vegetation
    scene.add(mesh);
    return mesh;
  }
  const yaw = (a) => q.setFromEuler(e.set(0, a, 0));
  const jitter = (c, base, hs, ss, ls) => c.setHSL(base[0] + (rnd() - 0.5) * hs, base[1] + (rnd() - 0.5) * ss, base[2] + (rnd() - 0.5) * ls);

  // pines: trunk + two cones
  const sizes = forest.map(() => 0.85 + rnd() * 0.9);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a432f, roughness: 1, envMapIntensity: 0.3 });
  inst(new THREE.CylinderGeometry(0.22, 0.38, 3, 6), trunkMat, forest, (p, i) => { yaw(rnd() * 6); v.set(p.x, p.h + 1.5 * sizes[i], p.z); s3.setScalar(sizes[i]); }, (c) => c.setRGB(1, 1, 1));
  const pineMatA = sway(new THREE.MeshStandardMaterial({ roughness: 0.95, envMapIntensity: 0.22 }), 3, 0.012);
  inst(new THREE.ConeGeometry(2.7, 5.4, 9), pineMatA, forest, (p, i) => { yaw(rnd() * 6); v.set(p.x, p.h + (2.4 + 2.7) * sizes[i], p.z); s3.set(sizes[i], sizes[i] * (0.9 + rnd() * 0.3), sizes[i]); }, (c) => jitter(c, [0.33, 0.55, 0.13], 0.04, 0.12, 0.05));
  const pineMatB = sway(new THREE.MeshStandardMaterial({ roughness: 0.95, envMapIntensity: 0.22 }), 2.2, 0.015);
  inst(new THREE.ConeGeometry(1.9, 4.2, 9), pineMatB, forest, (p, i) => { yaw(rnd() * 6); v.set(p.x, p.h + (2.4 + 5.2) * sizes[i], p.z); s3.setScalar(sizes[i]); }, (c) => jitter(c, [0.34, 0.55, 0.16], 0.04, 0.12, 0.05));

  // cypress
  const cs = cypress.map(() => 0.8 + rnd() * 0.6);
  inst(new THREE.CylinderGeometry(0.18, 0.28, 1.6, 6), trunkMat, cypress, (p, i) => { yaw(0); v.set(p.x, p.h + 0.8, p.z); s3.setScalar(cs[i]); }, (c) => c.setRGB(1, 1, 1));
  inst(new THREE.ConeGeometry(1.15, 9.5, 8), sway(new THREE.MeshStandardMaterial({ roughness: 0.95, envMapIntensity: 0.22 }), 4.75, 0.006), cypress, (p, i) => { yaw(rnd() * 6); v.set(p.x, p.h + 1.2 + 4.75 * cs[i], p.z); s3.set(cs[i] * (0.8 + rnd() * 0.4), cs[i], cs[i] * (0.8 + rnd() * 0.4)); }, (c) => jitter(c, [0.36, 0.5, 0.11], 0.03, 0.1, 0.04));

  // broadleaf (olive / oak): trunk + two flattened blobs
  const bs = broad.map(() => 0.8 + rnd() * 0.7);
  inst(new THREE.CylinderGeometry(0.28, 0.46, 2.4, 6), trunkMat, broad, (p, i) => { yaw(rnd() * 6); v.set(p.x, p.h + 1.2 * bs[i], p.z); s3.setScalar(bs[i]); }, (c) => c.setRGB(0.9, 0.9, 0.9));
  const leafMat = () => sway(new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true, envMapIntensity: 0.22 }), 2, 0.02);
  inst(new THREE.IcosahedronGeometry(2.5, 1), leafMat(), broad, (p, i) => { yaw(rnd() * 6); v.set(p.x, p.h + 3.6 * bs[i], p.z); s3.set(bs[i], bs[i] * 0.78, bs[i]); }, (c) => jitter(c, [0.24, 0.45, 0.2], 0.07, 0.12, 0.06));
  inst(new THREE.IcosahedronGeometry(1.7, 1), leafMat(), broad, (p, i) => { yaw(rnd() * 6); v.set(p.x + 1.3 * bs[i], p.h + 4.4 * bs[i], p.z + 0.6 * bs[i]); s3.set(bs[i], bs[i] * 0.8, bs[i]); }, (c) => jitter(c, [0.26, 0.45, 0.23], 0.07, 0.12, 0.06));

  // bushes
  inst(new THREE.IcosahedronGeometry(1.0, 1), sway(new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true, envMapIntensity: 0.3 }), 0.8, 0.02), bushes,
    (p) => { yaw(rnd() * 6); const s = 0.5 + rnd() * 1.1; v.set(p.x, p.h + 0.35 * s, p.z); s3.set(s * 1.2, s * 0.7, s * 1.2); }, (c) => jitter(c, [0.27, 0.4, 0.2], 0.1, 0.15, 0.08), false);

  // rocks
  inst(new THREE.DodecahedronGeometry(1.0, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true, envMapIntensity: 0.22 }), rocks,
    (p) => { q.setFromEuler(e.set(rnd() * 0.6, rnd() * 6, rnd() * 0.6)); const s = 0.4 + Math.pow(rnd(), 2) * 2.4; v.set(p.x, p.h + 0.15 * s, p.z); s3.set(s * (0.8 + rnd() * 0.6), s * (0.5 + rnd() * 0.4), s * (0.8 + rnd() * 0.6)); },
    (c) => c.setHSL(0.09, 0.07 + rnd() * 0.06, 0.34 + rnd() * 0.16));

  return { update(time) { uniforms.uTime.value = time; } };
}
