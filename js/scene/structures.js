// Man-made structures: roads, fences, street lamps, the compound of buildings and the detached house.
import * as THREE from 'three';
import { rngFrom, ROADS, clamp, smooth } from './world.js';
import { asphaltTexture, plasterTexture, roofTileTexture, concreteTexture, chainlinkTexture, softDot } from './textures.js';

const noPick = (m) => { m.raycast = () => {}; return m; };

function std(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, envMapIntensity: 0.5, ...o }); }
export function box(w, h, d, material, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z); m.castShadow = cast; m.receiveShadow = true;
  return m;
}
// scale a box's UVs so a texture tiles at world scale (tile = metres per repeat)
function boxUV(geo, w, h, d, tile) {
  const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
  }
  return geo;
}
function texBox(w, h, d, material, x, y, z, tile = 6) {
  const geo = boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, tile);
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---- roads ---------------------------------------------------------------------------------------
export function buildRoads(scene) {
  const base = asphaltTexture(true);
  for (const [x0, z0, x1, z1, w] of ROADS) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const t = base.clone(); t.needsUpdate = true; t.repeat.set(1, len / 9);
    const geo = new THREE.PlaneGeometry(w, len); geo.rotateX(-Math.PI / 2); // length now runs along z
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, envMapIntensity: 0.3 }));
    m.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    m.position.set((x0 + x1) / 2, 0.06, (z0 + z1) / 2); m.receiveShadow = true;
    scene.add(noPick(m));
  }
}

// ---- fences ---------------------------------------------------------------------------------------
export function buildFence(parent, cx, cz, w, d, height = 2.2, gap = null) {
  const postGeo = new THREE.CylinderGeometry(0.07, 0.07, height, 6), postMat = std(0x8a9096, { metalness: 0.5, roughness: 0.5 });
  const link = chainlinkTexture();
  const sides = [[-w / 2, -d / 2, w / 2, -d / 2], [w / 2, -d / 2, w / 2, d / 2], [w / 2, d / 2, -w / 2, d / 2], [-w / 2, d / 2, -w / 2, -d / 2]];
  const posts = [];
  sides.forEach(([x0, z0, x1, z1], si) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 3.5));
    for (let i = 0; i <= n; i++) posts.push([x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
    // skip the mesh panel where a gate is (side index == gap)
    const segs = gap === si ? [[0, 0.38], [0.62, 1]] : [[0, 1]];
    segs.forEach(([a, b]) => {
      const sl = len * (b - a), t = link.clone(); t.needsUpdate = true; t.repeat.set(sl / 1.0, height / 1.0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sl, height), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.6, envMapIntensity: 0.6 }));
      const mx = x0 + (x1 - x0) * ((a + b) / 2), mz = z0 + (z1 - z0) * ((a + b) / 2);
      m.position.set(cx + mx, height / 2, cz + mz); m.rotation.y = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
      m.castShadow = false; parent.add(noPick(m));
    });
  });
  const inst = new THREE.InstancedMesh(postGeo, postMat, posts.length), M = new THREE.Matrix4();
  posts.forEach(([x, z], i) => { M.makeTranslation(cx + x, height / 2, cz + z); inst.setMatrixAt(i, M); });
  inst.castShadow = true; parent.add(noPick(inst));
}

// ---- street lamps ------------------------------------------------------------------------------------
export function buildLamps(scene, spots, dot = softDot()) {
  const poleMat = std(0x30343a, { metalness: 0.6, roughness: 0.5 });
  const glowMat = new THREE.SpriteMaterial({ map: dot, color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const poolMat = new THREE.MeshBasicMaterial({ map: dot, color: 0xffc880, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const headMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  for (const [x, z, hgt = 6.2, side = 1] of spots) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, hgt, 6), poleMat); pole.position.y = hgt / 2; pole.castShadow = true;
    const arm = box(1.5, 0.1, 0.1, poleMat, side * 0.7, hgt - 0.1, 0);
    const head = box(0.7, 0.14, 0.32, headMat, side * 1.4, hgt - 0.22, 0, false);
    const glow = new THREE.Sprite(glowMat); glow.position.set(side * 1.4, hgt - 0.3, 0); glow.scale.setScalar(5.5);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), poolMat); pool.rotation.x = -Math.PI / 2; pool.position.set(side * 1.4, 0.09, 0);
    g.add(pole, arm, head, glow, pool);
    scene.add(g);
    g.traverse((o) => { o.raycast = () => {}; });
  }
  return { update(night) { glowMat.opacity = 0.95 * night; poolMat.opacity = 0.5 * night; headMat.color.setRGB(0.13 + 0.87 * night, 0.13 + 0.8 * night, 0.13 + 0.55 * night); } };
}

// ---- windows: instanced glass + instanced warm "lights" (one lit/unlit state per window) -----------------
function windowSet(group, transforms, size, litSize) {
  const glassGeo = new THREE.PlaneGeometry(size[0], size[1]), litGeo = new THREE.PlaneGeometry(litSize[0], litSize[1]);
  const glass = new THREE.InstancedMesh(glassGeo, new THREE.MeshStandardMaterial({ color: 0x1d2c3d, roughness: 0.1, metalness: 0.7, envMapIntensity: 1.5 }), transforms.length);
  const litMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide });
  const lit = new THREE.InstancedMesh(litGeo, litMat, transforms.length);
  const M = new THREE.Matrix4(), rnd = rngFrom(77), thr = new Float32Array(transforms.length), warm = [];
  transforms.forEach((t, i) => {
    M.compose(new THREE.Vector3(t.x, t.y, t.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t.ry, 0)), new THREE.Vector3(1, 1, 1));
    glass.setMatrixAt(i, M);
    M.compose(new THREE.Vector3(t.x + t.nx * 0.03, t.y, t.z + t.nz * 0.03), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t.ry, 0)), new THREE.Vector3(1, 1, 1));
    lit.setMatrixAt(i, M);
    thr[i] = rnd();
    warm.push(rnd() < 0.72 ? new THREE.Color(1.0, 0.82 + rnd() * 0.1, 0.52 + rnd() * 0.15) : new THREE.Color(0.75, 0.88, 1.0));
    lit.setColorAt(i, new THREE.Color(0, 0, 0));
  });
  glass.castShadow = false; glass.receiveShadow = false; noPick(glass); noPick(lit);
  group.add(glass, lit);
  let lastFrac = -1;
  return {
    set(frac, opacity) {
      litMat.opacity = opacity;
      const qf = Math.round(frac * 40) / 40;
      if (qf === lastFrac) return;
      lastFrac = qf;
      const off = new THREE.Color(0, 0, 0);
      for (let i = 0; i < transforms.length; i++) lit.setColorAt(i, thr[i] < qf ? warm[i] : off);
      lit.instanceColor.needsUpdate = true;
    },
  };
}

// ---- compound -------------------------------------------------------------------------------------------
export function buildCompound(group) {
  const rnd = rngFrom(404);
  const plan = [[-18, -10, 11, 9, 4], [0, -10, 12, 9, 5], [18, -10, 11, 9, 3], [-18, 10, 11, 9, 4], [0, 10, 12, 9, 3], [18, 10, 11, 9, 4]];
  const tones = [0xe3d9c8, 0xd5dbe0, 0xe8d3b9, 0xdcd6c6, 0xcfd8d2, 0xe6dccb];
  // plaza
  const plazaTex = concreteTexture(); plazaTex.repeat.set(10, 8);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(64, 50), new THREE.MeshStandardMaterial({ map: plazaTex, roughness: 0.95, envMapIntensity: 0.3, color: 0xcfcfc8 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.05; plaza.receiveShadow = true; group.add(plaza);

  const wins = [];
  plan.forEach(([x, z, w, d, fl], idx) => {
    const hgt = fl * 3.2;
    const wallMat = new THREE.MeshStandardMaterial({ map: plasterTexture(tones[idx]), roughness: 0.92, envMapIntensity: 0.4 });
    group.add(texBox(w, hgt, d, wallMat, x, 0, z, 7));
    // plinth + floor bands
    group.add(box(w + 0.3, 0.7, d + 0.3, std(0x9a948a), x, 0, z));
    for (let f = 1; f < fl; f++) group.add(box(w + 0.25, 0.22, d + 0.25, std(0xf0ece2), x, f * 3.2 - 0.1, z));
    // roof slab + parapet
    group.add(box(w + 0.5, 0.35, d + 0.5, std(0x6f7276, { roughness: 0.9 }), x, hgt, z));
    const pm = std(0xd8d3c8), py = hgt + 0.35;
    group.add(box(w + 0.5, 0.8, 0.25, pm, x, py, z + d / 2 + 0.12), box(w + 0.5, 0.8, 0.25, pm, x, py, z - d / 2 - 0.12), box(0.25, 0.8, d + 0.5, pm, x + w / 2 + 0.12, py, z), box(0.25, 0.8, d + 0.5, pm, x - w / 2 - 0.12, py, z));
    // roof props: water tank on legs, A/C units, stair head
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.5, 14), std(0xcfd6dc, { metalness: 0.3, roughness: 0.5 }));
    tank.position.set(x + (rnd() - 0.5) * (w - 4), py + 1.6, z + (rnd() - 0.5) * (d - 4)); tank.castShadow = true; group.add(tank);
    group.add(box(0.15, 0.85, 0.15, std(0x555a60), tank.position.x - 0.5, py, tank.position.z), box(0.15, 0.85, 0.15, std(0x555a60), tank.position.x + 0.5, py, tank.position.z));
    for (let k = 0; k < 2; k++) group.add(box(1.3, 0.9, 0.9, std(0xb9bec4, { metalness: 0.3 }), x + (rnd() - 0.5) * (w - 3), py, z + (rnd() - 0.5) * (d - 3)));
    group.add(box(2.4, 2.2, 2.4, std(0xcdc6b8), x - w / 2 + 2.2, py, z - d / 2 + 2.2));
    // entrance on the +z face of the front-row buildings and -z of the back row
    const front = z > 0 ? 1 : -1;
    group.add(box(2.0, 2.7, 0.25, std(0x4a3a2c), x, 0, z + front * (d / 2 + 0.05)));
    group.add(box(3.4, 0.18, 1.6, std(0x8d8b86), x, 2.9, z + front * (d / 2 + 0.8)));
    // windows on the four faces
    const face = (len, centre, fixed, axis, n) => {
      const cols = Math.max(2, Math.floor(len / 3.4)), gap = len / cols;
      for (let c = 0; c < cols; c++) for (let r = 0; r < fl; r++) {
        if (r === 0 && axis === 'x' && n === front && c === Math.floor(cols / 2)) continue;
        const off = -len / 2 + gap * (c + 0.5), y = r * 3.2 + 1.95;
        if (axis === 'x') wins.push({ x: centre + off, y, z: fixed + n * 0.03, nx: 0, nz: n, ry: n > 0 ? 0 : Math.PI });
        else wins.push({ x: fixed + n * 0.03, y, z: centre + off, nx: n, nz: 0, ry: n > 0 ? Math.PI / 2 : -Math.PI / 2 });
      }
    };
    face(w, x, z + d / 2, 'x', 1); face(w, x, z - d / 2, 'x', -1); face(d, z, x + w / 2, 'z', 1); face(d, z, x - w / 2, 'z', -1);
  });
  const ws = windowSet(group, wins, [1.5, 1.7], [1.25, 1.45]);

  return { update(night, loadFrac, cover) { ws.set(clamp(0.12 + 0.88 * loadFrac, 0, 1), clamp(night * 0.95 + (1 - night) * cover * 0.28 * loadFrac, 0, 1)); } };
}

// ---- house ----------------------------------------------------------------------------------------------
export function buildHouse(group) {
  const wall = new THREE.MeshStandardMaterial({ map: plasterTexture(0xf0e7d2), roughness: 0.92, envMapIntensity: 0.4, side: THREE.DoubleSide });
  group.add(texBox(9, 4.6, 7, wall, 0, 0, 0, 5));
  group.add(box(9.3, 0.5, 7.3, std(0xa59f93), 0, 0, 0));
  // gable roof (ridge along x)
  const hw = 4.2, ov = 5.3, eave = 4.5, ridge = 7.3;
  const P = [[-ov, eave, hw], [ov, eave, hw], [ov, ridge, 0], [-ov, ridge, 0], [-ov, eave, -hw], [ov, eave, -hw]];
  const pos = [], uv = [];
  const quad = (a, b, c, d) => { pos.push(...P[a], ...P[b], ...P[c], ...P[a], ...P[c], ...P[d]); uv.push(0, 0, 3, 0, 3, 2, 0, 0, 3, 2, 0, 2); };
  quad(0, 1, 2, 3); quad(3, 2, 5, 4);
  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  roofGeo.computeVertexNormals();
  const tiles = roofTileTexture(); tiles.repeat.set(2, 1.4);
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.75, side: THREE.DoubleSide, envMapIntensity: 0.5 }));
  roof.castShadow = true; roof.receiveShadow = true; group.add(roof);
  // gable ends
  for (const sx of [-4.5, 4.5]) {
    const g = new THREE.BufferGeometry(), apex = 4.6 + (ridge - eave) * (3.5 / hw) * 1.0;
    g.setAttribute('position', new THREE.Float32BufferAttribute([sx, 4.6, -3.5, sx, 4.6, 3.5, sx, apex, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 0.5], 2)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, wall); m.castShadow = true; group.add(m);
  }
  group.add(box(0.9, 2.2, 0.9, std(0xb9aea0), 2.2, 6.0, -1.6)); // chimney
  group.add(box(1.1, 2.1, 0.2, std(0x5b3f2b), 0, 0.4, 3.55));    // door
  group.add(box(2.4, 0.15, 1.5, std(0xb4553b), 0, 2.7, 4.25));   // porch canopy
  group.add(box(0.15, 2.3, 0.15, std(0xf0f0ee), -1.05, 0.2, 4.9), box(0.15, 2.3, 0.15, std(0xf0f0ee), 1.05, 0.2, 4.9));
  const path = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 9), new THREE.MeshStandardMaterial({ color: 0xbdb7aa, roughness: 0.95, envMapIntensity: 0.3 }));
  path.rotation.x = -Math.PI / 2; path.position.set(0, 0.06, 9.2); path.receiveShadow = true; group.add(path);
  // windows
  const wins = [];
  [-2.8, 2.8].forEach((x) => wins.push({ x, y: 2.2, z: 3.53, nx: 0, nz: 1, ry: 0 }));
  [-2.4, 2.4].forEach((x) => wins.push({ x, y: 2.2, z: -3.53, nx: 0, nz: -1, ry: Math.PI }));
  [-1.6, 1.6].forEach((z) => { wins.push({ x: 4.53, y: 2.2, z, nx: 1, nz: 0, ry: Math.PI / 2 }); wins.push({ x: -4.53, y: 2.2, z, nx: -1, nz: 0, ry: -Math.PI / 2 }); });
  const ws = windowSet(group, wins, [1.4, 1.5], [1.15, 1.25]);
  // garden wall / fence
  const fm = std(0xf4f1ea), posts = [];
  for (let i = -8; i <= 8; i++) { if (Math.abs(i) > 0.9 || true) { posts.push([i * 1.3, 11]); posts.push([i * 1.3, -10]); } }
  for (let k = -7; k <= 7; k++) { posts.push([-11, k * 1.4]); posts.push([11, k * 1.4]); }
  const fp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), fm, posts.length), M = new THREE.Matrix4();
  posts.forEach(([x, z], i) => { M.makeTranslation(x, 0.5, z); fp.setMatrixAt(i, M); });
  fp.castShadow = true; group.add(noPick(fp));
  group.add(box(22.4, 0.08, 0.08, fm, 0, 0.85, 11), box(22.4, 0.08, 0.08, fm, 0, 0.85, -10), box(0.08, 0.08, 21, fm, -11, 0.85, 0.5), box(0.08, 0.08, 21, fm, 11, 0.85, 0.5));
  return { update(night, kwFrac) { ws.set(clamp(0.2 + 0.8 * kwFrac, 0, 1), clamp(night * 0.95, 0, 1)); } };
}
