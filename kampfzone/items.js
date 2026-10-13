// Waffen, Heilgegenstände, Munition und Material – Werte, Beute-Tabellen, 3D-Modelle und HUD-Symbole.

import * as THREE from '../vendor/three.module.js';
import { merge, boxAt } from './geo.js';
import { weighted } from './util.js';

export const RARITY = [
  { name: 'Gewöhnlich',   color: '#b9bec4', hex: 0xb9bec4, mul: 1.00 },
  { name: 'Ungewöhnlich', color: '#58d15a', hex: 0x58d15a, mul: 1.06 },
  { name: 'Selten',       color: '#3fa4ff', hex: 0x3fa4ff, mul: 1.12 },
  { name: 'Episch',       color: '#c35bff', hex: 0xc35bff, mul: 1.19 },
  { name: 'Legendär',     color: '#ffb02e', hex: 0xffb02e, mul: 1.26 },
];

// falloff: [volle Wirkung bis m, minimale Wirkung ab m, Faktor]
export const WEAPONS = {
  pistole:        { name: 'Pistole', ammo: 'leicht', dmg: 25, rate: 6.0, mag: 16, reload: 1.4, spread: 0.014, aimSpread: 0.005, auto: false, range: 110, falloff: [25, 70, 0.65], head: 2.0, struct: 25, zoom: 1.15, recoil: 0.010, pref: 15, sound: 'pistol' },
  mp:             { name: 'Maschinenpistole', ammo: 'leicht', dmg: 17, rate: 11, mag: 30, reload: 2.1, spread: 0.03, aimSpread: 0.018, auto: true, range: 85, falloff: [18, 55, 0.6], head: 1.75, struct: 17, zoom: 1.2, recoil: 0.007, pref: 12, sound: 'smg' },
  sturmgewehr:    { name: 'Sturmgewehr', ammo: 'mittel', dmg: 30, rate: 5.5, mag: 30, reload: 2.3, spread: 0.022, aimSpread: 0.004, auto: true, range: 220, falloff: [50, 150, 0.7], head: 1.6, struct: 30, zoom: 1.6, recoil: 0.012, pref: 25, sound: 'ar' },
  schrotflinte:   { name: 'Schrotflinte', ammo: 'schrot', dmg: 11, pellets: 10, rate: 1.0, mag: 5, reload: 4.0, spread: 0.075, aimSpread: 0.06, auto: false, range: 45, falloff: [8, 30, 0.25], head: 1.6, struct: 9, zoom: 1.15, recoil: 0.05, pref: 6, sound: 'shotgun' },
  scharfschuetze: { name: 'Scharfschützengewehr', ammo: 'schwer', dmg: 105, rate: 0.4, mag: 1, reload: 2.6, spread: 0.09, aimSpread: 0.0, auto: false, range: 450, falloff: [450, 450, 1], head: 2.5, struct: 105, zoom: 4.5, scope: true, recoil: 0.06, pref: 60, sound: 'sniper' },
  raketenwerfer:  { name: 'Raketenwerfer', ammo: 'raketen', dmg: 110, rate: 0.6, mag: 1, reload: 3.0, spread: 0.006, aimSpread: 0.0, auto: false, rocket: true, splash: 5, range: 300, falloff: [300, 300, 1], head: 1, struct: 420, zoom: 1.2, recoil: 0.04, pref: 25, sound: 'rocket' },
};

// welche Seltenheit eine Waffe haben kann
const WEAPON_RARITIES = {
  pistole: [0, 1, 2, 3], mp: [0, 1, 2, 3, 4], sturmgewehr: [0, 1, 2, 3, 4],
  schrotflinte: [0, 1, 2, 3, 4], scharfschuetze: [2, 3, 4], raketenwerfer: [3, 4],
};

export const HEALS = {
  verband:     { name: 'Verband', stack: 15, time: 3.0, hp: 15, maxHp: 75, drop: 5, color: '#f4efe6' },
  medikit:     { name: 'Medikit', stack: 3, time: 6.0, hp: 100, maxHp: 100, drop: 1, color: '#ff5b5b' },
  minischild:  { name: 'Mini-Schild', stack: 6, time: 2.0, shield: 25, maxShield: 50, drop: 3, color: '#5fb8ff' },
  schildtrank: { name: 'Schildtrank', stack: 3, time: 4.0, shield: 50, maxShield: 100, drop: 1, color: '#3d7bff' },
};
const HEAL_RARITY = { verband: 0, medikit: 1, minischild: 2, schildtrank: 2 };

export const AMMO = {
  leicht:  { name: 'Leichte Munition', color: 0x7fd3ff, box: 18, max: 999 },
  mittel:  { name: 'Mittlere Munition', color: 0x9eff8a, box: 20, max: 999 },
  schwer:  { name: 'Schwere Munition', color: 0xff8a6b, box: 6, max: 999 },
  schrot:  { name: 'Schrotpatronen', color: 0xffd36b, box: 5, max: 999 },
  raketen: { name: 'Raketen', color: 0xd0d0d0, box: 3, max: 12 },
};

export const MATS = {
  holz:   { name: 'Holz', color: 0xc08a52, max: 999 },
  stein:  { name: 'Stein', color: 0xa7a39c, max: 999 },
  metall: { name: 'Metall', color: 0xb8c4cc, max: 999 },
};

// ---------- Beute ----------

export function makeWeapon(id, r) { return { k: 'w', id, r, mag: WEAPONS[id].mag }; }

export function rollWeapon(rng, bias = 0) {
  const id = weighted(rng, [['sturmgewehr', 26], ['schrotflinte', 22], ['mp', 18], ['pistole', 18], ['scharfschuetze', 9], ['raketenwerfer', 4]]);
  const allowed = WEAPON_RARITIES[id];
  let r = weighted(rng, [[0, 34 - bias * 12], [1, 30], [2, 20 + bias * 4], [3, 11 + bias * 5], [4, 5 + bias * 3]]);
  r = Math.min(Math.max(r, allowed[0]), allowed[allowed.length - 1]);
  return makeWeapon(id, r);
}

export function rollHeal(rng) {
  const id = weighted(rng, [['verband', 34], ['minischild', 30], ['schildtrank', 18], ['medikit', 18]]);
  return { k: 'h', id, n: HEALS[id].drop };
}

export function ammoFor(id, mult = 1) {
  const a = WEAPONS[id].ammo;
  return { k: 'a', id: a, n: Math.max(1, Math.round(AMMO[a].box * mult)) };
}

// Truhe: Waffe + Munition + oft Heilung + 30 Material
export function chestLoot(rng) {
  const out = [];
  const w = rollWeapon(rng, 1);
  out.push(w, ammoFor(w.id, 1.5));
  if (rng() < 0.65) out.push(rollHeal(rng));
  if (rng() < 0.4) out.push(ammoFor(rng.pick(Object.keys(WEAPONS).filter(k => k !== 'raketenwerfer'))));
  out.push({ k: 'm', id: rng.pick(['holz', 'stein', 'metall']), n: 30 });
  return out;
}

// Schlechte Waffe für den Boden: nur Gewöhnlich (grau) oder Ungewöhnlich (grün), keine Spezialwaffen
export function rollFloorWeapon(rng) {
  const id = weighted(rng, [['pistole', 36], ['mp', 24], ['schrotflinte', 20], ['sturmgewehr', 20]]);
  return makeWeapon(id, rng() < 0.78 ? 0 : 1);
}

// Bodenbeute: eine Sache (plus Munition bei Waffen)
export function floorLoot(rng) {
  const x = rng();
  if (x < 0.62) { const w = rollFloorWeapon(rng); return [w, ammoFor(w.id)]; }
  if (x < 0.82) return [rollHeal(rng)];
  return [ammoFor(rng.pick(['pistole', 'sturmgewehr', 'schrotflinte', 'mp', 'scharfschuetze']), 1.5)];
}

export function itemName(it) {
  if (it.k === 'w') return WEAPONS[it.id].name;
  if (it.k === 'h') return HEALS[it.id].name;
  if (it.k === 'a') return AMMO[it.id].name;
  if (it.k === 'm') return MATS[it.id].name;
  return '?';
}
export function itemRarity(it) {
  if (it.k === 'w') return it.r;
  if (it.k === 'h') return HEAL_RARITY[it.id];
  return 0;
}

// ---------- 3D-Modelle (Lauf zeigt nach −z) ----------

const geoCache = new Map();
let itemMat = null;
export function itemMaterial() {
  if (!itemMat) itemMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });
  return itemMat;
}

const DARK = 0x2b2f33, GRAY = 0x5a6168, WOOD = 0x7a4b28, LIGHT = 0x9aa3ab;

function cyl(r, l, cx, cy, cz, axis = 'z') {
  const g = new THREE.CylinderGeometry(r, r, l, 10);
  if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(Math.PI / 2);
  return g.translate(cx, cy, cz);
}

export function weaponGeo(id, r) {
  const key = id + ':' + r;
  if (geoCache.has(key)) return geoCache.get(key);
  const acc = RARITY[r].hex;
  let parts;
  switch (id) {
    case 'pistole': parts = [
      { geo: boxAt(0.05, 0.065, 0.24, 0, 0.03, -0.06), color: DARK },
      { geo: boxAt(0.045, 0.13, 0.065, 0, -0.06, 0.03).rotateX(-0.2), color: GRAY },
      { geo: boxAt(0.052, 0.02, 0.2, 0, 0.068, -0.06), color: acc },
    ]; break;
    case 'mp': parts = [
      { geo: boxAt(0.07, 0.09, 0.36, 0, 0, -0.05), color: DARK },
      { geo: boxAt(0.04, 0.16, 0.05, 0, -0.1, -0.08), color: GRAY },
      { geo: boxAt(0.04, 0.12, 0.05, 0, -0.08, 0.06), color: GRAY },
      { geo: cyl(0.016, 0.12, 0, 0.01, -0.29), color: DARK },
      { geo: boxAt(0.072, 0.02, 0.2, 0, 0.055, -0.05), color: acc },
    ]; break;
    case 'sturmgewehr': parts = [
      { geo: boxAt(0.07, 0.1, 0.5, 0, 0, -0.05), color: GRAY },
      { geo: cyl(0.018, 0.28, 0, 0.01, -0.44), color: DARK },
      { geo: boxAt(0.06, 0.11, 0.24, 0, -0.01, 0.31), color: DARK },
      { geo: boxAt(0.045, 0.17, 0.07, 0, -0.12, -0.1).rotateX(0.25), color: DARK },
      { geo: boxAt(0.045, 0.12, 0.05, 0, -0.09, 0.08), color: DARK },
      { geo: boxAt(0.03, 0.05, 0.16, 0, 0.075, -0.05), color: DARK },
      { geo: boxAt(0.074, 0.025, 0.3, 0, 0.035, -0.15), color: acc },
    ]; break;
    case 'schrotflinte': parts = [
      { geo: cyl(0.025, 0.62, 0, 0.02, -0.33), color: DARK },
      { geo: boxAt(0.07, 0.065, 0.22, 0, -0.03, -0.3), color: WOOD },
      { geo: boxAt(0.07, 0.1, 0.2, 0, 0, 0.0), color: GRAY },
      { geo: boxAt(0.06, 0.12, 0.3, 0, -0.04, 0.24).rotateX(0.12), color: WOOD },
      { geo: boxAt(0.074, 0.02, 0.18, 0, 0.055, 0.0), color: acc },
    ]; break;
    case 'scharfschuetze': parts = [
      { geo: boxAt(0.07, 0.09, 0.5, 0, 0, 0), color: GRAY },
      { geo: cyl(0.016, 0.5, 0, 0.015, -0.5), color: DARK },
      { geo: cyl(0.035, 0.3, 0, 0.1, -0.02), color: DARK },
      { geo: boxAt(0.06, 0.12, 0.3, 0, -0.03, 0.36), color: WOOD },
      { geo: boxAt(0.04, 0.1, 0.05, 0, -0.09, 0.08), color: DARK },
      { geo: boxAt(0.074, 0.02, 0.36, 0, 0.05, 0.0), color: acc },
    ]; break;
    case 'raketenwerfer': parts = [
      { geo: cyl(0.075, 1.0, 0, 0.04, -0.1), color: 0x4f6b3a },
      { geo: cyl(0.085, 0.12, 0, 0.04, -0.58), color: DARK },
      { geo: cyl(0.085, 0.1, 0, 0.04, 0.38), color: DARK },
      { geo: boxAt(0.04, 0.14, 0.05, 0, -0.08, 0.05), color: DARK },
      { geo: boxAt(0.04, 0.14, 0.05, 0, -0.08, -0.25), color: DARK },
      { geo: boxAt(0.03, 0.06, 0.12, -0.08, 0.12, -0.05), color: acc },
    ]; break;
  }
  const g = merge(parts);
  geoCache.set(key, g);
  return g;
}

export function pickaxeGeo() {
  if (geoCache.has('pickaxe')) return geoCache.get('pickaxe');
  const g = merge([
    { geo: cyl(0.025, 0.95, 0, 0, 0, 'y'), color: WOOD },
    { geo: boxAt(0.06, 0.09, 0.5, 0, 0.42, -0.08).rotateX(0.0), color: LIGHT },
    { geo: new THREE.ConeGeometry(0.045, 0.22, 4).rotateX(-Math.PI / 2).translate(0, 0.42, -0.43), color: LIGHT },
    { geo: boxAt(0.05, 0.08, 0.14, 0, 0.42, 0.23), color: GRAY },
    { geo: boxAt(0.05, 0.12, 0.05, 0, -0.38, 0), color: 0x2f5fb5 },
  ]);
  geoCache.set('pickaxe', g);
  return g;
}

export function healGeo(id) {
  const key = 'h:' + id;
  if (geoCache.has(key)) return geoCache.get(key);
  let parts;
  if (id === 'verband') parts = [
    { geo: cyl(0.09, 0.12, 0, 0, 0, 'x'), color: 0xf4efe6 },
    { geo: cyl(0.03, 0.13, 0, 0, 0, 'x'), color: 0xcfc6b7 },
  ];
  else if (id === 'medikit') parts = [
    { geo: boxAt(0.36, 0.22, 0.12, 0, 0, 0), color: 0xf2f2f2 },
    { geo: boxAt(0.2, 0.06, 0.125, 0, 0, 0), color: 0xe02a2a },
    { geo: boxAt(0.06, 0.18, 0.125, 0, 0, 0), color: 0xe02a2a },
    { geo: boxAt(0.12, 0.04, 0.04, 0, 0.13, 0), color: 0x555555 },
  ];
  else {
    const s = id === 'minischild' ? 0.7 : 1;
    parts = [
      { geo: new THREE.SphereGeometry(0.1 * s, 12, 10).translate(0, 0.0, 0), color: 0x4aa3ff },
      { geo: cyl(0.03 * s, 0.12 * s, 0, 0.12 * s, 0, 'y'), color: 0x7cc4ff },
      { geo: cyl(0.04 * s, 0.03 * s, 0, 0.19 * s, 0, 'y'), color: 0xdddddd },
    ];
  }
  const g = merge(parts);
  geoCache.set(key, g);
  return g;
}

export function ammoGeo(id) {
  const key = 'a:' + id;
  if (geoCache.has(key)) return geoCache.get(key);
  const c = AMMO[id].color;
  const g = merge([
    { geo: boxAt(0.36, 0.2, 0.24, 0, 0, 0), color: 0x3e5a2e },
    { geo: boxAt(0.37, 0.05, 0.25, 0, 0.06, 0), color: c },
  ]);
  geoCache.set(key, g);
  return g;
}

export function matGeo(id) {
  const key = 'm:' + id;
  if (geoCache.has(key)) return geoCache.get(key);
  const c = MATS[id].color;
  const parts = [];
  for (let i = 0; i < 3; i++) parts.push({ geo: boxAt(0.5, 0.08, 0.22, 0, i * 0.09, 0).rotateY(i * 0.3), color: c });
  const g = merge(parts);
  geoCache.set(key, g);
  return g;
}

export function itemGeo(it) {
  if (it.k === 'w') return weaponGeo(it.id, it.r);
  if (it.k === 'h') return healGeo(it.id);
  if (it.k === 'a') return ammoGeo(it.id);
  return matGeo(it.id);
}

// ---------- HUD-Symbole (SVG) ----------

const SVG = (body, vb = '0 0 64 32') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" fill="currentColor">${body}</svg>`;
const ICONS = {
  pickaxe: SVG('<path d="M14 26 L40 6 l3 3 L17 29 z"/><path d="M28 3 Q44 -1 58 12 Q46 7 36 9 z"/>'),
  pistole: SVG('<path d="M12 9 h36 v8 h-24 l-4 12 h-9 l4-12 h-3 z"/>'),
  mp: SVG('<path d="M6 10 h44 v4 h6 v3 h-6 v3 h-18 l-3 9 h-6 l2-9 h-6 l-1 7 h-6 l1-7 h-7 z"/>'),
  sturmgewehr: SVG('<path d="M2 12 h10 l3-2 h28 v-3 h6 v3 h13 v4 h-13 v3 h-12 l-4 10 h-6 l3-10 h-6 l-4 7 h-5 l3-7 h-6 l-6 5 h-4 z"/>'),
  schrotflinte: SVG('<path d="M2 15 l14-4 h46 v4 h-30 v4 h-14 l-12 5 z"/><rect x="34" y="17" width="14" height="4"/>'),
  scharfschuetze: SVG('<path d="M2 15 l12-3 h48 v3 h-30 v4 h-8 l-4 7 h-5 l3-7 h-4 l-10 4 z"/><rect x="22" y="5" width="18" height="5" rx="2"/>'),
  raketenwerfer: SVG('<rect x="4" y="9" width="56" height="10" rx="3"/><rect x="20" y="19" width="5" height="8"/><rect x="36" y="19" width="5" height="8"/>'),
  verband: SVG('<rect x="18" y="6" width="28" height="20" rx="10"/><rect x="28" y="6" width="8" height="20" fill="#0005"/>'),
  medikit: SVG('<rect x="14" y="5" width="36" height="24" rx="3"/><path d="M28 9 h8 v6 h6 v6 h-6 v6 h-8 v-6 h-6 v-6 h6 z" fill="#e33"/>'),
  minischild: SVG('<circle cx="32" cy="20" r="8"/><rect x="29" y="6" width="6" height="8"/>'),
  schildtrank: SVG('<circle cx="32" cy="19" r="11"/><rect x="28" y="2" width="8" height="9"/>'),
};
export function iconFor(it) {
  if (!it) return '';
  if (it === 'pickaxe') return ICONS.pickaxe;
  return ICONS[it.id] || '';
}
