// Der Kampfbus: ein 12-m-Niederflur-Linienbus mit echter Karosserie (Seitenwände mit Fenster- und
// Türausschnitten, Radhäuser, gewölbtes Dach, Lackierung mit Werbung), Schwenkschiebetüren, Innenraum
// mit Polstersitzen, Haltestangen, Haltewunschtastern und Fahrgastinfo – hängt an einem Heißluftballon
// mit Brenner. Alle Spieler sitzen darin, bis sie abspringen.

import * as THREE from '../vendor/three.module.js';
import { merge, boxAt } from './geo.js';
import { makeModel, reachHand } from './actors.js';
import { skinById } from './skins.js';

const L = 12, Wd = 2.55, hx = Wd / 2;     // Länge, Breite
const T = 0.06;                           // Wandstärke
const BOT = 0.3, TOP = 2.85, RR = 0.24;   // Unterkante, Oberkante Seitenwand, Dachrundung
const FLOOR = 0.58, CEIL = 2.62;
const WIN0 = 1.36, WIN1 = 2.58, DOOR_TOP = 2.6;
const AXLES = [-3.35, 2.65], WY = 0.5, AR = 0.6;
const DOORS = [[-5.75, -4.45], [-0.32, 0.98]];          // rechte Seite (+x)
const WIN_L = [[-5.85, -4.55], [-4.45, -3.0], [-2.9, -1.45], [-1.35, 0.1], [0.2, 1.65], [1.75, 3.2], [3.3, 4.6], [4.7, 5.85]];
const WIN_R = [[-4.35, -2.95], [-2.85, -1.45], [-1.35, -0.42], [1.08, 2.5], [2.6, 4.0], [4.1, 5.85]];
const YEL = 0xf2b90c, TRIM = 0x16191c, RAIL = 0xe8b80f;
const BAL_Y = 9.0;                        // Ballonöffnung über dem Bus

// Sitzplätze [x, z, Höhe]: Reihen zu 2 + 2, an der Mitteltür rechts frei, über den Radkästen erhöht
export const SEATS = [];
for (let r = 0; r < 10; r++) {
  const z = -3.15 + r * 0.92;
  const up = r === 0 || r === 6 || r === 7 ? 0.3 : 0;
  for (const x of [-0.95, -0.5, 0.5, 0.95]) {
    if (x > 0 && (r === 3 || r === 4)) continue;
    SEATS.push([x, z, up]);
  }
}
export const PLAYER_SEAT = SEATS.findIndex(([x, z]) => x === -0.95 && Math.abs(z - 0.53) < 0.01);   // Fensterplatz links

// ---------- Texturen ----------

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Lackierung einer Seite: Gelb, schwarzes Fensterband, blaue Bauchbinde, Schriftzug, Liniennummer, Werbung
function liveryTexture(side) {
  return canvasTex(2048, 544, (x, W, H) => {
    const PX = z => (side < 0 ? (z + 6) : (6 - z)) / 12 * W;
    const PY = y => (3.2 - y) / 3.2 * H;
    const rect = (z0, z1, y0, y1, col) => { const a = PX(z0), b = PX(z1); x.fillStyle = col; x.fillRect(Math.min(a, b), PY(y1), Math.abs(b - a), PY(y0) - PY(y1)); };
    const g = x.createLinearGradient(0, PY(2.85), 0, PY(0.3));
    g.addColorStop(0, '#f7c42a'); g.addColorStop(0.55, '#f0b40c'); g.addColorStop(1, '#e2a406');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // Blechstöße
    x.fillStyle = 'rgba(120,80,0,0.35)';
    for (let z = -4.5; z < 6; z += 1.5) x.fillRect(PX(z) - 1, PY(1.28), 2, PY(0.6) - PY(1.28));
    rect(-6, 6, WIN0 - 0.04, 2.63, '#111417');          // Fensterband
    rect(-6, 6, WIN0 - 0.08, WIN0 - 0.04, '#d8dde1');   // Zierleiste
    rect(-6, 6, 0.42, 0.6, '#1c3d8c');                  // Bauchbinde
    rect(-6, 6, 0.6, 0.625, '#ffffff');
    rect(-6, 6, 0.26, 0.42, '#2b2f33');                 // Schürze
    // Radlauf-Gummi
    x.strokeStyle = '#141414'; x.lineWidth = 14;
    for (const z of AXLES) { x.beginPath(); x.arc(PX(z), PY(WY), AR * 170 + 6, 0, Math.PI * 2); x.stroke(); }
    // Türrahmen
    if (side > 0) for (const [z0, z1] of DOORS) { x.strokeStyle = '#141414'; x.lineWidth = 12; x.strokeRect(Math.min(PX(z0), PX(z1)) - 6, PY(DOOR_TOP) - 6, Math.abs(PX(z1) - PX(z0)) + 12, PY(BOT) - PY(DOOR_TOP) + 12); }
    // Schriftzug
    const zc = side < 0 ? -0.35 : -1.55;
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.fillStyle = '#1c3d8c'; x.font = `900 ${side < 0 ? 60 : 50}px Arial, Helvetica, sans-serif`;
    x.fillText('KAMPFZONE', PX(zc), PY(0.92));
    x.font = '600 22px Arial, Helvetica, sans-serif';
    x.fillText('V E R K E H R S B E T R I E B E', PX(zc), PY(0.74));
    // Liniennummer
    const lz = side < 0 ? -5.15 : -4.18;
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(PX(lz), PY(0.98), 30, 0, Math.PI * 2); x.fill();
    x.lineWidth = 5; x.strokeStyle = '#1c3d8c'; x.stroke();
    x.fillStyle = '#1c3d8c'; x.font = '900 40px Arial, Helvetica, sans-serif'; x.textBaseline = 'middle';
    x.fillText('7', PX(lz), PY(0.98) + 2);
    // Wagennummer
    x.fillStyle = '#222'; x.font = '700 16px monospace';
    x.fillText('Wagen 2026', PX(side < 0 ? -5.3 : -2.3), PY(1.18));
    // Werbefläche hinten
    const a0 = PX(3.45), a1 = PX(5.75), ax = Math.min(a0, a1), aw = Math.abs(a1 - a0), ay = PY(1.24), ah = PY(0.66) - PY(1.24);
    const ag = x.createLinearGradient(ax, 0, ax + aw, 0);
    if (side < 0) { ag.addColorStop(0, '#0d47a1'); ag.addColorStop(1, '#42a5f5'); } else { ag.addColorStop(0, '#2e7d32'); ag.addColorStop(1, '#9ccc65'); }
    x.fillStyle = ag; x.fillRect(ax, ay, aw, ah);
    x.strokeStyle = '#f2f2f2'; x.lineWidth = 4; x.strokeRect(ax + 2, ay + 2, aw - 4, ah - 4);
    x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.fillStyle = '#ffffff';
    if (side < 0) {
      x.font = '900 34px Arial, Helvetica, sans-serif'; x.fillText('SCHILDTRANK', ax + 90, ay + 46);
      x.font = 'italic 600 20px Arial, Helvetica, sans-serif'; x.fillText('Jetzt in jeder Truhe!', ax + 92, ay + 78);
      // Flasche
      x.fillStyle = '#bfe6ff'; x.beginPath(); x.arc(ax + 46, ay + 62, 26, 0, Math.PI * 2); x.fill();
      x.fillRect(ax + 38, ay + 16, 16, 24);
      x.fillStyle = '#1e88e5'; x.beginPath(); x.arc(ax + 46, ay + 66, 20, 0, Math.PI * 2); x.fill();
    } else {
      x.font = '900 30px Arial, Helvetica, sans-serif'; x.fillText('BAUMARKT', ax + 22, ay + 42);
      x.font = '600 20px Arial, Helvetica, sans-serif'; x.fillText('Holz · Stein · Metall', ax + 24, ay + 72);
      x.fillStyle = '#5d4037'; for (let i = 0; i < 3; i++) x.fillRect(ax + aw - 80 + i * 22, ay + 26 + i * 6, 18, 60 - i * 6);
    }
  });
}

// Front: schwarzer Scheibenrahmen, Kühlergrill, Logo (u gespiegelt, damit von vorn lesbar)
function frontTexture() {
  return canvasTex(512, 630, (x, W, H) => {
    const PX = v => (0.5 - v / 2.6) * W, PY = y => (3.2 - y) / 3.2 * H;
    const g = x.createLinearGradient(0, PY(3.1), 0, PY(0.3));
    g.addColorStop(0, '#f7c42a'); g.addColorStop(1, '#e2a406');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = '#111417';
    x.beginPath(); x.roundRect(PX(1.22), PY(3.0), PX(-1.22) - PX(1.22), PY(0.95) - PY(3.0), 18); x.fill();
    x.fillStyle = '#2b2f33'; x.fillRect(0, PY(0.42), W, PY(0.26) - PY(0.42));
    // Grill
    x.fillStyle = '#1a1d20'; x.fillRect(PX(0.55), PY(0.64), PX(-0.55) - PX(0.55), PY(0.44) - PY(0.64));
    x.fillStyle = '#3a3f44'; for (let y = 0.47; y < 0.63; y += 0.045) x.fillRect(PX(0.53), PY(y), PX(-0.53) - PX(0.53), 3);
    // Logo
    x.fillStyle = '#e8ecef'; x.beginPath(); x.arc(PX(0), PY(0.8), 20, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#1c3d8c'; x.font = '900 18px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('KZ', PX(0), PY(0.8) + 1);
  });
}

// Heck: Heckscheibenrahmen, Motorgitter, Schriftzug
function rearTexture() {
  return canvasTex(512, 630, (x, W, H) => {
    const PX = v => (v / 2.6 + 0.5) * W, PY = y => (3.2 - y) / 3.2 * H;
    const g = x.createLinearGradient(0, PY(3.1), 0, PY(0.3));
    g.addColorStop(0, '#f7c42a'); g.addColorStop(1, '#e2a406');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = '#111417';
    x.beginPath(); x.roundRect(PX(-1.02), PY(2.98), PX(1.02) - PX(-1.02), PY(1.7) - PY(2.98), 14); x.fill();
    x.fillStyle = '#1c3d8c'; x.fillRect(0, PY(0.6), W, PY(0.42) - PY(0.6));
    x.fillStyle = '#2b2f33'; x.fillRect(0, PY(0.42), W, PY(0.26) - PY(0.42));
    // Motorklappe mit Lüftungsgitter
    x.fillStyle = '#c99706'; x.fillRect(PX(-0.9), PY(1.36), PX(0.9) - PX(-0.9), 3);
    x.fillStyle = '#1a1d20'; x.fillRect(PX(-0.7), PY(1.3), PX(0.7) - PX(-0.7), PY(0.7) - PY(1.3));
    x.fillStyle = '#4a5056'; for (let y = 0.74; y < 1.28; y += 0.05) x.fillRect(PX(-0.68), PY(y), PX(0.68) - PX(-0.68), 4);
    x.fillStyle = '#1c3d8c'; x.font = '900 34px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('KAMPFZONE', PX(0), PY(1.52));
  });
}

// LED-Zielanzeige (orange Punktmatrix)
function ledTexture(text, w = 512, h = 72, size = 50) {
  return canvasTex(w, h, (x) => {
    x.fillStyle = '#080808'; x.fillRect(0, 0, w, h);
    x.font = `bold ${size}px monospace`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#ffae2a'; x.shadowColor = '#ff7a00'; x.shadowBlur = 10;
    x.fillText(text, w / 2, h / 2 + 2);
    x.shadowBlur = 0; x.shadowColor = 'transparent';
    x.globalCompositeOperation = 'destination-in';
    for (let j = 0; j < h; j += 4) for (let i = 0; i < w; i += 4) x.fillRect(i, j, 3, 3);
    x.globalCompositeOperation = 'destination-over';
    x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, w, h);
  });
}

// Fahrgastinformation (Bildschirm im Innenraum)
function screenTexture() {
  return canvasTex(512, 160, (x, W, H) => {
    x.fillStyle = '#0d1b3d'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#f0b40c'; x.fillRect(0, 0, W, 40);
    x.fillStyle = '#1c3d8c'; x.fillRect(8, 6, 40, 28);
    x.fillStyle = '#fff'; x.font = '900 24px Arial, sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillText('7', 28, 21);
    x.textAlign = 'left'; x.fillStyle = '#111'; x.font = '700 22px Arial, sans-serif'; x.fillText('Richtung Kampfzone', 60, 21);
    x.fillStyle = '#9fb3d9'; x.font = '600 20px Arial, sans-serif'; x.fillText('Nächster Halt:', 18, 66);
    x.fillStyle = '#ffffff'; x.font = '900 40px Arial, sans-serif'; x.fillText('Absprung', 18, 108);
    x.fillStyle = '#9fb3d9'; x.font = '600 18px Arial, sans-serif'; x.fillText('Ausstieg rechts · Gleiter bereithalten', 18, 145);
    x.strokeStyle = '#f0b40c'; x.lineWidth = 4; x.beginPath(); x.moveTo(420, 60); x.lineTo(420, 150); x.stroke();
    x.fillStyle = '#f0b40c'; for (const y of [70, 105, 140]) { x.beginPath(); x.arc(420, y, 8, 0, Math.PI * 2); x.fill(); }
  });
}

// Sitzbezug: dunkelblauer Velours mit buntem Konfetti-Muster
function moquetteTexture() {
  const t = canvasTex(128, 128, (x, W, H) => {
    x.fillStyle = '#1a2850'; x.fillRect(0, 0, W, H);
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const cols = ['#e8b10a', '#d6402b', '#37a0d6', '#e9eef2', '#2f6f4f'];
    for (let i = 0; i < 90; i++) {
      x.fillStyle = cols[i % cols.length];
      x.save(); x.translate(rnd() * W, rnd() * H); x.rotate(rnd() * Math.PI);
      x.fillRect(-3, -1, 6 + rnd() * 5, 2.5); x.restore();
    }
    for (let i = 0; i < 2500; i++) { x.fillStyle = `rgba(255,255,255,${rnd() * 0.06})`; x.fillRect(rnd() * W, rnd() * H, 1, 1); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Boden: grauer Kautschuk mit Noppen
function floorTexture() {
  const t = canvasTex(128, 128, (x, W, H) => {
    x.fillStyle = '#596067'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#6a7279';
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { x.beginPath(); x.arc(i * 16 + 8 + (j % 2) * 8, j * 16 + 8, 3.2, 0, Math.PI * 2); x.fill(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 14);
  return t;
}

// Ballonhülle: 24 Bahnen, Lastbänder, Schriftzug am Äquator, helle Krone
const GORES = 24;
function balloonTexture() {
  return canvasTex(1024, 1024, (x, W, H) => {
    const gw = W / GORES;
    const V = v => (1 - v) * H;
    const C = ['#d32f2f', '#f9c22e', '#1e5bbf'];
    for (let i = 0; i < GORES; i++) {
      x.fillStyle = '#5a4634'; x.fillRect(i * gw, V(0.04), gw, V(0) - V(0.04));
      x.fillStyle = C[i % 3]; x.fillRect(i * gw, V(0.55), gw, V(0.04) - V(0.55));
      x.fillStyle = C[(i + 1) % 3]; x.fillRect(i * gw, V(0.86), gw, V(0.66) - V(0.86));
      x.fillStyle = '#f2f2ee'; x.fillRect(i * gw, V(1), gw, V(0.86) - V(1));
    }
    x.fillStyle = '#f4f4f0'; x.fillRect(0, V(0.66), W, V(0.55) - V(0.66));
    x.fillStyle = '#1c3d8c'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const cx of [W * 0.25, W * 0.75]) {
      x.save(); x.translate(cx, V(0.605)); x.scale(0.55, 1);
      x.font = '900 92px Arial, Helvetica, sans-serif'; x.fillText('KAMPFZONE', 0, 4);
      x.restore();
    }
    // Lastbänder (senkrecht) und Querbänder
    x.fillStyle = 'rgba(70,52,30,0.85)';
    for (let i = 0; i <= GORES; i++) x.fillRect(i * gw - 1.5, 0, 3, H);
    x.fillStyle = 'rgba(70,52,30,0.4)';
    for (const v of [0.18, 0.3, 0.42, 0.55, 0.66, 0.76, 0.86, 0.94]) x.fillRect(0, V(v) - 1, W, 2);
    // leichte Falten/Schattierung je Bahn
    for (let i = 0; i < GORES; i++) {
      const g = x.createLinearGradient(i * gw, 0, (i + 1) * gw, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.16)'); g.addColorStop(0.5, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.16)');
      x.fillStyle = g; x.fillRect(i * gw, 0, gw, H);
    }
  });
}

// ---------- Geometrie-Helfer ----------

const rrect = (path, a0, a1, b0, b1, r) => {
  const s0 = Math.min(a0, a1), s1 = Math.max(a0, a1);
  path.moveTo(s0 + r, b0);
  path.lineTo(s1 - r, b0); path.quadraticCurveTo(s1, b0, s1, b0 + r);
  path.lineTo(s1, b1 - r); path.quadraticCurveTo(s1, b1, s1 - r, b1);
  path.lineTo(s0 + r, b1); path.quadraticCurveTo(s0, b1, s0, b1 - r);
  path.lineTo(s0, b0 + r); path.quadraticCurveTo(s0, b0, s0 + r, b0);
  return path;
};
const holeRect = (a0, a1, b0, b1, r) => rrect(new THREE.Path(), a0, a1, b0, b1, r);
const extrude = (shape, depth, segs = 6) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: segs });

// Dachprofil von links nach rechts (o = Einzug nach innen)
function roofProfile(o = 0) {
  const p = [], r = RR - o;
  for (let i = 0; i <= 6; i++) { const t = Math.PI - (Math.PI / 2) * i / 6; p.push([-hx + RR + r * Math.cos(t), TOP + r * Math.sin(t)]); }
  for (let i = 0; i <= 6; i++) { const t = Math.PI / 2 - (Math.PI / 2) * i / 6; p.push([hx - RR + r * Math.cos(t), TOP + r * Math.sin(t)]); }
  return p;
}

// Seitenwand als Blech mit Fenster-, Tür- und Radausschnitten.
// Die Form liegt in (s, y) mit s = z (links) bzw. −z (rechts), damit die Außenseite die Lackierung richtig herum zeigt.
function sideGeometry(side) {
  const S = z => (side < 0 ? z : -z);
  const feats = AXLES.map(zc => ({ z0: zc - AR, zc, arch: true }));
  if (side > 0) for (const [z0, z1] of DOORS) feats.push({ z0, z1 });
  feats.sort((a, b) => a.z0 - b.z0);
  const P = [[-L / 2, BOT]];
  const a0 = Math.asin((BOT - WY) / AR);
  for (const f of feats) {
    if (f.arch) for (let i = 0; i <= 18; i++) { const t = Math.PI - a0 - (Math.PI - 2 * a0) * i / 18; P.push([f.zc + AR * Math.cos(t), WY + AR * Math.sin(t)]); }
    else P.push([f.z0, BOT], [f.z0, DOOR_TOP], [f.z1, DOOR_TOP], [f.z1, BOT]);
  }
  P.push([L / 2, BOT], [L / 2, TOP], [-L / 2, TOP]);
  const shape = new THREE.Shape(P.map(([z, y]) => new THREE.Vector2(S(z), y)));
  for (const [z0, z1] of side < 0 ? WIN_L : WIN_R) shape.holes.push(holeRect(S(z0), S(z1), WIN0, WIN1, 0.08));
  const g = extrude(shape, T);
  // (s, y, e) → Bus: Außenseite = Deckel bei e = T
  const m = new THREE.Matrix4();
  if (side > 0) m.set(0, 0, 1, hx - T, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1);
  else m.set(0, 0, -1, -(hx - T), 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
  g.applyMatrix4(m);
  return g;
}

// Stirnwand (vorn/hinten) mit Dachrundung und Ausschnitten
function endGeometry(holes) {
  const pr = roofProfile(0).reverse();
  const shape = new THREE.Shape([new THREE.Vector2(-hx, BOT), new THREE.Vector2(hx, BOT), ...pr.map(([x, y]) => new THREE.Vector2(x, y))]);
  for (const h of holes) shape.holes.push(holeRect(...h));
  return extrude(shape, T, 8);
}

// Abgerundeter Kasten (z. B. Klimaanlage)
function rbox(w, h, d, r) {
  const s = new THREE.Shape();
  rrect(s, -w / 2 + r, w / 2 - r, -d / 2 + r, d / 2 - r, 0.0001);
  const g = new THREE.ExtrudeGeometry(s, { depth: h - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 4 });
  return g.rotateX(-Math.PI / 2).translate(0, r, 0);
}

// Seil/Kabel zwischen zwei Punkten
function cable(a, b, r = 0.025) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 5);
  const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  m.setPosition(a.clone().add(b).multiplyScalar(0.5));
  return { geo: g, m };
}

// Rad mit Reifenflanke, Stahlfelge, Nabe und Radmuttern (Außenseite +x), hinten Zwillingsreifen
function wheelGeo(twin) {
  const prof = [[0.3, -0.15], [0.39, -0.16], [0.46, -0.155], [0.495, -0.125], [0.5, -0.08], [0.5, 0.08], [0.495, 0.125], [0.46, 0.155], [0.39, 0.16], [0.3, 0.15]];
  const tire = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28).rotateZ(-Math.PI / 2);
  const parts = [{ geo: tire, color: 0x161616, mat: 1 }];
  if (twin) parts.push({ geo: tire.clone().translate(-0.31, 0, 0), color: 0x161616, mat: 1 });
  parts.push({ geo: new THREE.CylinderGeometry(0.3, 0.3, 0.28, 24).rotateZ(Math.PI / 2), color: 0x8e959b });
  parts.push({ geo: new THREE.CylinderGeometry(0.2, 0.29, 0.05, 24).rotateZ(-Math.PI / 2).translate(0.15, 0, 0), color: 0xc5ccd2 });
  parts.push({ geo: new THREE.CylinderGeometry(0.1, 0.12, 0.1, 16).rotateZ(-Math.PI / 2).translate(0.19, 0, 0), color: 0x6d747a });
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    parts.push({ geo: new THREE.CylinderGeometry(0.018, 0.018, 0.05, 6).rotateZ(Math.PI / 2).translate(0.19, Math.cos(a) * 0.155, Math.sin(a) * 0.155), color: 0x3a3f44 });
  }
  return merge(parts.map(p => ({ mat: 0, ...p })));
}

// Ballonhülle: Profil gleichmäßig nach Bogenlänge abgetastet (für saubere Querbänder), Bahnen leicht gewölbt
function balloonGeo() {
  const key = [[1.35, 0], [2.3, 1.1], [4.1, 3.1], [6.1, 5.7], [7.5, 8.5], [8.0, 11.1], [7.6, 13.7], [6.3, 15.9], [4.1, 17.4], [1.6, 18.2], [0.02, 18.35]];
  const curve = new THREE.CatmullRomCurve3(key.map(([r, y]) => new THREE.Vector3(r, y, 0)));
  const prof = curve.getSpacedPoints(40).map(p => new THREE.Vector2(Math.max(0.01, p.x), p.y));
  const g = new THREE.LatheGeometry(prof, GORES * 4);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const ph = Math.atan2(x, z) / (Math.PI * 2) * GORES;
    const f = 1 + 0.03 * Math.sin((ph - Math.floor(ph)) * Math.PI);
    pos.setX(i, x * f); pos.setZ(i, z * f);
  }
  g.computeVertexNormals();
  return g;
}

// ---------- Bus ----------

export function makeBus(scene) {
  const g = new THREE.Group();
  const std = o => new THREE.MeshStandardMaterial({ roughness: 0.5, ...o });
  const paint = map => new THREE.MeshPhysicalMaterial({ map, color: 0xffffff, roughness: 0.32, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.12 });
  const moq = moquetteTexture();
  const M = {
    sideL: paint(liveryTexture(-1)), sideR: paint(liveryTexture(1)),
    front: paint(frontTexture()), rear: paint(rearTexture()),
    yellow: new THREE.MeshPhysicalMaterial({ color: YEL, roughness: 0.32, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
    edge: std({ color: 0x1b1e21, roughness: 0.6 }),
    liner: std({ color: 0x141618, roughness: 0.9, side: THREE.DoubleSide }),
    trim: std({ color: TRIM, roughness: 0.45 }),
    plastic: std({ color: 0x2e3236, roughness: 0.7 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x1d2c36, transparent: true, opacity: 0.38, roughness: 0.04, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide }),
    chrome: std({ color: 0xd5dade, metalness: 0.95, roughness: 0.16 }),
    light: new THREE.MeshBasicMaterial({ color: 0xfff4d6 }),
    red: new THREE.MeshBasicMaterial({ color: 0xc8140c }),
    amber: new THREE.MeshBasicMaterial({ color: 0xe8840c }),
    inner: std({ color: 0xd9dde1, roughness: 0.85, side: THREE.DoubleSide, emissive: 0x484d52 }),
    floor: std({ map: floorTexture(), roughness: 0.95, emissive: 0x23282c }),
    vcol: std({ vertexColors: true, roughness: 0.6, emissive: 0x2a2e33 }),
    moq: std({ map: moq, roughness: 0.98, emissive: 0xffffff, emissiveMap: moq, emissiveIntensity: 0.28 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff6e0 }),
    dest: new THREE.MeshBasicMaterial({ map: ledTexture('7  KAMPFZONE', 512, 72, 46) }),
    destSide: new THREE.MeshBasicMaterial({ map: ledTexture('7 KAMPFZONE', 512, 64, 44) }),
    destRear: new THREE.MeshBasicMaterial({ map: ledTexture('7', 128, 72, 54) }),
    screen: new THREE.MeshBasicMaterial({ map: screenTexture() }),
    stop: new THREE.MeshBasicMaterial({ color: 0x5a0e0a }),
    balloon: new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.22 }),
    skirt: std({ color: 0x9a6a3a, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x3a2410 }),
    rope: std({ color: 0x9a8a68, roughness: 0.9 }),
    steel: std({ color: 0x7d858c, metalness: 0.8, roughness: 0.35 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    core: new THREE.MeshBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  };
  M.balloon.map = M.balloon.emissiveMap = balloonTexture();     // Stoff leuchtet etwas durch
  moq.repeat.set(2, 2);
  for (const k of ['sideL', 'sideR', 'front', 'rear']) {
    const t = M[k].map;
    if (k === 'front') { t.repeat.set(-1 / 2.6, 1 / 3.2); t.offset.set(0.5, 0); }
    else if (k === 'rear') { t.repeat.set(1 / 2.6, 1 / 3.2); t.offset.set(0.5, 0); }
    else { t.repeat.set(1 / 12, 1 / 3.2); t.offset.set(0.5, 0); }
  }
  const add = (geo, m, parent = g) => { const me = new THREE.Mesh(geo, m); parent.add(me); return me; };

  // --- Karosserie ---
  add(sideGeometry(-1), [M.sideL, M.edge]);
  add(sideGeometry(1), [M.sideR, M.edge]);
  add(endGeometry([[-hx + 0.13, hx - 0.13, 1.02, 2.56, 0.12], [-0.98, 0.98, 2.64, 2.96, 0.03]]).translate(0, 0, -L / 2), [M.front, M.edge]);
  add(endGeometry([[-hx + 0.32, hx - 0.32, 1.8, 2.56, 0.1], [-0.3, 0.3, 2.64, 2.88, 0.02]]).translate(0, 0, L / 2 - T), [M.rear, M.edge]);
  {
    const out = roofProfile(0), inn = roofProfile(T).reverse();
    const roof = new THREE.Shape([...out, ...inn].map(([x, y]) => new THREE.Vector2(x, y)));
    add(extrude(roof, L - 0.02, 8).translate(0, 0, -L / 2 + 0.01), M.yellow);
  }
  // Unterboden, Stoßfänger, Ecken
  add(boxAt(1.1, 0.32, L - 0.4, 0, 0.42, 0), M.plastic);
  add(rbox(Wd + 0.04, 0.3, 0.2, 0.05).translate(0, 0.27, -L / 2 - 0.04), M.plastic);
  add(rbox(Wd + 0.04, 0.3, 0.2, 0.05).translate(0, 0.27, L / 2 + 0.04), M.plastic);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(boxAt(0.05, TOP - BOT, 0.05, sx * (hx - 0.005), (TOP + BOT) / 2, sz * (L / 2 - 0.005)), M.trim);
  // Radhäuser (innen schwarz)
  for (const z of AXLES) for (const sx of [-1, 1]) {
    const liner = add(new THREE.CylinderGeometry(AR - 0.02, AR - 0.02, 0.44, 18, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), M.liner);
    liner.position.set(sx * (hx - 0.25), WY, z);
  }
  // Glas: Seitenscheiben (rechts ohne Türen), Front, Heck
  const glassZ = { '-1': [[-5.9, 5.9]], '1': [[-4.45, -0.4], [1.05, 5.9]] };
  for (const sx of [-1, 1]) for (const [z0, z1] of glassZ[sx]) {
    const gl = add(new THREE.PlaneGeometry(z1 - z0, WIN1 - WIN0 + 0.04), M.glass);
    gl.position.set(sx * (hx - T / 2), (WIN0 + WIN1) / 2, (z0 + z1) / 2);
    gl.rotation.y = Math.PI / 2;
  }
  add(new THREE.PlaneGeometry(Wd - 0.24, 1.56), M.glass).position.set(0, 1.79, -L / 2 + T / 2);
  add(new THREE.PlaneGeometry(Wd - 0.62, 0.78), M.glass).position.set(0, 2.18, L / 2 - T / 2);
  // Zielanzeigen: vorn, seitlich über der Vordertür, hinten
  const dest = add(new THREE.PlaneGeometry(1.96, 0.3), M.dest); dest.position.set(0, 2.8, -L / 2 + 0.035); dest.rotation.y = Math.PI;
  const ds = add(new THREE.PlaneGeometry(1.2, 0.17), M.destSide); ds.position.set(hx - 0.09, 2.45, -3.65); ds.rotation.y = Math.PI / 2;
  add(new THREE.PlaneGeometry(0.58, 0.22), M.destRear).position.set(0, 2.76, L / 2 - 0.035);
  // Front: Scheinwerfer, Blinker, Nebelscheinwerfer, Scheibenwischer, Kennzeichen
  const fz = -L / 2 - 0.005;
  for (const sx of [-1, 1]) {
    add(rbox(0.7, 0.24, 0.08, 0.025).translate(sx * 0.82, 0.6, fz - 0.01), M.trim);
    for (const dx of [-0.17, 0.05]) { const l = add(new THREE.CircleGeometry(0.075, 18), M.light); l.position.set(sx * (0.82 + dx), 0.74, fz - 0.06); l.rotation.y = Math.PI; }
    add(boxAt(0.1, 0.07, 0.01, sx * 1.07, 0.74, fz - 0.06), M.amber);
    add(boxAt(0.5, 0.025, 0.01, sx * 0.8, 0.645, fz - 0.06), M.light);
    const fog = add(new THREE.CircleGeometry(0.05, 14), M.light); fog.position.set(sx * 0.95, 0.42, fz - 0.15); fog.rotation.y = Math.PI;
  }
  // Scheibenwischer (parallel geparkt)
  add(merge([0.85, -0.25].map(px => ({ geo: boxAt(0.022, 0.95, 0.015, 0, 0.47, 0).rotateZ(1.38).translate(px, 1.08, fz - 0.02) }))), M.trim);
  {
    const pf = add(new THREE.PlaneGeometry(0.52, 0.11), new THREE.MeshBasicMaterial({ map: plateTexture() }));
    pf.position.set(0, 0.42, -L / 2 - 0.145); pf.rotation.y = Math.PI;
  }
  // Spiegel (Hörner) an gebogenen Armen
  for (const sx of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * (hx - 0.18), 2.83, -L / 2 + 0.04), new THREE.Vector3(sx * (hx - 0.05), 2.98, -L / 2 - 0.28),
      new THREE.Vector3(sx * (hx + 0.12), 2.75, -L / 2 - 0.48), new THREE.Vector3(sx * (hx + 0.2), 2.42, -L / 2 - 0.46),
    ]);
    add(new THREE.TubeGeometry(curve, 16, 0.022, 6), M.trim);
    add(rbox(0.24, 0.44, 0.09, 0.03).translate(sx * (hx + 0.22), 2.0, -L / 2 - 0.45), M.trim);
    add(new THREE.PlaneGeometry(0.2, 0.38), M.chrome).position.set(sx * (hx + 0.22), 2.22, -L / 2 - 0.4);
  }
  // Heck: Rückleuchten, Kennzeichen
  const rz = L / 2 + 0.005;
  for (const sx of [-1, 1]) {
    add(rbox(0.2, 0.86, 0.05, 0.02).translate(sx * (hx - 0.16), 0.66, rz), M.trim);
    add(boxAt(0.15, 0.1, 0.02, sx * (hx - 0.16), 0.75, rz + 0.04), M.light);
    add(boxAt(0.15, 0.3, 0.02, sx * (hx - 0.16), 0.97, rz + 0.04), M.red);
    add(boxAt(0.15, 0.18, 0.02, sx * (hx - 0.16), 1.23, rz + 0.04), M.red);
    add(boxAt(0.15, 0.14, 0.02, sx * (hx - 0.16), 1.41, rz + 0.04), M.amber);
    add(boxAt(0.3, 0.05, 0.02, sx * 0.55, 2.98, rz + 0.01), M.red);
  }
  add(new THREE.PlaneGeometry(0.52, 0.11), new THREE.MeshBasicMaterial({ map: plateTexture() })).position.set(0, 0.48, L / 2 + 0.145);
  // seitliche Begrenzungsleuchten
  for (const sx of [-1, 1]) for (const z of [-4.7, -1.7, 1.6, 4.4]) {
    if (sx > 0 && DOORS.some(([a, b]) => z > a - 0.1 && z < b + 0.1)) continue;
    add(boxAt(0.02, 0.05, 0.1, sx * (hx + 0.005), 0.5, z), M.amber);
  }
  // Dach: Klimaanlage, Lüftungsklappen, Antenne
  add(rbox(1.95, 0.3, 2.6, 0.1).translate(0, TOP + RR - 0.02, -1.4), M.yellow);
  add(rbox(1.6, 0.06, 2.3, 0.02).translate(0, TOP + RR + 0.28, -1.4), M.plastic);
  add(rbox(1.5, 0.22, 1.5, 0.08).translate(0, TOP + RR - 0.02, 3.7), M.yellow);
  for (const z of [1.6, -4.6]) add(rbox(0.8, 0.07, 0.8, 0.03).translate(0, TOP + RR - 0.01, z), M.plastic);
  add(new THREE.CylinderGeometry(0.008, 0.012, 0.5, 5).translate(0.6, TOP + RR + 0.25, -4.9), M.trim);
  // Räder
  const wheels = [];
  const wg = [wheelGeo(false), wheelGeo(true)];
  const wmats = [std({ vertexColors: true, metalness: 0.6, roughness: 0.35 }), std({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide })];
  AXLES.forEach((z, i) => {
    for (const sx of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(sx * (hx - 0.22), WY, z);
      const geo = sx > 0 ? wg[i] : wg[i].clone().rotateY(Math.PI);
      add(geo, wmats, w);
      g.add(w);
      wheels.push(w);
    }
  });

  // --- Türen: Schwenkschiebetüren (je zwei Flügel), öffnen nach außen ---
  const doorLeaves = [];
  const leafW = 0.62, leafH = DOOR_TOP - BOT - 0.08;
  const leafFrame = merge([
    { geo: boxAt(0.05, leafH, 0.05, 0, 0, -leafW / 2 + 0.025) }, { geo: boxAt(0.05, leafH, 0.05, 0, 0, leafW / 2 - 0.025) },
    { geo: boxAt(0.05, 0.06, leafW, 0, leafH / 2 - 0.03, 0) }, { geo: boxAt(0.05, 0.12, leafW, 0, -leafH / 2 + 0.06, 0) },
    { geo: boxAt(0.04, 0.05, leafW - 0.06, 0, -0.22, 0) },
  ]);
  for (const [z0, z1] of DOORS) {
    for (const k of [-1, 1]) {
      const leaf = new THREE.Group();
      const zc = k < 0 ? z0 + leafW / 2 + 0.02 : z1 - leafW / 2 - 0.02;
      leaf.position.set(hx - 0.02, BOT + 0.04 + leafH / 2, zc);
      leaf.userData = { x: leaf.position.x, z: zc, k };
      add(leafFrame, M.trim, leaf);
      const pane = add(new THREE.PlaneGeometry(leafW - 0.08, leafH - 0.2), M.glass, leaf);
      pane.rotation.y = Math.PI / 2; pane.position.y = 0.02;
      add(new THREE.CylinderGeometry(0.016, 0.016, 1.1, 6).translate(-0.07, 0.15, 0), M.chrome, leaf);
      g.add(leaf);
      doorLeaves.push(leaf);
    }
    // Einstieg: Stufe mit gelber Kante
    add(boxAt(0.3, FLOOR - BOT, z1 - z0, hx - 0.15, (FLOOR + BOT) / 2, (z0 + z1) / 2), M.plastic);
    add(boxAt(0.05, 0.012, z1 - z0, hx - T - 0.03, FLOOR + 0.026, (z0 + z1) / 2), M.yellow);
  }

  // --- Innenraum ---
  add(boxAt(Wd - 2 * T - 0.01, 0.05, L - 2 * T - 0.02, 0, FLOOR, 0), M.floor);
  const ceil = add(new THREE.PlaneGeometry(Wd - 2 * T, L - 2 * T), M.inner); ceil.rotation.x = Math.PI / 2; ceil.position.y = CEIL;
  // Seitenverkleidung unter den Fenstern (rechts mit Türaussparungen)
  const lining = { '-1': [[-5.9, 5.9]], '1': [[-4.45, -0.32], [0.98, 5.9]] };
  for (const sx of [-1, 1]) for (const [z0, z1] of lining[sx]) {
    const pn = add(new THREE.PlaneGeometry(z1 - z0, WIN0 - FLOOR), M.inner);
    pn.position.set(sx * (hx - T - 0.005), (WIN0 + FLOOR) / 2, (z0 + z1) / 2); pn.rotation.y = Math.PI / 2;
    // Werberahmen unter der Decke
    const ad = add(new THREE.PlaneGeometry(z1 - z0, 0.08), M.trim);
    ad.position.set(sx * (hx - T - 0.006), WIN1 + 0.01, (z0 + z1) / 2); ad.rotation.y = Math.PI / 2;
  }
  const back = add(new THREE.PlaneGeometry(Wd - 2 * T, 1.8 - FLOOR), M.inner); back.position.set(0, (1.8 + FLOOR) / 2, L / 2 - T - 0.005);
  add(boxAt(Wd - 2 * T, 0.12, 0.3, 0, 1.86, L / 2 - 0.2), M.plastic);              // Hutablage hinten
  // Radkästen innen und Podeste unter den erhöhten Sitzen
  const inner = [];
  AXLES.forEach((z, i) => {
    const w = i ? 0.72 : 0.42;                    // hinten Zwillingsreifen → breiter
    for (const sx of [-1, 1]) inner.push({ geo: boxAt(w, 1.1 - FLOOR, 1.32, sx * (hx - T - w / 2), (1.1 + FLOOR) / 2, z), color: 0x9aa1a8 });
  });
  for (const sx of [-1, 1]) for (const [za, zb] of [[-3.77, -2.85], [1.75, 3.59]]) {
    inner.push({ geo: boxAt(hx - T - 0.27, 0.3, zb - za, sx * (0.27 + (hx - T - 0.27) / 2), FLOOR + 0.15, (za + zb) / 2), color: 0x6c737a });
    inner.push({ geo: boxAt(hx - T - 0.27, 0.02, 0.04, sx * (0.27 + (hx - T - 0.27) / 2), FLOOR + 0.3, za + 0.02), color: 0xe8b80f });
  }
  // Sitze: Polster (Velours), Kunststoffschale, Griff, Sockel
  const seatParts = [];
  for (const [x, z, up] of SEATS) {
    const y = up;
    seatParts.push({ geo: boxAt(0.42, 0.1, 0.42, x, 0.98 + y, z - 0.01), mat: 1 });
    seatParts.push({ geo: boxAt(0.42, 0.56, 0.07, 0, 0.28, 0).rotateX(0.12).translate(x, 1.03 + y, z + 0.2), mat: 1 });
    seatParts.push({ geo: boxAt(0.44, 0.6, 0.03, 0, 0.3, 0).rotateX(0.12).translate(x, 1.02 + y, z + 0.25), color: 0x3a4048 });
    seatParts.push({ geo: boxAt(0.44, 0.04, 0.44, x, 0.92 + y, z - 0.01), color: 0x3a4048 });
    if (Math.abs(x) < 0.7) {
      seatParts.push({ geo: new THREE.CylinderGeometry(0.018, 0.018, 0.2, 8).rotateZ(Math.PI / 2).translate(x - Math.sign(x) * 0.08, 1.66 + y, z + 0.24), color: RAIL });
      seatParts.push({ geo: boxAt(0.05, 0.92 + y - FLOOR, 0.05, x, (0.92 + y + FLOOR) / 2, z), color: 0x5c636a });
    } else seatParts.push({ geo: boxAt(0.18, 0.05, 0.05, x + Math.sign(x) * 0.2, 0.9 + y, z), color: 0x5c636a });
  }
  // Haltestangen (gelb) mit Haltewunschtastern, Deckenhandläufe
  for (let z = -3.6; z <= 5; z += 1.84) for (const x of [-0.27, 0.27]) {
    seatParts.push({ geo: new THREE.CylinderGeometry(0.02, 0.02, CEIL - FLOOR, 8).translate(x, (CEIL + FLOOR) / 2, z), color: RAIL });
    seatParts.push({ geo: boxAt(0.05, 0.09, 0.05, x, 1.45, z), mat: 2 });
  }
  for (const z of [-4.3, 0.3]) for (const dz of [-0.75, 0.75]) seatParts.push({ geo: new THREE.CylinderGeometry(0.02, 0.02, CEIL - FLOOR, 8).translate(hx - 0.3, (CEIL + FLOOR) / 2, z + dz), color: RAIL });
  for (const x of [-0.27, 0.27]) seatParts.push({ geo: new THREE.CylinderGeometry(0.02, 0.02, L - 1.6, 8).rotateX(Math.PI / 2).translate(x, CEIL - 0.14, 0.4), color: RAIL });
  // Fahrerplatz: Sitz, Armaturenbrett, Lenkrad, Fahrscheindrucker, Trennscheibe
  seatParts.push({ geo: boxAt(0.5, 0.12, 0.5, -0.72, 0.95, -4.95), color: 0x222222 });
  seatParts.push({ geo: boxAt(0.5, 0.75, 0.1, -0.72, 1.36, -4.66), color: 0x222222 });
  seatParts.push({ geo: boxAt(0.2, 0.42, 0.2, -0.72, 0.76, -4.95), color: 0x333333 });
  seatParts.push({ geo: boxAt(Wd - 2 * T, 0.42, 0.55, 0, 0.82, -5.62), color: 0x2a2e33 });
  seatParts.push({ geo: boxAt(1.1, 0.16, 0.5, -0.62, 1.1, -5.55).rotateX(0.35), color: 0x1f2226 });
  seatParts.push({ geo: new THREE.TorusGeometry(0.21, 0.022, 8, 24).rotateX(-1.0).translate(-0.72, 1.4, -5.3), color: 0x111111 });
  seatParts.push({ geo: new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8).rotateX(-1.0 + Math.PI / 2).translate(-0.72, 1.3, -5.42), color: 0x111111 });
  seatParts.push({ geo: boxAt(0.26, 0.2, 0.2, -0.15, 1.25, -5.3), color: 0x3a3f44 });
  seatParts.push({ geo: boxAt(0.04, 1.3, 0.04, -0.3, 1.25, -4.42), color: 0x8a9096 });
  add(merge(seatParts.map(p => ({ mat: 0, ...p }))), [M.vcol, M.moq, M.stop]);   // Box-Gruppen sonst je Seite verteilt
  add(merge(inner), M.vcol);
  const part = add(new THREE.PlaneGeometry(hx - 0.3 - T, 1.0), M.glass); part.position.set(-(hx + 0.3) / 2, 1.6, -4.42);
  // Deckenleuchten, Fahrgastinfo-Bildschirme, „Wagen hält“-Anzeige
  add(merge([-0.72, 0.72].map(x => ({ geo: boxAt(0.18, 0.03, L - 1.8, x, CEIL - 0.02, 0.3) }))), M.lamp);
  for (const [z, ry] of [[-4.1, 0], [1.3, 0]]) {
    add(boxAt(1.02, 0.34, 0.06, 0, CEIL - 0.25, z), M.trim);
    const sc = add(new THREE.PlaneGeometry(0.96, 0.3), M.screen); sc.position.set(0, CEIL - 0.25, z + 0.035); sc.rotation.y = ry;
    add(boxAt(0.04, 0.08, 0.04, 0, CEIL - 0.04, z), M.trim);
  }
  const stopSign = add(boxAt(0.5, 0.1, 0.03, 0.75, CEIL - 0.1, -4.12), M.stop);

  // Busfahrer
  const driver = makeModel(skinById('busfahrer'));
  driver.root.position.set(-0.72, FLOOR + 0.02, -4.92);
  driver.root.scale.setScalar(0.86);
  driver.body.position.y = -0.44;
  driver.legL.rotation.set(1.45, 0, 0.06); driver.kneeL.rotation.x = -1.3;
  driver.legR.rotation.set(1.4, 0, -0.06); driver.kneeR.rotation.x = -1.2;
  reachHand(driver, -1, -0.17, 1.42, -0.47);
  reachHand(driver, 1, 0.17, 1.42, -0.47);
  driver.head.rotation.x = -0.05;
  driver.holder.visible = false; driver.pick.visible = false;
  g.add(driver.root);

  // --- Heißluftballon: Hülle, Skirt, Brenner mit Rahmen, Seile ---
  const bal = add(balloonGeo(), M.balloon);
  bal.position.y = BAL_Y;
  add(new THREE.CylinderGeometry(1.36, 1.55, 1.3, 24, 1, true).translate(0, BAL_Y - 0.62, 0), M.skirt);
  const frame = [];
  for (const y of [7.2, 7.62]) for (const [ax, az, rx] of [[0, -0.5, 0], [0, 0.5, 0], [-0.5, 0, 1], [0.5, 0, 1]]) {
    frame.push({ geo: new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6).rotateZ(Math.PI / 2).rotateY(rx * Math.PI / 2).translate(ax, y, az) });
  }
  for (const sx of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) frame.push({ geo: new THREE.CylinderGeometry(0.025, 0.025, 0.42, 6).translate(sx, 7.41, sz) });
  for (const sx of [-0.2, 0.2]) {
    for (let i = 0; i < 4; i++) frame.push({ geo: new THREE.TorusGeometry(0.15, 0.028, 6, 14).rotateX(Math.PI / 2).translate(sx, 7.32 + i * 0.07, 0) });
    frame.push({ geo: new THREE.CylinderGeometry(0.08, 0.1, 0.18, 10).translate(sx, 7.68, 0) });
  }
  add(merge(frame), M.steel);
  const flame = new THREE.Group();
  flame.position.y = 7.75;
  for (const sx of [-0.2, 0.2]) {
    add(new THREE.ConeGeometry(0.2, 1.7, 12, 1, true).translate(sx, 0.85, 0), M.flame, flame);
    add(new THREE.ConeGeometry(0.08, 0.8, 8, 1, true).translate(sx, 0.4, 0), M.core, flame);
  }
  g.add(flame);
  const ropes = [];
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8;
    const top = V3(Math.cos(a) * 1.38, BAL_Y, Math.sin(a) * 1.38);
    ropes.push(cable(top, V3(Math.sign(Math.cos(a)) * 0.5, 7.62, Math.sign(Math.sin(a)) * 0.5), 0.018));
  }
  for (const sx of [-1, 1]) for (const [sz, bz] of [[-1, -4.6], [1, 4.6], [-1, -1.2], [1, 1.2]]) ropes.push(cable(V3(sx * 0.5, 7.2, sz * 0.5), V3(sx * 0.95, TOP + RR, bz), 0.025));
  add(merge(ropes), M.rope);
  for (const sx of [-1, 1]) for (const bz of [-4.6, -1.2, 1.2, 4.6]) add(boxAt(0.12, 0.08, 0.2, sx * 0.95, TOP + RR + 0.02, bz), M.steel);

  for (const c of g.children) { c.castShadow = false; c.receiveShadow = false; }
  g.visible = false;
  scene.add(g);

  // Türen öffnen (0 = zu, 1 = offen): Flügel schwenken heraus und gleiten zur Seite
  let doorT = -1;
  const setDoors = t => {
    if (t === doorT) return;
    doorT = t;
    const out = Math.min(1, t * 2), slide = Math.max(0, t * 1.4 - 0.4);
    for (const l of doorLeaves) {
      l.position.x = l.userData.x + out * 0.12;
      l.position.z = l.userData.z + l.userData.k * slide * 0.6;
    }
    stopSign.material = t > 0 ? M.red : M.stop;
  };
  setDoors(0);
  return { group: g, wheels, flame, balloon: bal, setDoors };
}

function plateTexture() {
  return canvasTex(256, 56, (x) => {
    x.fillStyle = '#f4f4f4'; x.fillRect(0, 0, 256, 56);
    x.fillStyle = '#1f3fa3'; x.fillRect(0, 0, 28, 56);
    x.strokeStyle = '#111'; x.lineWidth = 4; x.strokeRect(2, 2, 252, 52);
    x.fillStyle = '#111'; x.font = 'bold 36px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('KZ-B 2026', 142, 30);
  });
}
