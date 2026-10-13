// Die Karte: Wiese, Wald, Felsen, Seen und ein Fluss; in der Mitte eine Stadt mit 11 Gebäuden, Straßen,
// Kirche, Ampeln, Mülltonnen, Laternen und parkenden Autos. Dazu eine Siedlung, ein Bauernhof und eine
// Insel mit Leuchtturm im Inselsee. Truhen und Bodenbeute überall.

import * as THREE from '../vendor/three.module.js';
import { merge, boxAt, mat4 } from './geo.js';
import { STYLES } from './pieces.js';
import { floorLoot } from './items.js';
import { GRID, HALF } from './util.js';
import { buildTerrain, terrainH, shoreDist, WATER, LAKES, ISLAND } from './terrain.js';

export const ROADS = [-64, 0, 64];
export const CITY = 72;
const BLOCKS = [[-56, -56, -8, -8], [8, -56, 56, -8], [-56, 8, -8, 56], [8, 8, 56, 56]];

// 10 Gebäude: Ecke (x0, z0), Breite/Tiefe in Zellen, Stockwerke, Stil, Tür-Seite
const BUILDINGS = [
  { x0: -52, z0: -52, w: 4, d: 4, floors: 3, style: 'office',  door: '+x' },
  { x0: -28, z0: -52, w: 4, d: 3, floors: 2, style: 'brick',   door: '+x' },
  { x0: -52, z0: -28, w: 5, d: 4, floors: 2, style: 'plaster', door: '+z' },
  { x0: 12,  z0: -52, w: 3, d: 4, floors: 4, style: 'office',  door: '-x' },
  { x0: 32,  z0: -52, w: 5, d: 3, floors: 2, style: 'wood',    door: '+z' },
  { x0: 16,  z0: -28, w: 8, d: 4, floors: 2, style: 'brick',   door: '+z' },
  { x0: -52, z0: 12,  w: 3, d: 3, floors: 2, style: 'wood',    door: '-z' },
  { x0: -32, z0: 12,  w: 4, d: 4, floors: 2, style: 'plaster', door: '+x' },
  { x0: -52, z0: 36,  w: 4, d: 4, floors: 3, style: 'brick',   door: '-x' },
  { x0: -28, z0: 36,  w: 4, d: 4, floors: 2, style: 'plaster', door: '+z' },
  { x0: -28, z0: -28, w: 4, d: 4, floors: 2, style: 'wood',    door: '+z' },
];

// Siedlung im Westen: Häuser mit Satteldach an einer Dorfstraße (x = −118)
const SUBURB = [
  { x0: -140, z0: -32, floors: 2, style: 'plaster', door: '+x' },
  { x0: -140, z0: -14, floors: 1, style: 'wood',    door: '+x' },
  { x0: -140, z0: 4,   floors: 2, style: 'brick',   door: '+x' },
  { x0: -140, z0: 22,  floors: 1, style: 'plaster', door: '+x' },
  { x0: -140, z0: 40,  floors: 2, style: 'wood',    door: '+x' },
  { x0: -108, z0: -32, floors: 1, style: 'brick',   door: '-x' },
  { x0: -108, z0: 12,  floors: 2, style: 'plaster', door: '-x' },
  { x0: -108, z0: 30,  floors: 1, style: 'wood',    door: '-x' },
].map(h => ({ ...h, w: 3, d: 3, roof: true }));

// Bauernhof im Osten
const FARM = [
  { x0: 116, z0: -12, w: 3, d: 2, floors: 2, style: 'plaster', door: '+z', roof: true },
  { x0: 120, z0: 8,   w: 4, d: 3, floors: 2, style: 'wood',    door: '-z', roof: true, tint: 0xd8705e },
];

// Fischerhütte auf der Insel
const HUT = { x0: 100, z0: 104, w: 3, d: 2, floors: 1, style: 'wood', door: '-z', roof: true, tint: 0xb9d6e8 };

export const PLACES = [
  { name: 'Stadt', x: 0, z: -78 },
  { name: 'Kirche', x: 26, z: 60 },
  { name: 'Siedlung', x: -118, z: -42 },
  { name: 'Bauernhof', x: 122, z: -26 },
  { name: 'Insel', x: 108, z: 86 },
];
const TINTS = {
  plaster: [0xfff1d6, 0xffd9cf, 0xd6eaff, 0xdff5d8, 0xfff3b0, 0xf2dcff],
  brick: [0xffffff, 0xf3d9cf, 0xe6ddd5],
  wood: [0xffffff, 0xd9c4ae],
  office: [0xffffff, 0xdfe9f2],
};
const DEBRIS = { holz: 0xa0703f, stein: 0xb7ab9a, metall: 0x9aa5ad };

// ---------- Geometrie-Helfer ----------

// waagerechtes Rechteck; uv(x, z) → [u, v]
function quad(x0, z0, x1, z1, y, uv) {
  const g = new THREE.BufferGeometry();
  const P = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.flatMap(([x, z]) => [x, y, z]), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(P.flatMap(([x, z]) => uv(x, z)), 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}

function staticMesh(G, geo, mat, { shadow = false, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = receive;
  G.mapGroup.add(m);
  return m;
}

function texMat(tex, opts = {}) { return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, ...opts }); }

// ---------- Prop-Geometrien (Vertex-Farben, für Instanzen) ----------

function cyl(rt, rb, h, seg = 10) { return new THREE.CylinderGeometry(rt, rb, h, seg); }

function propGeos() {
  const tl = merge([
    { geo: cyl(0.08, 0.1, 3.6).translate(0, 1.8, 0), color: 0x3a3d40 },
    { geo: boxAt(0.36, 1.05, 0.3, 0, 3.05, 0.02), color: 0x222426 },
    { geo: boxAt(0.44, 1.18, 0.03, 0, 3.05, -0.14), color: 0x2a2c2e },
    { geo: boxAt(0.26, 0.04, 0.12, 0, 3.47, 0.22), color: 0x222426 },
    { geo: boxAt(0.26, 0.04, 0.12, 0, 3.14, 0.22), color: 0x222426 },
    { geo: boxAt(0.26, 0.04, 0.12, 0, 2.81, 0.22), color: 0x222426 },
    { geo: boxAt(0.3, 0.3, 0.15, 0, 1.0, 0.1), color: 0xe7c43a },
  ]);
  const bin = merge([
    { geo: boxAt(0.6, 0.92, 0.72, 0, 0.5, 0).scale(1, 1, 1), color: 0xffffff },
    { geo: boxAt(0.66, 0.07, 0.8, 0, 0.99, 0.02), color: 0xb0b0b0 },
    { geo: boxAt(0.5, 0.05, 0.06, 0, 0.9, 0.4), color: 0x777777 },
    { geo: cyl(0.1, 0.1, 0.06, 10).rotateZ(Math.PI / 2).translate(-0.3, 0.1, 0.3), color: 0x1d1d1d },
    { geo: cyl(0.1, 0.1, 0.06, 10).rotateZ(Math.PI / 2).translate(0.3, 0.1, 0.3), color: 0x1d1d1d },
  ]);
  const lamp = merge([
    { geo: cyl(0.09, 0.13, 6.2).translate(0, 3.1, 0), color: 0x4a4f55 },
    { geo: boxAt(0.08, 0.08, 1.7, 0, 6.1, 0.8), color: 0x4a4f55 },
    { geo: boxAt(0.36, 0.16, 0.6, 0, 6.0, 1.55), color: 0x3a3d40 },
    { geo: boxAt(0.3, 0.04, 0.5, 0, 5.91, 1.55), color: 0xfff3c4 },
  ]);
  const car = merge([
    { geo: boxAt(1.85, 0.62, 4.2, 0, 0.62, 0), color: 0xffffff },
    { geo: boxAt(1.65, 0.56, 2.2, 0, 1.2, 0.2), color: 0x23303b },
    { geo: boxAt(1.6, 0.08, 2.0, 0, 1.5, 0.2), color: 0xffffff },
    { geo: boxAt(1.86, 0.18, 0.1, 0, 0.6, -2.12), color: 0x333333 },
    { geo: boxAt(0.35, 0.12, 0.05, -0.6, 0.78, -2.11), color: 0xfff6c8 },
    { geo: boxAt(0.35, 0.12, 0.05, 0.6, 0.78, -2.11), color: 0xfff6c8 },
    { geo: boxAt(0.35, 0.12, 0.05, -0.6, 0.78, 2.11), color: 0xd02020 },
    { geo: boxAt(0.35, 0.12, 0.05, 0.6, 0.78, 2.11), color: 0xd02020 },
    ...[[-0.86, -1.35], [0.86, -1.35], [-0.86, 1.35], [0.86, 1.35]].map(([x, z]) => ({ geo: cyl(0.34, 0.34, 0.24, 14).rotateZ(Math.PI / 2).translate(x, 0.34, z), color: 0x151515 })),
  ]);
  const bench = merge([
    { geo: boxAt(1.8, 0.07, 0.5, 0, 0.46, 0), color: 0x8a5a30 },
    { geo: boxAt(1.8, 0.4, 0.06, 0, 0.75, 0.24), color: 0x8a5a30 },
    { geo: boxAt(0.07, 0.46, 0.5, -0.8, 0.23, 0), color: 0x2e2e2e },
    { geo: boxAt(0.07, 0.46, 0.5, 0.8, 0.23, 0), color: 0x2e2e2e },
  ]);
  const pew = merge([
    { geo: boxAt(3.2, 0.1, 0.5, 0, 0.48, 0), color: 0x6b4022 },
    { geo: boxAt(3.2, 0.62, 0.08, 0, 0.84, 0.24), color: 0x6b4022 },
    { geo: boxAt(0.08, 0.95, 0.56, -1.6, 0.47, 0), color: 0x5a341a },
    { geo: boxAt(0.08, 0.95, 0.56, 1.6, 0.47, 0), color: 0x5a341a },
  ]);
  const grave = merge([
    { geo: boxAt(0.7, 0.9, 0.18, 0, 0.45, 0), color: 0x8d8d88 },
    { geo: new THREE.CylinderGeometry(0.35, 0.35, 0.18, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 0.9, 0), color: 0x8d8d88 },
    { geo: boxAt(0.8, 0.06, 1.6, 0, 0.03, 0.9), color: 0x4f6e33 },
  ]);
  const lampBulb = new THREE.SphereGeometry(0.12, 10, 8);
  const fence = merge([
    ...[-1.9, 0, 1.9].map(x => ({ geo: boxAt(0.12, 1.1, 0.12, x, 0.55, 0), color: 0x7a5530 })),
    { geo: boxAt(4, 0.1, 0.05, 0, 0.45, 0), color: 0x8f6a3f },
    { geo: boxAt(4, 0.1, 0.05, 0, 0.85, 0), color: 0x8f6a3f },
  ]);
  const hay = merge([
    { geo: cyl(0.75, 0.75, 1.3, 16).rotateZ(Math.PI / 2).translate(0, 0.75, 0), color: 0xd9b860 },
    { geo: cyl(0.6, 0.6, 1.32, 16).rotateZ(Math.PI / 2).translate(0, 0.75, 0), color: 0xc9a54c },
  ]);
  const tractor = merge([
    { geo: boxAt(1.2, 0.8, 2.6, 0, 1.0, 0.2), color: 0x2f8a3a },
    { geo: boxAt(1.0, 0.6, 1.6, 0, 1.0, -1.2), color: 0x2f8a3a },
    { geo: boxAt(1.1, 1.1, 1.1, 0, 1.95, 0.7), color: 0x1d2328 },
    { geo: boxAt(1.2, 0.08, 1.2, 0, 2.55, 0.7), color: 0x2f8a3a },
    { geo: cyl(0.07, 0.07, 0.8, 8).translate(0.3, 1.9, -1.6), color: 0x222222 },
    ...[-0.85, 0.85].map(x => ({ geo: cyl(0.85, 0.85, 0.5, 18).rotateZ(Math.PI / 2).translate(x, 0.85, 0.9), color: 0x151515 })),
    ...[-0.75, 0.75].map(x => ({ geo: cyl(0.45, 0.45, 0.3, 14).rotateZ(Math.PI / 2).translate(x, 0.45, -1.5), color: 0x151515 })),
    ...[-0.85, 0.85].map(x => ({ geo: cyl(0.45, 0.45, 0.52, 12).rotateZ(Math.PI / 2).translate(x, 0.85, 0.9), color: 0xe8c21a })),
  ]);
  return { tl, bin, lamp, car, bench, pew, grave, lampBulb, fence, hay, tractor };
}

// Bäume und Felsen (flach schattiert, Vertex-Farben)
function natureGeos() {
  const pine = merge([
    { geo: new THREE.CylinderGeometry(0.22, 0.32, 3, 7).translate(0, 1.5, 0), color: 0x6b4428 },
    { geo: new THREE.ConeGeometry(2.4, 3.6, 8).translate(0, 3.6, 0), color: 0x2f6b34 },
    { geo: new THREE.ConeGeometry(1.9, 3.0, 8).translate(0, 5.3, 0), color: 0x377a3c },
    { geo: new THREE.ConeGeometry(1.3, 2.6, 8).translate(0, 6.9, 0), color: 0x3f8843 },
  ]);
  const oak = merge([
    { geo: new THREE.CylinderGeometry(0.28, 0.4, 3.4, 7).translate(0, 1.7, 0), color: 0x6e4a2c },
    { geo: new THREE.IcosahedronGeometry(2.3, 0).translate(0, 4.6, 0), color: 0x4c8c38 },
    { geo: new THREE.IcosahedronGeometry(1.7, 0).translate(1.3, 4.0, 0.6), color: 0x58993f },
    { geo: new THREE.IcosahedronGeometry(1.6, 0).translate(-1.2, 4.2, -0.7), color: 0x438232 },
  ]);
  const rocks = [];
  for (let v = 0; v < 3; v++) {
    const g = new THREE.IcosahedronGeometry(1, v === 2 ? 1 : 0);
    const p = g.attributes.position;
    const seed = (x, y, z) => Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + v * 11.1) * 43758.5453 % 1;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const f = 0.8 + Math.abs(seed(x, y, z)) * 0.35;
      p.setXYZ(i, x * f, y * f * 0.75, z * f);
    }
    g.computeVertexNormals();
    g.translate(0, 0.35, 0);
    rocks.push(merge([{ geo: g, color: 0x8f8c86 }]));
  }
  const bush = merge([
    { geo: new THREE.IcosahedronGeometry(0.9, 0).translate(0, 0.6, 0), color: 0x3f7f30 },
    { geo: new THREE.IcosahedronGeometry(0.7, 0).translate(0.6, 0.5, 0.2), color: 0x4a8c38 },
  ]);
  const reedParts = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, r = 0.15 + (i % 3) * 0.18, h = 1.4 + (i % 4) * 0.35;
    reedParts.push({ geo: new THREE.ConeGeometry(0.05, h, 4).translate(Math.cos(a) * r, h / 2, Math.sin(a) * r), color: i % 2 ? 0x6f8a3a : 0x8a9a48 });
    if (i % 3 === 0) reedParts.push({ geo: new THREE.CylinderGeometry(0.05, 0.05, 0.3, 5).translate(Math.cos(a) * r, h * 0.85, Math.sin(a) * r), color: 0x5a3a20 });
  }
  const reed = merge(reedParts);
  return { pine, oak, rocks, bush, reed };
}

// ---------- Aufbau ----------

export function buildMap(G) {
  const rng = G.rng, P = G.pieces, W = G.world, L = G.loot, tx = G.tex;
  const info = { buildings: [], church: null, trees: [], rocks: [] };
  const occupied = [];   // Rechtecke, in denen keine Natur/Beute erscheinen soll
  const lootSpots = [];  // [x, y, z]
  const chestSpots = []; // [x, y, z, yaw]
  G.trafficLights = [];
  G.clocks = [];

  const vmat = P._std('vcolor', { vertexColors: true, roughness: 0.8 });
  const vflat = P._std('vflat', { vertexColors: true, roughness: 0.9, flatShading: true });

  // --- Gelände mit Seen und Fluss ---
  buildTerrain(G, tx.grass);
  W.terrain = terrainH;
  W.water = WATER;
  G.boats = [];
  G.beams = [];

  // --- Straßen ---
  const roadParts = [], crossParts = [], zebraParts = [], paveParts = [], walkParts = [];
  for (const c of ROADS) {
    roadParts.push({ geo: quad(c - 4, -68, c + 4, 68, 0.02, (x, z) => [(x - c + 4) / 8, z / 16]) });
    roadParts.push({ geo: quad(-68, c - 4, 68, c + 4, 0.02, (x, z) => [(z - c + 4) / 8, x / 16]) });
  }
  for (const cx of ROADS) for (const cz of ROADS) crossParts.push({ geo: quad(cx - 4, cz - 4, cx + 4, cz + 4, 0.026, (x, z) => [x / 8, z / 8]) });
  roadParts.push({ geo: quad(-114, -4, -68, 4, 0.02, (x, z) => [(z + 4) / 8, x / 16]) });     // zur Siedlung
  roadParts.push({ geo: quad(-122, -36, -114, 60, 0.02, (x, z) => [(x + 122) / 8, z / 16]) }); // Dorfstraße
  roadParts.push({ geo: quad(68, -4, 114, 4, 0.02, (x, z) => [(z + 4) / 8, x / 16]) });        // zum Bauernhof
  crossParts.push({ geo: quad(-122, -4, -114, 4, 0.026, (x, z) => [x / 8, z / 8]) });
  staticMesh(G, merge(roadParts), texMat(tx.road));
  staticMesh(G, merge(crossParts), texMat(tx.asphalt));
  // Zebrastreifen an Kreuzungen mit Ampel
  const lit = [[0, 0], [0, -64], [0, 64], [-64, 0], [64, 0]];
  for (const [cx, cz] of lit) {
    if (cx + 8 <= 68) zebraParts.push({ geo: quad(cx + 4.4, cz - 4, cx + 7.4, cz + 4, 0.032, (x, z) => [(z - cz + 4) / 8, (x - cx - 4.4) / 3]) });
    if (cx - 8 >= -68) zebraParts.push({ geo: quad(cx - 7.4, cz - 4, cx - 4.4, cz + 4, 0.032, (x, z) => [(z - cz + 4) / 8, (x - cx + 7.4) / 3]) });
    if (cz + 8 <= 68) zebraParts.push({ geo: quad(cx - 4, cz + 4.4, cx + 4, cz + 7.4, 0.032, (x, z) => [(x - cx + 4) / 8, (z - cz - 4.4) / 3]) });
    if (cz - 8 >= -68) zebraParts.push({ geo: quad(cx - 4, cz - 7.4, cx + 4, cz - 4.4, 0.032, (x, z) => [(x - cx + 4) / 8, (z - cz + 7.4) / 3]) });
  }
  staticMesh(G, merge(zebraParts), new THREE.MeshStandardMaterial({ map: tx.zebra, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  // Gehwege (0,15 m hoch, begehbar) und gepflasterte Blöcke
  const walk = (x0, z0, x1, z1) => {
    walkParts.push({ geo: boxAt(x1 - x0, 0.15, z1 - z0, (x0 + x1) / 2, 0.075, (z0 + z1) / 2) });
    W.box(x0, 0, z0, x1, 0.15, z1);
  };
  for (const [x0, z0, x1, z1] of BLOCKS) {
    walk(x0 - 4, z0 - 4, x1 + 4, z0);
    walk(x0 - 4, z1, x1 + 4, z1 + 4);
    walk(x0 - 4, z0, x0, z1);
    walk(x1, z0, x1 + 4, z1);
    paveParts.push({ geo: quad(x0, z0, x1, z1, 0.012, (x, z) => [x / 4, z / 4]) });
  }
  walk(68, -72, 72, -4); walk(68, 4, 72, 72); walk(-72, -72, -68, -4); walk(-72, 4, -68, 72);
  walk(-68, 68, 68, 72); walk(-68, -72, 68, -68);
  staticMesh(G, merge(walkParts, { planar: 4, half: 0 }), texMat(tx.sidewalk));
  staticMesh(G, merge(paveParts), texMat(tx.paving));
  occupied.push([-74, -74, 74, 74], [-146, -40, -92, 64], [-116, -7, -72, 7], [72, -7, 114, 7], [108, -20, 152, 32], [95, 92, 121, 117]);

  // --- Gebäude ---
  const floorDecor = [];
  for (const def of [...BUILDINGS, ...SUBURB, ...FARM, HUT]) {
    const tint = def.tint ?? rng.pick(TINTS[def.style]);
    building(G, def, tint, lootSpots, chestSpots, floorDecor);
    if (def.roof) pitchedRoof(G, def, tint);
    info.buildings.push([def.x0, def.z0, def.x0 + def.w * GRID, def.z0 + def.d * GRID, def.style]);
  }
  staticMesh(G, merge(floorDecor), texMat(tx.woodFloor));

  // --- Kirche ---
  church(G, lootSpots, chestSpots);
  info.church = [20, 12, 32, 44];

  // --- Straßenmöbel ---
  const PG = propGeos();
  const pools = {
    tl: P.pool('p-tl', () => ({ geo: PG.tl, mat: vmat, cap: 24 })),
    bulb: P.pool('p-bulb', () => ({ geo: PG.lampBulb, mat: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), cap: 80, shadow: false })),
    bin: P.pool('p-bin', () => ({ geo: PG.bin, mat: vmat, cap: 90 })),
    lamp: P.pool('p-lamp', () => ({ geo: PG.lamp, mat: vmat, cap: 40 })),
    car: P.pool('p-car', () => ({ geo: PG.car, mat: P._std('car', { vertexColors: true, roughness: 0.35, metalness: 0.4 }), cap: 28 })),
    bench: P.pool('p-bench', () => ({ geo: PG.bench, mat: vmat, cap: 16 })),
    pew: P.pool('p-pew', () => ({ geo: PG.pew, mat: vmat, cap: 16 })),
    grave: P.pool('p-grave', () => ({ geo: PG.grave, mat: vmat, cap: 20 })),
    fence: P.pool('p-fence', () => ({ geo: PG.fence, mat: vmat, cap: 70 })),
    hay: P.pool('p-hay', () => ({ geo: PG.hay, mat: vmat, cap: 12 })),
    tractor: P.pool('p-tractor', () => ({ geo: PG.tractor, mat: P._std('tractor', { vertexColors: true, roughness: 0.45, metalness: 0.3 }), cap: 3 })),
  };
  G.propPools = pools;

  // Ampeln
  for (const [cx, cz] of lit) {
    for (const [sx, sz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const x = cx + sx * 5.4, z = cz + sz * 5.4;
      if (Math.abs(x) > 71 || Math.abs(z) > 71) continue;
      const face = sx === sz ? (sz > 0 ? 2 : 3) : (sx > 0 ? 0 : 1);  // Richtung, in die die Lampen zeigen
      const yaw = [Math.PI / 2, -Math.PI / 2, 0, Math.PI][face];
      trafficLight(G, pools, x, z, yaw, face < 2 ? 'x' : 'z');
    }
  }

  // Segmente zwischen Kreuzungen: Mülltonnen, Laternen, Autos
  const segs = [];
  for (const c of ROADS) for (const [a, b] of [[-56, -8], [8, 56]]) { segs.push({ axis: 'x', c, a, b }); segs.push({ axis: 'z', c, a, b }); }
  const BIN_COLS = [0x5a6066, 0x2d5fb5, 0xe2bd2a, 0x7a4a2a, 0x3c8a48];
  segs.forEach((s, n) => {
    const side = n % 2 ? 1 : -1;
    const at = (along, off) => s.axis === 'x' ? [along, s.c + off] : [s.c + off, along];
    // Tonnengruppe am einen Ende
    const cnt = 2 + (rng() < 0.5 ? 1 : 0);
    for (let q = 0; q < cnt; q++) {
      const [x, z] = at(s.a + 3 + q * 0.8, side * 7.1);
      const yaw = s.axis === 'x' ? (side > 0 ? Math.PI : 0) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      trashBin(G, pools, x, z, yaw + Math.PI, BIN_COLS[(n + q) % BIN_COLS.length]);
    }
    // einzelne Tonne am anderen Ende, gegenüber
    {
      const [x, z] = at(s.b - 3, -side * 7.1);
      const yaw = s.axis === 'x' ? (side > 0 ? 0 : Math.PI) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
      trashBin(G, pools, x, z, yaw + Math.PI, rng.pick(BIN_COLS));
    }
    // Laterne in der Mitte
    {
      const [x, z] = at((s.a + s.b) / 2, side * 4.7);
      const yaw = s.axis === 'x' ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
      streetLamp(G, pools, x, z, yaw);
    }
    // parkendes Auto
    if (rng() < 0.6) {
      const along = s.a + 10 + rng() * (s.b - s.a - 20);
      const [x, z] = at(along, side * 2.2);
      const yaw = s.axis === 'x' ? Math.PI / 2 : 0;
      car(G, pools, x, z, yaw + (rng() < 0.5 ? Math.PI : 0), rng.pick([0xc0392b, 0x2e86de, 0xf1c40f, 0xecf0f1, 0x2c3e50, 0x27ae60, 0x7f8c8d, 0xe67e22]));
    }
    // Beute am Straßenrand
    if (n % 3 === 0) { const [x, z] = at((s.a + s.b) / 2 + 6, -side * 6); lootSpots.push([x, 0.15, z]); }
  });

  pews(G, pools);
  suburbProps(G, pools);
  farmProps(G, pools, chestSpots, lootSpots);
  island(G, chestSpots, lootSpots);

  // Kirchplatz: Brunnen, Bänke, Bäume
  fountain(G, 46, 30);
  for (const [x, z, yaw] of [[46, 23.5, 0], [46, 36.5, Math.PI], [39.5, 30, Math.PI / 2], [52.5, 30, -Math.PI / 2]]) bench(G, pools, x, z, yaw);
  trashBin(G, pools, 41, 23.5, 0, 0x3c8a48);
  trashBin(G, pools, 51, 36.5, Math.PI, 0x5a6066);
  // Friedhof hinter der Kirche
  for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) grave(G, pools, 21 + c * 2.4, 47.5 + r * 3.6);

  // --- Natur ---
  const NG = natureGeos();
  const npool = {
    pine: P.pool('n-pine', () => ({ geo: NG.pine, mat: vflat, cap: 420 })),
    oak: P.pool('n-oak', () => ({ geo: NG.oak, mat: vflat, cap: 260 })),
    rocks: NG.rocks.map((g, i) => P.pool('n-rock' + i, () => ({ geo: g, mat: vflat, cap: 60 }))),
    bush: P.pool('n-bush', () => ({ geo: NG.bush, mat: vflat, cap: 140, shadow: false })),
  };
  const trees = [];
  const freeAt = (x, z, r) => {
    if (Math.abs(x) > HALF - 5 || Math.abs(z) > HALF - 5) return false;
    if (shoreDist(x, z) < r + 1.5) return false;
    for (const [x0, z0, x1, z1] of occupied) if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return false;
    for (const t of trees) if ((t[0] - x) ** 2 + (t[1] - z) ** 2 < (r + t[2]) ** 2) return false;
    return true;
  };
  // Waldstücke
  for (let f = 0; f < 9; f++) {
    let cx, cz, tries = 0;
    do { cx = rng.range(-150, 150); cz = rng.range(-150, 150); tries++; } while ((Math.abs(cx) < 95 && Math.abs(cz) < 95) && tries < 50);
    for (let i = 0; i < 16; i++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * 18;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!freeAt(x, z, 2.2)) continue;
      trees.push([x, z, 2.2, rng() < 0.7 ? 'pine' : 'oak']);
    }
  }
  for (let i = 0; i < 400 && trees.length < 230; i++) {
    const x = rng.range(-155, 155), z = rng.range(-155, 155);
    if (!freeAt(x, z, 2.6)) continue;
    trees.push([x, z, 2.6, rng() < 0.55 ? 'pine' : 'oak']);
  }
  // ein paar Bäume in der Stadt (Kirchplatz, Höfe)
  for (const [x, z] of [[40, 13], [53, 13], [40, 49], [53, 49], [12, 20], [12, 44], [-20, -34], [-44, 30], [28, -44], [52, -20], [-11, 20]]) {
    trees.push([x, z, 2, 'oak', true]);
  }
  // Gärten der Siedlung, Hof und Insel
  for (const [x, z] of [[-146, -24], [-146, 12], [-146, 30], [-92, -20], [-92, 24], [-92, 40], [104, 117], [117, 108], [100, 98], [148, -10]]) trees.push([x, z, 2, 'oak', true]);
  for (const [x, z] of [[96, 112], [118, 114]]) trees.push([x, z, 2, 'pine', true]);
  for (const [x, z, , kind] of trees) tree(G, npool, x, z, kind, rng);
  info.trees = trees.map(t => [t[0], t[1]]);
  // Felsen
  const rocks = [];
  for (let i = 0; i < 300 && rocks.length < 60; i++) {
    const x = rng.range(-150, 150), z = rng.range(-150, 150);
    if (!freeAt(x, z, 3)) continue;
    trees.push([x, z, 3]);
    rocks.push([x, z]);
    rock(G, npool, x, z, rng);
  }
  info.rocks = rocks;
  // Büsche (nur Deko)
  for (let i = 0; i < 300 && i < 1000; i++) {
    const x = rng.range(-155, 155), z = rng.range(-155, 155);
    if (!freeAt(x, z, 1.2)) continue;
    npool.bush.add(mat4(x, 0, z, rng() * 6, 0.8 + rng() * 0.6), [0.85 + rng() * 0.3, 0.9 + rng() * 0.2, 0.85]);
    if (npool.bush.n >= 120) break;
  }
  // Schilf an den Seeufern (Deko)
  const reeds = P.pool('n-reed', () => ({ geo: NG.reed, mat: vflat, cap: 160, shadow: false }));
  for (const Lk of LAKES) {
    const n = Math.round(Lk.r * 1.3);
    for (let i = 0; i < n; i++) {
      if (rng() < 0.35) continue;
      const a = rng() * Math.PI * 2, rr = Lk.r - 0.5 + rng() * 1.5;
      const x = Lk.x + Math.cos(a) * rr, z = Lk.z + Math.sin(a) * rr;
      reeds.add(mat4(x, terrainH(x, z) - 0.1, z, rng() * 6, 0.8 + rng() * 0.5), [0.9 + rng() * 0.2, 0.9 + rng() * 0.2, 0.8]);
    }
  }
  // Waldrand außerhalb der Karte (Deko)
  for (let i = 0; i < 160; i++) {
    const side = i % 4, t = rng.range(-175, 175), off = HALF + 6 + rng() * 22;
    const x = side === 0 ? off : side === 1 ? -off : t, z = side === 2 ? off : side === 3 ? -off : t;
    const kind = rng() < 0.7 ? 'pine' : 'oak';
    npool[kind].add(mat4(x, 0, z, rng() * 6, 1 + rng() * 0.5), [0.8 + rng() * 0.2, 0.85 + rng() * 0.2, 0.8]);
  }

  // --- Truhen und Beute ---
  // Natur: neben Bäumen/Felsen und auf Lichtungen
  for (let i = 0; i < 16; i++) {
    const t = rng.pick(trees.filter(t => !t[4]));
    const a = rng() * Math.PI * 2;
    const x = t[0] + Math.cos(a) * (t[2] + 0.6), z = t[1] + Math.sin(a) * (t[2] + 0.6);
    if (Math.abs(x) > HALF - 6 || Math.abs(z) > HALF - 6 || shoreDist(x, z) < 2) continue;
    chestSpots.push([x, 0, z, Math.atan2(t[0] - x, t[1] - z) + Math.PI]);
  }
  // Bodenbeute (schlechte Waffen) – mehr Plätze
  for (let i = 0; i < 600 && lootSpots.length < 95; i++) {
    const x = rng.range(-150, 150), z = rng.range(-150, 150);
    if (!freeAt(x, z, 1.5)) continue;
    lootSpots.push([x, 0, z]);
  }
  for (const [x, y, z, yaw] of chestSpots) L.addChest(x, y, z, Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2));
  for (const [x, y, z] of lootSpots) {
    const items = floorLoot(rng);
    items.forEach((it, i) => { const p = L.spawn(it, x + i * 0.7, y + 0.3, z); p.settled = false; p.floor = true; });
  }

  // --- Kartenrand ---
  const E = HALF;
  W.box(-E - 2, -10, -E - 2, E + 2, 400, -E);
  W.box(-E - 2, -10, E, E + 2, 400, E + 2);
  W.box(-E - 2, -10, -E, -E, 400, E);
  W.box(E, -10, -E, E + 2, 400, E);

  info.chests = chestSpots.map(c => [c[0], c[2]]);
  info.roads = [[-114, -4, -68, 4], [-122, -36, -114, 60], [68, -4, 114, 4]];
  return info;
}

// ---------- Einzelteile ----------

function building(G, def, tint, lootSpots, chestSpots, floorDecor) {
  const rng = G.rng, P = G.pieces;
  const { x0, z0, w, d, floors, style } = def;
  const S = STYLES[style];
  const i0 = x0 / GRID, k0 = z0 / GRID;
  // Treppen: abwechselnd hinten rechts (+x) und davor (−x)
  const ramps = [];
  for (let j = 0; j < floors - 1; j++) ramps.push(j % 2 === 0 ? { ix: w - 2, iz: d - 1, dir: 0 } : { ix: w - 2, iz: d - 2, dir: 1 });
  const isRamp0 = (ix, iz) => ramps.length && ramps[0].ix === ix && ramps[0].iz === iz;
  // Türen: Hauptseite + gegenüber
  const opposite = { '+x': '-x', '-x': '+x', '+z': '-z', '-z': '+z' };
  const doors = {};
  for (const side of [def.door, opposite[def.door]]) {
    const n = side.endsWith('x') ? d : w;
    const order = [Math.floor(n / 2), Math.floor(n / 2) - 1, Math.floor(n / 2) + 1, 0, n - 1].filter(v => v >= 0 && v < n);
    for (const c of order) {
      const cell = side === '-z' ? [c, 0] : side === '+z' ? [c, d - 1] : side === '-x' ? [0, c] : [w - 1, c];
      if (!isRamp0(cell[0], cell[1])) { doors[side] = c; break; }
    }
  }
  const variantFor = (side, c, j) => {
    if (j === 0 && doors[side] === c) return 'door';
    if (style === 'office') return 'window';
    return rng() < (j === 0 ? 0.5 : 0.75) ? 'window' : 'solid';
  };
  const wall = (axis, i, j, k, yaw, variant) => P.addWall({
    axis, i, j, k, yaw, variant, pool: P.cityWallPool(style, variant), hp: S.hp, name: S.name,
    yieldMat: S.mat, yieldHit: 6, color: tint, debris: DEBRIS[S.mat], sound: S.mat,
  });
  for (let j = 0; j < floors; j++) {
    for (let ix = 0; ix < w; ix++) {
      wall('x', i0 + ix, j, k0, Math.PI, variantFor('-z', ix, j));
      wall('x', i0 + ix, j, k0 + d, 0, variantFor('+z', ix, j));
    }
    for (let iz = 0; iz < d; iz++) {
      wall('z', i0, j, k0 + iz, -Math.PI / 2, variantFor('-x', iz, j));
      wall('z', i0 + w, j, k0 + iz, Math.PI / 2, variantFor('+x', iz, j));
    }
  }
  for (let j = 1; j <= floors; j++) {
    const roof = j === floors;
    const hole = !roof && ramps[j - 1];
    for (let ix = 0; ix < w; ix++) for (let iz = 0; iz < d; iz++) {
      if (hole && hole.ix === ix && hole.iz === iz) continue;
      P.addFloor({
        i: i0 + ix, j, k: k0 + iz, pool: P.cityFloorPool(style, roof), hp: S.hp, name: roof ? 'Dach' : 'Decke',
        yieldMat: S.mat, yieldHit: 6, color: tint, debris: DEBRIS[S.mat], sound: S.mat,
      });
    }
  }
  ramps.forEach((r, j) => P.addRamp({
    i: i0 + r.ix, j, k: k0 + r.iz, dir: r.dir, pool: P.stairPool(), hp: 200, name: 'Treppe', yieldMat: 'holz', yieldHit: 5, debris: DEBRIS.holz, sound: 'holz',
  }));
  floorDecor.push({ geo: quad(x0, z0, x0 + w * GRID, z0 + d * GRID, 0.03, (x, z) => [x / 4, z / 4]) });
  // Beute: pro Stockwerk eine Truhe (meist) und etwas Bodenbeute
  const blocked = (ix, iz, j) => ramps.some((r, rj) => r.ix === ix && r.iz === iz && (rj === j || rj === j - 1));
  for (let j = 0; j < floors; j++) {
    const y = j === 0 ? 0 : j * GRID + 0.2;
    const cells = [];
    for (let ix = 0; ix < w; ix++) for (let iz = 0; iz < d; iz++) if (!blocked(ix, iz, j)) cells.push([ix, iz]);
    if (!cells.length) continue;
    if (rng() < 0.8) {
      const [ix, iz] = cells.splice(Math.floor(rng() * cells.length), 1)[0];
      // an eine Außenwand rücken, wenn möglich
      let x = x0 + ix * GRID + 2, z = z0 + iz * GRID + 2, yaw = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      if (iz === 0) { z = z0 + 0.8; yaw = Math.PI; }
      else if (iz === d - 1) { z = z0 + d * GRID - 0.8; yaw = 0; }
      else if (ix === 0) { x = x0 + 0.8; yaw = Math.PI / 2; }
      else if (ix === w - 1) { x = x0 + w * GRID - 0.8; yaw = -Math.PI / 2; }
      chestSpots.push([x, y, z, yaw]);
    }
    if (cells.length && rng() < 0.7) {
      const [ix, iz] = cells[Math.floor(rng() * cells.length)];
      lootSpots.push([x0 + ix * GRID + 2, y, z0 + iz * GRID + 2]);
    }
  }
}

function church(G, lootSpots, chestSpots) {
  const P = G.pieces, W = G.world, tx = G.tex;
  const S = STYLES.church;
  const wall = (axis, i, j, k, yaw, variant) => P.addWall({
    axis, i, j, k, yaw, variant, pool: P.cityWallPool('church', variant), hp: S.hp, name: S.name,
    yieldMat: 'stein', yieldHit: 6, debris: DEBRIS.stein, sound: 'stein',
  });
  const floor = (i, j, k, roof) => P.addFloor({
    i, j, k, pool: P.cityFloorPool('church', roof), hp: S.hp, name: roof ? 'Turmdach' : 'Turmboden', yieldMat: 'stein', yieldHit: 6, debris: DEBRIS.stein, sound: 'stein',
  });
  // Turm: x 20..32 (i 5..7), z 12..20 (k 3..4), 6 Stockwerke
  for (let j = 0; j < 6; j++) {
    for (let ix = 0; ix < 3; ix++) {
      wall('x', 5 + ix, j, 3, Math.PI, j === 5 ? 'bigdoor' : j === 0 && ix === 1 ? 'bigdoor' : 'solid');
      const back = j === 0 ? (ix === 1 ? 'solid' : 'door') : j === 5 ? 'bigdoor' : 'solid';
      wall('x', 5 + ix, j, 5, 0, back);
    }
    for (let iz = 0; iz < 2; iz++) {
      wall('z', 5, j, 3 + iz, -Math.PI / 2, j === 5 ? 'bigdoor' : 'solid');
      wall('z', 8, j, 3 + iz, Math.PI / 2, j === 5 ? 'bigdoor' : 'solid');
    }
  }
  // Wendel aus Rampen: gerade Stockwerke (1,1) Richtung +x, ungerade (1,0) Richtung −x
  for (let j = 0; j < 5; j++) {
    const r = j % 2 === 0 ? { ix: 1, iz: 1, dir: 0 } : { ix: 1, iz: 0, dir: 1 };
    P.addRamp({ i: 5 + r.ix, j, k: 3 + r.iz, dir: r.dir, pool: P.stairPool(), hp: 250, name: 'Treppe', yieldMat: 'holz', yieldHit: 5, debris: DEBRIS.holz, sound: 'holz' });
  }
  for (let j = 1; j <= 6; j++) for (let ix = 0; ix < 3; ix++) for (let iz = 0; iz < 2; iz++) {
    if (j < 6) { const below = (j - 1) % 2 === 0 ? [1, 1] : [1, 0]; if (ix === below[0] && iz === below[1]) continue; }
    floor(5 + ix, j, 3 + iz, j === 6);
  }
  // Kirchenschiff: x 20..32, z 20..44 (k 5..10), zwei Stockwerke hoch, ohne Zwischendecke
  for (let iz = 0; iz < 6; iz++) {
    wall('z', 5, 0, 5 + iz, -Math.PI / 2, 'winlow');
    wall('z', 5, 1, 5 + iz, -Math.PI / 2, 'window');
    wall('z', 8, 0, 5 + iz, Math.PI / 2, iz === 4 ? 'door' : 'winlow');
    wall('z', 8, 1, 5 + iz, Math.PI / 2, 'window');
  }
  for (let ix = 0; ix < 3; ix++) {
    wall('x', 5 + ix, 0, 11, 0, 'solid');
    wall('x', 5 + ix, 1, 11, 0, ix === 1 ? 'window' : 'solid');
  }
  // Satteldach (zwei zerstörbare Schrägen)
  const rt = tx.roofTiles.clone(); rt.repeat.set(2, 6); rt.needsUpdate = true;
  const roofPool = P.pool('church-roof', () => ({ geo: new THREE.BoxGeometry(8.6, 0.3, 24.8).translate(0, -0.15, 0), mat: P._std('church-roof', { map: rt }), cap: 4 }));
  const th = Math.atan2(5, 6);
  P.create({ kind: 'roof', name: 'Kirchendach', hp: 900, yieldMat: 'stein', yieldHit: 6, debris: 0x9a4630, sound: 'stein',
    parts: [{ pool: roofPool, m: mat4(23, 10.5, 32, 0, 1, 1, 1, 0, th) }], slopes: [[20, 20, 26, 44, 8, 5, 0, 1]], center: new THREE.Vector3(23, 10.5, 32) });
  P.create({ kind: 'roof', name: 'Kirchendach', hp: 900, yieldMat: 'stein', yieldHit: 6, debris: 0x9a4630, sound: 'stein',
    parts: [{ pool: roofPool, m: mat4(29, 10.5, 32, 0, 1, 1, 1, 0, -th) }], slopes: [[26, 20, 32, 44, 8, 5, 0, -1]], center: new THREE.Vector3(29, 10.5, 32) });
  // Giebel hinten (Deko)
  const gable = new THREE.Shape([new THREE.Vector2(-6, 0), new THREE.Vector2(6, 0), new THREE.Vector2(0, 5)]);
  const gg = new THREE.ExtrudeGeometry(gable, { depth: 0.25, bevelEnabled: false });
  const ct = tx.church.clone(); ct.repeat.set(0.25, 0.25); ct.needsUpdate = true;
  staticMesh(G, gg.translate(26, 8, 43.875), texMat(ct), { shadow: true });
  // Turmspitze und Kreuz
  const spire = new THREE.ConeGeometry(4 * Math.SQRT2, 12, 4).rotateY(Math.PI / 4).scale(1.5, 1, 1).translate(26, 30.2, 16);
  staticMesh(G, spire, new THREE.MeshStandardMaterial({ color: 0x4f7d6a, roughness: 0.6, metalness: 0.3, flatShading: true }), { shadow: true });
  W.box(21.5, 24, 13, 30.5, 28, 19);
  const gold = new THREE.MeshStandardMaterial({ color: 0xe6b422, roughness: 0.3, metalness: 0.8, emissive: 0x332200 });
  staticMesh(G, merge([{ geo: boxAt(0.25, 3, 0.25, 26, 37.5, 16) }, { geo: boxAt(1.6, 0.25, 0.25, 26, 38.3, 16) }]), gold, { shadow: true });
  // Glocke
  const bell = new THREE.LatheGeometry([new THREE.Vector2(0, 1.3), new THREE.Vector2(0.35, 1.25), new THREE.Vector2(0.55, 0.8), new THREE.Vector2(0.75, 0.15), new THREE.Vector2(0.9, 0)], 16).translate(26, 21.6, 16);
  staticMesh(G, bell, new THREE.MeshStandardMaterial({ color: 0xb8862b, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide }), { shadow: true });
  // Turmuhren (zeigen die echte Uhrzeit)
  const clockMat = new THREE.MeshBasicMaterial({ map: tx.clock, transparent: true });
  const handMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  for (const [x, z, yaw] of [[26, 11.84, Math.PI], [19.84, 16, -Math.PI / 2], [32.16, 16, Math.PI / 2]]) {
    const g = new THREE.Group();
    g.position.set(x, 18, z);
    g.rotation.y = yaw;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), clockMat);
    const hourH = new THREE.Mesh(boxAt(0.12, 0.75, 0.03, 0, 0.32, 0), handMat);
    const minH = new THREE.Mesh(boxAt(0.08, 1.1, 0.03, 0, 0.5, 0), handMat);
    hourH.position.z = minH.position.z = 0.03;
    g.add(face, hourH, minH);
    G.mapGroup.add(g);
    G.clocks.push({ hour: hourH, min: minH });
  }
  // Innenraum: Fliesen, Bänke, Altar
  staticMesh(G, quad(20, 12, 32, 44, 0.03, (x, z) => [x / 4, z / 4]), texMat(tx.tiles));
  const altarMat = new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: 0.8 });
  staticMesh(G, boxAt(3, 1.1, 1.2, 26, 0.55, 41.6), altarMat, { shadow: true });
  staticMesh(G, boxAt(3.1, 0.06, 1.3, 26, 1.12, 41.6), new THREE.MeshStandardMaterial({ color: 0xb02a2a, roughness: 0.9 }));
  W.box(24.5, 0, 41, 27.5, 1.1, 42.2);
  staticMesh(G, merge([{ geo: boxAt(0.3, 3.2, 0.12, 26, 4.8, 43.8) }, { geo: boxAt(1.8, 0.3, 0.12, 26, 5.6, 43.8) }]), gold);
  const candle = new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0x332a10 });
  const flame = new THREE.MeshBasicMaterial({ color: 0xffc04a });
  for (const x of [25, 27]) {
    staticMesh(G, new THREE.CylinderGeometry(0.05, 0.05, 0.35, 8).translate(x, 1.32, 41.6), candle);
    staticMesh(G, new THREE.SphereGeometry(0.05, 6, 6).scale(1, 1.8, 1).translate(x, 1.56, 41.6), flame, { receive: false });
  }
  chestSpots.push([26, 0, 39.9, 0]);
  chestSpots.push([22.2, 20.2, 13.4, Math.PI]);
  lootSpots.push([30, 8.2, 14.5]);
  lootSpots.push([26, 0, 27.6]);
}

function trafficLight(G, pools, x, z, yaw, axis) {
  const P = G.pieces;
  const parts = [{ pool: pools.tl, m: mat4(x, 0.15, z, yaw) }];
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const lamps = [];
  for (const [y, col] of [[3.38, OFF.r], [3.05, OFF.y], [2.72, OFF.g]]) {
    const lx = x + 0.17 * s, lz = z + 0.17 * c;
    const p = { pool: pools.bulb, m: mat4(lx, y + 0.15, lz), color: new THREE.Color(...col) };
    parts.push(p);
    lamps.push(p);
  }
  const pc = P.create({
    kind: 'prop', name: 'Ampel', hp: 150, yieldMat: 'metall', yieldHit: 6, bonus: 6, debris: 0x55595e, sound: 'metall',
    parts, boxes: [[x - 0.14, 0.15, z - 0.14, x + 0.14, 3.8, z + 0.14]], center: new THREE.Vector3(x, 2, z),
  });
  G.trafficLights.push({ pc, axis, lamps: pc.parts.slice(1), state: '' });
}

export const OFF = { r: [0.22, 0.04, 0.03], y: [0.22, 0.17, 0.03], g: [0.03, 0.18, 0.08] };
export const ON = { r: [1, 0.1, 0.06], y: [1, 0.72, 0.05], g: [0.15, 1, 0.45] };

// Ampelphasen (20 s): z grün 0–7, gelb 7–9, rot 9–19, rot-gelb 19–20; x versetzt um 10 s
export function updateTrafficLights(G, time) {
  for (const t of G.trafficLights) {
    if (t.pc.dead) continue;
    const ph = ((time + (t.axis === 'x' ? 10 : 0)) % 20 + 20) % 20;
    const st = ph < 7 ? 'g' : ph < 9 ? 'y' : ph < 19 ? 'r' : 'ry';
    if (st === t.state) continue;
    t.state = st;
    const on = { r: st === 'r' || st === 'ry', y: st === 'y' || st === 'ry', g: st === 'g' };
    ['r', 'y', 'g'].forEach((k, i) => {
      const part = t.lamps[i];
      part.color.setRGB(...(on[k] ? ON[k] : OFF[k]));
      part.pool.setColor(part.idx, part.color);
    });
  }
}

function trashBin(G, pools, x, z, yaw, color) {
  G.pieces.create({
    kind: 'prop', name: 'Mülltonne', hp: 90, yieldMat: 'metall', yieldHit: 6, bonus: 4, debris: color, sound: 'metall',
    parts: [{ pool: pools.bin, m: mat4(x, 0.15, z, yaw), color }],
    boxes: [[x - 0.36, 0.15, z - 0.36, x + 0.36, 1.18, z + 0.36]], center: new THREE.Vector3(x, 0.7, z),
  });
}

function streetLamp(G, pools, x, z, yaw) {
  G.pieces.create({
    kind: 'prop', name: 'Laterne', hp: 150, yieldMat: 'metall', yieldHit: 6, bonus: 6, debris: 0x4a4f55, sound: 'metall',
    parts: [{ pool: pools.lamp, m: mat4(x, 0.15, z, yaw) }],
    boxes: [[x - 0.14, 0.15, z - 0.14, x + 0.14, 6.3, z + 0.14]], center: new THREE.Vector3(x, 3, z),
  });
}

function car(G, pools, x, z, yaw, color) {
  const along = Math.abs(Math.sin(yaw)) > 0.5;   // Längsachse entlang x
  const hx = along ? 2.1 : 0.93, hz = along ? 0.93 : 2.1;
  G.pieces.create({
    kind: 'prop', name: 'Auto', hp: 450, yieldMat: 'metall', yieldHit: 10, bonus: 15, debris: color, sound: 'metall',
    parts: [{ pool: pools.car, m: mat4(x, 0.02, z, yaw), color }],
    boxes: [[x - hx, 0, z - hz, x + hx, 0.95, z + hz], [x - hx * 0.55, 0.95, z - hz * 0.8, x + hx * 0.55, 1.55, z + hz * 0.8]],
    center: new THREE.Vector3(x, 0.8, z),
  });
}

function bench(G, pools, x, z, yaw) {
  const s = Math.abs(Math.sin(yaw)) > 0.5;
  const hx = s ? 0.3 : 0.9, hz = s ? 0.9 : 0.3;
  G.pieces.create({
    kind: 'prop', name: 'Bank', hp: 80, yieldMat: 'holz', yieldHit: 5, bonus: 4, debris: 0x8a5a30, sound: 'holz',
    parts: [{ pool: pools.bench, m: mat4(x, 0, z, yaw) }],
    boxes: [[x - hx, 0, z - hz, x + hx, 0.5, z + hz]], center: new THREE.Vector3(x, 0.5, z),
  });
}

function grave(G, pools, x, z) {
  G.pieces.create({
    kind: 'prop', name: 'Grabstein', hp: 60, yieldMat: 'stein', yieldHit: 4, bonus: 3, debris: 0x8d8d88, sound: 'stein',
    parts: [{ pool: pools.grave, m: mat4(x, 0, z, Math.PI) }],
    boxes: [[x - 0.35, 0, z - 0.1, x + 0.35, 1.2, z + 0.1]], center: new THREE.Vector3(x, 0.6, z),
  });
}

// Kirchenbänke (zerstörbar), zwei Reihen mit Mittelgang
function pews(G, pools) {
  for (let r = 0; r < 6; r++) for (const x of [22.6, 29.4]) {
    const z = 24 + r * 2.5;
    G.pieces.create({
      kind: 'prop', name: 'Kirchenbank', hp: 100, yieldMat: 'holz', yieldHit: 4, bonus: 4, debris: 0x6b4022, sound: 'holz',
      parts: [{ pool: pools.pew, m: mat4(x, 0, z, 0) }],
      boxes: [[x - 1.6, 0, z - 0.25, x + 1.6, 0.55, z + 0.3]], center: new THREE.Vector3(x, 0.5, z),
    });
  }
}

function fountain(G, x, z) {
  const stone = new THREE.MeshStandardMaterial({ color: 0xb9b2a4, roughness: 0.85 });
  staticMesh(G, new THREE.CylinderGeometry(3.3, 3.5, 0.6, 28, 1, true).translate(x, 0.3, z), new THREE.MeshStandardMaterial({ color: 0xb9b2a4, roughness: 0.85, side: THREE.DoubleSide }), { shadow: true });
  staticMesh(G, new THREE.RingGeometry(3.05, 3.35, 28).rotateX(-Math.PI / 2).translate(x, 0.6, z), stone);
  staticMesh(G, new THREE.CircleGeometry(3.1, 28).rotateX(-Math.PI / 2).translate(x, 0.45, z), new THREE.MeshStandardMaterial({ color: 0x3f8fc0, roughness: 0.15, metalness: 0.2, emissive: 0x0a2233 }));
  staticMesh(G, new THREE.CylinderGeometry(0.35, 0.5, 2, 12).translate(x, 1, z), stone, { shadow: true });
  staticMesh(G, new THREE.CylinderGeometry(1.1, 0.4, 0.4, 16).translate(x, 2.1, z), stone, { shadow: true });
  G.world.box(x - 3.3, 0, z - 3.3, x + 3.3, 0.6, z + 3.3);
  G.world.box(x - 0.45, 0.6, z - 0.45, x + 0.45, 2.3, z + 0.45);
  G.fountainPos = new THREE.Vector3(x, 2.3, z);
}

function tree(G, npool, x, z, kind, rng) {
  const s = 0.85 + rng() * 0.45;
  const tint = [0.85 + rng() * 0.25, 0.85 + rng() * 0.25, 0.85 + rng() * 0.15];
  const tr = 0.35 * s;
  G.pieces.create({
    kind: 'tree', name: kind === 'pine' ? 'Tanne' : 'Laubbaum', hp: 260, yieldMat: 'holz', yieldHit: 8, bonus: 12, nature: true,
    debris: 0x3f7a3a, sound: 'holz',
    parts: [{ pool: npool[kind], m: mat4(x, 0, z, rng() * 6, s), color: tint }],
    boxes: [[x - tr, 0, z - tr, x + tr, 6 * s, z + tr]], center: new THREE.Vector3(x, 2, z),
  });
}

function rock(G, npool, x, z, rng) {
  const sx = 1.4 + rng() * 1.3, sy = 1.0 + rng() * 0.9, sz = 1.4 + rng() * 1.3;
  const v = Math.floor(rng() * 3);
  const r = Math.max(sx, sz) * 0.72;
  const g = 0.85 + rng() * 0.25;
  G.pieces.create({
    kind: 'rock', name: 'Fels', hp: 380, yieldMat: 'stein', yieldHit: 7, bonus: 10, nature: true, debris: 0x8f8c86, sound: 'stein',
    parts: [{ pool: npool.rocks[v], m: mat4(x, 0, z, rng() * 6, sx, sy, sz), color: [g, g, g] }],
    boxes: [[x - r, 0, z - r, x + r, (0.35 + 0.75) * sy * 0.95, z + r]], center: new THREE.Vector3(x, 0.8 * sy, z),
  });
}

// ---------- Satteldach ----------

function pitchedRoof(G, def, tint) {
  const P = G.pieces, W = G.world;
  const x0 = def.x0, z0 = def.z0, x1 = x0 + def.w * GRID, z1 = z0 + def.d * GRID;
  const alongX = def.w > def.d;                       // First entlang der längeren Seite
  const len = (alongX ? def.w : def.d) * GRID, span = (alongX ? def.d : def.w) * GRID;
  const half = span / 2, rise = Math.min(4, half * 0.6), slope = Math.hypot(half, rise);
  const th = Math.atan2(rise, half);
  const y = def.floors * GRID + 0.2;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const pool = P.pool(`roof-${len}x${span}`, () => {
    const t = G.tex.roofTiles.clone();
    t.repeat.set(slope / 4, len / 4);
    t.needsUpdate = true;
    return { geo: new THREE.BoxGeometry(slope + 0.7, 0.3, len + 0.8).translate(0, -0.15, 0), mat: P._std(`roof-${len}x${span}`, { map: t }), cap: 24 };
  });
  const S = STYLES[def.style];
  const mk = (px, pz, ry, rz, sl) => P.create({
    kind: 'roof', name: 'Dach', hp: 320, yieldMat: S.mat, yieldHit: 5, debris: 0x9a4630, sound: 'stein',
    parts: [{ pool, m: mat4(px, y + rise / 2, pz, ry, 1, 1, 1, 0, rz) }], slopes: [sl], center: new THREE.Vector3(px, y + rise / 2, pz),
  });
  if (!alongX) {
    mk(cx - half / 2, cz, 0, th, [x0, z0, cx, z1, y, rise, 0, 1]);
    mk(cx + half / 2, cz, 0, -th, [cx, z0, x1, z1, y, rise, 0, -1]);
  } else {
    mk(cx, cz - half / 2, Math.PI / 2, -th, [x0, z0, x1, cz, y, rise, 2, 1]);
    mk(cx, cz + half / 2, Math.PI / 2, th, [x0, cz, x1, z1, y, rise, 2, -1]);
  }
  // Giebeldreiecke
  const tri = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, rise)]);
  const col = new THREE.Color(S.edge).multiply(new THREE.Color(tint));
  const gm = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 });
  for (const end of [0, 1]) {
    const g = new THREE.ExtrudeGeometry(tri, { depth: 0.25, bevelEnabled: false });
    if (!alongX) g.translate(cx, y, end ? z1 - 0.25 : z0);
    else g.rotateY(Math.PI / 2).translate(end ? x1 - 0.25 : x0, y, cz);
    staticMesh(G, g, gm, { shadow: true });
  }
  void W;
}

// ---------- Siedlung ----------

function suburbProps(G, pools) {
  const rng = G.rng;
  const BIN_COLS = [0x5a6066, 0x2d5fb5, 0xe2bd2a, 0x7a4a2a];
  for (const h of SUBURB) {
    const front = h.door === '+x' ? h.x0 + 12 + 1.2 : h.x0 - 1.2;
    trashBin(G, pools, front, h.z0 + 1.5, h.door === '+x' ? -Math.PI / 2 : Math.PI / 2, rng.pick(BIN_COLS));
    trashBin(G, pools, front, h.z0 + 2.4, h.door === '+x' ? -Math.PI / 2 : Math.PI / 2, rng.pick(BIN_COLS));
    // Gartenzaun an der Rückseite
    const back = h.door === '+x' ? h.x0 - 4 : h.x0 + 16;
    for (let z = h.z0 + 2; z < h.z0 + 12; z += 4) fence(G, pools, back, z, Math.PI / 2);
  }
  for (const z of [-24, 8, 36, 54]) streetLamp(G, pools, -123.2, z, Math.PI / 2);
  for (const [z, yaw, col] of [[-6.5, 0, 0x2e86de], [24, Math.PI, 0xc0392b], [46, 0, 0x7f8c8d]]) car(G, pools, -115.8, z, yaw, col);
}

// ---------- Bauernhof ----------

function farmProps(G, pools, chestSpots, lootSpots) {
  // Silo
  const silo = new THREE.MeshStandardMaterial({ color: 0xb8c2c8, metalness: 0.6, roughness: 0.4 });
  staticMesh(G, cyl(2.6, 2.6, 13, 20).translate(142, 6.5, 14), silo, { shadow: true });
  staticMesh(G, new THREE.SphereGeometry(2.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(142, 13, 14), silo, { shadow: true });
  G.world.box(140, 0, 12, 144, 14.5, 16);
  // Heuballen, Traktor, Zaun
  for (const [x, z, yaw] of [[131, -7, 0], [133.5, -6.5, 0.3], [138, -3, 1.2], [128, 25, 0.1], [131, 26, 1.5], [146, 24, 0.6]]) {
    G.pieces.create({
      kind: 'prop', name: 'Heuballen', hp: 90, yieldMat: 'holz', yieldHit: 6, bonus: 4, debris: 0xd9b860, sound: 'holz',
      parts: [{ pool: pools.hay, m: mat4(x, 0, z, yaw) }], boxes: [[x - 0.75, 0, z - 0.75, x + 0.75, 1.5, z + 0.75]], center: new THREE.Vector3(x, 0.75, z),
    });
  }
  G.pieces.create({
    kind: 'prop', name: 'Traktor', hp: 400, yieldMat: 'metall', yieldHit: 10, bonus: 15, debris: 0x2f8a3a, sound: 'metall',
    parts: [{ pool: pools.tractor, m: mat4(126, 0, 1, Math.PI / 2) }],
    boxes: [[124.4, 0, 0.3, 127.6, 1.4, 1.7], [125.2, 1.4, 0.4, 126.8, 2.6, 1.6]], center: new THREE.Vector3(126, 1, 1),
  });
  for (let x = 114; x < 150; x += 4) fence(G, pools, x, -18, 0);
  for (let z = -16; z < 32; z += 4) if (z < -6 || z > 6) fence(G, pools, 150, z, Math.PI / 2);
  chestSpots.push([136, 0, -7, Math.PI], [145.5, 0, 18, -Math.PI / 2]);
  lootSpots.push([124, 0, 2.5], [140, 0, 24]);
}

function fence(G, pools, x, z, yaw) {
  const along = Math.abs(Math.sin(yaw)) > 0.5;   // gedreht → entlang z
  const hx = along ? 0.12 : 2, hz = along ? 2 : 0.12;
  G.pieces.create({
    kind: 'prop', name: 'Zaun', hp: 70, yieldMat: 'holz', yieldHit: 4, bonus: 3, debris: 0x8f6a3f, sound: 'holz',
    parts: [{ pool: pools.fence, m: mat4(x, 0, z, yaw) }], boxes: [[x - hx, 0, z - hz, x + hx, 1.1, z + hz]], center: new THREE.Vector3(x, 0.6, z),
  });
}

// ---------- Insel im Inselsee: Leuchtturm, Fischerhütte, Steg, Ruderboot ----------

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const x = c.getContext('2d');
  for (let i = 0; i < 6; i++) { x.fillStyle = i % 2 ? '#f2f0ea' : '#c7302a'; x.fillRect(0, i * 256 / 6, 64, 256 / 6 + 1); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function island(G, chestSpots, lootSpots) {
  const W = G.world;
  const LX = ISLAND.x + 5, LZ = ISLAND.z - 8;                  // Leuchtturm
  const st = new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.6 });
  staticMesh(G, cyl(1.85, 2.45, 15, 24).translate(LX, 7.5, LZ), st, { shadow: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.5, metalness: 0.4 });
  staticMesh(G, cyl(2.5, 2.5, 0.3, 24).translate(LX, 15.15, LZ), dark, { shadow: true });
  staticMesh(G, cyl(1.35, 1.35, 1.8, 16).translate(LX, 16.2, LZ), new THREE.MeshStandardMaterial({ color: 0xfff1b0, emissive: 0xffd34a, emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }));
  staticMesh(G, new THREE.ConeGeometry(1.6, 1.4, 16).translate(LX, 17.8, LZ), new THREE.MeshStandardMaterial({ color: 0xa82822, roughness: 0.5 }), { shadow: true });
  staticMesh(G, boxAt(1.2, 2.2, 0.2, LX, 1.1, LZ + 2.35), new THREE.MeshStandardMaterial({ color: 0x3d2a1a }));
  W.box(LX - 2.2, 0, LZ - 2.2, LX + 2.2, 15.3, LZ + 2.2);
  // drehender Lichtkegel
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.2, 34, 16, 1, true).translate(0, -17, 0).rotateZ(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.set(LX, 16.2, LZ);
  G.mapGroup.add(beam);
  G.beams.push(beam);
  // Steg nach Westen mit Leiter am Ende
  const deckTex = G.tex.woodFloor.clone(); deckTex.repeat.set(4, 1); deckTex.needsUpdate = true;
  const DX0 = 80, DX1 = ISLAND.x - ISLAND.r + 1.5, DZ = ISLAND.z;
  staticMesh(G, boxAt(DX1 - DX0, 0.25, 2.4, (DX0 + DX1) / 2, 0.22, DZ), new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.9 }), { shadow: true });
  W.box(DX0, 0.1, DZ - 1.2, DX1, 0.35, DZ + 1.2);
  const posts = [];
  for (let x = DX0 + 0.3; x < DX1; x += 2.5) for (const dz of [-1.1, 1.1]) posts.push({ geo: cyl(0.12, 0.12, 4, 6).translate(x, -1.8, DZ + dz) });
  for (let y = -1.7; y < 0.2; y += 0.4) posts.push({ geo: boxAt(0.08, 0.06, 1.0, DX0 - 0.45, y, DZ) });
  for (const dz of [-0.5, 0.5]) posts.push({ geo: boxAt(0.08, 2.6, 0.08, DX0 - 0.45, -0.7, DZ + dz) });
  staticMesh(G, merge(posts), new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 0.9 }));
  W.slope(DX0 - 1, DZ - 0.6, DX0, DZ + 0.6, -2.1, 2.45, 0, 1);    // Leiter aus dem Wasser
  // Ruderboot (schaukelt)
  const boat = new THREE.Group();
  const hull = new THREE.LatheGeometry([new THREE.Vector2(0.01, -0.35), new THREE.Vector2(0.55, -0.3), new THREE.Vector2(0.75, 0), new THREE.Vector2(0.8, 0.25)], 14);
  const hm = new THREE.Mesh(hull, new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.6, side: THREE.DoubleSide }));
  hm.scale.set(1, 1, 3.2);
  const seat = new THREE.Mesh(boxAt(1.4, 0.06, 0.35, 0, 0.1, 0), new THREE.MeshStandardMaterial({ color: 0x7a4b28 }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 6, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2e6fb0 }));
  rim.scale.set(1, 3.2, 1); rim.position.y = 0.25;
  boat.add(hm, seat, rim);
  boat.position.set(85, WATER + 0.1, DZ + 3.2);
  boat.rotation.y = 0.3;
  G.mapGroup.add(boat);
  G.boats.push(boat);
  // Beute auf der Insel
  chestSpots.push([LX, 0, LZ + 3.4, 0], [DX0 + 1.5, 0.35, DZ, -Math.PI / 2]);
  lootSpots.push([ISLAND.x - 6, 0, ISLAND.z - 5], [ISLAND.x + 2, 0, ISLAND.z + 10]);
}
