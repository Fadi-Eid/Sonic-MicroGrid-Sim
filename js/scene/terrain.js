// Island terrain (height field with beaches, grass, scrub and rock) and the animated sea.
import * as THREE from 'three';
import { islandHeight, coastR, fbm, smooth, lerp, SEA_Y } from './world.js';
import { grainTexture } from './textures.js';

const SIZE = 340, SEG = 150, HALF = SIZE / 2;

export function buildTerrain() {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, islandHeight(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal, colors = new Float32Array(pos.count * 3);
  const sandDry = new THREE.Color(0xdccd9f), sandWet = new THREE.Color(0xa99c76), seabed = new THREE.Color(0x9a9272);
  const grassA = new THREE.Color(0x6b8f48), grassB = new THREE.Color(0x56803f), dry = new THREE.Color(0x9a9b58), scrub = new THREE.Color(0x4d6b3a);
  const rockA = new THREE.Color(0x85806f), rockB = new THREE.Color(0x625d52);
  const c = new THREE.Color(), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i), ny = nrm.getY(i);
    const d = Math.hypot(x, z), t = coastR(Math.atan2(z, x)) - d;
    const n1 = fbm(x * 0.045 + 3, z * 0.045 - 8), n2 = fbm(x * 0.21 - 5, z * 0.21 + 2);
    if (h < SEA_Y + 0.05) c.copy(seabed).lerp(sandWet, smooth(-3, SEA_Y, h));
    else {
      c.copy(grassA).lerp(grassB, smooth(0.35, 0.65, n1));
      c.lerp(dry, smooth(0.58, 0.8, n2) * 0.65);
      c.lerp(scrub, smooth(2, 9, h) * 0.5);
      const beach = 1 - smooth(5, 13, t + (n2 - 0.5) * 6);
      tmp.copy(sandDry).lerp(sandWet, smooth(2, -1, t) * 0.8);
      c.lerp(tmp, beach);
      const steep = smooth(0.38, 0.75, 1 - ny) + smooth(10, 16, h) * 0.5;
      tmp.copy(rockA).lerp(rockB, n2);
      c.lerp(tmp, Math.min(1, steep));
    }
    const v = 0.9 + 0.2 * n2;
    colors[i * 3] = c.r * v; colors[i * 3 + 1] = c.g * v; colors[i * 3 + 2] = c.b * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const grain = grainTexture(); grain.repeat.set(70, 70);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 1, metalness: 0, envMapIntensity: 0.45 }));
  mesh.receiveShadow = true;
  return mesh;
}

// ---- sea ----------------------------------------------------------------------------------------
function heightTexture() {
  const N = 256, data = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i / (N - 1) - 0.5) * SIZE, z = (j / (N - 1) - 0.5) * SIZE;
    data[j * N + i] = Math.max(0, Math.min(255, ((islandHeight(x, z) + 6) / 22) * 255));
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

export function buildWater() {
  const uniforms = {
    uTime: { value: 0 }, uHeight: { value: heightTexture() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
    uZenith: { value: new THREE.Color(0x3a74d6) }, uHorizon: { value: new THREE.Color(0xa6cdf2) },
    uFogColor: { value: new THREE.Color(0xa6cdf2) }, uFogNear: { value: 260 }, uFogFar: { value: 1000 },
    uDay: { value: 1 }, uCover: { value: 0 }, uChop: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      varying vec3 vW;
      uniform float uTime, uDay, uCover, uChop, uFogNear, uFogFar;
      uniform sampler2D uHeight;
      uniform vec3 uSunDir, uSunColor, uZenith, uHorizon, uFogColor;
      const float SEA = ${SEA_Y.toFixed(3)};
      vec2 wv(vec2 p, vec2 d, float k, float sp, float a){ float ph = dot(p, d) * k + uTime * sp; return d * (cos(ph) * a * k); }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vW.xz;
        vec2 g = wv(p, normalize(vec2(1.0, 0.35)), 0.12, 0.8, 0.4) + wv(p, normalize(vec2(-0.4, 1.0)), 0.2, 1.1, 0.2);
        g *= uChop;
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 V = normalize(cameraPosition - vW);
        float dist = length(cameraPosition - vW);
        // water depth from the baked height map
        vec2 uv = vW.xz / ${SIZE.toFixed(1)} + 0.5;
        float depth = 7.0;
        if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) depth = SEA - (texture2D(uHeight, uv).r * 22.0 - 6.0);
        depth = max(depth, 0.0);
        vec3 deep = vec3(0.012, 0.115, 0.205), shallow = vec3(0.10, 0.50, 0.52);
        vec3 body = mix(shallow, deep, 1.0 - exp(-depth * 0.32));
        body *= (0.12 + 0.88 * uDay) * (1.0 - 0.35 * uCover);
        vec3 R = reflect(-V, N);
        float fres = 0.025 + 0.975 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.45));
        vec3 col = mix(body, sky, clamp(fres, 0.0, 0.92));
        float sp = pow(max(dot(R, normalize(uSunDir)), 0.0), 380.0) * 2.6 + pow(max(dot(R, normalize(uSunDir)), 0.0), 32.0) * 0.18;
        col += uSunColor * sp * smoothstep(-0.05, 0.12, uSunDir.y) * (1.0 - 0.85 * uCover);
        // surf foam along the shore + a little crest foam
        float wob = sin(uTime * 1.1 + p.x * 0.3 + p.y * 0.23) * 0.25;
        float foam = smoothstep(0.7, 0.0, depth + wob) * 0.8;
        float crest = 0.0;
        col = mix(col, vec3(0.93, 0.96, 0.97) * (0.25 + 0.75 * uDay), clamp(foam + crest, 0.0, 0.9));
        float alpha = mix(0.35, 1.0, smoothstep(0.0, 1.6, depth));
        alpha = max(alpha, clamp(foam + crest, 0.0, 1.0));
        float fogF = smoothstep(uFogNear, uFogFar, dist);
        col = mix(col, uFogColor, fogF);
        gl_FragColor = vec4(col, mix(alpha, 1.0, fogF));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), mat);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = SEA_Y; mesh.renderOrder = 2;
  return { mesh, uniforms };
}
