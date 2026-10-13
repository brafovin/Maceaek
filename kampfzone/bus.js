// Der Kampfbus: ein realistischer Linienbus (Fenster, Türen, Sitze, Haltestangen, Fahrer), der an einem
// Heißluftballon über die Karte fliegt. Alle Spieler sitzen darin, bis sie abspringen.

import * as THREE from '../vendor/three.module.js';
import { merge, boxAt } from './geo.js';
import { makeModel } from './actors.js';

const L = 12, Wd = 2.55;                 // Länge und Breite
const YEL = 0xf2c018, SKIRT = 0x33373b, TRIM = 0x16191c, SEAT = 0x2b4f9c, RAIL = 0xe8c21a;

// Sitzplätze: 10 Reihen, je 2 + 2 Sitze, Gang in der Mitte
export const SEATS = [];
for (let r = 0; r < 10; r++) for (const x of [-0.95, -0.5, 0.5, 0.95]) SEATS.push([x, -3.15 + r * 0.92]);

function destTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 80;
  const x = c.getContext('2d');
  x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, 512, 80);
  x.font = 'bold 54px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#ffa31a'; x.shadowColor = '#ff7a00'; x.shadowBlur = 12;
  x.fillText('◀ KAMPFZONE', 256, 42);
  // LED-Raster
  x.globalCompositeOperation = 'destination-in';
  for (let j = 0; j < 80; j += 4) for (let i = 0; i < 512; i += 4) x.fillRect(i, j, 3, 3);
  x.globalCompositeOperation = 'destination-over';
  x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, 512, 80);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function plateTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 56;
  const x = c.getContext('2d');
  x.fillStyle = '#f4f4f4'; x.fillRect(0, 0, 256, 56);
  x.fillStyle = '#1f3fa3'; x.fillRect(0, 0, 28, 56);
  x.strokeStyle = '#111'; x.lineWidth = 4; x.strokeRect(2, 2, 252, 52);
  x.fillStyle = '#111'; x.font = 'bold 36px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('KZ-B 2026', 142, 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Heißluftballon mit Längsstreifen
function balloonGeo() {
  const prof = [[0.5, 0], [1.6, 0.6], [3.6, 2.4], [5.6, 5], [6.6, 8], [6.4, 10.6], [5.2, 12.8], [3, 14.3], [0.05, 14.9]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(prof, 24).toNonIndexed();
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const A = new THREE.Color(0xd8342a), B = new THREE.Color(0xf6c445), C = new THREE.Color(0x2f6fd0);
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const s = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 24 + 0.5) % 3;
    const c = s === 0 ? A : s === 1 ? B : C;
    for (let v = 0; v < 3; v++) col.set([c.r, c.g, c.b], (i + v) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function makeBus(scene) {
  const g = new THREE.Group();
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.5, ...o });
  const M = {
    body: std({ color: YEL, metalness: 0.25, roughness: 0.35 }),
    skirt: std({ color: SKIRT }),
    trim: std({ color: TRIM, roughness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x223644, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.6, depthWrite: false, side: THREE.DoubleSide }),
    chrome: std({ color: 0xcfd4d8, metalness: 0.9, roughness: 0.2 }),
    tire: std({ color: 0x141414, roughness: 0.9 }),
    light: new THREE.MeshBasicMaterial({ color: 0xfff6d8 }),
    red: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
    amber: new THREE.MeshBasicMaterial({ color: 0xffa21a }),
    inner: std({ color: 0xdfe4e8, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x4a5056 }),
    floor: std({ color: 0x5d6873, roughness: 0.9, emissive: 0x1c2126 }),
    vcol: std({ vertexColors: true, roughness: 0.7, emissive: 0x262a2e }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff8e0 }),
    dest: new THREE.MeshBasicMaterial({ map: destTexture() }),
    plate: new THREE.MeshBasicMaterial({ map: plateTexture() }),
    balloon: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }),
    rope: std({ color: 0x8a7a5a }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.85 }),
  };
  const add = (geo, m, parent = g) => { const me = new THREE.Mesh(geo, m); parent.add(me); return me; };
  const hx = Wd / 2;
  // --- Karosserie ---
  add(boxAt(Wd, 0.26, L - 0.1, 0, 0.45, 0), M.skirt);
  add(boxAt(Wd, 0.78, L, 0, 0.97, 0), M.body);                 // untere Seitenwände
  add(boxAt(Wd + 0.01, 0.07, L + 0.01, 0, 1.38, 0), M.trim);   // Zierleiste
  add(boxAt(Wd, 0.5, L, 0, 2.82, 0), M.body);                   // Dachkante
  add(boxAt(Wd - 0.3, 0.12, L - 0.4, 0, 3.12, 0), M.body);      // Dachwölbung
  // Fensterband: dunkle Säulen + Glas, rechts mit zwei Türen
  const pillars = [];
  for (let z = -4.6; z <= 5.6; z += 1.45) for (const sx of [-1, 1]) pillars.push({ geo: boxAt(0.06, 1.16, 0.12, sx * (hx - 0.02), 1.99, z) });
  add(merge(pillars), M.trim);
  for (const sx of [-1, 1]) {
    const gl = add(new THREE.PlaneGeometry(L - 1.0, 1.16), M.glass);
    gl.position.set(sx * (hx - 0.01), 1.99, 0.45);
    gl.rotation.y = sx * Math.PI / 2;
  }
  // Türen (rechte Seite, +x): zwei Glasflügel mit schmalen Rahmen
  const frames = [];
  for (const zc of [-5.05, 0.35]) {
    for (const dz of [-0.62, 0, 0.62]) frames.push({ geo: boxAt(0.06, 2.1, 0.06, hx + 0.03, 1.5, zc + dz) });
    for (const y of [0.46, 1.5, 2.54]) frames.push({ geo: boxAt(0.06, 0.06, 1.3, hx + 0.03, y, zc) });
    for (const dz of [-0.31, 0.31]) {
      const dg = add(new THREE.PlaneGeometry(0.56, 2.0), M.glass);
      dg.position.set(hx + 0.035, 1.5, zc + dz);
      dg.rotation.y = Math.PI / 2;
    }
    frames.push({ geo: boxAt(0.05, 0.04, 0.5, hx + 0.08, 1.3, zc) });
  }
  add(merge(frames), M.trim);
  // Front: Windschutzscheibe, Zielanzeige, Scheinwerfer, Stoßfänger, Spiegel
  const ws = add(new THREE.PlaneGeometry(Wd - 0.2, 1.85), M.glass);
  ws.position.set(0, 1.85, -L / 2 - 0.01); ws.rotation.y = Math.PI;
  add(boxAt(Wd, 0.2, 0.06, 0, 2.9, -L / 2 + 0.01), M.trim);
  const dest = add(new THREE.PlaneGeometry(2.0, 0.32), M.dest); dest.position.set(0, 2.83, -L / 2 - 0.04); dest.rotation.y = Math.PI;
  add(boxAt(Wd + 0.06, 0.22, 0.12, 0, 0.42, -L / 2 - 0.02), M.trim);
  for (const sx of [-1, 1]) {
    add(boxAt(0.42, 0.16, 0.05, sx * 0.88, 0.72, -L / 2 - 0.02), M.light);
    add(boxAt(0.18, 0.12, 0.05, sx * 1.12, 0.92, -L / 2 - 0.02), M.amber);
    add(boxAt(0.04, 0.04, 0.55, sx * (hx + 0.2), 2.35, -L / 2 + 0.2), M.trim);
    add(boxAt(0.08, 0.38, 0.22, sx * (hx + 0.32), 2.15, -L / 2 + 0.05), M.trim);
    add(boxAt(0.035, 0.02, 0.9, sx * 0.45, 1.05, -L / 2 - 0.03).rotateX(0.0).rotateZ(sx * 0.5), M.trim);
  }
  const pf = add(new THREE.PlaneGeometry(0.52, 0.12), M.plate); pf.position.set(0, 0.42, -L / 2 - 0.09); pf.rotation.y = Math.PI;
  // Heck
  const rw = add(new THREE.PlaneGeometry(Wd - 0.5, 0.75), M.glass); rw.position.set(0, 2.05, L / 2 + 0.01);
  add(boxAt(Wd + 0.06, 0.22, 0.12, 0, 0.42, L / 2 + 0.02), M.trim);
  add(boxAt(1.6, 0.5, 0.04, 0, 1.05, L / 2 + 0.01), M.trim);
  for (const sx of [-1, 1]) add(boxAt(0.2, 0.45, 0.05, sx * 1.08, 1.0, L / 2 + 0.02), M.red);
  const pr = add(new THREE.PlaneGeometry(0.52, 0.12), M.plate); pr.position.set(0, 0.62, L / 2 + 0.035);
  // Dach: Klimaanlagen
  add(boxAt(1.7, 0.3, 2.2, 0, 3.32, -1.5), M.chrome);
  add(boxAt(1.7, 0.3, 1.6, 0, 3.32, 3.2), M.chrome);
  // Räder mit Felgen und Radkästen
  const wheels = [];
  for (const z of [-3.85, 3.55]) for (const sx of [-1, 1]) {
    add(boxAt(0.04, 0.55, 1.3, sx * (hx + 0.01), 0.62, z), M.trim);
    const w = new THREE.Group();
    w.position.set(sx * (hx - 0.18), 0.5, z);
    add(new THREE.CylinderGeometry(0.5, 0.5, 0.32, 20).rotateZ(Math.PI / 2), M.tire, w);
    add(new THREE.CylinderGeometry(0.28, 0.28, 0.34, 12).rotateZ(Math.PI / 2), M.chrome, w);
    add(boxAt(0.36, 0.06, 0.5, 0, 0, 0), M.trim, w);
    g.add(w);
    wheels.push(w);
  }
  // --- Innenraum ---
  add(boxAt(Wd - 0.1, 0.05, L - 0.2, 0, 0.58, 0), M.floor);
  const ceil = add(new THREE.PlaneGeometry(Wd - 0.12, L - 0.2), M.inner); ceil.rotation.x = Math.PI / 2; ceil.position.y = 2.56;
  // Innenverkleidung unter den Fenstern, vorne und hinten
  for (const sx of [-1, 1]) {
    const pn = add(new THREE.PlaneGeometry(L - 0.2, 0.8), M.inner);
    pn.position.set(sx * (hx - 0.05), 0.98, 0); pn.rotation.y = Math.PI / 2;
  }
  const back = add(new THREE.PlaneGeometry(Wd - 0.1, 1.98), M.inner); back.position.set(0, 1.57, L / 2 - 0.05);
  const frontLow = add(new THREE.PlaneGeometry(Wd - 0.1, 0.5), M.inner); frontLow.position.set(0, 0.83, -L / 2 + 0.05);
  const seatParts = [];
  for (const [x, z] of SEATS) {
    seatParts.push({ geo: boxAt(0.42, 0.12, 0.44, x, 0.98, z), color: SEAT });
    seatParts.push({ geo: boxAt(0.42, 0.62, 0.08, x, 1.3, z + 0.24), color: SEAT });
    seatParts.push({ geo: boxAt(0.06, 0.4, 0.06, x, 0.75, z), color: 0x777c80 });
  }
  // Haltestangen (gelb), Deckenlampen
  for (let z = -3.6; z <= 5; z += 1.84) for (const x of [-0.27, 0.27]) seatParts.push({ geo: new THREE.CylinderGeometry(0.022, 0.022, 1.98, 6).translate(x, 1.57, z), color: RAIL });
  for (const x of [-0.27, 0.27]) seatParts.push({ geo: new THREE.CylinderGeometry(0.02, 0.02, L - 1.4, 6).rotateX(Math.PI / 2).translate(x, 2.42, 0.2), color: RAIL });
  add(merge([-0.75, 0.75].map(x => ({ geo: boxAt(0.2, 0.03, L - 1.6, x, 2.535, 0.2) }))), M.lamp);
  // Fahrerplatz mit Lenkrad
  seatParts.push({ geo: boxAt(0.5, 0.12, 0.5, -0.72, 1.0, -4.95), color: 0x222222 });
  seatParts.push({ geo: boxAt(0.5, 0.7, 0.1, -0.72, 1.35, -4.68), color: 0x222222 });
  seatParts.push({ geo: boxAt(1.0, 0.75, 0.6, -0.55, 0.95, -5.65), color: 0x2e3236 });
  seatParts.push({ geo: new THREE.TorusGeometry(0.2, 0.025, 6, 16).rotateX(-1.1).translate(-0.72, 1.45, -5.42), color: 0x111111 });
  // Trennwand vorne rechts (Tür-Aussparung bleibt frei)
  seatParts.push({ geo: boxAt(0.04, 1.0, 0.8, 0.3, 1.1, -4.2), color: 0xb5bcc2 });
  add(merge(seatParts), M.vcol);
  const driver = makeModel({ shirt: 0x2f4f7a, pants: 0x22272e, skin: 0xe2b48c, hair: 0x5a4632, pack: 0x2f4f7a });
  driver.root.position.set(-0.72, 0.6, -4.92);
  driver.root.scale.setScalar(0.86);
  driver.body.position.y = -0.44;
  driver.legL.rotation.set(-1.45, 0, 0.05); driver.legR.rotation.set(-1.45, 0, -0.05);
  driver.armL.rotation.set(1.2, 0, 0.2); driver.armR.rotation.set(1.2, 0, -0.2);
  driver.holder.visible = false; driver.pick.visible = false;
  g.add(driver.root);
  // --- Ballon mit Seilen und Brenner ---
  const bal = add(balloonGeo(), M.balloon);
  bal.position.y = 8.2;
  const ropes = [];
  for (const [x, z] of [[-1.1, -4.8], [1.1, -4.8], [-1.1, 4.8], [1.1, 4.8], [-1.1, 0], [1.1, 0]]) {
    const top = new THREE.Vector3(x * 0.35, 8.3, z * 0.25), bot = new THREE.Vector3(x, 3.15, z);
    const len = top.distanceTo(bot);
    const r = new THREE.CylinderGeometry(0.03, 0.03, len, 5);
    const m = new THREE.Matrix4().lookAt(bot, top, new THREE.Vector3(0, 1, 0)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    m.setPosition(bot.clone().add(top).multiplyScalar(0.5));
    ropes.push({ geo: r, m });
  }
  add(merge(ropes), M.rope);
  add(new THREE.CylinderGeometry(0.4, 0.5, 0.4, 10).translate(0, 7.9, 0), M.trim);
  const flame = add(new THREE.ConeGeometry(0.3, 1.4, 10).translate(0, 8.9, 0), M.flame);
  for (const c of g.children) { c.castShadow = false; c.receiveShadow = false; }
  g.visible = false;
  scene.add(g);
  return { group: g, wheels, flame, balloon: bal };
}
