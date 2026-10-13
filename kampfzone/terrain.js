// Gelände mit sanften Hügeln, Seen, Fluss und Insel: Höhenfunktion für die Physik, Geländenetz mit
// Sandstrand und eine Wasseroberfläche. Orte und Straßen bleiben flach.

import * as THREE from '../vendor/three.module.js';
import { HALF } from './util.js';

export const WATER = -0.6;          // Wasserspiegel
export const SWIM_Y = WATER - 1.2;  // Fußhöhe beim Schwimmen
const DEEP = 3.4;

// Seen (Kreise) mit optionaler Insel; Flüsse als Linienzüge
export const LAKES = [
  { name: 'Inselsee', x: 108, z: 106, r: 40, island: { x: 108, z: 106, r: 14 } },
  { name: 'Waldsee', x: -112, z: 110, r: 24 },
  { name: 'Mühlteich', x: -102, z: -112, r: 19 },
  { name: 'Fischteich', x: 116, z: -114, r: 16 },
];
export const RIVERS = [
  { pts: [[-166, -52], [-146, -64], [-128, -84], [-108, -104]], w: 4.5 },
];
export const ISLAND = LAKES[0].island;
export const HILL_MAX = 7;              // höchster Hügel (m)

// flache Bereiche (Orte und Straßen) – dort gibt es keine Hügel
const FLAT = [
  [-80, -80, 80, 80],       // Stadt
  [-152, -44, -86, 68],     // Siedlung
  [-120, -8, -70, 8],       // Straße West
  [70, -8, 120, 8],         // Straße Ost
  [102, -26, 158, 36],      // Bauernhof
  [90, 88, 126, 124],       // Insel
];

function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

function hash(i, j) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * u;
  const b = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * u;
  return a + (b - a) * v;
}
function rectDist(x, z, r) {
  return Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - z, 0, z - r[3]));
}
// Hügel: weich ausgeblendet an Orten, Ufern und am Kartenrand
function hills(x, z, sd) {
  let m = smooth((sd - 3) / 16) * (1 - smooth((Math.max(Math.abs(x), Math.abs(z)) - 146) / 14));
  if (m <= 0) return 0;
  for (const r of FLAT) { m = Math.min(m, smooth(rectDist(x, z, r) / 22)); if (m <= 0) return 0; }
  const n = vnoise(x / 58 + 3.1, z / 58 - 7.7) * 0.65 + vnoise(x / 24 + 11.3, z / 24 + 2.9) * 0.35;
  return Math.max(0, n - 0.32) / 0.68 * HILL_MAX * m;
}

function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

// [Höhe, vorzeichenbehafteter Abstand zum Ufer (negativ = im Wasser)]
function sample(x, z) {
  let h = 0, sd = 99;
  for (const L of LAKES) {
    if (Math.abs(x - L.x) > L.r + 12 || Math.abs(z - L.z) > L.r + 12) continue;
    let d = Math.hypot(x - L.x, z - L.z) - L.r;
    if (L.island) d = Math.max(d, L.island.r - Math.hypot(x - L.island.x, z - L.island.z));
    sd = Math.min(sd, d);
    if (d < 0) h = Math.min(h, -DEEP * smooth(-d / 8));
  }
  for (const R of RIVERS) {
    let d = Infinity;
    for (let i = 0; i < R.pts.length - 1; i++) d = Math.min(d, segDist(x, z, ...R.pts[i], ...R.pts[i + 1]));
    d -= R.w;
    sd = Math.min(sd, d);
    if (d < 0) h = Math.min(h, -2.6 * smooth(-d / 4));
  }
  if (h === 0) h = hills(x, z, sd);
  return [h, sd];
}

export function terrainH(x, z) { return sample(x, z)[0]; }
export function shoreDist(x, z) { return sample(x, z)[1]; }
export function inWater(x, z) { return sample(x, z)[0] < WATER; }
export function deepWater(x, z) { return sample(x, z)[0] < SWIM_Y; }

// Normalenkarte für kleine Wellen
function waterNormals() {
  const N = 256, c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d'), img = x.createImageData(N, N);
  const H = (i, j) => {
    const u = i / N * Math.PI * 2, v = j / N * Math.PI * 2;
    return Math.sin(u * 3 + v * 2) * 0.5 + Math.sin(u * 7 - v * 5) * 0.25 + Math.sin(u * 11 + v * 13) * 0.12 + Math.cos(v * 4 - u) * 0.3;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const dx = H(i + 1, j) - H(i - 1, j), dz = H(i, j + 1) - H(i, j - 1);
    const l = Math.hypot(dx, 2, dz);
    const p = (j * N + i) * 4;
    img.data[p] = (dx / l * 0.5 + 0.5) * 255;
    img.data[p + 1] = (dz / l * 0.5 + 0.5) * 255;
    img.data[p + 2] = (2 / l * 0.5 + 0.5) * 255;
    img.data[p + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(30, 30);
  return t;
}

let normals = null;

// Gelände und Wasser in die Kartengruppe legen. grass: Wiesentextur.
export function buildTerrain(G, grass) {
  const E = HALF + 10, STEP = 2, n = Math.round(2 * E / STEP);
  const geo = new THREE.PlaneGeometry(2 * E, 2 * E, n, n).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const sand = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const [h, sd] = sample(x, z);
    pos.setY(i, h);
    uv.setXY(i, x / 8, -z / 8);
    sand[i] = 1 - smooth((sd - 1.5) / 3);
  }
  geo.setAttribute('sand', new THREE.BufferAttribute(sand, 1));
  geo.computeVertexNormals();
  const tex = grass.clone();
  tex.repeat.set(1, 1);
  tex.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float sand;\nvarying float vSand;\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSand = sand;\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSand;\nvarying vec3 vWP;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float gr = fract(sin(dot(floor(vWP.xz * 6.0), vec2(12.9898, 78.233))) * 43758.5453);
        vec3 sandCol = mix(vec3(0.62, 0.52, 0.32), vec3(0.72, 0.62, 0.4), gr);
        sandCol = mix(sandCol, vec3(0.32, 0.28, 0.2), smoothstep(-0.4, -2.5, vWP.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, sandCol, clamp(vSand, 0.0, 1.0));`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  G.mapGroup.add(mesh);
  // Wiese außerhalb der Karte (mit Loch für das Gelände)
  const shape = new THREE.Shape([new THREE.Vector2(-600, -600), new THREE.Vector2(600, -600), new THREE.Vector2(600, 600), new THREE.Vector2(-600, 600)]);
  shape.holes.push(new THREE.Path([new THREE.Vector2(-E, -E), new THREE.Vector2(-E, E), new THREE.Vector2(E, E), new THREE.Vector2(E, -E)]));
  const ring = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  const rt = grass.clone(); rt.repeat.set(1 / 8, 1 / 8); rt.needsUpdate = true;
  const outer = new THREE.Mesh(ring, new THREE.MeshStandardMaterial({ map: rt, roughness: 0.95 }));
  outer.receiveShadow = true;
  G.mapGroup.add(outer);
  // Wasseroberfläche
  if (!normals) normals = waterNormals();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2 * E, 2 * E).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x1f6a9a, transparent: true, opacity: 0.82, roughness: 0.03, metalness: 0.0, envMapIntensity: 1.4, normalMap: normals, normalScale: new THREE.Vector2(0.3, 0.3), depthWrite: false }));
  water.position.y = WATER;
  water.renderOrder = 2;
  G.mapGroup.add(water);
  G.waterTex = normals;
}

// Wellen bewegen
export function updateWater(G, dt) {
  if (G.waterTex) { G.waterTex.offset.x += dt * 0.012; G.waterTex.offset.y += dt * 0.007; }
}
