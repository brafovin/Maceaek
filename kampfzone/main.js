// Kampfzone – Hauptmodul: Renderer, Eingabe, Kamera, Battle-Bus, Spielablauf und Menüs.

import * as THREE from '../vendor/three.module.js';
import { makeTextures } from './textures.js';
import { World } from './physics.js';
import { Pieces, MAT_ORDER, BUILD_MATS } from './pieces.js';
import { Loot } from './loot.js';
import { Fx } from './fx.js';
import { Sfx } from './sfx.js';
import { Zone } from './zone.js';
import { Hud } from './hud.js';
import { buildMap, updateTrafficLights } from './map.js';
import { Actor, OUTFITS, attack, select, startReload, stepActor, animate, updateTimers, rayActors } from './actors.js';
import { Brain, BOT_NAMES } from './bots.js';
import { current, give } from './inventory.js';
import { WEAPONS, itemName, makeWeapon } from './items.js';
import { makeRng, forward, clamp, fmtTime, HALF } from './util.js';
import { merge } from './geo.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const $ = id => document.getElementById(id);

// ---------- Einstellungen ----------

const SETTINGS_KEY = 'kampfzone.settings';
function loadSettings() {
  const def = { sens: 1, vol: 0.7, shadows: true, quality: 'hoch', bots: 19, diff: 'normal' };
  try { return { ...def, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return def; }
}
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(G.settings)); } catch { /* egal */ } }

const G = {
  THREE, time: 0, state: 'loading', actors: [], bots: [], player: null,
  keys: {}, mouse: { l: false, r: false }, settings: loadSettings(),
  buildMode: false, buildKind: 'wall', buildMat: 'holz', lastBuild: 0,
  camYaw: 0, camPitch: 0, camY: 0, aiming: false, scoped: false, hidePlayer: false,
  interact: null, bigMap: false, fireQueued: false, stats: { dmg: 0 },
};
window.KZ = G;

// ---------- Renderer und Szene ----------

const canvas = $('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('err').textContent = 'WebGL ist nicht verfügbar – das Spiel kann nicht starten.';
  $('err').hidden = false;
  throw e;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = G.settings.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc4dcf0, 140, 430);
scene.background = new THREE.Color(0xc4dcf0);
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
camera.rotation.order = 'YXZ';
G.scene = scene; G.camera = camera; G.renderer = renderer;

// Himmel mit Farbverlauf und Sonne
const SUN = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { sun: { value: SUN } },
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 sun; varying vec3 vD;
    void main(){
      float h = clamp(vD.y, -0.2, 1.0);
      vec3 top = vec3(0.24, 0.5, 0.86), hor = vec3(0.77, 0.86, 0.94), low = vec3(0.6, 0.7, 0.75);
      vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.55)) : mix(hor, low, -h * 4.0);
      float s = max(0.0, dot(vD, sun));
      c += vec3(1.0, 0.9, 0.7) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.18);
      gl_FragColor = vec4(c, 1.0);
    }`,
}));
sky.renderOrder = -10;
scene.add(sky);

const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5c6b3c, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d8, 2.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const SC = sun.shadow.camera;
SC.left = SC.bottom = -70; SC.right = SC.top = 70; SC.near = 1; SC.far = 420;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// Wolken
const cloudGeo = merge([
  { geo: new THREE.IcosahedronGeometry(9, 1) },
  { geo: new THREE.IcosahedronGeometry(7, 1).translate(10, -1, 2) },
  { geo: new THREE.IcosahedronGeometry(6, 1).translate(-10, -2, -1) },
  { geo: new THREE.IcosahedronGeometry(5, 1).translate(4, 3, -5) },
]);
const clouds = new THREE.InstancedMesh(cloudGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, emissive: 0x8090a0, emissiveIntensity: 0.4 }), 22);
{
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  for (let i = 0; i < 22; i++) {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6);
    s.set(1 + Math.random() * 1.2, 0.5 + Math.random() * 0.4, 1 + Math.random());
    m.compose(new THREE.Vector3((Math.random() - 0.5) * 600, 150 + Math.random() * 40, (Math.random() - 0.5) * 600), q, s);
    clouds.setMatrixAt(i, m);
  }
  clouds.frustumCulled = false;
  scene.add(clouds);
}

// Battle-Bus mit Ballon
const busMesh = (() => {
  const g = new THREE.Group();
  const M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.2 });
  const add = (geo, m, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; g.add(me); return me; };
  add(new THREE.BoxGeometry(3.2, 3, 11), M(0x2f7fd6), 0, 0, 0);
  add(new THREE.BoxGeometry(3.25, 1.1, 9), M(0x1d2a38), 0, 0.5, 0.6);
  add(new THREE.BoxGeometry(3.0, 1.2, 0.1), M(0x1d2a38), 0, 0.5, -5.52);
  add(new THREE.BoxGeometry(3.3, 0.3, 11.1), M(0xf2f2f2), 0, -0.6, 0);
  for (const [x, z] of [[-1.6, -3.5], [1.6, -3.5], [-1.6, 3.5], [1.6, 3.5]]) add(new THREE.CylinderGeometry(0.7, 0.7, 0.4, 14).rotateZ(Math.PI / 2), M(0x151515), x, -1.5, z);
  const balloon = add(new THREE.SphereGeometry(4.2, 20, 14), M(0x7cc4ff), 0, 9.5, 0);
  balloon.scale.set(1, 1.15, 1.3);
  const stripe = add(new THREE.SphereGeometry(4.25, 20, 14, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.16), M(0xffd23f), 0, 9.5, 0);
  stripe.scale.copy(balloon.scale);
  for (const [x, z] of [[-1.4, -4], [1.4, -4], [-1.4, 4], [1.4, 4]]) {
    const r = add(new THREE.CylinderGeometry(0.04, 0.04, 5.2), M(0xdddddd), x * 0.6, 4.0, z * 0.6);
    r.rotation.set(z > 0 ? -0.35 : 0.35, 0, x > 0 ? 0.15 : -0.15);
  }
  g.visible = false;
  scene.add(g);
  return g;
})();

// ---------- Module ----------

G.tex = makeTextures();
G.world = new World();
G.mapGroup = new THREE.Group();
scene.add(G.mapGroup);
G.pieces = new Pieces(G);
G.loot = new Loot(G);
G.fx = new Fx(G);
G.sfx = new Sfx(G);
G.zone = new Zone(G);
G.hud = new Hud(G);
G.sfx.setVolume(G.settings.vol);
G.bus = { start: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0), speed: 24, dur: 16, t: 0, pos: new THREE.Vector3(), mesh: busMesh };

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const pr = Math.min(window.devicePixelRatio || 1, G.settings.quality === 'hoch' ? 2 : 1);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const sc = h * pr / (2 * Math.tan(camera.fov * Math.PI / 360));
  G.fx.soft.mat.uniforms.uScale.value = sc;
  G.fx.hard.mat.uniforms.uScale.value = sc;
}
window.addEventListener('resize', resize);
resize();

// ---------- Welt aufbauen ----------

function disposeMap() {
  G.mapGroup.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) for (const m of [].concat(o.material)) m.dispose();
  });
  G.mapGroup.clear();
  G.world.clear();
  G.pieces.reset();
  G.loot.reset();
  G.fx.clear();
  for (const a of G.actors) a.dispose();
  G.actors = []; G.bots = []; G.player = null;
  G.zone.reset();
}

function newWorld(seed) {
  disposeMap();
  G.seed = seed;
  G.rng = makeRng(seed);
  G.mapInfo = buildMap(G);
  G.hud.buildMap(G.mapInfo);
}

function planBus(rng) {
  const B = G.bus;
  const a = rng() * Math.PI * 2, off = rng.range(-45, 45);
  B.dir.set(Math.cos(a), 0, Math.sin(a));
  const perp = new THREE.Vector3(-B.dir.z, 0, B.dir.x);
  B.start.copy(B.dir).multiplyScalar(-195).addScaledVector(perp, off).setY(112);
  B.dur = 390 / B.speed;
  B.t = 0;
  B.pos.copy(B.start);
  busMesh.visible = true;
  busMesh.rotation.y = Math.atan2(-B.dir.x, -B.dir.z);
}

G.eject = a => {
  if (a.state !== 'bus') return;
  a.state = 'fall';
  a.pos.copy(G.bus.pos).y -= 3;
  a.vel.set(G.bus.dir.x * 8, -3, G.bus.dir.z * 8);
  if (a === G.player) G.sfx.play('glider', 0.5);
};

function newGame() {
  const S = G.settings;
  const seed = params.has('seed') ? Number(params.get('seed')) : (Math.random() * 1e9) | 0;
  newWorld(seed);
  const rng = G.rng;
  G.time = 0;
  G.stats = { dmg: 0, start: 0 };
  G.buildMode = false; G.buildMat = 'holz'; G.buildKind = 'wall';
  G.killer = null; G.placement = 0; G.endShown = false;
  const player = new Actor(G, { name: 'Du', isPlayer: true, outfit: OUTFITS[0] });
  G.player = player;
  G.actors = [player];
  const names = [...BOT_NAMES].sort(() => rng() - 0.5);
  const nBots = Number(params.get('bots') ?? S.bots);
  for (let i = 0; i < nBots; i++) {
    const b = new Actor(G, { name: names[i % names.length], outfit: OUTFITS[1 + (i % (OUTFITS.length - 1))] });
    new Brain(G, b, S.diff);
    G.actors.push(b);
    G.bots.push(b);
  }
  planBus(rng);
  for (const a of G.actors) { a.state = 'bus'; a.pos.copy(G.bus.pos); }
  for (const b of G.bots) b.brain.planDrop(G.bus, rng);
  G.zone.start(rng);
  player.yaw = Math.atan2(-G.bus.dir.x, -G.bus.dir.z) + 0.6;
  player.pitch = -0.25;
  G.camY = player.pos.y;
  if (params.has('skipbus')) {
    player.state = 'ground';
    player.pos.set(Number(params.get('px') ?? 0), Number(params.get('py') ?? 0.2), Number(params.get('pz') ?? -6));
    player.yaw = Number(params.get('yaw') ?? 0);
    player.pitch = 0;
    G.camY = player.pos.y;
  }
  G.state = 'play';
  G.sfx.play('horn');
  G.hud.notice('Der Bus fliegt los – Leertaste zum Abspringen!', 'info', 3.5);
}

// ---------- Eingabe ----------

const locked = () => document.pointerLockElement === canvas;
function requestLock() {
  if (TEST) return;
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* egal */ }
}

document.addEventListener('pointerlockchange', () => {
  if (!locked() && G.state === 'play' && !TEST) pause();
});

function setBuild(kind) {
  if (!G.player || !G.player.alive || G.player.state !== 'ground') return;
  G.buildMode = true;
  G.buildKind = kind;
  G.player.useT = 0;
  G.player.reloadT = 0;
}
function cycleMat(dir = 1) {
  const i = MAT_ORDER.indexOf(G.buildMat);
  G.buildMat = MAT_ORDER[(i + dir + 3) % 3];
  G.sfx.play('click');
}
function selectSlot(i) {
  const p = G.player;
  if (!p || !p.alive) return;
  G.buildMode = false;
  select(G, p, i);
}

window.addEventListener('keydown', e => {
  if (e.code === 'Tab') e.preventDefault();
  if (G.state !== 'play') return;
  const p = G.player;
  if (!e.repeat) {
    const m = /^Digit([1-7])$/.exec(e.code);
    if (m) selectSlot(Number(m[1]) - 1);
    switch (e.code) {
      case 'KeyQ': setBuild('wall'); break;
      case 'KeyF': setBuild('floor'); break;
      case 'KeyC': setBuild('ramp'); break;
      case 'KeyB': if (G.buildMode) G.buildMode = false; else setBuild(G.buildKind); break;
      case 'KeyG': cycleMat(); break;
      case 'KeyR': if (!G.buildMode) startReload(G, p); break;
      case 'KeyE': interact(); break;
      case 'KeyM': G.bigMap = !G.bigMap; $('bigmapWrap').hidden = !G.bigMap; break;
      case 'Space':
        if (p.state === 'bus') G.eject(p);
        else if (p.state === 'fall') p.deploy = true;
        break;
    }
  }
  G.keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', e => { G.keys[e.code] = false; });
window.addEventListener('blur', () => { G.keys = {}; G.mouse.l = G.mouse.r = false; });

canvas.addEventListener('mousedown', e => {
  G.sfx.init();
  if (G.state !== 'play') return;
  if (!locked() && !TEST) { requestLock(); return; }
  if (e.button === 0) { G.mouse.l = true; G.fireQueued = true; G.fireQueuedAt = G.time; }
  if (e.button === 2) { if (G.buildMode) cycleMat(); else G.mouse.r = true; }
});
window.addEventListener('mouseup', e => {
  if (e.button === 0) G.mouse.l = false;
  if (e.button === 2) G.mouse.r = false;
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('wheel', e => {
  if (G.state !== 'play' || !G.player) return;
  const d = e.deltaY > 0 ? 1 : -1;
  if (G.buildMode) {
    const kinds = ['wall', 'floor', 'ramp'];
    G.buildKind = kinds[(kinds.indexOf(G.buildKind) + d + 3) % 3];
  } else selectSlot((G.player.inv.sel + d + 7) % 7);
}, { passive: true });
window.addEventListener('mousemove', e => {
  if (G.state !== 'play' || !locked() || !G.player) return;
  const p = G.player;
  const zoom = G.aiming ? WEAPONS[current(p.inv).id].zoom : 1;
  const s = 0.0022 * G.settings.sens / Math.sqrt(zoom);
  p.yaw -= e.movementX * s;
  p.pitch = clamp(p.pitch - e.movementY * s, -1.45, 1.45);
});

function interact() {
  const p = G.player, t = G.interact;
  if (!t || !p.alive) return;
  if (t.chest) { G.loot.openChest(t.chest, p); return; }
  const pk = t.pickup, it = pk.item, inv = p.inv;
  const r = give(inv, it);
  if (r === 'taken' || r === 'partial') {
    if (r === 'taken') G.loot.remove(pk);
    G.sfx.play('pickup');
    if (inv.sel === 0 && it.k === 'w') {
      const i = inv.slots.findIndex(s => s && s.k === 'w' && s.id === it.id && s.r === it.r);
      if (i >= 0) select(G, p, i + 1);
    }
    return;
  }
  if (inv.sel === 0) { G.hud.notice('Inventar voll – wähle einen Platz (2–7) zum Tauschen', 'warn'); return; }
  const old = inv.slots[inv.sel - 1];
  inv.slots[inv.sel - 1] = { ...it };
  G.loot.remove(pk);
  p.reloadT = 0; p.useT = 0;
  const f = forward(p.yaw, 0, new THREE.Vector3());
  G.loot.spawn(old, p.pos.x + f.x * 0.8, p.pos.y + 0.6, p.pos.z + f.z * 0.8, f.x * 1.5, 2, f.z * 1.5);
  G.sfx.play('pickup');
}

// ---------- Spieler ----------

const _F = new THREE.Vector3(), _O = new THREE.Vector3(), _D = new THREE.Vector3(), _A = new THREE.Vector3(), _H = new THREE.Vector3();

// Zielpunkt aus der Kamera, Schuss aus dem Kopf der Figur
function computeAim(p) {
  forward(G.camYaw, G.camPitch, _F);
  p.eye(_H);
  const cam = camera.position;
  const s = Math.max(0, (_H.x - cam.x) * _F.x + (_H.y - cam.y) * _F.y + (_H.z - cam.z) * _F.z);
  _A.copy(cam).addScaledVector(_F, s);
  const wh = G.world.raycast(_A.x, _A.y, _A.z, _F.x, _F.y, _F.z, 600);
  let t = wh ? wh.t : 600;
  const ah = rayActors(G, _A, _F, t, p);
  if (ah) t = ah.t;
  _A.addScaledVector(_F, t);
  _O.copy(_H);
  _D.subVectors(_A, _O);
  if (_D.length() < 1.2) _D.copy(_F); else _D.normalize();
  return [_O, _D];
}

function controlPlayer(dt) {
  const p = G.player, K = G.keys;
  if (!p.alive) { G.pieces.hideGhost(); return; }
  if (p.state === 'bus') return;
  let mx = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0), mz = (K.KeyS ? 1 : 0) - (K.KeyW ? 1 : 0);
  const l = Math.hypot(mx, mz);
  if (l > 0) { mx /= l; mz /= l; }
  const y = p.yaw;
  const vx = Math.cos(y) * mx + Math.sin(y) * mz, vz = -Math.sin(y) * mx + Math.cos(y) * mz;
  const cur = current(p.inv);
  let speed;
  if (p.state === 'fall') speed = 17;
  else if (p.state === 'glide') speed = 13;
  else {
    speed = K.ShiftLeft || K.ShiftRight ? 7.8 : 5.8;
    if (G.aiming) speed = 3.8;
    if (p.useT > 0) speed = 2.6;
  }
  p.dive = p.state === 'fall' && p.pitch < -0.6;
  stepActor(G, p, vx * speed, vz * speed, !!K.Space && p.state === 'ground', dt);

  // Bauen oder Kämpfen
  if (G.buildMode && p.state === 'ground') {
    const t = G.pieces.target(p, G.buildKind, G.camYaw, G.camPitch);
    const ok = G.pieces.canBuild(p, t, G.buildMat);
    G.pieces.showGhost(t, ok);
    if (G.mouse.l && ok && G.time - G.lastBuild > 0.1) { G.pieces.build(p, t, G.buildMat); G.lastBuild = G.time; }
    else if (G.mouse.l && G.fireQueued && !ok && t.free) { G.hud.notice(`Nicht genug ${BUILD_MATS[G.buildMat].name} (10 nötig) – Spitzhacke benutzen!`, 'warn', 1.6); }
    G.fireQueued = false;
  } else {
    G.pieces.hideGhost();
    if (G.buildMode) G.buildMode = false;
    if (p.state === 'ground') {
      const W = cur && cur !== 'pickaxe' && cur.k === 'w' ? WEAPONS[cur.id] : null;
      const want = G.mouse.l && (cur === 'pickaxe' || (W && W.auto) || G.fireQueued);
      if (want || (G.fireQueued && cur && cur.k === 'h')) {
        const [o, d] = computeAim(p);
        const fired = attack(G, p, o, d, G.aiming);
        if (fired && W) {
          p.pitch = clamp(p.pitch + W.recoil * (0.7 + Math.random() * 0.4), -1.45, 1.45);
          p.yaw += (Math.random() - 0.5) * W.recoil * 0.5;
        }
        if (fired || !W || G.time - G.fireQueuedAt > 0.25) G.fireQueued = false;
      }
    }
  }
  // Munition und Material automatisch aufsammeln
  for (const pk of G.loot.pickups) {
    const it = pk.item;
    if (it.k !== 'a' && it.k !== 'm') continue;
    if (Math.abs(pk.pos.x - p.pos.x) > 1.6 || Math.abs(pk.pos.z - p.pos.z) > 1.6 || Math.abs(pk.pos.y - p.pos.y) > 1.4) continue;
    if (G.time - pk.born < 0.5) continue;
    const n0 = it.n;
    const r = give(p.inv, it);
    if (r === 'taken') G.loot.remove(pk);
    if (r !== 'full') {
      G.sfx.play('pickup', 0.6);
      if (it.k === 'm') G.hud.matGain(it.id, n0 - it.n);
    }
    break;
  }
  const f = forward(p.yaw, 0, _F);
  G.interact = p.state === 'ground' ? G.loot.nearest(p.pos, f.x, f.z, 2.6, ['w', 'h']) : null;
}

// ---------- Kamera ----------

function updateCamera(dt) {
  const p = G.player;
  if (!p) return;
  if (G.camOverride) { const o = G.camOverride; camera.position.set(...o.p); camera.lookAt(...o.t); G.camYaw = camera.rotation.y; return; }
  const cur = current(p.inv);
  const W = cur && cur !== 'pickaxe' && cur.k === 'w' ? WEAPONS[cur.id] : null;
  G.aiming = !!(G.mouse.r && W && !G.buildMode && p.alive && p.state === 'ground');
  G.scoped = G.aiming && !!W.scope;
  const sprint = (G.keys.ShiftLeft || G.keys.ShiftRight) && p.state === 'ground' && !G.aiming;
  const fov = G.aiming ? 75 / W.zoom : sprint ? 80 : 75;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 14);
    camera.updateProjectionMatrix();
  }
  // Zuschauen nach dem Ausscheiden
  if (!p.alive) {
    const f = G.killer && G.killer.alive ? G.killer : null;
    const c = f ? f.pos : p.pos;
    const a = G.time * 0.35;
    camera.position.set(c.x + Math.sin(a) * 7, c.y + 4, c.z + Math.cos(a) * 7);
    camera.lookAt(c.x, c.y + 1.2, c.z);
    G.camYaw = camera.rotation.y;
    G.hidePlayer = false;
    return;
  }
  const yaw = p.yaw, pitch = p.pitch;
  forward(yaw, pitch, _F);
  if (p.state === 'bus') {
    const b = G.bus.pos;
    camera.position.set(b.x - _F.x * 30, b.y - _F.y * 30 + 6, b.z - _F.z * 30);
    camera.rotation.set(pitch, yaw, 0);
    G.camYaw = yaw; G.camPitch = pitch;
    return;
  }
  const air = p.state === 'fall' || p.state === 'glide';
  const back = G.aiming ? 1.7 : air ? 6.5 : 3.6, side = air ? 0 : G.aiming ? 0.62 : 0.8, up = air ? 1.4 : 0.35;
  if (Math.abs(G.camY - p.pos.y) > 2.5) G.camY = p.pos.y;
  else G.camY += (p.pos.y - G.camY) * Math.min(1, dt * 16);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  _H.set(p.pos.x, G.camY + 1.6, p.pos.z);
  _O.set(_H.x + rx * side - _F.x * back, _H.y + up - _F.y * back, _H.z + rz * side - _F.z * back);
  _D.subVectors(_O, _H);
  const len = _D.length();
  _D.divideScalar(len);
  const h = G.world.raycast(_H.x, _H.y, _H.z, _D.x, _D.y, _D.z, len + 0.3);
  if (h) _O.copy(_H).addScaledVector(_D, Math.max(0.15, h.t - 0.3));
  camera.position.copy(_O);
  camera.rotation.set(pitch, yaw, 0);
  G.camYaw = yaw; G.camPitch = pitch;
  G.hidePlayer = G.scoped || camera.position.distanceTo(_H) < 0.7;
}

// ---------- Ablauf ----------

function separate() {
  const A = G.actors;
  for (let i = 0; i < A.length; i++) {
    const a = A[i];
    if (!a.alive || a.state !== 'ground') continue;
    for (let j = i + 1; j < A.length; j++) {
      const b = A[j];
      if (!b.alive || b.state !== 'ground' || Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.8 && d > 0.001) {
        const push = (0.8 - d) / 2;
        a.pos.x -= dx / d * push; a.pos.z -= dz / d * push;
        b.pos.x += dx / d * push; b.pos.z += dz / d * push;
      }
    }
  }
}

G.onElimination = (t, src, o) => {
  const p = G.player;
  const nm = a => a === p ? '<b class="me">Du</b>' : `<b>${a.name}</b>`;
  let html;
  if (src && src !== t) html = `${nm(src)} ${src === p ? 'hast' : 'hat'} ${t === p ? '<b class="me">dich</b>' : nm(t)} eliminiert <small>${o.weapon || ''}</small>`;
  else if (o.storm) html = `${nm(t)} ${t === p ? 'wurdest' : 'wurde'} vom Sturm erwischt`;
  else html = `${nm(t)} ${t === p ? 'bist' : 'ist'} zu tief gefallen`;
  G.hud.feed(html);
  if (src === p && t !== p) { G.hud.notice(`Du hast ${t.name} eliminiert!`, 'kill', 2); G.sfx.play('kill'); }
  const alive = G.actors.filter(a => a.alive);
  if (t === p) {
    G.placement = alive.length + 1;
    G.killer = src && src !== p ? src : null;
    G.killWeapon = o.weapon || (o.storm ? 'Sturm' : '');
    G.buildMode = false;
    G.pieces.hideGhost();
    G.sfx.play('lose');
    setTimeout(() => showEnd(false), 2200);
  } else if (alive.length === 1 && alive[0] === p) {
    G.placement = 1;
    G.sfx.play('win');
    setTimeout(() => showEnd(true), 1200);
  }
};

function update(dt) {
  G.time += dt;
  $('lockHint').hidden = TEST || G.state !== 'play' || locked();
  const B = G.bus;
  if (busMesh.visible) {
    B.t += dt;
    B.pos.copy(B.start).addScaledVector(B.dir, B.speed * B.t);
    busMesh.position.copy(B.pos);
    busMesh.position.y += Math.sin(B.t * 1.3) * 0.4;
    if (B.t >= B.dur) for (const a of G.actors) if (a.state === 'bus') G.eject(a);
    if (B.t > B.dur + 6) busMesh.visible = false;
  }
  if (G.state === 'play') controlPlayer(dt);
  for (const b of G.bots) b.brain.update(dt);
  separate();
  for (const a of G.actors) {
    if (a.alive) updateTimers(G, a, dt);
    animate(G, a, dt);
  }
  G.pieces.update(dt);
  G.loot.update(dt, camera.position);
  G.fx.update(dt);
  G.zone.update(dt);
  updateTrafficLights(G, G.time);
  updateCamera(dt);
  G.hud.update(dt);
  const p = G.player;
  const out = G.zone.active && p.alive && p.state !== 'bus' && !G.zone.inside(p.pos.x, p.pos.z);
  G.sfx.storm(out ? 1 : 0);
  scene.fog.color.setHex(out ? 0x8a5fb0 : 0xc4dcf0);
  scene.fog.near = out ? 20 : 140; scene.fog.far = out ? 160 : 430;
}

function updateClocks() {
  const d = new Date();
  const h = d.getHours() % 12 + d.getMinutes() / 60, m = d.getMinutes() + d.getSeconds() / 60;
  for (const c of G.clocks || []) {
    c.hour.rotation.z = -h / 12 * Math.PI * 2;
    c.min.rotation.z = -m / 60 * Math.PI * 2;
  }
}

// Titelbild: Kamera kreist über der Stadt
function titleCam(dt) {
  G.time += dt;
  const a = G.time * 0.05;
  camera.position.set(Math.sin(a) * 120, 58, Math.cos(a) * 120);
  camera.lookAt(0, 6, 0);
  G.camYaw = camera.rotation.y;
  updateTrafficLights(G, G.time);
  G.pieces.update(dt);
  G.loot.update(dt, camera.position);
  G.fx.update(dt);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.state === 'play' || G.state === 'end') update(dt);
  else if (G.state === 'title') titleCam(dt);
  updateClocks();
  const fp = G.state === 'title' || !G.player ? camera.position : G.player.pos;
  sun.position.set(fp.x + SUN.x * 160, fp.y + SUN.y * 160, fp.z + SUN.z * 160);
  sun.target.position.set(fp.x, fp.y, fp.z);
  sky.position.copy(camera.position);
  clouds.position.x = (G.time * 1.5) % 200;
  renderer.render(scene, camera);
}

// ---------- Menüs ----------

const CONTROLS = `
<div class="controls">
  <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Laufen</div><div><kbd>Shift</kbd> Sprinten</div>
  <div><kbd>Leertaste</kbd> Springen / Abspringen / Gleiter</div><div><kbd>Maus</kbd> Umsehen</div>
  <div><kbd>Linke Maustaste</kbd> Schießen / Hacken / Bauen / Heilen</div><div><kbd>Rechte Maustaste</kbd> Zielen</div>
  <div><kbd>1</kbd> Spitzhacke &nbsp; <kbd>2</kbd>–<kbd>7</kbd> Inventar</div><div><kbd>Mausrad</kbd> Platz wechseln</div>
  <div><kbd>E</kbd> Truhe öffnen / Aufheben</div><div><kbd>R</kbd> Nachladen</div>
  <div><kbd>Q</kbd> Wand &nbsp;<kbd>F</kbd> Boden &nbsp;<kbd>C</kbd> Rampe</div><div><kbd>G</kbd> / <kbd>Rechte Maustaste</kbd> Material</div>
  <div><kbd>B</kbd> Baumodus an/aus</div><div><kbd>M</kbd> Karte &nbsp; <kbd>Esc</kbd> Pause</div>
</div>`;

function showScreen(html, cls) {
  const s = $('screen');
  s.className = cls || '';
  s.innerHTML = html;
  s.hidden = false;
  document.body.dataset.screen = cls || 'menu';
}
function hideScreen() { $('screen').hidden = true; document.body.dataset.screen = 'game'; }

function showTitle() {
  G.state = 'title';
  $('hud').hidden = true;
  const S = G.settings;
  showScreen(`
    <div class="panel title-panel">
      <h1 class="logo">KAMPF<span>ZONE</span></h1>
      <p class="sub">Spring aus dem Bus, plündere Truhen, baue Deckung – und überlebe bis zum Schluss.</p>
      <div class="opts">
        <label>Gegner <select id="optBots">${[9, 14, 19, 29].map(n => `<option ${n === S.bots ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>Schwierigkeit <select id="optDiff">${[['leicht', 'Leicht'], ['normal', 'Normal'], ['schwer', 'Schwer']].map(([v, n]) => `<option value="${v}" ${v === S.diff ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <button id="btnPlay" class="big">SPIELEN</button>
      ${CONTROLS}
      <p class="tip">Tipp: Mit der Spitzhacke bekommst du Holz aus Bäumen, Stein aus Felsen und Metall aus Autos, Ampeln und Mülltonnen. Jedes Bauteil kostet 10 Material.</p>
    </div>`, 'title');
  $('btnPlay').onclick = () => {
    G.settings.bots = Number($('optBots').value);
    G.settings.diff = $('optDiff').value;
    saveSettings();
    G.sfx.init();
    startPlaying();
  };
}

function startPlaying() {
  newGame();
  hideScreen();
  $('hud').hidden = false;
  requestLock();
}

function pause() {
  if (G.state !== 'play') return;
  G.state = 'paused';
  G.mouse.l = G.mouse.r = false;
  G.keys = {};
  const S = G.settings;
  showScreen(`
    <div class="panel">
      <h2>Pause</h2>
      <button id="btnResume" class="big">Weiterspielen</button>
      <div class="settings">
        <label>Mausempfindlichkeit <input id="setSens" type="range" min="0.2" max="3" step="0.05" value="${S.sens}"><output>${S.sens.toFixed(2)}</output></label>
        <label>Lautstärke <input id="setVol" type="range" min="0" max="1" step="0.05" value="${S.vol}"><output>${Math.round(S.vol * 100)}%</output></label>
        <label>Schatten <input id="setShadows" type="checkbox" ${S.shadows ? 'checked' : ''}></label>
        <label>Grafik <select id="setQuality"><option value="hoch" ${S.quality === 'hoch' ? 'selected' : ''}>Hoch</option><option value="niedrig" ${S.quality === 'niedrig' ? 'selected' : ''}>Niedrig</option></select></label>
      </div>
      ${CONTROLS}
      <div class="row"><button id="btnRestart">Neues Spiel</button><button id="btnMenu">Hauptmenü</button></div>
    </div>`, 'pause');
  $('btnResume').onclick = () => { hideScreen(); G.state = 'play'; requestLock(); };
  $('btnRestart').onclick = () => startPlaying();
  $('btnMenu').onclick = () => { newWorld((Math.random() * 1e9) | 0); showTitle(); };
  $('setSens').oninput = e => { S.sens = Number(e.target.value); e.target.nextElementSibling.textContent = S.sens.toFixed(2); saveSettings(); };
  $('setVol').oninput = e => { S.vol = Number(e.target.value); G.sfx.setVolume(S.vol); e.target.nextElementSibling.textContent = Math.round(S.vol * 100) + '%'; saveSettings(); };
  $('setShadows').onchange = e => {
    S.shadows = e.target.checked; saveSettings();
    renderer.shadowMap.enabled = S.shadows;
    scene.traverse(o => { if (o.material) { for (const m of [].concat(o.material)) m.needsUpdate = true; } });
  };
  $('setQuality').onchange = e => { S.quality = e.target.value; saveSettings(); resize(); };
}

function showEnd(win) {
  if (G.endShown) return;
  G.endShown = true;
  G.state = 'end';
  if (locked()) document.exitPointerLock();
  const p = G.player;
  const time = fmtTime(G.time);
  const by = !win && G.killer ? `Eliminiert von <b>${G.killer.name}</b>${G.killWeapon ? ` (${G.killWeapon})` : ''}` : !win && G.killWeapon === 'Sturm' ? 'Der Sturm hat dich erwischt' : !win ? 'Du bist ausgeschieden' : 'Niemand außer dir ist mehr übrig!';
  showScreen(`
    <div class="panel end-panel ${win ? 'win' : 'lose'}">
      <h1>${win ? '#1 SIEG!' : `Platz #${G.placement}`}</h1>
      <p class="sub">${by}</p>
      <div class="stats">
        <div><b>${p.kills}</b><span>Eliminierungen</span></div>
        <div><b>${Math.round(G.stats.dmg)}</b><span>Schaden</span></div>
        <div><b>${time}</b><span>Spielzeit</span></div>
        <div><b>${G.placement}/${G.actors.length}</b><span>Platz</span></div>
      </div>
      <div class="row"><button id="btnAgain" class="big">Nochmal spielen</button><button id="btnMenu">Hauptmenü</button></div>
    </div>`, 'end');
  $('btnAgain').onclick = () => startPlaying();
  $('btnMenu').onclick = () => { newWorld((Math.random() * 1e9) | 0); showTitle(); };
}

// ---------- Start ----------

newWorld(params.has('seed') ? Number(params.get('seed')) : 12345);
if (TEST && params.has('auto')) {
  $('hud').hidden = false;
  hideScreen();
  newGame();
} else showTitle();
G.ready = true;
G.debug = {
  give(id, r = 2) { const it = makeWeapon(id, r); give(G.player.inv, it); G.player.inv.ammo[WEAPONS[id].ammo] += 120; return itemName(it); },
  tp(x, y, z) { G.player.pos.set(x, y, z); G.player.vel.set(0, 0, 0); G.player.state = 'ground'; G.camY = y; },
  look(yaw, pitch = 0) { G.player.yaw = yaw; G.player.pitch = pitch; },
  step(n = 60, dt = 1 / 60) { for (let i = 0; i < n; i++) update(dt); },
  pause() { G.state = 'paused'; },
  HALF,
};
requestAnimationFrame(frame);
