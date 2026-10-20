// Life around the island: a jetty with a moored fishing boat and a sailing boat circling the island.
import * as THREE from 'three';
import { coastR, SEA_Y, rngFrom } from './world.js';

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, envMapIntensity: 0.6, ...o });
function mesh(geo, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; }
const noPick = (g) => g.traverse((o) => { o.raycast = () => {}; });

// boat hull from a top-view outline, extruded upwards
function hull(length, beam, height, color) {
  const s = new THREE.Shape(), L = length / 2, B = beam / 2;
  s.moveTo(0, L); s.bezierCurveTo(B * 0.9, L * 0.55, B, -L * 0.2, B * 0.85, -L); s.lineTo(-B * 0.85, -L); s.bezierCurveTo(-B, -L * 0.2, -B * 0.9, L * 0.55, 0, L);
  const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false, curveSegments: 10 });
  g.rotateX(-Math.PI / 2); // outline now lies in x/z, extruded along +y, bow towards -z
  g.rotateY(Math.PI);      // bow towards +z
  return mesh(g, mat(color, { roughness: 0.45 }), 0, -0.3, 0);
}

function fishingBoat() {
  const b = new THREE.Group();
  b.add(hull(7.5, 2.6, 1.3, 0x2c5f8a));
  b.add(mesh(new THREE.BoxGeometry(2.7, 0.25, 6.4), mat(0xe8e4da), 0, 0.98, -0.2));
  b.add(mesh(new THREE.BoxGeometry(1.8, 1.5, 2.0), mat(0xf1efe8), 0, 1.7, -1.4));
  b.add(mesh(new THREE.BoxGeometry(1.85, 0.5, 1.2), new THREE.MeshStandardMaterial({ color: 0x1b2b3b, roughness: 0.1, metalness: 0.6 }), 0, 1.95, -0.6));
  b.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), mat(0x888888), 0, 3.2, -1.4));
  return b;
}
function sailBoat() {
  const b = new THREE.Group();
  b.add(hull(10, 3, 1.1, 0xf4f4f0));
  b.add(mesh(new THREE.BoxGeometry(2.4, 0.15, 7.5), mat(0xb89462), 0, 0.82, 0));
  b.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 11, 6), mat(0xdddddd, { metalness: 0.5 }), 0, 6.2, 0.4));
  const sail = new THREE.Shape(); sail.moveTo(0, 0); sail.lineTo(0, 9.5); sail.lineTo(-4.6, 0.6); sail.lineTo(0, 0);
  const sg = new THREE.ShapeGeometry(sail);
  const sm = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0xfaf8f2, roughness: 0.9, side: THREE.DoubleSide }));
  sm.rotation.y = Math.PI / 2; sm.position.set(0, 1.1, 0.35); sm.castShadow = true; b.add(sm);
  const jib = new THREE.Shape(); jib.moveTo(0, 0); jib.lineTo(0, 7.5); jib.lineTo(2.4, 0.4); jib.lineTo(0, 0);
  const jm = new THREE.Mesh(new THREE.ShapeGeometry(jib), new THREE.MeshStandardMaterial({ color: 0xe9e4d6, roughness: 0.9, side: THREE.DoubleSide }));
  jm.rotation.y = Math.PI / 2; jm.position.set(0, 1.2, 1.2); b.add(jm);
  return b;
}

export function buildLife(scene) {
    // ---- jetty on the south-east shore
  const a = 0.95, rc = coastR(a), ux = Math.cos(a), uz = Math.sin(a);
  const jetty = new THREE.Group(), L = 32, mid = rc + 6;
  jetty.position.set(ux * mid, 0, uz * mid); jetty.rotation.y = Math.atan2(ux, uz);
  const wood = mat(0x7a5b3d, { roughness: 0.95 }), deckY = 0.62;
  jetty.add(mesh(new THREE.BoxGeometry(2.6, 0.16, L), wood, 0, deckY, 0));
  for (let i = 0; i <= 10; i++) for (const sx of [-1.15, 1.15]) jetty.add(mesh(new THREE.CylinderGeometry(0.14, 0.17, 4.2, 6), wood, sx, deckY - 2.0, -L / 2 + (L * i) / 10));
  const boat = fishingBoat(); boat.position.set(2.8, SEA_Y + 0.05, L / 2 - 4); jetty.add(boat);
  scene.add(jetty);
  noPick(jetty);
  // ---- sailing boat circling the island
  const sail = sailBoat(); scene.add(sail); noPick(sail);
  let sailAng = 2.2;
  return {
    update(dt, time, spd) {
      // boats bob
      boat.position.y = SEA_Y + 0.05 + Math.sin(time * 1.3) * 0.08; boat.rotation.z = Math.sin(time * 1.1) * 0.03; boat.rotation.x = Math.sin(time * 0.9 + 1) * 0.02;
      sailAng += dt * 0.011 * Math.max(0.25, spd);
      const R = 172, x = Math.cos(sailAng) * R, z = Math.sin(sailAng) * R;
      sail.position.set(x, SEA_Y + 0.15 + Math.sin(time * 1.2) * 0.1, z);
      sail.rotation.y = Math.atan2(-Math.sin(sailAng), Math.cos(sailAng)) ; // heading along the tangent
      sail.rotation.z = 0.12 + Math.sin(time * 0.8) * 0.03; // heel
    },
  };
}
