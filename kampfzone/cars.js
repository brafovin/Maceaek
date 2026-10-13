// Realistische Automodelle: gerundete Karosserie aus dem Seitenprofil (mit Radläufen), schräge Fahrgastzelle
// mit Scheiben und Säulen, Scheinwerfer, Rückleuchten, Grill, Stoßfänger, Spiegel, Türfugen, Innenraum.
// Die Räder sind eigene Instanzen (drehen sich, Vorderräder lenken).
// Materialgruppen: 0 Lack (Instanzfarbe), 1 Glas, 2 Kunststoff/Gummi, 3 Chrom, 4 Frontlicht, 5 Rücklicht, 6 Innenraum/Schilder

import * as THREE from '../vendor/three.module.js';
import { merge, boxAt } from './geo.js';

// Abmessungen je Modell (Front bei −z). profile: Seitenlinie (z, y) ohne Radläufe; cab: Fahrgastzelle
export const CAR_MODELS = {
  limousine: {
    L: 4.6, w: 1.66, wr: 0.34, wx: 0.8, axles: [-1.4, 1.4], bottom: 0.34,
    profile: [[-2.15, 0.34], [-2.24, 0.44], [-2.26, 0.62], [-2.16, 0.78], [-1.6, 0.87], [-0.95, 0.93], [1.4, 0.95], [2.0, 0.92], [2.24, 0.84], [2.27, 0.6], [2.2, 0.42], [2.1, 0.34]],
    cab: { yb: 0.97, bf: -0.95, br: 1.36, wb: 0.8, yt: 1.42, tf: -0.12, tr: 0.82, wt: 0.66, b: 0.5 },
    lights: { fy: 0.7, fz: -2.27, ry: 0.8, rz: 2.29, lx: 0.6 }, seat: [-0.38, 0.12, 0.15],
  },
  kleinwagen: {
    L: 3.9, w: 1.58, wr: 0.31, wx: 0.76, axles: [-1.25, 1.25], bottom: 0.33,
    profile: [[-1.82, 0.33], [-1.9, 0.42], [-1.92, 0.6], [-1.84, 0.76], [-1.35, 0.88], [-0.85, 0.95], [1.7, 0.98], [1.88, 0.9], [1.92, 0.6], [1.86, 0.4], [1.76, 0.33]],
    cab: { yb: 0.98, bf: -0.85, br: 1.76, wb: 0.77, yt: 1.48, tf: -0.08, tr: 1.52, wt: 0.65, b: 0.42 },
    lights: { fy: 0.72, fz: -1.92, ry: 1.02, rz: 1.86, lx: 0.58 }, seat: [-0.37, 0.14, 0.25],
  },
  transporter: {
    L: 5.0, w: 1.86, wr: 0.36, wx: 0.86, axles: [-1.75, 1.65], bottom: 0.36,
    profile: [[-2.38, 0.36], [-2.48, 0.46], [-2.5, 0.72], [-2.42, 0.94], [-2.0, 1.1], [-1.6, 1.16], [2.5, 1.16], [2.5, 0.42], [2.42, 0.36]],
    cab: { yb: 1.2, bf: -1.6, br: 2.5, wb: 0.93, yt: 2.08, tf: -0.75, tr: 2.5, wt: 0.9, b: 0.2, cargo: 0.05 },
    lights: { fy: 0.86, fz: -2.49, ry: 1.0, rz: 2.52, lx: 0.72 }, seat: [-0.45, 0.42, -0.75],
  },
};

// Materialien (einmalig): nur der Lack nimmt die Instanzfarbe an
let MATS = null;
function noTint(m) {
  m.onBeforeCompile = sh => {
    // wie color_vertex, nur ohne Instanzfarbe
    sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `
      #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR )
        vColor = vec4( 1.0 );
      #endif
      #ifdef USE_COLOR_ALPHA
        vColor *= color;
      #elif defined( USE_COLOR )
        vColor.rgb *= color;
      #endif`);
  };
  m.customProgramCacheKey = () => 'kz-notint';
  return m;
}
export function carMaterials() {
  if (MATS) return MATS;
  MATS = [
    new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }),
    noTint(new THREE.MeshPhysicalMaterial({ color: 0x24323b, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.8, envMapIntensity: 1.8, side: THREE.DoubleSide })),
    noTint(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })),
    noTint(new THREE.MeshStandardMaterial({ color: 0xdfe3e6, metalness: 1, roughness: 0.18 })),
    noTint(new THREE.MeshStandardMaterial({ color: 0xf8f4e8, emissive: 0xfff2d0, emissiveIntensity: 0.9, roughness: 0.1 })),
    noTint(new THREE.MeshStandardMaterial({ color: 0xa0140e, emissive: 0xc0140c, emissiveIntensity: 0.7, roughness: 0.2 })),
    noTint(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })),
  ];
  return MATS;
}

// Viereck (a, b, c, d gegen den Uhrzeigersinn von außen gesehen) als zwei Dreiecke
function quads(list) {
  const pos = [];
  for (const [a, b, c, d] of list) pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  return g;
}

const lerp = (a, b, t) => a + (b - a) * t;

// Fahrgastzelle: Seiten (Fenster mit A-, B-, C-Säule), Front- und Heckscheibe, Dach
function cabin(c, parts) {
  const { yb, bf, br, wb, yt, tf, tr, wt } = c;
  const B = (u, s) => [s * wb, yb, lerp(bf, br, u)];
  const Tp = (u, s) => [s * wt, yt, lerp(tf, tr, u)];
  // Säulen-Aufteilung der Seite: [u0, u1, Glas?]
  const segs = c.cargo !== undefined
    ? [[0, 0.04, 0], [0.04, c.b, 1], [c.b, c.b + 0.04, 0], [c.b + 0.04, 1, 0]]
    : [[0, 0.04, 0], [0.04, c.b, 1], [c.b, c.b + 0.05, 0], [c.b + 0.05, 0.86, 1], [0.86, 1, 0]];
  for (const s of [-1, 1]) {
    for (const [u0, u1, glass] of segs) {
      // Reihenfolge so, dass die Normale nach außen zeigt
      const q = s > 0 ? [B(u1, s), B(u0, s), Tp(u0, s), Tp(u1, s)] : [B(u0, s), B(u1, s), Tp(u1, s), Tp(u0, s)];
      parts.push({ geo: quads([q]), mat: glass ? 1 : 0 });
    }
    // Zierleiste unter den Scheiben
    parts.push({ geo: boxAt(0.03, 0.035, br - bf - 0.1, s * (wb + 0.01), yb + 0.01, (bf + br) / 2), mat: 2, color: 0x16181a });
  }
  // Frontscheibe, Heckscheibe, Dach
  parts.push({ geo: quads([[[wb, yb, bf], [-wb, yb, bf], [-wt, yt, tf], [wt, yt, tf]]]), mat: 1 });
  parts.push({ geo: quads([[[-wb, yb, br], [wb, yb, br], [wt, yt, tr], [-wt, yt, tr]]]), mat: c.cargo !== undefined ? 0 : 1 });
  parts.push({ geo: quads([[[-wt, yt, tr], [wt, yt, tr], [wt, yt, tf], [-wt, yt, tf]]]), mat: 0 });
  parts.push({ geo: quads([[[-wt, yt - 0.01, tf], [wt, yt - 0.01, tf], [wt, yt - 0.01, tr], [-wt, yt - 0.01, tr]]]), mat: 6, color: 0x8d8a84 });   // Dachhimmel
  // Dachkanten leicht gerundet (Lackstreifen)
  for (const s of [-1, 1]) parts.push({ geo: new THREE.CylinderGeometry(0.035, 0.035, tr - tf, 6).rotateX(Math.PI / 2).translate(s * (wt - 0.01), yt - 0.012, (tf + tr) / 2), mat: 0 });
}

const cache = new Map();

// Karosserie eines Modells (ohne Räder)
export function carGeometry(id) {
  if (cache.has(id)) return cache.get(id);
  const M = CAR_MODELS[id], bev = 0.06;
  // Seitenprofil mit Radläufen; Formkoordinate X = −z (damit die Extrusion nach +x zeigt)
  const P = [];
  const prof = M.profile;
  const ar = M.wr + 0.09;
  // obere Linie von vorn nach hinten, dann unten zurück mit Radläufen
  for (const p of prof) P.push(p);
  const bottom = M.bottom;
  const axl = [...M.axles].sort((a, b) => b - a);   // hinten zuerst (wir laufen unten von hinten nach vorn)
  for (const zc of axl) {
    const a0 = Math.asin(Math.max(-1, Math.min(1, (bottom - M.wr) / ar)));
    for (let i = 0; i <= 14; i++) {
      const t = a0 + (Math.PI - 2 * a0) * i / 14;      // von hinten (rechts) über oben nach vorn
      P.push([zc + ar * Math.cos(t), M.wr + ar * Math.sin(t)]);
    }
  }
  const shape = new THREE.Shape(P.map(([z, y]) => new THREE.Vector2(-z, y)));
  const body = new THREE.ExtrudeGeometry(shape, { depth: M.w - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.7, bevelSegments: 3, curveSegments: 6 });
  body.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, -(M.w - 2 * bev) / 2, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
  const parts = [{ geo: body, mat: 0 }];
  cabin(M.cab, parts);
  const hw = M.w / 2, L2 = M.L / 2, Lt = M.lights;
  // Radhausschalen (verhindern Durchblick)
  for (const z of M.axles) for (const s of [-1, 1]) parts.push({ geo: boxAt(0.42, M.wr + 0.06, ar * 2, s * (hw - 0.3), M.wr + 0.3, z), mat: 2, color: 0x0c0d0e });
  // Stoßfänger, Grill, Schweller
  parts.push({ geo: boxAt(M.w + 0.02, 0.14, 0.14, 0, bottom + 0.06, -L2 + 0.04), mat: 2, color: 0x1d2024 });
  parts.push({ geo: boxAt(M.w + 0.02, 0.14, 0.14, 0, bottom + 0.06, L2 - 0.04), mat: 2, color: 0x1d2024 });
  parts.push({ geo: boxAt(M.w * 0.42, 0.14, 0.06, 0, Lt.fy - 0.15, Lt.fz - 0.02), mat: 2, color: 0x101214 });
  for (let i = 0; i < 3; i++) parts.push({ geo: boxAt(M.w * 0.4, 0.012, 0.02, 0, Lt.fy - 0.2 + i * 0.045, Lt.fz - 0.05), mat: 3 });
  for (const s of [-1, 1]) {
    const a0 = M.axles[0] + ar, a1 = M.axles[1] - ar;
    parts.push({ geo: boxAt(0.05, 0.1, a1 - a0, s * (hw + 0.01), bottom + 0.03, (a0 + a1) / 2), mat: 2, color: 0x1d2024 });
    // Scheinwerfer (Gehäuse + Linse), Blinker, Rückleuchten
    parts.push({ geo: boxAt(0.44, 0.15, 0.08, s * Lt.lx, Lt.fy, Lt.fz), mat: 2, color: 0x15171a });
    parts.push({ geo: boxAt(0.2, 0.1, 0.04, s * (Lt.lx - 0.08), Lt.fy, Lt.fz - 0.03), mat: 4 });
    parts.push({ geo: new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12).rotateX(Math.PI / 2).translate(s * (Lt.lx + 0.12), Lt.fy, Lt.fz - 0.035), mat: 4 });
    parts.push({ geo: boxAt(0.1, 0.05, 0.04, s * (Lt.lx + 0.16), Lt.fy - 0.06, Lt.fz - 0.035), mat: 2, color: 0xd9822b });
    parts.push({ geo: boxAt(0.3, 0.13, 0.06, s * (Lt.lx - 0.06), Lt.ry, Lt.rz), mat: 5 });
    parts.push({ geo: boxAt(0.12, 0.13, 0.065, s * (Lt.lx + 0.15), Lt.ry, Lt.rz), mat: 2, color: 0xd9822b });
    // Außenspiegel
    const c = M.cab, mz = c.bf + 0.18;
    parts.push({ geo: boxAt(0.12, 0.04, 0.08, s * (c.wb + 0.06), c.yb + 0.04, mz), mat: 2, color: 0x16181a });
    parts.push({ geo: boxAt(0.1, 0.12, 0.15, s * (c.wb + 0.15), c.yb + 0.08, mz), mat: 0 });
    parts.push({ geo: boxAt(0.01, 0.09, 0.11, 0, 0, 0).rotateY(Math.PI / 2).translate(s * (c.wb + 0.15), c.yb + 0.08, mz + 0.076), mat: 3 });
    // Türfugen und Griffe
    const dz = [c.bf + 0.05, lerp(c.bf, c.br, c.b) + 0.04];
    if (c.cargo === undefined) dz.push(lerp(c.bf, c.br, 0.86));
    for (const z of dz) parts.push({ geo: boxAt(0.008, c.yb - bottom - 0.22, 0.012, s * (hw + 0.005), (c.yb + bottom) / 2 + 0.06, z), mat: 2, color: 0x0e0f10 });
    for (let i = 0; i < dz.length - 1; i++) parts.push({ geo: boxAt(0.03, 0.03, 0.14, s * (hw + 0.01), c.yb - 0.12, dz[i + 1] - 0.2), mat: 3 });
  }
  // Kennzeichen
  for (const [z, y, r] of [[-L2 - 0.03, bottom + 0.2, Math.PI], [L2 + 0.03, Lt.ry - 0.24, 0]]) {
    parts.push({ geo: boxAt(0.52, 0.12, 0.012, 0, 0, 0).rotateY(r).translate(0, y, z), mat: 6, color: 0xf2f2f2 });
    parts.push({ geo: boxAt(0.05, 0.12, 0.014, -0.235 * (r ? -1 : 1), y, z), mat: 6, color: 0x1f3fa3 });
  }
  // Innenraum: Sitze (Fahrer laut M.seat), Rückbank bzw. Trennwand, Armaturenbrett, Lenkrad, Boden
  const c = M.cab, [sx, sy0, sz] = M.seat, sy = sy0 + 0.32;
  for (const x of [-Math.abs(sx), Math.abs(sx)]) {
    parts.push({ geo: boxAt(0.46, 0.12, 0.48, x, sy, sz - 0.03), mat: 6, color: 0x2a2c30 });
    parts.push({ geo: boxAt(0.46, 0.62, 0.1, 0, 0.31, 0).rotateX(0.18).translate(x, sy + 0.05, sz + 0.24), mat: 6, color: 0x2a2c30 });
    parts.push({ geo: boxAt(0.24, 0.16, 0.1, x, sy + 0.74, sz + 0.36), mat: 6, color: 0x2a2c30 });
  }
  if (c.cargo === undefined) {
    parts.push({ geo: boxAt(1.36, 0.12, 0.5, 0, sy, sz + 0.95), mat: 6, color: 0x2a2c30 });
    parts.push({ geo: boxAt(1.36, 0.55, 0.1, 0, 0.27, 0).rotateX(0.15).translate(0, sy + 0.05, sz + 1.2), mat: 6, color: 0x2a2c30 });
  } else parts.push({ geo: boxAt(c.wb * 2 - 0.04, c.yt - bottom - 0.2, 0.06, 0, (c.yt + bottom) / 2, sz + 0.55), mat: 6, color: 0x3a3d42 });   // Trennwand
  parts.push({ geo: boxAt(c.wb * 2 - 0.1, 0.22, 0.4, 0, c.yb - 0.02, c.bf + 0.22), mat: 6, color: 0x1e2023 });
  parts.push({ geo: boxAt(c.wb * 2 - 0.1, 0.05, Math.min(2.6, c.br - c.bf), 0, bottom + 0.1, (c.bf + c.br) / 2 + 0.1), mat: 6, color: 0x1a1b1d });
  parts.push({ geo: new THREE.TorusGeometry(0.17, 0.022, 6, 18).rotateX(-0.45).translate(sx, sy + 0.5, sz - 0.48), mat: 6, color: 0x111111 });
  const g = merge(parts.map(p => ({ color: 0xffffff, ...p })));
  cache.set(id, g);
  return g;
}

// Rad: Reifen mit Flanke (Gummi) und Leichtmetallfelge mit fünf Speichen (Außenseite +x)
let wheelCache = null;
export function wheelGeometry() {
  if (wheelCache) return wheelCache;
  const r = 1, w = 0.66;          // Einheitsrad, wird je Modell skaliert
  const prof = [[0.62, -w / 2], [0.8, -w / 2 - 0.02], [0.94, -w / 2 + 0.02], [1, -w / 2 + 0.12], [r, w / 2 - 0.12], [0.94, w / 2 - 0.02], [0.8, w / 2 + 0.02], [0.62, w / 2]];
  const tire = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 30).rotateZ(-Math.PI / 2);
  const parts = [{ geo: tire, mat: 0, color: 0x141414 }];
  parts.push({ geo: new THREE.CylinderGeometry(0.64, 0.64, w - 0.04, 24, 1, true).rotateZ(Math.PI / 2), mat: 1, color: 0x6a7076 });
  parts.push({ geo: new THREE.CylinderGeometry(0.64, 0.64, 0.04, 24).rotateZ(Math.PI / 2).translate(-0.1, 0, 0), mat: 1, color: 0x2a2d30 });
  parts.push({ geo: new THREE.TorusGeometry(0.6, 0.05, 6, 28).rotateY(Math.PI / 2).translate(w / 2 - 0.05, 0, 0), mat: 1, color: 0xc9ced2 });
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    parts.push({ geo: boxAt(0.08, 0.5, 0.15, 0, 0.32, 0).rotateX(a).translate(w / 2 - 0.07, 0, 0), mat: 1, color: 0xc9ced2 });
  }
  parts.push({ geo: new THREE.CylinderGeometry(0.16, 0.2, 0.12, 16).rotateZ(-Math.PI / 2).translate(w / 2 - 0.05, 0, 0), mat: 1, color: 0xb5bbc0 });
  wheelCache = merge(parts);
  return wheelCache;
}
let wheelMats = null;
export function wheelMaterials() {
  if (!wheelMats) wheelMats = [
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.25 }),
  ];
  return wheelMats;
}
