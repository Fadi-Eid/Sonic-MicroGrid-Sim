// Three.js scene: island microgrid with solar field, inverter, diesel plant, optional battery,
// a compound of buildings and one detached house. All physics comes in through update(live);
// this file only draws. Coordinates: x = east, y = up, z = south (north is -z).
import * as THREE from 'three';
import { OrbitControls } from '../lib/OrbitControls.js';
import { POS, COL, SEA_Y, clamp, lerp, smooth } from './scene/world.js';
import { gravelTexture, concreteTexture, louverTexture, panelTexture, softDot, cloudTexture } from './scene/textures.js';
import { buildTerrain, buildWater } from './scene/terrain.js';
import { buildVegetation } from './scene/vegetation.js';
import { buildRoads, buildFence, buildLamps, buildCompound, buildHouse, box } from './scene/structures.js';
import { buildLife } from './scene/life.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, envMapIntensity: 0.5, ...o });
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const noPick = (o) => { o.raycast = () => {}; return o; };

export function createScene(canvas, handlers = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 3000);
  camera.position.set(72, 82, 168);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(2, 4, -8);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 20; controls.maxDistance = 330; controls.maxPolarAngle = Math.PI * 0.485;

  // ---------------------------------------------------------------- lights & sky
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a6b4a, 0.45);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -128, right: 128, top: 128, bottom: -128, near: 10, far: 700 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.5; sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);
  const moon = new THREE.DirectionalLight(0x8aa4dc, 0);
  scene.add(moon);

  const skyUniforms = {
    zenith: { value: new THREE.Color(0x3a74d6) }, horizon: { value: new THREE.Color(0xa6cdf2) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, glow: { value: new THREE.Color(0xffe2a0) }, glowAmt: { value: 0.5 },
  };
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD; uniform vec3 zenith, horizon, sunDir, glow; uniform float glowAmt;
      void main(){ vec3 d = normalize(vD); float t = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(horizon, zenith, pow(t, 0.5));
        c = mix(c, horizon * 1.06, exp(-t * 9.0) * 0.55);
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += glow * (pow(s, 8.0) * 0.22 + pow(s, 64.0) * 0.55 + pow(s, 900.0) * 3.0) * glowAmt;
        float below = clamp(-d.y * 5.0, 0.0, 1.0); c = mix(c, horizon * 0.5, below);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), skyMat);
  sky.renderOrder = -10; scene.add(sky);
  scene.fog = new THREE.Fog(0xa6cdf2, 260, 1000);

  // reflections: a small environment map generated from the sky itself
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(1400, 24, 12), skyMat));
  let envRT = null, envSun = new THREE.Vector3(9, 9, 9), envCover = -1, envNight = -1, envClock = 0;
  function updateEnv(force) {
    if (!force && time - envClock < 1.2) return;
    const dsun = envSun.distanceTo(sunDir);
    if (!force && dsun < 0.025 && Math.abs(envCover - L.weather.coverage) < 0.06 && Math.abs(envNight - L.night) < 0.05) return;
    envClock = time; envSun.copy(sunDir); envCover = L.weather.coverage; envNight = L.night;
    const rt = pmrem.fromScene(envScene, 0.02, 1, 3000);
    if (envRT) envRT.dispose();
    envRT = rt; scene.environment = rt.texture;
  }

  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(38, 24, 12), new THREE.MeshBasicMaterial({ color: 0xfff4c8, fog: false }));
  const moonDisc = new THREE.Mesh(new THREE.SphereGeometry(26, 24, 12), new THREE.MeshBasicMaterial({ color: 0xe8eefc, fog: false }));
  scene.add(sunDisc, moonDisc);
  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(1100 * 3);
  for (let i = 0; i < 1100; i++) {
    const u = Math.random() * 2 * Math.PI, v = Math.acos(Math.random() * 0.98 + 0.02);
    sp[i * 3] = 1250 * Math.sin(v) * Math.cos(u); sp[i * 3 + 1] = 1250 * Math.cos(v); sp[i * 3 + 2] = 1250 * Math.sin(v) * Math.sin(u);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(stars);

  // ---------------------------------------------------------------- land, sea, plants
  scene.add(buildTerrain());
  const water = buildWater(); scene.add(water.mesh);
  const vegetation = buildVegetation(scene);
  buildRoads(scene);
  const life = buildLife(scene);

  const dot = softDot();
  const groups = {};
  const mkGroup = (kind, pos) => { const g = new THREE.Group(); g.position.copy(pos); g.userData.kind = kind; scene.add(g); groups[kind] = g; return g; };
  const pad = (parent, w, d, x, z, tex, repeatPer = 8, color = 0xffffff) => {
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set(w / repeatPer, d / repeatPer);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, color, roughness: 1, envMapIntensity: 0.25 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.07, z); m.receiveShadow = true; parent.add(m); return m;
  };
  const gravel = gravelTexture(), concrete = concreteTexture();

  // ---- solar field (rebuilt on configure)
  const solarG = mkGroup('solar', POS.solar);
  pad(solarG, 80, 54, 0, 0, gravel, 7);
  buildFence(solarG, 0, 0, 74, 50, 2.1, 1);
  let panelMesh = null, postMesh = null, beamMesh = null;
  const panelMat = new THREE.MeshStandardMaterial({ map: panelTexture(), roughness: 0.3, metalness: 0.45, envMapIntensity: 0.9 });
  const solarInfo = { visible: 0, realPerVisible: 1 };
  function buildSolar(panelCount, tiltDeg, lat) {
    for (const m of [panelMesh, postMesh, beamMesh]) if (m) { solarG.remove(m); m.dispose(); }
    const cols = 36, maxV = 288;
    const V = panelCount <= 0 ? 0 : Math.min(panelCount, maxV);
    solarInfo.visible = V; solarInfo.realPerVisible = V ? panelCount / V : 1;
    const pw = 1.6, pl = 2.7, tilt = THREE.MathUtils.degToRad(tiltDeg);
    const pitch = pl * Math.cos(tilt) + (pl * Math.sin(tilt)) / Math.tan(THREE.MathUtils.degToRad(24)) + 0.6;
    const rows = Math.max(1, Math.ceil(V / cols));
    panelMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(pw * 0.97, 0.07, pl), panelMat, Math.max(1, V));
    const postCount = rows * Math.ceil(cols / 4 + 1);
    postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1, 0.14), std(0x9aa0a8, { metalness: 0.7, roughness: 0.4 }), Math.max(1, postCount));
    beamMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 0.1), std(0x9aa0a8, { metalness: 0.7, roughness: 0.4 }), Math.max(1, rows));
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const southSign = lat >= 0 ? 1 : -1;
    e.set(-tilt * southSign, southSign > 0 ? 0 : Math.PI, 0); q.setFromEuler(e);
    const width = cols * pw * 1.02, depth = (rows - 1) * pitch, yMid = 0.7 + (pl / 2) * Math.sin(tilt) + 0.1;
    for (let i = 0; i < V; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      M.compose(V3(-width / 2 + c * pw * 1.02 + pw / 2, yMid, -depth / 2 + r * pitch), q, V3(1, 1, 1)); panelMesh.setMatrixAt(i, M);
    }
    let pi = 0;
    for (let r = 0; r < rows; r++) {
      const z = -depth / 2 + r * pitch;
      M.compose(V3(0, 0.62, z), new THREE.Quaternion(), V3(width, 1, 1)); beamMesh.setMatrixAt(r, M);
      for (let c = 0; c <= cols; c += 4) { M.compose(V3(-width / 2 + c * pw * 1.02, 0.35, z), new THREE.Quaternion(), V3(1, 0.7, 1)); postMesh.setMatrixAt(pi++, M); }
    }
    postMesh.count = pi;
    panelMesh.castShadow = true; panelMesh.receiveShadow = true; postMesh.castShadow = true; beamMesh.castShadow = true;
    solarG.add(panelMesh, postMesh, beamMesh);
    solarG.updateMatrixWorld(true);
  }

  // ---- inverter station
  const invG = mkGroup('inverter', POS.inverter);
  const louv = louverTexture();
  invG.add(box(4.4, 2.7, 2.3, std(0xd9dde1, { metalness: 0.3, roughness: 0.5 }), 0, 0, 0));
  { const t = louv.clone(); t.needsUpdate = true; t.repeat.set(1.5, 0.8); const m = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.6), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })); m.position.set(-1.0, 1.35, 1.16); invG.add(m); }
  invG.add(box(4.7, 0.18, 2.6, std(0x5b6168), 0, 2.7, 0));
  invG.add(box(2.0, 2.4, 1.6, std(0x8a949c, { metalness: 0.4 }), 4.2, 0, 0)); // step-up transformer
  invG.add(box(10, 0.1, 6, std(0x9a9a9a), 1.5, 0, 0, false));
  const invLed = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), new THREE.MeshBasicMaterial({ color: 0x22c55e }));
  invLed.position.set(1.4, 2.0, 1.2); invG.add(invLed);

  // ---- battery
  const battG = mkGroup('battery', POS.battery);
  pad(battG, 14, 12, 0, 0, concrete, 6);
  const battLeds = [];
  for (let k = 0; k < 2; k++) {
    battG.add(box(6.2, 2.7, 2.5, std(k ? 0xeceff1 : 0xe2e7ea, { metalness: 0.25, roughness: 0.5 }), 0, 0, k * 3.4 - 1.7));
    battG.add(box(6.3, 0.14, 2.6, std(0x2d7d6b), 0, 2.7, k * 3.4 - 1.7));
    battG.add(box(0.9, 2.1, 0.08, std(0xb9c1c7), -2.4, 0.2, k * 3.4 - 1.7 + 1.27)); battG.add(box(0.9, 2.1, 0.08, std(0xb9c1c7), -1.4, 0.2, k * 3.4 - 1.7 + 1.27));
  }
  for (let i = 0; i < 10; i++) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.08), new THREE.MeshBasicMaterial({ color: 0x1a2a26 }));
    led.position.set(-2.3 + i * 0.5, 1.9, 2.99); battG.add(led); battLeds.push(led);
  }

  // ---- diesel plant (rebuilt on configure)
  const dieselG = mkGroup('generator', POS.diesel);
  pad(dieselG, 38, 28, 0, 3, concrete, 7);
  buildFence(dieselG, 0, 3, 42, 30, 2.2, 2);
  let gens = [];
  const smokeTex = dot, plantParts = [];
  function buildDiesel(units) {
    for (const o of plantParts) dieselG.remove(o);
    plantParts.length = 0; gens = [];
    const n = Math.min(Math.max(1, units), 6);
    const sideMat = () => { const t = louv.clone(); t.needsUpdate = true; t.repeat.set(2, 1); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.25, envMapIntensity: 0.6 }); };
    const roofMat = std(0x45524a, { roughness: 0.7 }), skid = std(0xdd7a1a, { roughness: 0.5 });
    const total = n * 8;
    for (let i = 0; i < n; i++) {
      const root = new THREE.Group();
      root.position.set(-total / 2 + 4 + i * 8, 0, 0);
      const body = new THREE.Mesh(new THREE.BoxGeometry(6.8, 3.0, 2.8), [sideMat(), sideMat(), roofMat, roofMat, sideMat(), sideMat()]);
      body.position.y = 1.5 + 0.35; body.castShadow = true; body.receiveShadow = true; root.add(body);
      const base = box(7.1, 0.35, 3.1, skid, 0, 0, 0); root.add(base);
      root.add(box(1.2, 2.1, 0.12, std(0x2f3a33), -1.9, 0.45, 1.46)); // service door
      root.add(box(0.6, 0.9, 0.1, std(0xd8d8d0), 1.2, 1.5, 1.46)); // control panel
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 3.6, 10), std(0x2b2b2e, { metalness: 0.7, roughness: 0.4 }));
      stack.position.set(2.4, 5.0, 0.6); stack.castShadow = true; root.add(stack);
      root.add(box(0.7, 0.12, 0.7, std(0x2b2b2e), 2.4, 6.75, 0.6));
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.1, 6), std(0x1d1f22, { metalness: 0.6 }));
      fan.rotation.x = Math.PI / 2; fan.position.set(-2.3, 2.0, 1.45); root.add(fan);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshBasicMaterial({ color: 0x333333 }));
      lamp.position.set(0.6, 3.3, 1.4); root.add(lamp);
      const smoke = [];
      for (let k = 0; k < 12; k++) {
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x9a9ca1, transparent: true, opacity: 0, depthWrite: false, fog: true }));
        spr.userData.t = k / 12; root.add(spr); smoke.push(spr);
      }
      dieselG.add(root); plantParts.push(root);
      gens.push({ root, fan, lamp, smoke, stackTop: V3(2.4, 7.0, 0.6), on: 0 });
    }
    // fuel tank in a bund behind the generator row + control room
    const cx = -3, cz = -8;
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 9, 24), std(0xe5e0d2, { metalness: 0.25, roughness: 0.45 }));
    tank.rotation.z = Math.PI / 2; tank.position.set(cx, 2.5, cz); tank.castShadow = true; tank.receiveShadow = true; dieselG.add(tank); plantParts.push(tank);
    const bm = std(0xa9a49a);
    for (const part of [box(13, 0.8, 0.3, bm, cx, 0, cz - 3.4), box(13, 0.8, 0.3, bm, cx, 0, cz + 3.4), box(0.3, 0.8, 7.0, bm, cx - 6.5, 0, cz), box(0.3, 0.8, 7.0, bm, cx + 6.5, 0, cz)]) { dieselG.add(part); plantParts.push(part); }
    for (const dx of [-2.6, 2.6]) { const l = box(0.4, 1.5, 0.4, std(0x666b70), cx + dx, 0.6, cz); dieselG.add(l); plantParts.push(l); }
    const ctl = box(5, 3, 3.4, std(0xd9d2c2), total / 2 + 5, 0, 8); dieselG.add(ctl); plantParts.push(ctl);
    const ctlRoof = box(5.4, 0.25, 3.8, std(0x6b6e72), total / 2 + 5, 3, 8); dieselG.add(ctlRoof); plantParts.push(ctlRoof);
  }

  // ---- compound, house, substation
  const compG = mkGroup('compound', POS.compound);
  const compound = buildCompound(compG);
  const houseG = mkGroup('house', POS.house);
  const houseObj = buildHouse(houseG);
  const marker = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.12, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  marker.rotation.x = Math.PI / 2; marker.position.y = 11.5; houseG.add(marker);
  const marker2 = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  marker2.position.y = 9.9; marker2.rotation.x = Math.PI; houseG.add(marker2);
  {
    const sub = new THREE.Group(); sub.position.copy(POS.bus);
    sub.add(box(3.4, 3, 2.6, std(0x7b8590, { metalness: 0.35 })));
    sub.add(box(3.8, 0.3, 3, std(0x444a52), 0, 3, 0));
    for (let i = 0; i < 3; i++) { const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 8), std(0xd9d9d0)); ins.position.set(-1 + i, 3.9, 0); sub.add(ins); }
    buildFence(sub, 0, 0, 8, 7, 2.0, 2);
    scene.add(sub);
  }
  const lamps = buildLamps(scene, [[-3.6, -10], [6.4, -18], [-3.6, -26], [6.4, -34], [-16, -40, 6.2, 1], [20, -40, 6.2, -1], [-16, -60, 6.2, 1], [20, -60, 6.2, -1], [34, 20, 6.2, 1], [58, 20, 6.2, -1], [60, -34, 5.2, 1]], dot);
  const plantLight = new THREE.PointLight(0xffd9a0, 0, 70, 1.6); plantLight.position.set(POS.diesel.x, 8, POS.diesel.z + 6); scene.add(plantLight);
  const plazaLight = new THREE.PointLight(0xffd9a0, 0, 90, 1.6); plazaLight.position.set(POS.compound.x, 10, POS.compound.z + 4); scene.add(plazaLight);

  // ---------------------------------------------------------------- cables + flow particles
  const flowDefs = {
    solar: { pts: [V3(POS.inverter.x + 5.2, 2.4, POS.inverter.z), V3(-10, 6, 8), V3(POS.bus.x - 1, 4.4, POS.bus.z)], color: COL.solar },
    diesel: { pts: [V3(POS.diesel.x - 14, 3.4, POS.diesel.z), V3(24, 6, 8), V3(POS.bus.x + 1, 4.4, POS.bus.z)], color: COL.diesel },
    battery: { pts: [V3(POS.battery.x + 1, 3.2, POS.battery.z), V3(-4, 6, 16), V3(POS.bus.x - 0.5, 4.4, POS.bus.z + 1)], color: COL.battery },
    compound: { pts: [V3(POS.bus.x, 4.4, POS.bus.z - 1.2), V3(POS.bus.x + 2, 6.4, -20), V3(POS.compound.x, 7, POS.compound.z + 16)], color: 0xffffff },
    house: { pts: [V3(POS.compound.x + 8, 7, POS.compound.z + 16), V3(38, 6.4, -34), V3(POS.house.x - 6, 4.6, POS.house.z + 6)], color: 0xffffff },
  };
  const flows = {}, poleMat = std(0x6b5a45, { roughness: 0.95 }), poleSeen = new Set();
  for (const [name, def] of Object.entries(flowDefs)) {
    const curve = new THREE.CatmullRomCurve3(def.pts, false, 'catmullrom', 0.35);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.09, 6, false), new THREE.MeshStandardMaterial({ color: 0x25282c, roughness: 0.6 }));
    tube.castShadow = true; scene.add(noPick(tube));
    def.pts.slice(1, -1).forEach((p) => {
      const key = p.x + ',' + p.z; if (poleSeen.has(key)) return; poleSeen.add(key);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, p.y + 0.6, 7), poleMat); pole.position.set(p.x, (p.y + 0.6) / 2 - 0.3, p.z); pole.castShadow = true; scene.add(noPick(pole));
      scene.add(noPick(box(2.4, 0.15, 0.15, poleMat, p.x, p.y - 0.1, p.z)));
    });
    const M = 26, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 3), 3));
    const pm = new THREE.PointsMaterial({ color: def.color, size: 0.85, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false, map: dot, blending: THREE.AdditiveBlending, fog: false });
    const pts = new THREE.Points(geo, pm); pts.frustumCulled = false; scene.add(noPick(pts));
    flows[name] = { curve, pts, M, phase: Math.random(), len: curve.getLength(), count: 0, dir: 1, mat: pm };
  }

  // ---------------------------------------------------------------- clouds (billboards) & rain
  const cloudTex = [cloudTexture(3), cloudTexture(8), cloudTexture(15)];
  const cloudMats = cloudTex.map((t) => new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  const clouds = [];
  {
    let a = 11;
    const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
    for (let i = 0; i < 30; i++) {
      const g = new THREE.Group(), parts = 5 + Math.floor(rnd() * 4);
      for (let k = 0; k < parts; k++) {
        const s = new THREE.Sprite(cloudMats[Math.floor(rnd() * 3)]);
        const w = 55 + rnd() * 60; s.scale.set(w, w * 0.62, 1);
        s.position.set((k - parts / 2) * 26 + (rnd() - 0.5) * 18, (rnd() - 0.4) * 9, (rnd() - 0.5) * 30);
        g.add(s);
      }
      const ang = rnd() * Math.PI * 2, rad = 120 + rnd() * 230;
      g.userData = { ang, rad, speed: 0.01 + rnd() * 0.012 };
      g.position.set(Math.cos(ang) * rad, 78 + rnd() * 50, Math.sin(ang) * rad);
      scene.add(noPick(g)); clouds.push(g);
    }
  }
  const RAIN_N = 2600, rainGeo = new THREE.BufferGeometry(), rp = new Float32Array(RAIN_N * 6);
  for (let i = 0; i < RAIN_N; i++) { const x = (Math.random() - 0.5) * 240, y = Math.random() * 100, z = (Math.random() - 0.5) * 240; rp.set([x, y, z, x, y - 2.2, z], i * 6); }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaecbe6, transparent: true, opacity: 0, fog: false }));
  rain.frustumCulled = false; scene.add(rain);

  // ---------------------------------------------------------------- DOM labels, selection ring, picking
  const labelRoot = document.createElement('div');
  labelRoot.className = 'scene-labels';
  canvas.parentElement.append(labelRoot);
  const labelDefs = {
    solar: { el: null, anchor: V3(POS.solar.x, 9, POS.solar.z) },
    generator: { el: null, anchor: V3(POS.diesel.x, 11, POS.diesel.z) },
    battery: { el: null, anchor: V3(POS.battery.x, 5.5, POS.battery.z) },
    compound: { el: null, anchor: V3(POS.compound.x, 24, POS.compound.z + 4) },
    house: { el: null, anchor: V3(POS.house.x, 15, POS.house.z) },
  };
  for (const [k, d] of Object.entries(labelDefs)) {
    d.el = document.createElement('button');
    d.el.type = 'button'; d.el.className = 'scene-label'; d.el.dataset.kind = k;
    d.el.addEventListener('click', () => handlers.onSelect && handlers.onSelect(k));
    labelRoot.append(d.el);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; ring.visible = false; scene.add(ring);
  let selected = null;
  const ringSize = { solar: 52, inverter: 6, generator: 24, battery: 10, compound: 34, house: 14 };
  const ringPos = { solar: POS.solar, inverter: POS.inverter, generator: POS.diesel, battery: POS.battery, compound: POS.compound, house: POS.house };

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pickables = [groups.solar, groups.inverter, groups.battery, groups.generator, groups.compound, groups.house];
  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(pickables, true);
    for (const hit of hits) {
      let o = hit.object;
      while (o && !o.userData.kind) o = o.parent;
      if (o && o.userData.kind && (o.userData.kind !== 'battery' || groups.battery.visible)) return o.userData.kind;
    }
    return null;
  }
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved < 5) { const k = pick(e); if (k && handlers.onSelect) handlers.onSelect(k); }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.buttons) return;
    const k = pick(e);
    canvas.style.cursor = k ? 'pointer' : 'grab';
    if (handlers.onHover) handlers.onHover(k, e);
  });
  canvas.addEventListener('pointerleave', () => handlers.onHover && handlers.onHover(null));

  // ---------------------------------------------------------------- configure / update
  let cfgSig = '';
  function configure(p) {
    const sig = [p.pv.panelCount, p.site.tilt, p.diesel.units, p.site.lat >= 0].join('|');
    if (sig !== cfgSig) { cfgSig = sig; buildSolar(p.pv.panelCount, p.site.tilt, p.site.lat); buildDiesel(p.diesel.units); }
    groups.battery.visible = !!(p.battery.enabled && p.battery.capacityKwh > 0);
    labelDefs.battery.hidden = !groups.battery.visible;
  }

  let L = null, time = 0;
  const sunDir = new THREE.Vector3();
  const palette = {
    dayZ: new THREE.Color(0x2f6fd0), dayH: new THREE.Color(0xa9d0f4), duskZ: new THREE.Color(0x24366b), duskH: new THREE.Color(0xff9a52),
    nightZ: new THREE.Color(0x02040c), nightH: new THREE.Color(0x0b1226), grey: new THREE.Color(0x77818c),
  };
  const _z = new THREE.Color(), _h = new THREE.Color(), _g = new THREE.Color(), _w = new THREE.Color();
  function applySky(live) {
    const up = live.sun.up;
    sunDir.set(live.sun.east, live.sun.up, -live.sun.north).normalize();
    const day = smooth(0.05, 0.38, up), dusk = 1 - Math.abs(clamp(up / 0.2, -1, 1));
    const night = 1 - smooth(-0.18, 0.04, up), cov = live.weather.coverage;
    _z.copy(palette.nightZ).lerp(palette.duskZ, 1 - night).lerp(palette.dayZ, day);
    _h.copy(palette.nightH).lerp(palette.duskH, (1 - night) * dusk * (1 - cov * 0.6)).lerp(palette.dayH, day);
    _g.copy(palette.grey).multiplyScalar(0.25 + 0.75 * (1 - night));
    _z.lerp(_g, cov * 0.75 * (1 - night * 0.5)); _h.lerp(_g.clone().multiplyScalar(1.1), cov * 0.7);
    skyUniforms.zenith.value.copy(_z); skyUniforms.horizon.value.copy(_h); skyUniforms.sunDir.value.copy(sunDir);
    skyUniforms.glowAmt.value = 0.9 * (1 - cov * 0.8) * smooth(-0.1, 0.1, up);
    scene.fog.color.copy(_h); scene.fog.near = lerp(260, 110, cov); scene.fog.far = lerp(1000, 650, cov);
    sun.position.copy(sunDir).multiplyScalar(300).add(controls.target); sun.target.position.copy(controls.target); sun.target.updateMatrixWorld();
    _w.set(0xfff3dc).lerp(new THREE.Color(0xff9a4a), 1 - smooth(0.0, 0.3, up)); sun.color.copy(_w);
    sun.intensity = 3.4 * smooth(-0.02, 0.18, up) * (1 - 0.82 * cov);
    moon.position.copy(sunDir).multiplyScalar(-300).add(controls.target); moon.intensity = 0.9 * night * (1 - cov * 0.6);
    hemi.intensity = 0.08 + 0.42 * (1 - night) * (1 - 0.45 * cov) + 0.16 * night;
    hemi.color.copy(_h).lerp(new THREE.Color(0xffffff), 0.35); hemi.groundColor.setRGB(0.28, 0.33, 0.22);
    sunDisc.position.copy(sunDir).multiplyScalar(1100); sunDisc.visible = up > -0.06 && cov < 0.9;
    sunDisc.material.color.set(0xfff4c8).lerp(new THREE.Color(0xff8d3a), 1 - smooth(0, 0.3, up));
    moonDisc.position.copy(sunDir).multiplyScalar(-1100); moonDisc.visible = up < 0.02 && cov < 0.9;
    stars.material.opacity = night * (1 - cov) * 0.95;
    renderer.toneMappingExposure = 0.85 + 0.17 * (1 - night);
    const u = water.uniforms;
    u.uSunDir.value.copy(sunDir); u.uSunColor.value.copy(_w); u.uZenith.value.copy(_z); u.uHorizon.value.copy(_h); u.uFogColor.value.copy(_h);
    u.uFogNear.value = scene.fog.near; u.uFogFar.value = scene.fog.far; u.uDay.value = day * 0.9 + (1 - night) * 0.1; u.uCover.value = cov; u.uChop.value = 0.8 + 0.8 * cov + 0.6 * live.weather.rain;
    // clouds take the light of the sky
    const cl = _w.clone().lerp(new THREE.Color(0xffffff), 0.5).lerp(new THREE.Color(0x8d96a0), clamp((cov - 0.45) * 1.5, 0, 0.8));
    cl.multiplyScalar(0.12 + 0.88 * (1 - night));
    cloudMats.forEach((m) => { m.color.copy(cl); m.opacity = 0.5 + 0.45 * smooth(0, 0.55, cov); });
    L.night = night;
  }

  function update(live, params) {
    L = live;
    if (params) configure(params);
    applySky(live);
    updateEnv(!envRT);
    const nightK = L.night, cov = live.weather.coverage;
    const show = Math.round(cov * clouds.length);
    clouds.forEach((c, i) => { c.visible = i < show; });

    const loadK = clamp(live.load / Math.max(1, live.peakLoad), 0, 1);
    compound.update(nightK, loadK, cov);
    houseObj.update(nightK, clamp(live.houseKw / Math.max(0.05, live.housePeakKw), 0, 1));
    lamps.update(nightK);
    plantLight.intensity = nightK * 380; plazaLight.intensity = nightK * 420;

    invLed.material.color.set(live.pvAvail < 0.5 ? 0x555555 : live.pvCurt > 0.5 ? 0xf59e0b : 0x22c55e);
    const soc = live.soc / 100;
    battLeds.forEach((led, i) => {
      const on = soc * 10 > i + 0.2, base = live.battChg > 0.5 ? 0x22d3a0 : live.battDis > 0.5 ? 0xf59e0b : 0x22c55e;
      led.material.color.set(on ? base : 0x1a2a26);
    });
    gens.forEach((g, i) => { g.on = i < live.unitsOn ? 1 : 0; g.lamp.material.color.set(g.on ? 0x34d399 : 0x3a3a3a); });

    const peak = Math.max(live.peakLoad, 1);
    const setFlow = (name, kw, dir, color) => {
      const f = flows[name];
      f.count = kw < 0.3 ? 0 : clamp(Math.round(4 + 22 * Math.sqrt(kw / peak)), 3, f.M);
      f.dir = dir; if (color != null) f.mat.color.set(color);
      f.mat.size = 0.55 + 0.9 * clamp(Math.sqrt(kw / peak), 0, 1);
      f.pts.geometry.setDrawRange(0, f.count);
    };
    setFlow('solar', live.pvUsed, 1);
    setFlow('diesel', live.dieselOut, 1);
    setFlow('battery', Math.abs(live.battDis - live.battChg), live.battDis >= live.battChg ? 1 : -1);
    const solarShare = live.load > 0 ? clamp(live.solarToLoad / Math.max(1e-6, live.solarToLoad + live.dieselToLoad), 0, 1) : 0;
    const mix = new THREE.Color(COL.diesel).lerp(new THREE.Color(COL.solar), solarShare);
    setFlow('compound', live.served, 1, mix.getHex());
    setFlow('house', live.houseKw * Math.max(1, live.subscribers * 0.02), 1, mix.getHex());

    const t = (k, html) => { if (labelDefs[k].html !== html) { labelDefs[k].html = html; labelDefs[k].el.innerHTML = html; } };
    t('solar', `<b>Solar</b> ${live.pvUsed.toFixed(0)} kW`);
    t('generator', `<b>Diesel</b> ${live.dieselOut.toFixed(0)} kW`);
    t('battery', `<b>Battery</b> ${live.soc.toFixed(0)}%`);
    t('compound', `<b>Compound</b> ${live.served.toFixed(0)} kW`);
    t('house', `<b>House</b> ${live.houseKw.toFixed(2)} kW`);
    rain.material.opacity = live.weather.rain * 0.5; rain.visible = live.weather.rain > 0.02; L.rainOn = live.weather.rain > 0.02;
  }

  // ---------------------------------------------------------------- frame loop
  const clock = new THREE.Clock(), tmp = new THREE.Vector3(), rainPos = rainGeo.getAttribute('position');
  function animate(dt) {
    if (!L) return;
    time += dt;
    const spd = Math.min(1, L.speedFactor == null ? 1 : L.speedFactor);
    water.uniforms.uTime.value = time * (0.4 + 0.6 * spd);
    vegetation.update(time);
    life.update(dt, time, spd);
    for (const f of Object.values(flows)) {
      if (f.count === 0) continue;
      f.phase = (f.phase + (f.dir * 11 * dt * Math.max(0.15, spd)) / f.len) % 1;
      if (f.phase < 0) f.phase += 1;
      const arr = f.pts.geometry.getAttribute('position');
      for (let i = 0; i < f.count; i++) { f.curve.getPointAt((((i / f.count + f.phase) % 1) + 1) % 1, tmp); arr.setXYZ(i, tmp.x, tmp.y, tmp.z); }
      arr.needsUpdate = true;
    }
    gens.forEach((g, gi) => {
      if (g.on) g.fan.rotation.y += dt * 14;
      g.root.position.y = g.on ? Math.sin(time * 60 + gi) * 0.01 : 0;
      for (const s of g.smoke) {
        s.userData.t += dt * (0.3 * (0.4 + 0.6 * Math.max(0.2, spd)));
        if (s.userData.t > 1) s.userData.t -= 1;
        const t = s.userData.t;
        s.position.set(g.stackTop.x + t * 6, g.stackTop.y + t * 9, g.stackTop.z + Math.sin(t * 6 + gi) * 0.7);
        const sc = 0.9 + t * 4.6; s.scale.set(sc, sc, 1);
        s.material.opacity = g.on ? (1 - t) * 0.4 * (0.4 + 0.6 * (L.dieselOut / Math.max(1, L.dieselCap))) : 0;
      }
    });
    clouds.forEach((c) => {
      if (!c.visible) return;
      c.userData.ang += c.userData.speed * dt * Math.max(0.2, spd);
      c.position.x = Math.cos(c.userData.ang) * c.userData.rad; c.position.z = Math.sin(c.userData.ang) * c.userData.rad;
    });
    if (L.rainOn) {
      const fall = 70 * dt * Math.max(0.3, spd);
      for (let i = 0; i < RAIN_N; i++) { let y = rainPos.getY(i * 2) - fall; if (y < 0) y += 100; rainPos.setY(i * 2, y); rainPos.setY(i * 2 + 1, y - 2.2); }
      rainPos.needsUpdate = true;
    }
    marker.rotation.z += dt * 1.2; marker2.position.y = 9.9 + Math.sin(time * 3) * 0.4;
    if (selected) { const sz = ringSize[selected] * (1 + 0.025 * Math.sin(time * 4)); ring.scale.set(sz, sz, 1); }
  }

  const v4 = new THREE.Vector3();
  function projectLabels() {
    const r = canvas.getBoundingClientRect();
    for (const [k, d] of Object.entries(labelDefs)) {
      const hide = d.hidden || (k === 'battery' && !groups.battery.visible);
      v4.copy(d.anchor).project(camera);
      const on = !hide && v4.z < 1 && v4.z > -1;
      d.el.style.display = on ? '' : 'none';
      if (on) {
        d.el.style.transform = `translate(-50%,-100%) translate(${((v4.x + 1) / 2) * r.width}px, ${((1 - v4.y) / 2) * r.height}px)`;
        d.el.classList.toggle('active', selected === k);
      }
    }
  }

  // ---- quality: start high, step down if the device cannot keep up (never back up, to avoid flicker)
  const LEVELS = [
    { pr: Math.min(window.devicePixelRatio || 1, 2), shadow: 2048 }, { pr: Math.min(window.devicePixelRatio || 1, 1.5), shadow: 1024 },
    { pr: 1, shadow: 1024 }, { pr: 1, shadow: 0 },
  ];
  let level = 0, slow = 0, fitted = false;
  function applyLevel() {
    const lv = LEVELS[level];
    renderer.setPixelRatio(lv.pr);
    renderer.shadowMap.enabled = lv.shadow > 0; sun.castShadow = lv.shadow > 0;
    if (lv.shadow > 0 && sun.shadow.mapSize.x !== lv.shadow) { sun.shadow.mapSize.set(lv.shadow, lv.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { m.needsUpdate = true; }); } });
    resize();
  }
  function resize() {
    const w = canvas.clientWidth, hh = canvas.clientHeight;
    if (!w || !hh) return;
    renderer.setPixelRatio(LEVELS[level].pr);
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh; camera.updateProjectionMatrix();
    if (!fitted) {
      fitted = true;
      const f = clamp(1 / camera.aspect, 1, 2.2);
      if (f > 1) camera.position.sub(controls.target).multiplyScalar(Math.pow(f, 0.85)).add(controls.target);
    }
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  function start(onFrame) {
    renderer.setAnimationLoop(() => {
      const dt = Math.min(0.1, clock.getDelta());
      if (handlers.adaptive !== false) {
        slow = dt > 0.045 ? slow + dt : Math.max(0, slow - dt * 2);
        if (slow > 2.5 && level < LEVELS.length - 1) { level++; slow = 0; applyLevel(); }
      }
      if (onFrame) onFrame(dt);
      animate(dt);
      controls.update();
      projectLabels();
      renderer.render(scene, camera);
    });
  }

  function setSelected(kind) {
    selected = kind; ring.visible = !!kind;
    if (kind) { const p = ringPos[kind]; ring.position.set(p.x, 0.3, p.z); }
  }
  function focus(kind) { const p = ringPos[kind]; if (p) controls.target.set(p.x, 3, p.z); }
  function snapshot() { renderer.render(scene, camera); return canvas.toDataURL('image/png'); }

  return { update, start, setSelected, focus, resize, snapshot, camera, controls, info: solarInfo, renderer };
}
