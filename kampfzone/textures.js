// Prozedurale Texturen (Canvas) – keine Bilddateien nötig.
// Wand-Texturen decken genau eine 4 × 4 m Wand ab (512 px).

import * as THREE from '../vendor/three.module.js';

const R = Math.random;

function cv(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, x: c.getContext('2d'), w, h };
}

function toTex(k, rx = 1, ry = rx) {
  const t = new THREE.CanvasTexture(k.c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Körnung über das ganze Bild
function grain(k, amt) {
  const d = k.x.getImageData(0, 0, k.w, k.h), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const v = (R() - 0.5) * amt;
    p[i] += v; p[i + 1] += v; p[i + 2] += v;
  }
  k.x.putImageData(d, 0, 0);
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) * f)) | 0;
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) * f)) | 0;
  const b = Math.min(255, Math.max(0, (n & 255) * f)) | 0;
  return `rgb(${r},${g},${b})`;
}

// ---------- Untergrund ----------

function grass() {
  const k = cv(512);
  k.x.fillStyle = '#5d9a3a'; k.x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 140; i++) {           // weiche Flecken
    k.x.fillStyle = R() < 0.5 ? 'rgba(80,140,45,0.25)' : 'rgba(120,170,60,0.22)';
    k.x.beginPath(); k.x.arc(R() * 512, R() * 512, 10 + R() * 40, 0, 7); k.x.fill();
  }
  for (let i = 0; i < 5000; i++) {          // Halme
    const x = R() * 512, y = R() * 512, l = 3 + R() * 6;
    k.x.strokeStyle = R() < 0.5 ? 'rgba(60,110,30,0.6)' : 'rgba(150,200,80,0.5)';
    k.x.beginPath(); k.x.moveTo(x, y); k.x.lineTo(x + (R() - 0.5) * 3, y - l); k.x.stroke();
  }
  grain(k, 18);
  return toTex(k);
}

function asphalt(k) {
  k.x.fillStyle = '#3d4044'; k.x.fillRect(0, 0, k.w, k.h);
  for (let i = 0; i < 2500; i++) {
    k.x.fillStyle = R() < 0.5 ? 'rgba(20,20,22,0.5)' : 'rgba(110,110,115,0.35)';
    k.x.fillRect(R() * k.w, R() * k.h, 1.5, 1.5);
  }
  grain(k, 16);
}

// Straße: 8 m breit (u), 16 m lang (v). Mittellinie gestrichelt, Randlinien durchgehend.
function road() {
  const k = cv(256, 512);
  asphalt(k);
  k.x.fillStyle = '#e8e8e0';
  k.x.fillRect(10, 0, 5, 512); k.x.fillRect(241, 0, 5, 512);
  for (let y = 0; y < 512; y += 256) k.x.fillRect(125, y + 40, 6, 110);
  return toTex(k);
}

function plainAsphalt() { const k = cv(256); asphalt(k); return toTex(k); }

function zebra() {
  const k = cv(256, 128);
  k.x.clearRect(0, 0, 256, 128);
  k.x.fillStyle = 'rgba(240,240,232,0.95)';
  for (let x = 8; x < 256; x += 32) k.x.fillRect(x, 0, 16, 128);
  const t = toTex(k); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function sidewalk() {
  const k = cv(256);
  k.x.fillStyle = '#9d9a93'; k.x.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    k.x.fillStyle = shade('#a9a59d', 0.92 + R() * 0.14);
    k.x.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
  }
  grain(k, 20);
  return toTex(k);
}

function paving() {
  const k = cv(256);
  k.x.fillStyle = '#8b857b'; k.x.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
    k.x.fillStyle = shade('#a39b8d', 0.85 + R() * 0.25);
    k.x.fillRect(x * 32 + (y % 2) * 16 + 1, y * 16 + 1, 30, 14);
  }
  grain(k, 18);
  return toTex(k);
}

// ---------- Fassaden ----------

function brickBase(k, base = '#9c4a32') {
  k.x.fillStyle = '#c6b9a6'; k.x.fillRect(0, 0, k.w, k.h);
  const bh = 16, bw = 48;
  for (let row = 0; row * bh < k.h; row++) {
    const off = (row % 2) * bw / 2;
    for (let x = -bw; x < k.w + bw; x += bw) {
      k.x.fillStyle = shade(base, 0.8 + R() * 0.35);
      k.x.fillRect(x + off + 2, row * bh + 2, bw - 3, bh - 3);
    }
  }
  grain(k, 22);
}

function plasterBase(k, base = '#efe9df') {
  k.x.fillStyle = base; k.x.fillRect(0, 0, k.w, k.h);
  for (let i = 0; i < 300; i++) {
    k.x.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.05)';
    k.x.beginPath(); k.x.arc(R() * k.w, R() * k.h, 4 + R() * 20, 0, 7); k.x.fill();
  }
  // Sockel unten
  k.x.fillStyle = 'rgba(80,70,60,0.18)'; k.x.fillRect(0, k.h - 40, k.w, 40);
  grain(k, 14);
}

function woodBase(k, base = '#8a5a34') {
  const pw = 32;
  for (let x = 0; x < k.w; x += pw) {
    k.x.fillStyle = shade(base, 0.82 + R() * 0.3);
    k.x.fillRect(x, 0, pw, k.h);
    k.x.fillStyle = 'rgba(0,0,0,0.35)'; k.x.fillRect(x, 0, 2, k.h);
    for (let i = 0; i < 6; i++) {
      k.x.strokeStyle = 'rgba(40,20,5,0.18)';
      k.x.beginPath(); const xx = x + 4 + R() * (pw - 8);
      k.x.moveTo(xx, 0); k.x.bezierCurveTo(xx + 4, k.h * 0.3, xx - 4, k.h * 0.6, xx + 2, k.h); k.x.stroke();
    }
  }
  grain(k, 16);
}

function officeBase(k) {
  k.x.fillStyle = '#7d8790'; k.x.fillRect(0, 0, k.w, k.h);
  k.x.fillStyle = '#6a737c';
  for (let y = 0; y < k.h; y += 128) k.x.fillRect(0, y, k.w, 6);
  for (let x = 0; x < k.w; x += 128) k.x.fillRect(x, 0, 6, k.h);
  grain(k, 10);
}

function churchBase(k) {
  k.x.fillStyle = '#b9ad94'; k.x.fillRect(0, 0, k.w, k.h);
  const bh = 42;
  for (let row = 0; row * bh < k.h; row++) {
    const off = (row % 2) * 40;
    for (let x = -80; x < k.w + 80; x += 80) {
      k.x.fillStyle = shade('#d4c7a8', 0.82 + R() * 0.25);
      k.x.fillRect(x + off + 2, row * bh + 2, 76, bh - 4);
    }
  }
  grain(k, 20);
}

// Fenster (Koordinaten in Metern auf der 4 × 4 m Wand; y nach oben)
function windowAt(k, x0, y0, w, h, { frame = '#f4f4f0', cross = true, dark = false } = {}) {
  const s = k.w / 4;
  const X = x0 * s, Y = k.h - (y0 + h) * s, W = w * s, H = h * s;
  k.x.fillStyle = 'rgba(0,0,0,0.25)'; k.x.fillRect(X - 6, Y + H, W + 12, 10);   // Schatten unter Fensterbank
  k.x.fillStyle = frame; k.x.fillRect(X - 8, Y - 8, W + 16, H + 16);
  const g = k.x.createLinearGradient(X, Y, X, Y + H);
  if (dark) { g.addColorStop(0, '#3d566d'); g.addColorStop(1, '#1b2836'); }
  else { g.addColorStop(0, '#a7cdec'); g.addColorStop(0.55, '#5e86a8'); g.addColorStop(1, '#2f4a63'); }
  k.x.fillStyle = g; k.x.fillRect(X, Y, W, H);
  k.x.fillStyle = 'rgba(255,255,255,0.22)';
  k.x.beginPath(); k.x.moveTo(X + W * 0.15, Y + H); k.x.lineTo(X + W * 0.45, Y); k.x.lineTo(X + W * 0.6, Y); k.x.lineTo(X + W * 0.3, Y + H); k.x.fill();
  if (cross) {
    k.x.fillStyle = frame;
    k.x.fillRect(X + W / 2 - 4, Y, 8, H);
    k.x.fillRect(X, Y + H * 0.38 - 4, W, 8);
  }
  k.x.fillStyle = shade('#c8c4bc', 1); k.x.fillRect(X - 14, Y + H + 6, W + 28, 10);  // Fensterbank
}

function facade(baseFn, win, arg) {
  const k = cv(512);
  baseFn(k, arg);
  if (win) windowAt(k, 1.15, 1.1, 1.7, 1.6);
  return toTex(k);
}

function officeWin() {
  const k = cv(512);
  officeBase(k);
  const g = k.x.createLinearGradient(0, 40, 0, 470);
  g.addColorStop(0, '#9fc6e6'); g.addColorStop(0.5, '#4e7898'); g.addColorStop(1, '#253e55');
  k.x.fillStyle = g; k.x.fillRect(0, 50, 512, 400);
  k.x.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 3; i++) { const x = 60 + i * 170; k.x.beginPath(); k.x.moveTo(x, 450); k.x.lineTo(x + 90, 50); k.x.lineTo(x + 130, 50); k.x.lineTo(x + 40, 450); k.x.fill(); }
  k.x.fillStyle = '#5b646c';
  for (let x = 0; x <= 512; x += 128) k.x.fillRect(x - 5, 50, 10, 400);
  k.x.fillRect(0, 44, 512, 10); k.x.fillRect(0, 446, 512, 10);
  return toTex(k);
}

// Bunte Kirchenfenster über zwei Wandstücke: unten (Rechteck ab 2.4 m), oben (bis Spitzbogen)
function stained(k, x0, y0, x1, y1, arch) {
  const s = k.w / 4;
  const X0 = x0 * s, X1 = x1 * s, Y1 = k.h - y0 * s, Y0 = k.h - y1 * s;
  k.x.save();
  k.x.beginPath();
  if (arch) {
    const r = (X1 - X0) / 2, cx = (X0 + X1) / 2;
    k.x.moveTo(X0, Y1); k.x.lineTo(X0, Y0 + r); k.x.quadraticCurveTo(X0, Y0, cx, Y0 - r * 0.3); k.x.quadraticCurveTo(X1, Y0, X1, Y0 + r); k.x.lineTo(X1, Y1);
  } else k.x.rect(X0, Y0, X1 - X0, Y1 - Y0);
  k.x.closePath();
  k.x.fillStyle = '#5a4e40'; k.x.lineWidth = 18; k.x.strokeStyle = '#7a6b56'; k.x.stroke(); k.x.fill();
  k.x.clip();
  const cols = ['#c0392b', '#2e86de', '#f1c40f', '#27ae60', '#8e44ad', '#e67e22', '#1abc9c'];
  for (let y = Y0 - 60; y < Y1; y += 26) for (let x = X0; x < X1; x += 26) {
    k.x.fillStyle = cols[(R() * cols.length) | 0];
    k.x.globalAlpha = 0.85; k.x.fillRect(x + 2, y + 2, 22, 22);
  }
  k.x.globalAlpha = 1;
  k.x.strokeStyle = '#2b241c'; k.x.lineWidth = 3;
  for (let y = Y0 - 60; y < Y1; y += 26) { k.x.beginPath(); k.x.moveTo(X0, y); k.x.lineTo(X1, y); k.x.stroke(); }
  for (let x = X0; x < X1; x += 26) { k.x.beginPath(); k.x.moveTo(x, Y0 - 60); k.x.lineTo(x, Y1); k.x.stroke(); }
  k.x.restore();
}

function churchWin(part) {
  const k = cv(512);
  churchBase(k);
  if (part === 'low') stained(k, 1.25, 2.2, 2.75, 4.01, false);
  else stained(k, 1.25, -0.01, 2.75, 3.3, true);
  return toTex(k);
}

// ---------- Innenräume, Böden, Dächer ----------

function wallpaper() {
  const k = cv(256);
  k.x.fillStyle = '#e8dfcf'; k.x.fillRect(0, 0, 256, 256);
  k.x.fillStyle = 'rgba(160,130,90,0.15)';
  for (let x = 0; x < 256; x += 32) k.x.fillRect(x, 0, 10, 256);
  k.x.fillStyle = '#9b8466'; k.x.fillRect(0, 236, 256, 20);
  grain(k, 10);
  return toTex(k);
}

function woodFloor() {
  const k = cv(256);
  for (let y = 0; y < 256; y += 32) {
    for (let x = -64; x < 256; x += 128) {
      const off = (y / 32) % 2 * 64;
      k.x.fillStyle = shade('#9b6a3e', 0.8 + R() * 0.3);
      k.x.fillRect(x + off, y, 127, 31);
    }
  }
  grain(k, 18);
  return toTex(k);
}

function tiles() {
  const k = cv(256);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    k.x.fillStyle = (x + y) % 2 ? '#d9d2c3' : '#6e6253';
    k.x.fillRect(x * 32, y * 32, 32, 32);
  }
  grain(k, 14);
  return toTex(k);
}

function ceiling() {
  const k = cv(128);
  k.x.fillStyle = '#e9e6e0'; k.x.fillRect(0, 0, 128, 128);
  grain(k, 8);
  return toTex(k);
}

function roofGravel() {
  const k = cv(256);
  k.x.fillStyle = '#6b6a66'; k.x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    k.x.fillStyle = shade('#77756f', 0.6 + R() * 0.8);
    k.x.fillRect(R() * 256, R() * 256, 2, 2);
  }
  return toTex(k);
}

function roofTiles() {
  const k = cv(512);
  k.x.fillStyle = '#5a2a1e'; k.x.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 32) for (let x = 0; x < 512; x += 32) {
    const off = (y / 32) % 2 * 16;
    k.x.fillStyle = shade('#9a4630', 0.75 + R() * 0.35);
    k.x.beginPath(); k.x.ellipse(x + off + 16, y + 20, 15, 16, 0, 0, Math.PI); k.x.fill();
    k.x.fillRect(x + off + 1, y, 30, 20);
  }
  grain(k, 16);
  return toTex(k);
}

// ---------- Bauteile der Spieler ----------

function buildWood() {
  const k = cv(256);
  for (let y = 0; y < 256; y += 32) {
    k.x.fillStyle = shade('#c08a52', 0.85 + R() * 0.25); k.x.fillRect(0, y, 256, 32);
    k.x.fillStyle = 'rgba(60,30,10,0.45)'; k.x.fillRect(0, y, 256, 3);
    k.x.fillStyle = 'rgba(60,30,10,0.6)';
    k.x.beginPath(); k.x.arc(30 + R() * 30, y + 16, 2.5, 0, 7); k.x.arc(200 + R() * 30, y + 16, 2.5, 0, 7); k.x.fill();
  }
  k.x.strokeStyle = '#6b4220'; k.x.lineWidth = 16; k.x.strokeRect(8, 8, 240, 240);
  k.x.lineWidth = 12; k.x.beginPath(); k.x.moveTo(14, 242); k.x.lineTo(242, 14); k.x.stroke();
  grain(k, 18);
  return toTex(k);
}

function buildStone() {
  const k = cv(256);
  k.x.fillStyle = '#6d6a66'; k.x.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 42) {
    let x = -(R() * 40);
    while (x < 256) {
      const w = 50 + R() * 40;
      k.x.fillStyle = shade('#a7a39c', 0.75 + R() * 0.35);
      k.x.fillRect(x + 3, y + 3, w - 6, 36);
      x += w;
    }
  }
  k.x.strokeStyle = '#4f4c48'; k.x.lineWidth = 10; k.x.strokeRect(5, 5, 246, 246);
  grain(k, 26);
  return toTex(k);
}

function buildMetal() {
  const k = cv(256);
  for (let x = 0; x < 256; x += 16) {
    const g = k.x.createLinearGradient(x, 0, x + 16, 0);
    g.addColorStop(0, '#6f7d86'); g.addColorStop(0.5, '#b5c2ca'); g.addColorStop(1, '#5d6a73');
    k.x.fillStyle = g; k.x.fillRect(x, 0, 16, 256);
  }
  k.x.strokeStyle = '#3e474d'; k.x.lineWidth = 14; k.x.strokeRect(7, 7, 242, 242);
  k.x.fillStyle = '#d6dde1';
  for (let i = 18; i < 250; i += 38) { for (const [x, y] of [[i, 7], [i, 249], [7, i], [249, i]]) { k.x.beginPath(); k.x.arc(x, y, 3, 0, 7); k.x.fill(); } }
  grain(k, 14);
  return toTex(k);
}

function stairs() {
  const k = cv(256);
  for (let y = 0; y < 256; y += 32) {
    k.x.fillStyle = shade('#8e6038', 0.9 + R() * 0.15); k.x.fillRect(0, y, 256, 32);
    k.x.fillStyle = 'rgba(0,0,0,0.4)'; k.x.fillRect(0, y + 28, 256, 4);
  }
  grain(k, 14);
  return toTex(k);
}

// Zifferblatt für den Kirchturm
function clockFace() {
  const k = cv(256);
  k.x.clearRect(0, 0, 256, 256);
  k.x.fillStyle = '#f3ecd8'; k.x.beginPath(); k.x.arc(128, 128, 120, 0, 7); k.x.fill();
  k.x.lineWidth = 10; k.x.strokeStyle = '#c9a43a'; k.x.stroke();
  k.x.fillStyle = '#2a2a2a';
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    k.x.save(); k.x.translate(128, 128); k.x.rotate(a);
    k.x.fillRect(-4, -108, 8, i % 3 === 0 ? 26 : 16);
    k.x.restore();
  }
  const t = toTex(k); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Weicher runder Lichtfleck (Partikel, Mündungsfeuer)
function glow() {
  const k = cv(64);
  const g = k.x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  k.x.fillStyle = g; k.x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(k.c);
  return t;
}

export function makeTextures() {
  return {
    grass: grass(),
    road: road(),
    asphalt: plainAsphalt(),
    zebra: zebra(),
    sidewalk: sidewalk(),
    paving: paving(),
    brick: facade(brickBase, false),
    brickWin: facade(brickBase, true),
    plaster: facade(plasterBase, false),
    plasterWin: facade(plasterBase, true),
    wood: facade(woodBase, false),
    woodWin: facade(woodBase, true),
    office: facade(officeBase, false),
    officeWin: officeWin(),
    church: facade(churchBase, false),
    churchWinLow: churchWin('low'),
    churchWinHigh: churchWin('high'),
    wallpaper: wallpaper(),
    woodFloor: woodFloor(),
    tiles: tiles(),
    ceiling: ceiling(),
    roofGravel: roofGravel(),
    roofTiles: roofTiles(),
    buildWood: buildWood(),
    buildStone: buildStone(),
    buildMetal: buildMetal(),
    stairs: stairs(),
    clock: clockFace(),
    glow: glow(),
  };
}
