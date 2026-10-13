// Realistische Skins: menschliche Proportionen, Gesicht (Augen, Brauen, Nase, Mund, Ohren), Frisuren,
// Kopfbedeckungen, Kleidung mit Details (Reißverschluss, Warnstreifen, Kragen, Krawatte, Gürtel, Rucksack)
// und Gelenke an Knien und Ellbogen. Jede Körperpartie ist eine zusammengeführte Geometrie mit Vertex-Farben.

import * as THREE from '../vendor/three.module.js';
import { merge } from './geo.js';

// top: tshirt | jacke | hemd | anzug | mantel | sport · hair: kurz | lang | zopf | dutt | glatze
// hat: helm | muetze | polizei | schutzhelm | feuer | kappe · extra: weste | warnweste | streifen | bart | brille | stethoskop
export const SKINS = [
  { id: 'rekrut', name: 'Rekrut', skin: 0xe8b996, hair: 0x3b2618, hairStyle: 'kurz', top: 'jacke', topCol: 0xc0392b, pants: 0x2b3a55, shoes: 0x2a2a2a, pack: 'rucksack', packCol: 0x3f454d },
  { id: 'soldat', name: 'Soldat', skin: 0xc68b5e, hair: 0x15110e, hairStyle: 'kurz', hat: 'helm', hatCol: 0x4b5a35, top: 'jacke', topCol: 0x5d6b3e, pants: 0x4e5a38, shoes: 0x2b241c, boots: true, extra: ['weste'], vestCol: 0x3a4430, pack: 'rucksack', packCol: 0x4e5638, gloves: 0x2a2a22 },
  { id: 'polizei', name: 'Polizistin', skin: 0xf1c7a1, hair: 0x8a4a1d, hairStyle: 'zopf', hat: 'polizei', hatCol: 0x1f2f55, top: 'hemd', topCol: 0x3c5a9a, pants: 0x1f2633, shoes: 0x111111, boots: true, extra: ['weste'], vestCol: 0x1d2b4a },
  { id: 'feuerwehr', name: 'Feuerwehrmann', skin: 0xd9a27a, hair: 0x2a1a10, hairStyle: 'kurz', hat: 'feuer', hatCol: 0xd8d8cf, top: 'jacke', topCol: 0x1d2a44, pants: 0x1d2a44, shoes: 0x111111, boots: true, extra: ['streifen'], stripeCol: 0xe8e66a, gloves: 0x3a3020 },
  { id: 'bau', name: 'Bauarbeiterin', skin: 0xf3d1b5, hair: 0x5b3a1e, hairStyle: 'zopf', hat: 'schutzhelm', hatCol: 0xffc61a, top: 'tshirt', topCol: 0x8a8f96, pants: 0x34465e, shoes: 0x6b4423, boots: true, extra: ['warnweste'], vestCol: 0xff7a1a, gloves: 0xc9a46a },
  { id: 'sportler', name: 'Sportler', skin: 0x8d5a3b, hair: 0x0e0b09, hairStyle: 'kurz', top: 'sport', topCol: 0xc62828, pants: 0xc62828, shoes: 0xf2f2f2, stripeCol: 0xf2f2f2 },
  { id: 'aerztin', name: 'Ärztin', skin: 0xf6d5bd, hair: 0xe8c66a, hairStyle: 'lang', top: 'mantel', topCol: 0xf4f4f0, pants: 0x3f7f9f, shoes: 0xe0e0e0, extra: ['stethoskop'] },
  { id: 'rocker', name: 'Rocker', skin: 0xe0ac7e, hair: 0x1a1210, hairStyle: 'lang', top: 'jacke', topCol: 0x1c1c1e, pants: 0x2a3140, shoes: 0x1a1a1a, boots: true, extra: ['bart', 'brille'] },
  { id: 'wanderer', name: 'Wanderer', skin: 0xd9a27a, hair: 0x7a2f1f, hairStyle: 'kurz', hat: 'muetze', hatCol: 0x2f6b3a, top: 'jacke', topCol: 0xe8732a, pants: 0x8a7a5a, shoes: 0x6b4423, boots: true, pack: 'gross', packCol: 0x2f5f8f, extra: ['bart'] },
  { id: 'agentin', name: 'Agentin', skin: 0xb07650, hair: 0x101010, hairStyle: 'dutt', top: 'anzug', topCol: 0x1e2024, pants: 0x1e2024, shoes: 0x0e0e0e, extra: ['brille'] },
  { id: 'busfahrer', name: 'Busfahrer', skin: 0xe2b48c, hair: 0x6a6a6a, hairStyle: 'kurz', hat: 'kappe', hatCol: 0x22324f, top: 'hemd', topCol: 0x9ec3e6, pants: 0x22272e, shoes: 0x111111, extra: ['bart'] },
];
export const PLAYABLE = SKINS.filter(s => s.id !== 'busfahrer');
export const skinById = id => SKINS.find(s => s.id === id) || SKINS[0];

const cache = new Map();

// Hilfsformen (bereits verschoben/skaliert)
const capsule = (r, len, x, y, z, sx = 1, sz = 1) => new THREE.CapsuleGeometry(r, len, 4, 10).scale(sx, 1, sz).translate(x, y, z);
const cyl = (rt, rb, h, x, y, z, sz = 1, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg).scale(1, 1, sz).translate(x, y, z);
const sph = (r, x, y, z, sx = 1, sy = 1, sz = 1, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs).scale(sx, sy, sz).translate(x, y, z);
const cap = (r, theta, x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, theta).scale(sx, sy, sz).translate(x, y, z);
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

function shade(hex, f) { return new THREE.Color(hex).multiplyScalar(f); }

// Geometrien je Skin (werden zwischen Figuren mit gleichem Skin geteilt)
export function skinParts(s) {
  if (cache.has(s.id)) return cache.get(s.id);
  const ex = s.extra || [];
  const P = {};
  const longSleeve = s.top !== 'tshirt';
  const skin = s.skin, top = s.topCol, pants = s.pants;
  // --- Rumpf: Becken, Oberkörper, Schultern, Hals, Kleidung, Rucksack ---
  const torso = [
    { geo: cyl(0.165, 0.15, 0.16, 0, 0.95, 0, 0.68), color: pants },
    { geo: cyl(0.2, 0.155, 0.5, 0, 1.27, 0, 0.62), color: top },
    { geo: new THREE.CapsuleGeometry(0.078, 0.3, 4, 10).rotateZ(Math.PI / 2).scale(1, 1, 0.9).translate(0, 1.47, 0), color: top },   // Schultern (quer)
    { geo: cyl(0.052, 0.056, 0.11, 0, 1.55, 0), color: skin },
    { geo: cyl(0.162, 0.162, 0.04, 0, 1.035, 0, 0.7), color: 0x2a2420 },                // Gürtel
    { geo: box(0.05, 0.035, 0.02, 0, 1.035, -0.115), color: 0xb8a060 },               // Schnalle
  ];
  if (s.top === 'jacke') {
    torso.push({ geo: box(0.012, 0.44, 0.01, 0, 1.28, -0.127), color: shade(top, 0.45) });
    torso.push({ geo: cyl(0.07, 0.085, 0.07, 0, 1.53, 0.005, 0.9), color: top });          // Kragen
  }
  if (s.top === 'hemd') {
    torso.push({ geo: box(0.1, 0.05, 0.02, 0, 1.5, -0.1), color: shade(top, 1.1) });
    for (let i = 0; i < 4; i++) torso.push({ geo: box(0.014, 0.014, 0.01, 0, 1.42 - i * 0.1, -0.125), color: 0xeeeeee });
    torso.push({ geo: box(0.06, 0.04, 0.01, -0.09, 1.38, -0.12), color: shade(top, 0.8) });   // Brusttasche
  }
  if (s.top === 'anzug') {
    torso.push({ geo: box(0.07, 0.24, 0.01, 0, 1.4, -0.122), color: 0xf2f2f2 });
    torso.push({ geo: box(0.03, 0.2, 0.012, 0, 1.38, -0.128), color: 0x8a1a1a });          // Krawatte
  }
  if (s.top === 'mantel') {
    torso.push({ geo: cyl(0.215, 0.2, 0.92, 0, 1.05, 0, 0.66), color: top });              // Kittel bis zu den Knien
    torso.push({ geo: box(0.012, 0.9, 0.012, 0, 1.05, -0.138), color: shade(top, 0.8) });
  }
  if (s.top === 'sport') {
    torso.push({ geo: box(0.012, 0.44, 0.01, 0, 1.28, -0.127), color: 0xf2f2f2 });
  }
  if (ex.includes('weste') || ex.includes('warnweste')) {
    torso.push({ geo: cyl(0.208, 0.168, 0.4, 0, 1.28, 0, 0.66), color: s.vestCol });
    if (ex.includes('warnweste')) for (const y of [1.17, 1.3]) torso.push({ geo: cyl(0.21, 0.19, 0.035, 0, y, 0, 0.67), color: 0xe8ecc8 });
    else for (let i = -1; i <= 1; i++) torso.push({ geo: box(0.07, 0.08, 0.03, i * 0.09, 1.2, -0.135), color: shade(s.vestCol, 0.8) });  // Taschen
  }
  if (ex.includes('streifen')) for (const y of [1.12, 1.32]) torso.push({ geo: cyl(0.205, 0.18, 0.04, 0, y, 0, 0.64), color: s.stripeCol });
  if (ex.includes('stethoskop')) torso.push({ geo: new THREE.TorusGeometry(0.11, 0.008, 6, 20, Math.PI * 1.2).rotateZ(Math.PI * 1.1).rotateX(0.2).translate(0, 1.42, -0.06), color: 0x222222 });
  if (s.pack === 'rucksack') {
    torso.push({ geo: box(0.28, 0.34, 0.13, 0, 1.27, 0.17), color: s.packCol });
    torso.push({ geo: box(0.22, 0.1, 0.03, 0, 1.18, 0.24), color: shade(s.packCol, 0.8) });
  }
  if (s.pack === 'gross') {
    torso.push({ geo: box(0.32, 0.56, 0.2, 0, 1.22, 0.2), color: s.packCol });
    torso.push({ geo: new THREE.CylinderGeometry(0.06, 0.06, 0.36, 10).rotateZ(Math.PI / 2).translate(0, 1.54, 0.2), color: 0x7a5530 });   // Isomatte
  }
  if (s.pack) for (const x of [-0.1, 0.1]) torso.push({ geo: box(0.035, 0.36, 0.015, x, 1.3, -0.122), color: shade(s.packCol, 0.7) });   // Gurte
  P.torso = merge(torso);
  // --- Kopf (Gruppe am Hals, y = 1.58) ---
  const head = [
    { geo: sph(0.112, 0, 0.12, 0, 1, 1.17, 1.07, 20, 14), color: skin },
    { geo: sph(0.024, -0.112, 0.12, 0.005, 0.6, 1, 0.9, 8, 6), color: shade(skin, 0.93) },
    { geo: sph(0.024, 0.112, 0.12, 0.005, 0.6, 1, 0.9, 8, 6), color: shade(skin, 0.93) },
    { geo: box(0.022, 0.04, 0.03, 0, 0.105, -0.122), color: shade(skin, 0.95) },          // Nase
    { geo: box(0.044, 0.009, 0.012, 0, 0.062, -0.108), color: 0x9a4a3a },                // Mund
  ];
  for (const x of [-0.04, 0.04]) {
    head.push({ geo: sph(0.017, x, 0.132, -0.103, 1, 0.8, 0.6, 10, 8), color: 0xf4f4f0 });
    head.push({ geo: sph(0.0095, x, 0.132, -0.114, 1, 1, 0.5, 8, 6), color: 0x2a1e14 });
    head.push({ geo: box(0.042, 0.009, 0.012, x, 0.16, -0.109).rotateZ(x > 0 ? -0.12 : 0.12), color: s.hair });
  }
  const H = s.hair;
  if (s.hairStyle !== 'glatze' && s.hat !== 'helm' && s.hat !== 'feuer') {
    head.push({ geo: cap(0.12, Math.PI * 0.42, 0, 0.123, 0.004, 1, 1.15, 1.08), color: H });
    head.push({ geo: cap(0.121, Math.PI * 0.42, 0, 0.118, 0.01, 1, 1.15, 1.06).rotateX(0.95), color: H });
  }
  if (s.hairStyle === 'lang') head.push({ geo: capsule(0.1, 0.16, 0, 0.02, 0.07, 1.05, 0.55), color: H });
  if (s.hairStyle === 'zopf') head.push({ geo: new THREE.CapsuleGeometry(0.035, 0.16, 4, 8).rotateX(0.45).translate(0, 0.02, 0.15), color: H });
  if (s.hairStyle === 'dutt') head.push({ geo: sph(0.05, 0, 0.2, 0.1), color: H });
  if (ex.includes('bart')) {
    head.push({ geo: sph(0.085, 0, 0.045, -0.06, 1.15, 0.75, 0.75), color: shade(H, 0.9) });
    head.push({ geo: box(0.07, 0.014, 0.014, 0, 0.078, -0.113), color: shade(H, 0.9) });
  }
  if (ex.includes('brille')) {
    for (const x of [-0.042, 0.042]) head.push({ geo: box(0.048, 0.028, 0.008, x, 0.132, -0.122), color: 0x0d0d0f });
    head.push({ geo: box(0.03, 0.008, 0.008, 0, 0.138, -0.122), color: 0x0d0d0f });
  }
  const hc = s.hatCol;
  if (s.hat === 'helm') {
    head.push({ geo: cap(0.137, Math.PI * 0.5, 0, 0.13, 0.005, 1, 1.0, 1.08), color: hc });
    head.push({ geo: cyl(0.15, 0.15, 0.02, 0, 0.135, 0.005, 1.06, 18), color: shade(hc, 0.85) });
  }
  if (s.hat === 'feuer') {
    head.push({ geo: cap(0.14, Math.PI * 0.52, 0, 0.13, 0.01, 1, 1.05, 1.1), color: hc });
    head.push({ geo: box(0.2, 0.08, 0.02, 0, 0.17, -0.145), color: 0xd4af37 });                // Visier
    head.push({ geo: box(0.22, 0.14, 0.03, 0, 0.06, 0.13), color: 0x1d2a44 });                 // Nackenschutz
  }
  if (s.hat === 'schutzhelm') {
    head.push({ geo: cap(0.132, Math.PI * 0.5, 0, 0.15, 0, 1, 1.0, 1.08), color: hc });
    head.push({ geo: cyl(0.16, 0.16, 0.015, 0, 0.152, -0.01, 1.1, 18), color: hc });
  }
  if (s.hat === 'muetze') {
    head.push({ geo: cap(0.126, Math.PI * 0.46, 0, 0.13, 0, 1, 1.15, 1.08), color: hc });
    head.push({ geo: cyl(0.126, 0.126, 0.04, 0, 0.17, 0, 1.08, 18), color: shade(hc, 0.85) });
  }
  if (s.hat === 'polizei' || s.hat === 'kappe') {
    head.push({ geo: cyl(0.13, 0.118, 0.085, 0, 0.245, 0.005, 1.05, 18), color: hc });
    head.push({ geo: cyl(0.135, 0.135, 0.018, 0, 0.29, 0.005, 1.08, 18), color: hc });
    head.push({ geo: box(0.17, 0.012, 0.08, 0, 0.205, -0.135), color: 0x111111 });
    head.push({ geo: box(0.03, 0.03, 0.01, 0, 0.255, -0.133), color: 0xd4af37 });
  }
  P.head = merge(head);
  // --- Arme (Schulter am Ursprung, Ellbogen bei y = −0.29) ---
  const sleeve = longSleeve ? top : skin;
  const upper = [{ geo: capsule(0.06, 0.18, 0, -0.15, 0, 1, 1), color: sleeve }];
  if (!longSleeve) upper.push({ geo: cyl(0.065, 0.062, 0.13, 0, -0.06, 0), color: top });
  if (ex.includes('streifen')) upper.push({ geo: cyl(0.062, 0.062, 0.03, 0, -0.2, 0), color: s.stripeCol });
  if (s.top === 'sport') upper.push({ geo: box(0.016, 0.28, 0.016, 0.055, -0.15, 0), color: s.stripeCol });
  if (s.top === 'mantel') upper[0].color = top;
  P.upper = merge(upper);
  const fore = [
    { geo: capsule(0.051, 0.165, 0, -0.135, 0, 1, 1), color: longSleeve ? top : skin },
    { geo: sph(0.048, 0, -0.3, -0.005, 0.8, 1.2, 0.62, 10, 8), color: s.gloves || skin },
    { geo: sph(0.018, 0.035, -0.27, -0.025, 1, 1.6, 1, 6, 6), color: s.gloves || skin },      // Daumen
  ];
  if (longSleeve) fore.push({ geo: cyl(0.053, 0.053, 0.03, 0, -0.245, 0), color: shade(top, 0.8) });
  if (ex.includes('streifen')) fore.push({ geo: cyl(0.054, 0.054, 0.03, 0, -0.17, 0), color: s.stripeCol });
  if (s.top === 'sport') fore.push({ geo: box(0.016, 0.24, 0.016, 0.048, -0.13, 0), color: s.stripeCol });
  P.fore = merge(fore);
  // --- Beine (Hüfte am Ursprung, Knie bei y = −0.43) ---
  const thigh = [{ geo: capsule(0.085, 0.26, 0, -0.21, 0, 1, 1), color: pants }];
  if (s.top === 'sport') thigh.push({ geo: box(0.016, 0.42, 0.016, 0.075, -0.21, 0), color: s.stripeCol });
  if (ex.includes('streifen')) thigh.push({ geo: cyl(0.08, 0.08, 0.035, 0, -0.32, 0), color: s.stripeCol });
  P.thigh = merge(thigh);
  const shoeH = s.boots ? 0.14 : 0.08;
  const shin = [
    { geo: capsule(0.066, 0.28, 0, -0.2, 0, 1, 1), color: pants },
    { geo: box(0.11, shoeH, 0.25, 0, -0.415 - shoeH / 2 + 0.04, -0.05), color: s.shoes },
    { geo: box(0.112, 0.022, 0.255, 0, -0.475, -0.05), color: shade(s.shoes, 0.6) },        // Sohle
  ];
  if (s.top === 'sport') shin.push({ geo: box(0.016, 0.3, 0.016, 0.06, -0.2, 0), color: s.stripeCol });
  if (ex.includes('streifen')) shin.push({ geo: cyl(0.064, 0.064, 0.035, 0, -0.1, 0), color: s.stripeCol });
  P.shin = merge(shin);
  cache.set(s.id, P);
  return P;
}
