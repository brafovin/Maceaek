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
import { Actor, OUTFITS, attack, select, startReload, stepActor, animate, updateTimers, rayActors, crouchToggle } from './actors.js';
import { WATER, updateWater } from './terrain.js';
import { Brain, BOT_NAMES } from './bots.js';
import { current, give } from './inventory.js';
import { WEAPONS, itemName, makeWeapon } from './items.js';
import { makeRng, forward, clamp, fmtTime, HALF, wrapAngle } from './util.js';
import { merge } from './geo.js';
import { makeBus, SEATS } from './bus.js';
import { Vehicles } from './vehicles.js';
import { Post } from './post.js';
import { Grass } from './grass.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const $ = id => document.getElementById(id);

// ---------- Einstellungen ----------

const SETTINGS_KEY = 'kampfzone.settings';
function loadSettings() {
  const def = { sens: 1, vol: 0.7, shadows: true, quality: 'hoch', bots: 19, diff: 'normal' };
  // Grafikstufen: ultra | hoch | niedrig
  try { return { ...def, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return def; }
}
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(G.settings)); } catch { /* egal */ } }

const G = {
  THREE, time: 0, state: 'loading', actors: [], bots: [], player: null,
  keys: {}, mouse: { l: false, r: false }, settings: loadSettings(),
  buildMode: false, buildKind: 'wall', buildMat: 'holz', lastBuild: 0,
  camYaw: 0, camPitch: 0, camY: 0, aiming: false, scoped: false, hidePlayer: false,
  interact: null, bigMap: false, fireQueued: false, stats: { dmg: 0 },
  editing: null, editHint: null,
  wind: { value: 0 }, shake: 0,
};

// Grafikstufen: Pixeldichte, Nachbearbeitung (Leuchten, Farbe), Schattenauflösung, Gras
const QUALITY = {
  ultra:   { pr: 2,   post: true,  shadow: 4096, grass: [16000, 40] },
  hoch:    { pr: 1.5, post: true,  shadow: 2048, grass: [9000, 32] },
  niedrig: { pr: 1,   post: false, shadow: 1024, grass: null },
};
const Q = () => QUALITY[G.settings.quality] || QUALITY.hoch;
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
const SUN = new THREE.Vector3(0.5, 0.68, 0.42).normalize();
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { sun: { value: SUN } },
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 sun; varying vec3 vD;
    void main(){
      float h = clamp(vD.y, -0.2, 1.0);
      vec3 top = vec3(0.2, 0.45, 0.85), hor = vec3(0.8, 0.88, 0.95), low = vec3(0.55, 0.64, 0.7);
      vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.5)) : mix(hor, low, -h * 4.0);
      c = pow(c, vec3(2.2));
      float s = max(0.0, dot(vD, sun));
      c += vec3(1.0, 0.85, 0.6) * (pow(s, 900.0) * 30.0 + pow(s, 60.0) * 0.6 + pow(s, 8.0) * 0.12);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
sky.renderOrder = -10;
scene.add(sky);

const hemi = new THREE.HemisphereLight(0xdfeaff, 0x6b6a45, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffecd0, 2.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const SC = sun.shadow.camera;
SC.left = SC.bottom = -70; SC.right = SC.top = 70; SC.near = 1; SC.far = 420;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

// Umgebungslicht und Spiegelungen aus dem Himmel (bildbasierte Beleuchtung)
{
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(45, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4a6a32 }));
  ground.position.y = -6;
  envScene.add(ground);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.7;
  pmrem.dispose();
}

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

// Kampfbus (realistischer Linienbus am Heißluftballon)
const BUS = makeBus(scene);
const busMesh = BUS.group;

// ---------- Module ----------

G.tex = makeTextures();
G.world = new World();
G.mapGroup = new THREE.Group();
scene.add(G.mapGroup);
G.pieces = new Pieces(G);
G.loot = new Loot(G);
G.vehicles = new Vehicles(G);
G.fx = new Fx(G);
G.sfx = new Sfx(G);
G.zone = new Zone(G);
G.post = new Post(renderer);
G.grass = null;
G.hud = new Hud(G);
G.sfx.setVolume(G.settings.vol);
G.bus = { start: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0), speed: 24, dur: 16, t: 0, yaw: 0, doors: 3, pos: new THREE.Vector3(), mesh: busMesh };
G.busView = 'innen';

// Sitzplatz einer Figur im Bus (Weltkoordinaten der Füße)
G.seatPos = (a, out, dy = 0.6, kx = 1) => {
  const [x, z] = SEATS[Math.max(0, a.seat) % SEATS.length];
  busMesh.updateMatrixWorld();
  return out.set(x * kx, dy, z).applyMatrix4(busMesh.matrixWorld);
};

function applyQuality() {
  const q = Q();
  if (sun.shadow.mapSize.x !== q.shadow) {
    sun.shadow.mapSize.set(q.shadow, q.shadow);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  if (q.grass && !G.grass) G.grass = new Grass(G, q.grass[0], q.grass[1]);
  if (G.grass && q.grass && G.grass.N !== q.grass[0]) {
    G.scene.remove(G.grass.mesh);
    G.grass = new Grass(G, q.grass[0], q.grass[1]);
  }
  if (G.grass) G.grass.visible = !!q.grass;
  resize();
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const pr = Math.min(window.devicePixelRatio || 1, Q().pr);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  G.post.setSize(Math.round(w * pr), Math.round(h * pr));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const sc = h * pr / (2 * Math.tan(camera.fov * Math.PI / 360));
  G.fx.soft.mat.uniforms.uScale.value = sc;
  G.fx.hard.mat.uniforms.uScale.value = sc;
}
window.addEventListener('resize', resize);
applyQuality();

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
  G.vehicles.reset();
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
  if (G.grass) G.grass.reset();
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
  B.yaw = Math.atan2(-B.dir.x, -B.dir.z);
  busMesh.visible = true;
  busMesh.position.copy(B.pos);
  busMesh.rotation.y = B.yaw;
}

G.eject = a => {
  if (a.state !== 'bus') return;
  if (G.bus.t < G.bus.doors) { if (a === G.player) G.hud.notice('Die Türen sind noch zu …', 'warn', 1.2); return; }
  a.state = 'fall';
  // durch die Mitteltür nach draußen
  G.seatPos(a, a.pos);
  a.pos.addScaledVector(new THREE.Vector3(-G.bus.dir.z, 0, G.bus.dir.x), 2.2).y -= 1.2;
  a.vel.set(G.bus.dir.x * 8, -3, G.bus.dir.z * 8);
  a.yaw = G.bus.yaw;
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
  // Sitzplätze verteilen; der Spieler bekommt einen Fensterplatz
  const seats = SEATS.map((_, i) => i).sort(() => rng() - 0.5);
  const win = seats.indexOf(16);        // Fensterplatz links in der Mitte (freie Sicht)
  [seats[0], seats[win]] = [seats[win], seats[0]];
  G.actors.forEach((a, i) => { a.state = 'bus'; a.seat = seats[i % seats.length]; G.seatPos(a, a.pos); a.yaw = G.bus.yaw; });
  for (const b of G.bots) b.brain.planDrop(G.bus, rng);
  G.zone.start(rng);
  player.yaw = G.bus.yaw + 1.1;   // aus dem Fenster schauen
  player.pitch = -0.15;
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
  finishEdit(false);
  G.buildMode = false;
  select(G, p, i);
}

// ---------- Bearbeiten eigener Bauteile (G) ----------

function findEditTarget(p) {
  forward(G.camYaw, G.camPitch, _F);
  const c = camera.position;
  const h = G.world.raycast(c.x, c.y, c.z, _F.x, _F.y, _F.z, 16, null, false);
  if (!h || !h.c.owner) return null;
  const pc = h.c.owner;
  if (!pc.meta || pc.owner !== p || pc.dead || pc.center.distanceTo(p.pos) > 7.5) return null;
  return pc;
}

function toggleEdit() {
  const p = G.player;
  if (G.editing) { finishEdit(true); return; }
  if (!p.alive || p.state !== 'ground' || p.swimming) return;
  const pc = findEditTarget(p);
  if (!pc) { G.hud.notice('Schau auf ein eigenes Bauteil in der Nähe, um es zu bearbeiten', 'warn', 1.6); return; }
  G.editing = { pc, edit: pc.edit, dir: pc.meta.dir, hover: -1, paint: null };
  G.buildMode = false;
  G.pieces.hideGhost();
  G.sfx.play('click');
}

function finishEdit(apply) {
  const e = G.editing;
  if (!e) return;
  G.editing = null;
  G.pieces.hideEdit();
  G.pieces.hideGhost();
  if (apply && !e.pc.dead && (e.edit !== e.pc.edit || e.dir !== e.pc.meta.dir)) G.pieces.applyEdit(e.pc, e.edit, e.dir);
}

// Kachel unter dem Fadenkreuz
function editHover(e) {
  const pc = e.pc, f = G.pieces.frame(pc), cam = camera.position;
  forward(G.camYaw, G.camPitch, _F);
  if (pc.meta.kind === 'wall') {
    let t, lx;
    if (pc.meta.axis === 'x') { if (Math.abs(_F.z) < 1e-4) return -1; t = (f.oz - cam.z) / _F.z; lx = cam.x + _F.x * t - f.ox; }
    else { if (Math.abs(_F.x) < 1e-4) return -1; t = (f.ox - cam.x) / _F.x; lx = f.oz - (cam.z + _F.z * t); }
    if (t <= 0) return -1;
    const ly = cam.y + _F.y * t - f.oy;
    const c = Math.floor((lx + 2) / (4 / 3)), r = Math.floor(ly / (4 / 3));
    return c >= 0 && c < 3 && r >= 0 && r < 3 ? r * 3 + c : -1;
  }
  if (pc.meta.kind === 'floor') {
    if (Math.abs(_F.y) < 1e-4) return -1;
    const t = (f.oy + 0.1 - cam.y) / _F.y;
    if (t <= 0) return -1;
    const c = Math.floor((cam.x + _F.x * t - f.ox + 2) / 2), r = Math.floor((cam.z + _F.z * t - f.oz + 2) / 2);
    return c >= 0 && c < 2 && r >= 0 && r < 2 ? r * 2 + c : -1;
  }
  return 0;
}

const RAMP_TURN = [2, 3, 1, 0];   // +x → +z → −x → −z → +x
function updateEdit() {
  const e = G.editing, p = G.player;
  if (e.pc.dead || !p.alive || p.state !== 'ground' || p.swimming || e.pc.center.distanceTo(p.pos) > 9) { finishEdit(false); return; }
  e.hover = editHover(e);
  const n = Pieces.tileCount(e.pc.meta.kind);
  if (G.mouse.l && e.hover >= 0) {
    if (n === 0) { if (G.fireQueued) { e.dir = RAMP_TURN[e.dir]; G.sfx.play('click'); } }
    else {
      const bit = 1 << e.hover, full = (1 << n) - 1;
      if (e.paint === null) e.paint = !(e.edit & bit);          // true = Kachel entfernen
      const next = e.paint ? e.edit | bit : e.edit & ~bit;
      if (next !== e.edit && next !== full) { e.edit = next; G.sfx.play('click', 0.6); }
    }
  }
  if (!G.mouse.l) e.paint = null;
  G.fireQueued = false;
  G.pieces.showEdit(e.pc, e.edit, e.dir, e.hover, camera.position);
}

window.addEventListener('keydown', e => {
  if (e.code === 'Tab') e.preventDefault();
  if (G.state !== 'play') return;
  const p = G.player;
  if (!e.repeat) {
    const m = /^Digit([1-7])$/.exec(e.code);
    if (m) selectSlot(Number(m[1]) - 1);
    switch (e.code) {
      case 'KeyQ': finishEdit(false); setBuild('wall'); break;
      case 'KeyF': finishEdit(false); setBuild('floor'); break;
      case 'KeyC': finishEdit(false); setBuild('ramp'); break;
      case 'KeyB': finishEdit(false); if (G.buildMode) G.buildMode = false; else setBuild(G.buildKind); break;
      case 'KeyG': toggleEdit(); break;
      case 'KeyR': if (G.buildMode) cycleMat(); else startReload(G, p); break;
      case 'KeyX': if (!G.editing) crouchToggle(G, p, (G.keys.ShiftLeft || G.keys.ShiftRight) && (G.keys.KeyW || G.keys.KeyA || G.keys.KeyS || G.keys.KeyD)); break;
      case 'KeyV': if (p.state === 'bus') G.busView = G.busView === 'innen' ? 'außen' : 'innen'; break;
      case 'KeyE':
        if (p.state === 'car') G.vehicles.exit(p);
        else if (G.carNear && (!G.interact || G.carNearD < G.interactD)) { finishEdit(false); G.buildMode = false; G.vehicles.enter(p, G.carNear); }
        else interact();
        break;
      case 'KeyH': if (p.state === 'car') G.sfx.at('carhorn', p.pos); break;
      case 'KeyM': G.bigMap = !G.bigMap; $('bigmapWrap').hidden = !G.bigMap; break;
      case 'Space':
        if (p.state === 'bus') G.eject(p);
        else if (p.state === 'fall') p.deploy = true;
        break;
      case 'ShiftLeft': case 'ShiftRight':
        if (p.crouch && p.slideT <= 0) p.crouch = false;   // Sprinten beendet das Schleichen
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
  if (e.button === 2) {
    if (G.editing) { G.editing.edit = 0; G.editing.dir = G.editing.pc.meta.dir; G.sfx.play('click'); }
    else if (G.buildMode) cycleMat();
    else G.mouse.r = true;
  }
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
  G.lastMouse = G.time;
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
  if (p.state === 'car') {
    // Fahren: W/S Gas und Rückwärts, A/D lenken, Leertaste Handbremse
    G.carInput = { throttle: (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0), steer: (K.KeyA ? 1 : 0) - (K.KeyD ? 1 : 0), brake: !!K.Space };
    G.interact = null; G.carNear = null; G.editHint = null;
    G.buildMode = false;
    G.pieces.hideGhost();
    return;
  }
  G.carInput = null;
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
    const sprint = (K.ShiftLeft || K.ShiftRight) && !p.crouch;
    speed = sprint ? 7.8 : p.crouch ? 2.8 : 5.8;
    if (G.aiming) speed = p.crouch ? 2.2 : 3.8;
    if (p.useT > 0) speed = Math.min(speed, 2.6);
  }
  p.dive = p.state === 'fall' && p.pitch < -0.6;
  stepActor(G, p, vx * speed, vz * speed, !!K.Space && p.state === 'ground', dt);

  // Bearbeiten, Bauen oder Kämpfen
  if (p.swimming) { G.buildMode = false; finishEdit(false); }
  G.editHint = !G.editing && p.state === 'ground' && !p.swimming ? findEditTarget(p) : null;
  if (G.editing) updateEdit();
  else if (G.buildMode && p.state === 'ground') {
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
  G.carNear = p.state === 'ground' && !p.swimming ? G.vehicles.nearest(p.pos) : null;
  const ip = G.interact && (G.interact.chest ? G.interact.chest.pos : G.interact.pickup.pos);
  G.interactD = ip ? Math.hypot(ip.x - p.pos.x, ip.z - p.pos.z) : Infinity;
  G.carNearD = G.carNear ? Math.hypot(G.carNear.pos.x - p.pos.x, G.carNear.pos.z - p.pos.z) - 1.2 : Infinity;
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
  const fov = G.aiming ? 75 / W.zoom : p.slideT > 0 ? 84 : sprint && !p.crouch ? 80 : 75;
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
    if (G.busView === 'innen') {
      // vom Sitzplatz aus: Mitspieler, Fahrer und die Landschaft unter dem Bus
      G.seatPos(p, camera.position, 1.78, 0.7);
      G.hidePlayer = true;
    } else {
      const b = G.bus.pos;
      camera.position.set(b.x - _F.x * 30, b.y + 5 - _F.y * 30 + 2, b.z - _F.z * 30);
      G.hidePlayer = false;
    }
    camera.rotation.set(pitch, yaw, 0);
    G.camYaw = yaw; G.camPitch = pitch;
    return;
  }
  if (p.state === 'car' && p.vehicle) {
    // Verfolgerkamera; richtet sich hinter dem Auto aus, wenn die Maus ruht
    const v = p.vehicle;
    if (G.time - (G.lastMouse || 0) > 1.2 && Math.abs(v.speed) > 3) p.yaw += wrapAngle(v.yaw + (v.speed < 0 ? Math.PI : 0) - p.yaw) * Math.min(1, dt * 2.5);
    p.pitch = clamp(p.pitch, -0.7, 0.45);
    forward(p.yaw, p.pitch - 0.12, _F);
    _H.set(v.pos.x, v.pos.y + 1.9, v.pos.z);
    const dist = v.type === 'traktor' ? 7 : 7.5 + Math.abs(v.speed) * 0.06;
    _O.copy(_H).addScaledVector(_F, -dist);
    _O.y += 0.6;
    _D.subVectors(_O, _H);
    const len = _D.length();
    _D.divideScalar(len);
    const h = G.world.raycast(_H.x, _H.y, _H.z, _D.x, _D.y, _D.z, len + 0.3, c => c.owner === v.pc);
    if (h) _O.copy(_H).addScaledVector(_D, Math.max(0.3, h.t - 0.3));
    camera.position.copy(_O);
    camera.rotation.set(p.pitch - 0.12, p.yaw, 0);
    G.camYaw = p.yaw; G.camPitch = p.pitch - 0.12;
    G.hidePlayer = false;
    const cf = 75 + Math.abs(v.speed) * 0.35;
    if (Math.abs(camera.fov - cf) > 0.05) { camera.fov += (cf - camera.fov) * Math.min(1, dt * 6); camera.updateProjectionMatrix(); }
    applyShake(dt);
    return;
  }
  const air = p.state === 'fall' || p.state === 'glide';
  const back = G.aiming ? 1.7 : air ? 6.5 : 3.6, side = air ? 0 : G.aiming ? 0.62 : 0.8, up = air ? 1.4 : 0.35;
  const footY = p.swimming ? WATER - 0.6 : p.pos.y;
  if (Math.abs(G.camY - footY) > 2.5) G.camY = footY;
  else G.camY += (footY - G.camY) * Math.min(1, dt * 16);
  G.camLow = (G.camLow || 0) + ((p.low ? 0.5 : 0) - (G.camLow || 0)) * Math.min(1, dt * 10);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  _H.set(p.pos.x, G.camY + 1.6 - G.camLow, p.pos.z);
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
  applyShake(dt);
}

// Kamerawackeln (Fallschaden, Explosionen in der Nähe)
function applyShake(dt) {
  if (!(G.shake > 0)) return;
  const s = G.shake * 0.22;
  camera.position.x += (Math.random() - 0.5) * s;
  camera.position.y += (Math.random() - 0.5) * s;
  camera.position.z += (Math.random() - 0.5) * s;
  G.shake = Math.max(0, G.shake - dt * 2.2);
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
    busMesh.rotation.z = Math.sin(B.t * 0.9) * 0.012;
    for (const w of BUS.wheels) w.rotation.x -= dt * 3;
    BUS.flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
    if (B.t >= B.dur) for (const a of G.actors) if (a.state === 'bus') G.eject(a);
    for (const a of G.actors) if (a.state === 'bus') { G.seatPos(a, a.pos); if (!a.isPlayer) a.yaw = B.yaw; }
    if (B.t > B.dur + 6) busMesh.visible = false;
  }
  if (G.state === 'play') controlPlayer(dt);
  G.vehicles.update(dt, G.state === 'play' ? G.carInput : null);
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
  updateWater(G, dt);
  for (const b of G.boats || []) { b.position.y = WATER + 0.1 + Math.sin(G.time * 1.3) * 0.06; b.rotation.z = Math.sin(G.time * 0.9) * 0.05; }
  for (const b of G.beams || []) b.rotation.y = G.time * 0.8;
  updateCamera(dt);
  G.hud.update(dt);
  const p = G.player;
  const out = G.zone.active && p.alive && p.state !== 'bus' && !G.zone.inside(p.pos.x, p.pos.z);
  G.sfx.storm(out ? 1 : 0);
  G.sfx.engine(p.alive && p.state === 'car' && p.vehicle ? Math.abs(p.vehicle.speed) / p.vehicle.T.maxF : -1);
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
  updateWater(G, dt);
  for (const b of G.beams || []) b.rotation.y = G.time * 0.8;
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
  G.wind.value += dt;
  if (G.grass) G.grass.update(camera.position, dt);
  if (Q().post) G.post.render(scene, camera);
  else renderer.render(scene, camera);
}

// ---------- Menüs ----------

const CONTROLS = `
<div class="controls">
  <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Laufen</div><div><kbd>Shift</kbd> Sprinten</div>
  <div><kbd>X</kbd> Schleichen (leise, schwer zu entdecken)</div><div><kbd>Shift</kbd> + <kbd>X</kbd> Rutschen</div>
  <div><kbd>Leertaste</kbd> Springen / Abspringen / Gleiter</div><div><kbd>Maus</kbd> Umsehen &nbsp; <kbd>V</kbd> Bus-Ansicht</div>
  <div><kbd>Linke Maustaste</kbd> Schießen / Hacken / Bauen / Heilen</div><div><kbd>Rechte Maustaste</kbd> Zielen</div>
  <div><kbd>1</kbd> Spitzhacke &nbsp; <kbd>2</kbd>–<kbd>7</kbd> Inventar</div><div><kbd>Mausrad</kbd> Platz wechseln</div>
  <div><kbd>E</kbd> Truhe öffnen / Aufheben / Auto ein- und aussteigen</div><div><kbd>R</kbd> Nachladen</div>
  <div>Im Auto: <kbd>W</kbd><kbd>S</kbd> Gas/Bremse &nbsp;<kbd>A</kbd><kbd>D</kbd> Lenken</div><div><kbd>Leertaste</kbd> Handbremse &nbsp; <kbd>H</kbd> Hupe</div>
  <div><kbd>Q</kbd> Wand &nbsp;<kbd>F</kbd> Boden &nbsp;<kbd>C</kbd> Rampe &nbsp;<kbd>B</kbd> Baumodus</div><div><kbd>R</kbd> / <kbd>Rechte Maustaste</kbd> Material (im Baumodus)</div>
  <div><kbd>G</kbd> Eigenes Bauteil bearbeiten</div><div><kbd>M</kbd> Karte &nbsp; <kbd>Esc</kbd> Pause</div>
</div>`;

const QSEL = q => [['ultra', 'Ultra'], ['hoch', 'Hoch'], ['niedrig', 'Niedrig']].map(([v, n]) => `<option value="${v}" ${v === q ? 'selected' : ''}>${n}</option>`).join('');

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
        <label>Grafik <select id="optQuality">${QSEL(S.quality)}</select></label>
        <label>Schwierigkeit <select id="optDiff">${[['leicht', 'Leicht'], ['normal', 'Normal'], ['schwer', 'Schwer']].map(([v, n]) => `<option value="${v}" ${v === S.diff ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <button id="btnPlay" class="big">SPIELEN</button>
      ${CONTROLS}
      <p class="tip">Tipp: Mit der Spitzhacke bekommst du Holz aus Bäumen, Stein aus Felsen und Metall aus Autos, Ampeln und Mülltonnen. Jedes Bauteil kostet 10 Material. Auf dem Boden liegen nur schwache Waffen – die guten sind in den Truhen. Zur Insel im See musst du schwimmen oder eine Brücke bauen. Autos kannst du fahren – aber Vorsicht vor Fallschaden und Unfällen!</p>
    </div>`, 'title');
  $('btnPlay').onclick = () => {
    G.settings.bots = Number($('optBots').value);
    G.settings.diff = $('optDiff').value;
    if (G.settings.quality !== $('optQuality').value) { G.settings.quality = $('optQuality').value; applyQuality(); }
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
        <label>Grafik <select id="setQuality">${QSEL(S.quality)}</select></label>
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
  $('setQuality').onchange = e => { S.quality = e.target.value; saveSettings(); applyQuality(); };
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
