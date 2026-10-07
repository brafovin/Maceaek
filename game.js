import * as THREE from './vendor/three.module.js';
import allLevels from './levels/index.js';
import { createGfx, readQuality, writeQuality } from './gfx.js';
import * as fx from './fx.js';
import { audio, gameAudio } from './audio.js';

const LEVELS = [...allLevels];
const params = new URLSearchParams(location.search);

// emiter zdarzeń dla interfejsu (ui.js): levelstart, levelcomplete, death, toast, pause, resume, lockerror
const events = new EventTarget();
function emit(type, detail = {}) { events.dispatchEvent(new CustomEvent(type, { detail })); }

/* ==========================================================================
   Maceaek – komora testowa z działem portalowym
   WASD + mysz, LPM = niebieski portal, PPM = pomarańczowy portal
   ========================================================================== */

// ---------------------------------------------------------------- stałe ----
const PLAYER_R = 0.3;        // połowa szerokości gracza
const PLAYER_H = 1.8;        // wysokość gracza
const EYE_H = 1.62;          // wysokość oczu od stóp
const GRAVITY = 24;
const JUMP_V = 8.4;
const WALK = 6;
const RUN = 10;
const STEP_H = 0.55;         // automatyczne wchodzenie na schodki
const PORTAL_HW = 0.65;      // połowa szerokości portalu
const PORTAL_HH = 1.15;      // połowa wysokości portalu
const PORTAL_MIN_EXIT = 3.5; // minimalna prędkość wylotu z portalu
let MAX_DEPTH = 2;           // ile poziomów „portal w portalu” jest renderowane (preset jakości)
const NEAR = 0.03;
const ACID_Y = -5;

const COLORS = [0x2d9bff, 0xff8a1f];

// ------------------------------------------------------------- renderer ----
const canvas = document.getElementById('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  const err = document.getElementById('err');
  err.style.display = 'block';
  err.textContent = 'Twoja przeglądarka nie obsługuje WebGL – gra nie może się uruchomić.';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setClearColor(0x05070a);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, NEAR, 250);
camera.rotation.order = 'YXZ';
fx.init({ scene, camera, renderer, COLORS, PORTAL_HW, PORTAL_HH, EYE_H, ACID_Y });

// oświetlenie sceny – świat ma światło wypalone w kolorach wierzchołków (gfx.js), te światła dotyczą
// tylko materiałów Lambert (np. podstawa przycisku)
scene.add(new THREE.AmbientLight(0xffffff, 1.15));
scene.add(new THREE.HemisphereLight(0xdfeaff, 0x6b7280, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(0.5, 1, 0.35);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xbcd0ff, 0.55);
fill.position.set(-0.6, 0.3, -0.8);
scene.add(fill);

// ------------------------------------------------------------- tekstury ----
function makeCanvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

function speckle(g, s, n, alpha) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
}

// materiały i tekstury świata, wypalone światło, lampy, mgła, presety jakości – gfx.js
const gfx = createGfx(THREE, renderer, scene);
const MATS = gfx.MATS;

// ----------------------------------------------------------------- świat ----
const world = new THREE.Group();
scene.add(world);
const boxes = [];        // kolizje AABB
const worldMeshes = [];  // do raycastu
const levelObjects = []; // dodatkowe obiekty poziomu (kwas, lampy, pad…)
const levelAnim = {};

function addBox(x0, y0, z0, x1, y1, z1, kind = 'white') {
  const m = MATS[kind];
  // ten mesh służy do raycastu i drzwi; wygląd świata powstaje w gfx.bake (wypalone światło)
  const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const mesh = new THREE.Mesh(geo, m.mat);
  const box = {
    min: new THREE.Vector3(x0, y0, z0),
    max: new THREE.Vector3(x1, y1, z1),
    kind,
    portalable: m.portalable,
    shootThrough: !!m.shootThrough,
    disabled: false,    // otwarte drzwi nie kolidują i nie przyjmują strzałów
  };
  mesh.userData.box = box;
  world.add(mesh);
  worldMeshes.push(mesh);
  boxes.push(box);
  return box;
}

function addObject(obj) {
  scene.add(obj);
  levelObjects.push(obj);
  return obj;
}

const WALL_T = 2;

function addSign(text, sub, w, h, x, y, z, ry = 0) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = Math.round(1024 * h / w);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(20,24,30,.92)'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(14, 14, c.width - 28, c.height - 28);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${Math.round(c.height * 0.3)}px system-ui, sans-serif`;
  g.fillText(text, c.width / 2, sub ? c.height * 0.42 : c.height / 2);
  if (sub) {
    g.font = `400 ${Math.round(c.height * 0.14)}px system-ui, sans-serif`;
    g.fillStyle = '#9fb3c8';
    g.fillText(sub, c.width / 2, c.height * 0.76);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.sign = true;
  return addObject(m);
}

// API dostępne dla definicji poziomów (levels/*.js)
const LevelAPI = {
  box: addBox,
  // pokój: podłoga NIE jest tworzona (robi to floor()), ściany od y=-8 do h, sufit, lampy
  room(x0, x1, z0, z1, h, o = {}) {
    const k = { n: 'white', s: 'white', e: 'white', w: 'white', ceil: 'floor', ...o };
    const T = WALL_T;
    addBox(x0 - T, -8, z0 - T, x1 + T, h, z0, k.n);
    addBox(x0 - T, -8, z1, x1 + T, h, z1 + T, k.s);
    addBox(x0 - T, -8, z0, x0, h, z1, k.w);
    addBox(x1, -8, z0, x1 + T, h, z1, k.e);
    addBox(x0 - T, h, z0 - T, x1 + T, h + 2, z1 + T, k.ceil);
    for (let x = x0 + 4; x < x1; x += 8) for (let z = z0 + 4; z < z1; z += 8) gfx.addLamp(x, h, z);
  },
  floor(x0, x1, z0, z1, kind = 'floor') { return addBox(x0, -8, z0, x1, 0, z1, kind); },
  // kostka (y = wysokość podłoża, na którym leży)
  cube(x, y, z) { return makeCube(x, y, z); },
  // przycisk naciskany przez gracza lub kostkę: id, środek (x,z), opcje {y, r, timer}
  button(id, x, z, o) { return addButton(id, x, z, o); },
  // drzwi otwierane przez przyciski (ids = id lub tablica), opcje {mode:'all'|'any', invert}
  door(ids, x0, y0, z0, x1, y1, z1, o) { return addDoor(ids, x0, y0, z0, x1, y1, z1, o); },
  // fizzler: usuwa portale gracza i niszczy (resetuje) kostki
  fizzler(x0, y0, z0, x1, y1, z1) { return addFizzler(x0, y0, z0, x1, y1, z1); },
  // tablica na ścianie (dekoracja)
  sign(text, sub, w, h, x, y, z, ry = 0) { return addSign(text, sub, w, h, x, y, z, ry); },
  // dół z kwasem – dziurę w podłodze tworzą sąsiednie floor()
  pit(x0, x1, z0, z1) {
    addBox(x0, -8, z0, x1, -6, z1, 'dark');
    gfx.addPit(x0, x1, z0, z1);
    addObject(fx.makeAcid(x0, x1, z0, z1));
  },
};

function clearLevel() {
  gfx.clear();
  for (const m of worldMeshes) { world.remove(m); m.geometry.dispose(); }
  worldMeshes.length = 0;
  boxes.length = 0;
  for (const o of levelObjects) {
    scene.remove(o);
    o.traverse(c => {
      c.geometry?.dispose();
      if (c.userData.sign) { c.material.map?.dispose(); c.material.dispose(); }   // tekstura tablicy jest własna dla poziomu
    });
  }
  levelObjects.length = 0;
  resetMechanics();
  fx.clearLevel();
}

// ---------------------------------------------------------------- portale ----
const DUMMY_TEX = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
DUMMY_TEX.needsUpdate = true;

// shader portalu (wir, pierścień, refrakcja, rozbłysk otwarcia) – w fx.js; tMap/uUseTex/vClip działają jak dawniej
const portalVert = fx.portalVert;
const portalFrag = fx.portalFrag;

const ROT180Y = new THREE.Matrix4().makeRotationY(Math.PI);

class Portal {
  constructor(index) {
    this.index = index;
    this.active = false;
    this.other = null;
    this.pos = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 0, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.right = new THREE.Vector3(1, 0, 0);
    this.frame = new THREE.Matrix4();
    this.frameInv = new THREE.Matrix4();
    this.host = null;
    this.open = 0;

    this.uniforms = fx.portalUniforms(COLORS[index], DUMMY_TEX);
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: portalVert,
      fragmentShader: portalFrag,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), this.material);
    this.disc.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    this.group.add(this.disc, fx.makeHalo(this));
    this.group.visible = false;
    scene.add(this.group);
  }

  place(pos, normal, up, host) {
    if (this.active) fx.portalGone(this);
    this.pos.copy(pos);
    this.normal.copy(normal);
    this.up.copy(up);
    this.right.crossVectors(up, normal).normalize();
    this.frame.makeBasis(this.right, this.up, this.normal).setPosition(this.pos);
    this.frameInv.copy(this.frame).invert();
    this.host = host;
    this.active = true;
    this.open = 0;
    this.group.visible = true;
    this.group.matrix.copy(this.frame);
    this.group.matrix.multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.004));
    this.group.matrixWorldNeedsUpdate = true;
    this.updateScale();
  }

  updateScale() {
    const e = this.open;
    const s = 1 - Math.pow(1 - e, 3) * Math.cos(e * 5.5) * 0.9; // sprężysty „wskok”
    const k = Math.max(0.001, e >= 1 ? 1 : s * e);
    this.disc.scale.set(PORTAL_HW / 0.88 * k, PORTAL_HH / 0.88 * k, 1);
    this.uniforms.uOpen.value = e;
  }

  clear(silent) {
    if (this.active && !silent) fx.portalGone(this);
    this.active = false;
    this.group.visible = false;
  }

  get linked() { return this.active && this.other.active; }
}

const portals = [new Portal(0), new Portal(1)];
portals[0].other = portals[1];
portals[1].other = portals[0];

// macierz przejścia A -> B:  B * Rot180Y * A^-1
function portalTransform(a, out = new THREE.Matrix4()) {
  return out.copy(a.other.frame).multiply(ROT180Y).multiply(a.frameInv);
}
const transforms = [new THREE.Matrix4(), new THREE.Matrix4()];
function refreshTransforms() {
  if (portals[0].active && portals[1].active) {
    portalTransform(portals[0], transforms[0]);
    portalTransform(portals[1], transforms[1]);
  }
}

// ----------------------------------------------------- render przez portale ----
const rtCache = new Map();
let viewW = 1, viewH = 1;

function rtFor(portal, depth) {
  const key = portal.index + ':' + depth;
  let rt = rtCache.get(key);
  const k = depth === 0 ? gfx.quality.rt0 : gfx.quality.rtN;
  const w = Math.max(2, Math.floor(viewW * k)), h = Math.max(2, Math.floor(viewH * k));
  if (!rt) {
    rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, samples: depth === 0 ? gfx.quality.msaa : 0 });
    rt.texture.minFilter = THREE.LinearFilter;
    rt.texture.magFilter = THREE.LinearFilter;
    rtCache.set(key, rt);
  } else if (rt.width !== w || rt.height !== h) {
    rt.setSize(w, h);
  }
  return rt;
}

const vcams = [];
for (let i = 0; i < MAX_DEPTH + 1; i++) {
  const c = new THREE.PerspectiveCamera();
  c.matrixAutoUpdate = false;
  c.matrixWorldAutoUpdate = false;
  vcams.push(c);
}

const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _plane = new THREE.Vector4();
const _q = new THREE.Vector4();
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _camPos = new THREE.Vector3();

// Skośna płaszczyzna cięcia (Lengyel) – obcina wszystko „za” portalem wyjściowym
function obliqueClip(cam, portal) {
  _n.copy(portal.normal).transformDirection(cam.matrixWorldInverse);
  _p.copy(portal.pos).addScaledVector(portal.normal, -0.02).applyMatrix4(cam.matrixWorldInverse);
  _plane.set(_n.x, _n.y, _n.z, -_n.dot(_p));
  const m = cam.projectionMatrix.elements;
  _q.set(
    (Math.sign(_plane.x) + m[8]) / m[0],
    (Math.sign(_plane.y) + m[9]) / m[5],
    -1,
    (1 + m[10]) / m[14]
  );
  _plane.multiplyScalar(2 / _plane.dot(_q));
  m[2] = _plane.x;
  m[6] = _plane.y;
  m[10] = _plane.z + 1;
  m[14] = _plane.w;
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
}

function portalVisibleFrom(portal, cam) {
  _camPos.setFromMatrixPosition(cam.matrixWorld);
  if (_p.subVectors(_camPos, portal.pos).dot(portal.normal) <= 0) return false;
  _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_pv);
  _sphere.set(portal.pos, PORTAL_HH * 1.2);
  return _frustum.intersectsSphere(_sphere);
}

function renderView(cam, depth, target) {
  const used = [false, false];
  if (depth < MAX_DEPTH && portals[0].linked) {
    for (const P of portals) {
      if (!portalVisibleFrom(P, cam)) continue;
      const vc = vcams[depth];
      vc.matrixWorld.copy(transforms[P.index]).multiply(cam.matrixWorld);
      vc.matrixWorldInverse.copy(vc.matrixWorld).invert();
      vc.projectionMatrix.copy(camera.projectionMatrix);
      obliqueClip(vc, P.other);
      const rt = rtFor(P, depth);
      renderView(vc, depth + 1, rt);
      used[P.index] = rt;
    }
  }
  for (const P of portals) {
    const rt = used[P.index];
    P.uniforms.uUseTex.value = rt ? 1 : 0;
    P.uniforms.tMap.value = rt ? rt.texture : DUMMY_TEX;
  }
  renderer.setRenderTarget(target);
  renderer.render(scene, cam);
}

// -------------------------------------------------------------- pistolet ----
const gunScene = new THREE.Scene();
const gunCam = new THREE.PerspectiveCamera(55, 1, 0.01, 10);

// model, animacje i światła pistoletu – w fxmodels.js (przez fx.js)
const gunRig = fx.createGun(gunScene);

// -------------------------------------------------------------- efekty ----
// pociski, rozbryzgi, cząstki i efekty ekranowe – w fx.js; tu tylko wejście dla fire()
function spawnRing(point, normal, color) { fx.impact(point, normal, color); }

// ------------------------------------------------------------------ gracz ----
const player = {
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  onGround: false,
  yaw: 0,
  pitch: 0,
  roll: 0,
  airUp: false,                   // po wylocie z podłogi, do pierwszego kontaktu z ziemią (patrz teleport)
  camOffset: new THREE.Vector3(), // wygładza „przeskok” kamery po teleportacji
};

const keys = Object.create(null);
let active = false;       // kursor zablokowany = gra aktywna
let levelDone = false;
let levelIndex = 0;
let levelDef = null;
let levelTimer = 0;       // czas od ukończenia poziomu (do auto-przejścia)
let levelTime = 0;        // czas poziomu [s]: nalicza się tylko przy aktywnej grze i nieukończonym poziomie

function overlaps(box, x, y, z) {
  return x - PLAYER_R < box.max.x && x + PLAYER_R > box.min.x &&
         y < box.max.y && y + PLAYER_H > box.min.y &&
         z - PLAYER_R < box.max.z && z + PLAYER_R > box.min.z;
}

// czy oś ciała gracza mieści się w otworze portalu P (rzut na płaszczyznę portalu).
// Celowo łagodnie: liczy się środek ciała, nie jego narożniki – portal ma być „łatwy do trafienia”.
const _c = new THREE.Vector3();
const HOLE_PTS = [0.3, 0.9, 1.5];
const HOLE_KR = 1.3, HOLE_KU = 1.12; // tolerancja trafienia w portal (względem narysowanego owalu)
function bodyInHole(P, x, y, z, loose = 1) {
  for (const h of HOLE_PTS) {
    _c.set(x, y + h, z).sub(P.pos);
    const r = _c.dot(P.right) / (PORTAL_HW * HOLE_KR * loose), u = _c.dot(P.up) / (PORTAL_HH * HOLE_KU * loose);
    if (r * r + u * u > 1) return false;
  }
  return true;
}

// ściana-gospodarz portalu jest „dziurawa”, gdy gracz przechodzi przez otwór
function boxIgnored(box, x, y, z) {
  for (const P of portals) {
    if (P.host !== box || !P.linked) continue;
    _c.set(x, y + EYE_H, z).sub(P.pos);
    if (_c.dot(P.normal) < -0.6) continue;
    // gracz już zanurzony w ścianie-gospodarzu (stopy poniżej płaszczyzny portalu) nie może „wypaść” z otworu bokiem
    // i zapaść się przez bryłę – dopóki oczy są nad płaszczyzną, tolerancja jest luźniejsza
    _c.set(x, y, z).sub(P.pos);
    const sunk = _c.dot(P.normal) < -0.05;
    if (bodyInHole(P, x, y, z, sunk ? 1.7 : 1)) {
      if (Math.abs(P.normal.y) > 0.5) inFloorHole = true;
      return true;
    }
  }
  return false;
}
let inFloorHole = false;

function collect(x, y, z, out) {
  out.length = 0;
  for (const b of boxes) if (!b.disabled && overlaps(b, x, y, z) && !boxIgnored(b, x, y, z)) out.push(b);
  for (const b of dynBoxes) if (overlaps(b, x, y, z)) out.push(b);
  return out;
}

const _hit = [];
const EPS = 1e-3;

function moveAxis(axis, delta) {
  if (delta === 0) return;
  const p = player.pos;
  const px = p.x, py = p.y, pz = p.z;
  p[axis] += delta;
  collect(p.x, p.y, p.z, _hit);
  if (!_hit.length) return;

  // pudła, w których gracz już tkwił przed ruchem (np. wychodzi z otworu portalu)
  for (let i = _hit.length - 1; i >= 0; i--) {
    if (overlaps(_hit[i], px, py, pz)) { pushOut(_hit[i]); _hit.splice(i, 1); }
  }
  if (!_hit.length) return;

  if (axis === 'y') {
    if (delta > 0) {
      let lim = Infinity;
      for (const b of _hit) lim = Math.min(lim, b.min.y - PLAYER_H - EPS);
      p.y = lim;
    } else {
      let lim = -Infinity;
      for (const b of _hit) lim = Math.max(lim, b.max.y + EPS);
      p.y = lim;
      player.onGround = true;
    }
    player.vel.y = 0;
    return;
  }

  // wejście na stopień
  if (player.wasGround) {
    let top = -Infinity;
    for (const b of _hit) top = Math.max(top, b.max.y);
    if (top - p.y <= STEP_H) {
      const oldY = p.y;
      p.y = top + EPS;
      if (!collect(p.x, p.y, p.z, _hit).length) return;
      p.y = oldY;
      collect(p.x, p.y, p.z, _hit);
    }
  }
  if (delta > 0) {
    let lim = Infinity;
    for (const b of _hit) lim = Math.min(lim, b.min[axis] - PLAYER_R - EPS);
    p[axis] = lim;
  } else {
    let lim = -Infinity;
    for (const b of _hit) lim = Math.max(lim, b.max[axis] + PLAYER_R + EPS);
    p[axis] = lim;
  }
  player.vel[axis] = 0;
}

// wypchnięcie z pudła najkrótszą drogą
function pushOut(b) {
  const p = player.pos;
  const opts = [
    [(p.x + PLAYER_R) - b.min.x, 'x', -1],
    [b.max.x - (p.x - PLAYER_R), 'x', 1],
    [(p.z + PLAYER_R) - b.min.z, 'z', -1],
    [b.max.z - (p.z - PLAYER_R), 'z', 1],
    [(p.y + PLAYER_H) - b.min.y, 'y', -1],
    [b.max.y - p.y, 'y', 1],
  ];
  let best = opts[0];
  for (const o of opts) if (o[0] < best[0]) best = o;
  const [d, axis, dir] = best;
  p[axis] += dir * (d + EPS);
  if (Math.sign(player.vel[axis]) === -dir) player.vel[axis] = 0;
  if (axis === 'y' && dir > 0) player.onGround = true;
}

function accelerate(wish, wishSpeed, accel, dt) {
  const cur = player.vel.x * wish.x + player.vel.z * wish.z;
  const add = wishSpeed - cur;
  if (add <= 0) return;
  const a = Math.min(accel * wishSpeed * dt, add);
  player.vel.x += wish.x * a;
  player.vel.z += wish.z * a;
}

const _wish = new THREE.Vector3();
const _eyePrev = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _hitP = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _upv = new THREE.Vector3();

function physicsStep(dt) {
  if ((active || game.forceActive) && !levelDone) levelTime += dt;
  // kierunek chodzenia
  let fx = 0, fz = 0;
  if (active || game.forceActive) {
    if (keys.KeyW || keys.ArrowUp) fz -= 1;
    if (keys.KeyS || keys.ArrowDown) fz += 1;
    if (keys.KeyA || keys.ArrowLeft) fx -= 1;
    if (keys.KeyD || keys.ArrowRight) fx += 1;
  }
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  _wish.set(fx * cos + fz * sin, 0, -fx * sin + fz * cos);
  const wishLen = _wish.length();
  if (wishLen > 0) _wish.multiplyScalar(1 / wishLen);
  const speed = (keys.ShiftLeft || keys.ShiftRight) ? RUN : WALK;

  if (player.onGround) {
    // tarcie
    const sp = Math.hypot(player.vel.x, player.vel.z);
    if (sp > 0) {
      const drop = Math.max(sp, 2.5) * 9 * dt;
      const k = Math.max(0, sp - drop) / sp;
      player.vel.x *= k; player.vel.z *= k;
    }
    if (wishLen > 0) accelerate(_wish, speed, 10, dt);
    if ((keys.Space) && (active || game.forceActive)) {
      player.vel.y = JUMP_V;
      player.onGround = false;
      audio.play('jump');
    }
  } else if (wishLen > 0) {
    // sterowanie w powietrzu nie może rozpędzać ponad bieg (strafowanie w stylu Quake'a dawałoby nieograniczony pęd);
    // prędkość z portali (większa niż bieg) jest zachowana
    const before = Math.hypot(player.vel.x, player.vel.z);
    accelerate(_wish, speed, 2.5, dt);
    const after = Math.hypot(player.vel.x, player.vel.z);
    const cap = Math.max(before, RUN);
    if (after > cap) { const k = cap / after; player.vel.x *= k; player.vel.z *= k; }
  }

  if (player.onGround) player.airUp = false;
  player.vel.y = Math.max(player.vel.y - GRAVITY * dt, -55);

  _eyePrev.copy(player.pos); _eyePrev.y += EYE_H;
  const wasGround = player.onGround;
  const vyBefore = player.vel.y;
  player.wasGround = wasGround;
  player.onGround = false;
  inFloorHole = false;
  moveAxis('x', player.vel.x * dt);
  moveAxis('z', player.vel.z * dt);
  moveAxis('y', player.vel.y * dt);
  if (inFloorHole) {
    // wpadasz w otwór w podłodze/suficie – nie „przebiegaj” go bokiem
    const k = Math.exp(-14 * dt);
    player.vel.x *= k; player.vel.z *= k;
  }
  if (!player.onGround && wasGround && player.vel.y <= 0) {
    // „przyklejenie” do podłoża przy schodzeniu ze stopni
    const y0 = player.pos.y;
    player.pos.y -= 0.12;
    if (collect(player.pos.x, player.pos.y, player.pos.z, _hit).length) {
      player.pos.y = Math.max(...Array.from(_hit, b => b.max.y)) + EPS;
      player.onGround = true; player.vel.y = 0;
    } else player.pos.y = y0;
  }

  // teleportacja
  _eye.copy(player.pos); _eye.y += EYE_H;
  tryTeleport(_eyePrev, _eye);
  gameAudio.move(dt, player, wasGround, vyBefore);

  mechanicsStep(dt);
  if (!game.exitHit && levelDef && exitReached()) game.exitHit = true;

  // kwas
  if (player.pos.y < ACID_Y - 0.4) {
    mech.deaths++;
    gameAudio.acid(player.pos.x, ACID_Y, player.pos.z);
    respawn();
    toast('Kwas! Zaczynasz od nowa');
    emit('death', { cause: 'acid', deaths: mech.deaths });
  }
}

function tryTeleport(prev, now) {
  if (!portals[0].linked) return;
  for (const P of portals) {
    const dPrev = _p.subVectors(prev, P.pos).dot(P.normal);
    const dNow = _c.subVectors(now, P.pos).dot(P.normal);
    const T = NEAR;
    if (dPrev >= T && dNow < T) {
      const t = (dPrev - T) / (dPrev - dNow);
      _hitP.lerpVectors(prev, now, t).sub(P.pos);
      const r = _hitP.dot(P.right) / (PORTAL_HW * HOLE_KR), u = _hitP.dot(P.up) / (PORTAL_HH * HOLE_KU);
      if (r * r + u * u < 1) { teleport(P); return; }
    }
  }
}

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _e = new THREE.Euler();

function teleport(P) {
  const M = transforms[P.index];
  const O = P.other;
  fx.teleported(P);

  // kamera (oczy) – ciągłość obrazu
  const eye = _eye.copy(player.pos); eye.y += EYE_H;
  eye.applyMatrix4(M);
  const camWorld = eye.clone();
  // prędkość
  const speed = player.vel.length();
  gameAudio.teleport(speed);
  player.vel.transformDirection(M).multiplyScalar(speed);
  // Wylot z podłogi stawia stopy na płaszczyźnie portalu, choć wejście nastąpiło, gdy oczy przekroczyły płaszczyznę
  // (stopy ~1.6 m niżej) – to jednorazowy „bonus” wysokości. Bez ziemi pomiędzy kolejnymi wylotami z podłogi
  // (pętla podłoga-podłoga) bonus nie przysługuje, inaczej każdy obieg dodawałby 1.6 m (pompa energii).
  if (O.normal.y > 0.5) {
    if (player.airUp) {
      const vn = player.vel.dot(O.normal);
      if (vn > 0) {
        const vn2 = Math.max(0, vn * vn - 2 * GRAVITY * (EYE_H - NEAR));
        player.vel.addScaledVector(O.normal, Math.sqrt(vn2) - vn);
      }
    }
    player.airUp = true;
  }
  const out = player.vel.dot(O.normal);
  if (out < PORTAL_MIN_EXIT) player.vel.addScaledVector(O.normal, PORTAL_MIN_EXIT - out);

  // orientacja kamery
  _e.set(player.pitch, player.yaw, player.roll, 'YXZ');
  _qa.setFromEuler(_e);
  _fwd.set(0, 0, -1).applyQuaternion(_qa).transformDirection(M);
  _upv.set(0, 1, 0).applyQuaternion(_qa).transformDirection(M);
  const hl = Math.hypot(_fwd.x, _fwd.z);
  let yaw;
  if (hl > 0.05) yaw = Math.atan2(-_fwd.x, -_fwd.z);
  else {
    const s = _fwd.y < 0 ? 1 : -1;
    yaw = Math.atan2(-_upv.x * s, -_upv.z * s);
  }
  const pitch = Math.asin(THREE.MathUtils.clamp(_fwd.y, -1, 1));
  // reszta obrotu to przechył (roll), który wygaszamy płynnie
  _qb.setFromEuler(_e.set(pitch, yaw, 0, 'YXZ'));
  const qFull = new THREE.Quaternion().setFromRotationMatrix(M).multiply(_qa);
  const rel = _qb.invert().multiply(qFull);
  let roll = 2 * Math.atan2(rel.z, rel.w);
  if (roll > Math.PI) roll -= Math.PI * 2;
  if (roll < -Math.PI) roll += Math.PI * 2;

  player.yaw = yaw;
  player.pitch = THREE.MathUtils.clamp(pitch, -1.5533, 1.5533);
  player.roll = roll;

  // gdzie stają stopy: środek ciała przenosimy tak jak środek ciała (nie oczy),
  // dzięki czemu przy wylocie z wysokiego portalu ciało nie zostaje w ścianie.
  // Przy wylocie z podłogi/sufitu ciało stoi/wisi tuż przy portalu.
  const centerNew = _c.set(player.pos.x, player.pos.y + 0.9, player.pos.z).applyMatrix4(M);
  let feetY = centerNew.y - 0.9;
  if (O.normal.y > 0.5) feetY = O.pos.y + 0.002;
  else if (O.normal.y < -0.5) feetY = O.pos.y - PLAYER_H - 0.002;
  player.pos.set(centerNew.x, feetY, centerNew.z);
  // wypchnij ze ścian, które nie są otworem portalu
  for (let i = 0; i < 4; i++) {
    if (!collect(player.pos.x, player.pos.y, player.pos.z, _hit).length) break;
    pushOut(_hit[0]);
  }
  player.onGround = false;
  player.camOffset.copy(camWorld).sub(_c.set(player.pos.x, player.pos.y + EYE_H, player.pos.z));
  _eyePrev.set(player.pos.x, player.pos.y + EYE_H, player.pos.z);
  fixHeldCube();
}

// ------------------------------------------------------------- mechanika ----
// Kostki, przyciski, drzwi, fizzlery. Wszystko jest AABB, jak reszta świata.
const HALF_CUBE = 0.4;
const HOLD_DIST = 1.9;
const cubes = [];
const dynBoxes = [];     // kostki jako bryły kolizji gracza (bez trzymanej)
const buttons = [];
const doors = [];
const fizzlers = [];
const mech = { held: null, deaths: 0, cubeResets: 0, fizzleCooldown: 0 };

const cubeMat = (() => {
  const tex = makeCanvasTexture(256, (g, s) => {
    g.fillStyle = '#8d949c'; g.fillRect(0, 0, s, s);
    speckle(g, s, 600, 0.08);
    g.fillStyle = '#b7bec6'; g.fillRect(14, 14, s - 28, s - 28);
    g.strokeStyle = '#4b525a'; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s - 6);
    g.strokeStyle = '#6a727b'; g.lineWidth = 3; g.strokeRect(14, 14, s - 28, s - 28);
    g.fillStyle = '#ff7ab8';
    g.beginPath(); g.arc(s / 2, s / 2, 46, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#b7bec6';
    g.beginPath(); g.arc(s / 2, s / 2, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff7ab8';
    g.beginPath(); g.arc(s / 2, s / 2, 14, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4b525a';
    for (const [x, y] of [[26, 26], [s - 26, 26], [26, s - 26], [s - 26, s - 26]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return fx.cubeMaterial(new THREE.MeshLambertMaterial({ map: tex }));
})();

function makeCube(x, y, z) {
  const c = {
    pos: new THREE.Vector3(x, y + HALF_CUBE, z),
    spawn: new THREE.Vector3(x, y + HALF_CUBE, z),
    vel: new THREE.Vector3(),
    held: false,
    onGround: false,
    mesh: new THREE.Mesh(new THREE.BoxGeometry(HALF_CUBE * 2, HALF_CUBE * 2, HALF_CUBE * 2), cubeMat),
    dyn: { min: new THREE.Vector3(), max: new THREE.Vector3(), kind: 'cube', portalable: false, shootThrough: false, disabled: false, isCube: true },
  };
  c.dyn.cube = c;
  c.mesh.position.copy(c.pos);
  scene.add(c.mesh);
  levelObjects.push(c.mesh);
  cubes.push(c);
  syncCubeBox(c);
  dynBoxes.push(c.dyn);
  fx.cubeBuilt(c, cubes.length - 1);
  return c;
}

function syncCubeBox(c) {
  c.dyn.min.set(c.pos.x - HALF_CUBE, c.pos.y - HALF_CUBE, c.pos.z - HALF_CUBE);
  c.dyn.max.set(c.pos.x + HALF_CUBE, c.pos.y + HALF_CUBE, c.pos.z + HALF_CUBE);
}

function cubeHits(b, x, y, z) {
  return x - HALF_CUBE < b.max.x && x + HALF_CUBE > b.min.x &&
         y - HALF_CUBE < b.max.y && y + HALF_CUBE > b.min.y &&
         z - HALF_CUBE < b.max.z && z + HALF_CUBE > b.min.z;
}

// ściana-gospodarz jest „dziurawa” dla kostki, gdy jej środek jest w otworze portalu
const _cc = new THREE.Vector3();
function cubeBoxIgnored(b, x, y, z) {
  for (const P of portals) {
    if (P.host !== b || !P.linked) continue;
    _cc.set(x, y, z).sub(P.pos);
    if (_cc.dot(P.normal) < -0.6) continue;
    const r = _cc.dot(P.right) / (PORTAL_HW * 1.2), u = _cc.dot(P.up) / (PORTAL_HH * 1.1);
    if (r * r + u * u <= 1) return true;
  }
  return false;
}

function cubeCollect(c, x, y, z, out) {
  out.length = 0;
  for (const b of boxes) if (!b.disabled && cubeHits(b, x, y, z) && !cubeBoxIgnored(b, x, y, z)) out.push(b);
  for (const o of cubes) if (o !== c && !o.held && cubeHits(o.dyn, x, y, z)) out.push(o.dyn);
  return out;
}

const _chit = [];
function cubePushOut(c, b) {
  const p = c.pos;
  const opts = [
    [(p.x + HALF_CUBE) - b.min.x, 'x', -1], [b.max.x - (p.x - HALF_CUBE), 'x', 1],
    [(p.y + HALF_CUBE) - b.min.y, 'y', -1], [b.max.y - (p.y - HALF_CUBE), 'y', 1],
    [(p.z + HALF_CUBE) - b.min.z, 'z', -1], [b.max.z - (p.z - HALF_CUBE), 'z', 1],
  ];
  let best = opts[0];
  for (const o of opts) if (o[0] < best[0]) best = o;
  p[best[1]] += best[2] * (best[0] + EPS);
  if (Math.sign(c.vel[best[1]]) === -best[2]) c.vel[best[1]] = 0;
  if (best[1] === 'y' && best[2] > 0) c.onGround = true;
}

function moveCubeAxis(c, axis, delta) {
  if (delta === 0) return;
  const p = c.pos;
  const px = p.x, py = p.y, pz = p.z;
  p[axis] += delta;
  cubeCollect(c, p.x, p.y, p.z, _chit);
  if (!_chit.length) return;
  for (let i = _chit.length - 1; i >= 0; i--) {
    if (cubeHits(_chit[i], px, py, pz)) { cubePushOut(c, _chit[i]); _chit.splice(i, 1); }
  }
  if (!_chit.length) return;
  if (delta > 0) {
    let lim = Infinity;
    for (const b of _chit) lim = Math.min(lim, b.min[axis] - HALF_CUBE - EPS);
    p[axis] = lim;
  } else {
    let lim = -Infinity;
    for (const b of _chit) lim = Math.max(lim, b.max[axis] + HALF_CUBE + EPS);
    p[axis] = lim;
    if (axis === 'y') c.onGround = true;
  }
  c.vel[axis] = 0;
}

const _holdT = new THREE.Vector3();
const _holdD = new THREE.Vector3();
// docelowe miejsce trzymanej kostki: przed oczami, ale nie za ścianą
function holdTarget(out) {
  const eye = _holdD.set(player.pos.x, player.pos.y + EYE_H, player.pos.z);
  const fwd = _fwd.set(0, 0, -1).applyEuler(_e.set(player.pitch, player.yaw, 0, 'YXZ'));
  let dist = HOLD_DIST;
  ray.set(eye, fwd);
  ray.far = HOLD_DIST + 0.6;
  const h = ray.intersectObjects(solidMeshes(), false)[0];
  if (h && !portalAtHit(h)) dist = Math.max(0.9, Math.min(dist, h.distance - 0.55));
  out.copy(eye).addScaledVector(fwd, dist);
  out.y -= 0.15;
  return out;
}

function stepCube(c, dt) {
  if (c.held) {
    const t = holdTarget(_holdT);
    // cel jest za daleko (np. po śmierci/respawnie gracza) – upuść, zamiast „teleportować” kostkę przez ściany
    if (c.pos.distanceTo(t) > 8) { dropCube(false, true); syncCubeBox(c); return; }
    const old = _p.copy(c.pos);
    c.onGround = false;
    c.vel.set(0, 0, 0);
    // przesuwamy małymi krokami (≤ 0.3 m), żeby nie przeskoczyć cienkich ścian, kratek i fizzlerów
    const dx = t.x - c.pos.x, dy = t.y - c.pos.y, dz = t.z - c.pos.z;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.3));
    for (let i = 0; i < n; i++) {
      moveCubeAxis(c, 'x', dx / n);
      moveCubeAxis(c, 'y', dy / n);
      moveCubeAxis(c, 'z', dz / n);
      if (cubeInFizzler(c)) { respawnCube(c); syncCubeBox(c); return; }
    }
    c.vel.copy(c.pos).sub(old).multiplyScalar(1 / dt);
    c.vel.clampLength(0, 14);
    // kostka nie nadąża za celem (zaklinowana za rogiem) – upuść
    if (c.pos.distanceTo(t) > 2.8) dropCube(false, true);
  } else {
    const prev = _p.copy(c.pos);
    c.vel.y = Math.max(c.vel.y - GRAVITY * dt, -55);
    const wasOn = c.onGround, vyHit = -c.vel.y;
    c.onGround = false;
    moveCubeAxis(c, 'x', c.vel.x * dt);
    moveCubeAxis(c, 'z', c.vel.z * dt);
    moveCubeAxis(c, 'y', c.vel.y * dt);
    if (c.onGround) { const k = Math.exp(-7 * dt); c.vel.x *= k; c.vel.z *= k; if (Math.hypot(c.vel.x, c.vel.z) < 0.05) { c.vel.x = 0; c.vel.z = 0; } }
    if (!wasOn && c.onGround && vyHit > 3) gameAudio.cubeHit(c, vyHit);
    cubeTeleport(c, prev);
    if (c.pos.y < ACID_Y - 0.5) { gameAudio.acid(c.pos.x, ACID_Y, c.pos.z, 0.35); respawnCube(c); }
  }
  syncCubeBox(c);
}

function cubeInFizzler(c) {
  for (const f of fizzlers) if (cubeHits(f, c.pos.x, c.pos.y, c.pos.z)) { mechEvent('fizzle', f); return true; }
  return false;
}

function cubeTeleport(c, prev) {
  if (!portals[0].linked) return;
  for (const P of portals) {
    const dPrev = _cc.subVectors(prev, P.pos).dot(P.normal);
    const dNow = _holdD.subVectors(c.pos, P.pos).dot(P.normal);
    // także kostka „wklejona” w ścianę z portalem (upuszczona zbyt blisko) przechodzi, jeśli jest w otworze
    if ((dPrev >= 0 && dNow < 0) || (dNow < 0 && dNow > -0.6)) {
      const t = dPrev >= 0 ? dPrev / (dPrev - dNow) : 1;
      _holdT.lerpVectors(prev, c.pos, t).sub(P.pos);
      const r = _holdT.dot(P.right) / (PORTAL_HW * 1.2), u = _holdT.dot(P.up) / (PORTAL_HH * 1.1);
      if (r * r + u * u < 1) {
        const M = transforms[P.index];
        c.pos.applyMatrix4(M);
        const sp = c.vel.length();
        c.vel.transformDirection(M).multiplyScalar(sp);
        const out = c.vel.dot(P.other.normal);
        if (out < 2.5) c.vel.addScaledVector(P.other.normal, 2.5 - out);
        fxCubeTeleport(c);
        gameAudio.cubeTeleport(c);
        return;
      }
    }
  }
}

function respawnCube(c) {
  if (c.held) dropCube(false, true);
  c.pos.copy(c.spawn);
  c.vel.set(0, 0, 0);
  c.onGround = false;
  mech.cubeResets++;
  syncCubeBox(c);
  fxCubeReset(c);
  gameAudio.cubeReset(c);
}

function fxCubeTeleport(c) { fx.cubeTeleport(c); }
function fxCubeReset(c) { fx.cubeReset(c); }

// na co patrzy gracz (podpowiedzi w HUD): ta sama logika co w pickCube (zasięg 3.4 m, bez ściany,
// bez kostki, na której stoi), ale nic nie podnosi. Zmieniając pickCube, zmień i to.
const _lkEye = new THREE.Vector3();
const _lkDir = new THREE.Vector3();
const _lkHit = new THREE.Vector3();
const _lkBox = new THREE.Box3();
const _lkEuler = new THREE.Euler(0, 0, 0, 'YXZ');
function lookTarget() {
  if (mech.held || !cubes.length) return null;
  _lkEye.set(player.pos.x, player.pos.y + EYE_H, player.pos.z);
  _lkDir.set(0, 0, -1).applyEuler(_lkEuler.set(player.pitch, player.yaw, 0, 'YXZ'));
  ray.set(_lkEye, _lkDir);
  ray.far = 3.4;
  const wall = ray.intersectObjects(solidMeshes(), false)[0];
  let bestD = wall ? wall.distance : 3.4, found = false;
  for (const c of cubes) {
    if (Math.abs(player.pos.y - (c.pos.y + HALF_CUBE)) < 0.12 &&
        Math.abs(player.pos.x - c.pos.x) < HALF_CUBE + PLAYER_R && Math.abs(player.pos.z - c.pos.z) < HALF_CUBE + PLAYER_R) continue;
    _lkBox.set(c.dyn.min, c.dyn.max);
    if (ray.ray.intersectBox(_lkBox, _lkHit)) {
      const d = _lkHit.distanceTo(_lkEye);
      if (d < bestD) { found = true; bestD = d; }
    }
  }
  return found ? { type: 'cube', dist: bestD } : null;
}

// podnoszenie / upuszczanie / rzut
function pickCube() {
  if (mech.held) return false;
  const eye = _holdD.set(player.pos.x, player.pos.y + EYE_H, player.pos.z).clone();
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
  ray.set(eye, dir);
  ray.far = 3.4;
  const wall = ray.intersectObjects(solidMeshes(), false)[0];
  let best = null, bestD = wall ? wall.distance : 3.4;
  const rr = ray.ray;
  const hitp = new THREE.Vector3();
  const bb = new THREE.Box3();
  for (const c of cubes) {
    if (Math.abs(player.pos.y - (c.pos.y + HALF_CUBE)) < 0.12 &&
        Math.abs(player.pos.x - c.pos.x) < HALF_CUBE + PLAYER_R && Math.abs(player.pos.z - c.pos.z) < HALF_CUBE + PLAYER_R) continue; // stoisz na niej
    bb.set(c.dyn.min, c.dyn.max);
    if (rr.intersectBox(bb, hitp)) {
      const d = hitp.distanceTo(eye);
      if (d < bestD) { best = c; bestD = d; }
    }
  }
  if (!best) return false;
  best.held = true;
  mech.held = best;
  best.vel.set(0, 0, 0);
  dynBoxes.splice(dynBoxes.indexOf(best.dyn), 1);
  return true;
}

function dropCube(throwIt, internal = false) {
  const c = mech.held;
  if (!c) return false;
  // upuszczenie w powietrzu pozwalałoby „wspinać się” na kostce (skok, podniesienie, puszczenie pod stopami)
  if (!throwIt && !internal && !player.onGround) return false;
  c.held = false;
  mech.held = null;
  dynBoxes.push(c.dyn);
  if (throwIt) {
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
    c.vel.copy(dir).multiplyScalar(13).add(new THREE.Vector3(0, 1.5, 0)).addScaledVector(player.vel, 0.6);
  } else {
    c.vel.multiplyScalar(0.5);
  }
  return true;
}

// po teleportacji gracza trzymana kostka ląduje przed nim
function fixHeldCube() {
  const c = mech.held;
  if (!c) return;
  holdTarget(c.pos);
  c.vel.set(0, 0, 0);
  syncCubeBox(c);
}

// ---- przyciski i drzwi ----
function addButton(id, x, z, o = {}) {
  const y = o.y ?? 0;
  const r = o.r ?? 0.95;
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.18, r + 0.22, 0.05, 40), new THREE.MeshLambertMaterial({ color: 0x3a4047 }));
  base.position.y = 0.02;
  const plateMat = new THREE.MeshBasicMaterial({ color: 0xe5484d });
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06, 40), plateMat);
  plate.position.y = 0.035;
  group.add(base, plate);
  group.position.set(x, y, z);
  scene.add(group);
  levelObjects.push(group);
  const b = { id, x, y, z, r, timer: o.timer || 0, plate, plateMat, pressed: false, hold: 0 };
  buttons.push(b);
  fx.buttonBuilt(b, group);
  return b;
}

function addDoor(ids, x0, y0, z0, x1, y1, z1, o = {}) {
  const box = addBox(x0, y0, z0, x1, y1, z1, 'door');
  const mesh = worldMeshes[worldMeshes.length - 1];
  const d = { ids: Array.isArray(ids) ? ids : [ids], mode: o.mode || 'all', box, mesh, open: 0, height: y1 - y0, invert: !!o.invert };
  doors.push(d);
  fx.doorBuilt(d);
  return d;
}

function addFizzler(x0, y0, z0, x1, y1, z1) {
  // cienki wolumen jest pogrubiany, żeby szybki gracz nie „przeskoczył” fizzlera
  const thin = (x1 - x0) < (z1 - z0) ? 'x' : 'z';
  const lo = thin === 'x' ? x0 : z0, hi = thin === 'x' ? x1 : z1;
  const gx0 = thin === 'x' ? Math.min(x0, (x0 + x1) / 2 - 0.35) : x0, gx1 = thin === 'x' ? Math.max(x1, (x0 + x1) / 2 + 0.35) : x1;
  const gz0 = thin === 'z' ? Math.min(z0, (z0 + z1) / 2 - 0.35) : z0, gz1 = thin === 'z' ? Math.max(z1, (z0 + z1) / 2 + 0.35) : z1;
  void lo; void hi;
  const w = Math.max(x1 - x0, z1 - z0), h = y1 - y0;
  const mat = fx.fizzlerMaterial(w, h);
  const alongX = (x1 - x0) >= (z1 - z0);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  if (!alongX) mesh.rotation.y = Math.PI / 2;
  scene.add(mesh);
  levelObjects.push(mesh);
  const f = { min: new THREE.Vector3(gx0, y0, gz0), max: new THREE.Vector3(gx1, y1, gz1), mesh, mat };
  fizzlers.push(f);
  fx.fizzlerBuilt(f, w, h, alongX);
  return f;
}

function buttonPressedNow(b) {
  // gracz
  if (Math.hypot(player.pos.x - b.x, player.pos.z - b.z) < b.r * 0.9 && Math.abs(player.pos.y - b.y) < 0.15 && player.onGround) return true;
  // kostki
  for (const c of cubes) {
    if (c.held) continue;
    if (Math.hypot(c.pos.x - b.x, c.pos.z - b.z) < b.r + 0.1 && Math.abs((c.pos.y - HALF_CUBE) - b.y) < 0.15) return true;
  }
  return false;
}

function playerInBox(min, max) {
  const p = player.pos;
  return p.x + PLAYER_R > min.x && p.x - PLAYER_R < max.x && p.y + PLAYER_H > min.y && p.y < max.y && p.z + PLAYER_R > min.z && p.z - PLAYER_R < max.z;
}

function mechanicsStep(dt) {
  for (const c of cubes) stepCube(c, dt);

  // przyciski
  const state = Object.create(null);
  for (const b of buttons) {
    const now = buttonPressedNow(b);
    if (now) b.hold = b.timer;
    else b.hold = Math.max(0, b.hold - dt);
    const on = now || b.hold > 0;
    if (on !== b.pressed) { b.pressed = on; mechEvent(on ? 'button-on' : 'button-off', b); }
    state[b.id] = (state[b.id] || false) || on;
  }

  // drzwi
  for (const d of doors) {
    const vals = d.ids.map(id => !!state[id]);
    let want = d.mode === 'any' ? vals.some(Boolean) : vals.every(Boolean);
    if (d.invert) want = !want;
    if (want && !d.box.disabled) { d.box.disabled = true; mechEvent('door-open', d); }
    else if (!want && d.box.disabled) {
      // nie zamykaj drzwi na kimś / na kostce
      let blocked = playerInBox(d.box.min, d.box.max);
      for (const c of cubes) if (cubeHits(d.box, c.pos.x, c.pos.y, c.pos.z)) blocked = true;
      if (!blocked) { d.box.disabled = false; mechEvent('door-close', d); }
    }
  }

  // fizzlery
  mech.fizzleCooldown = Math.max(0, mech.fizzleCooldown - dt);
  for (const f of fizzlers) {
    if (mech.fizzleCooldown <= 0 && playerInBox(f.min, f.max) && (portals[0].active || portals[1].active)) {
      resetPortals();
      mech.fizzleCooldown = 0.6;
      toast('Fizzler usunął portale');
      mechEvent('fizzle', f);
    }
    for (const c of cubes) if (cubeHits(f, c.pos.x, c.pos.y, c.pos.z)) { respawnCube(c); mechEvent('fizzle', f); }
  }
}

function mechEvent(type, obj) {
  gameAudio.mech(type, obj);
  fx.mechEvent(type, obj);
}

// przyciski, kostki, fizzlery i poświaty drzwi animuje fx.update; tu tylko przesuwanie drzwi
function mechanicsVisuals(dt) {
  for (const d of doors) {
    const target = d.box.disabled ? 1 : 0;
    d.open += (target - d.open) * Math.min(1, dt * 8);
    d.mesh.position.y = d.open * (d.height + 0.05);
    d.mesh.visible = d.open < 0.985;
  }
}

function resetMechanics() {
  for (const c of cubes) { c.mesh.geometry.dispose(); }
  cubes.length = 0;
  dynBoxes.length = 0;
  buttons.length = 0;
  doors.length = 0;
  for (const f of fizzlers) { f.mesh.geometry.dispose(); f.mat.dispose(); }
  fizzlers.length = 0;
  mech.held = null;
  mech.fizzleCooldown = 0;
}

function restartMechanics() {
  if (mech.held) dropCube(false, true);
  for (const c of cubes) { c.pos.copy(c.spawn); c.vel.set(0, 0, 0); c.onGround = false; syncCubeBox(c); c.mesh.position.copy(c.pos); }
  for (const b of buttons) { b.pressed = false; b.hold = 0; }
  for (const d of doors) { d.box.disabled = false; d.open = 0; d.mesh.position.y = 0; d.mesh.visible = true; }
}

function respawn() {
  if (mech.held) dropCube(false, true);
  const sp = levelDef ? levelDef.spawn : { x: 0, y: 0, z: 0, yaw: 0 };
  player.pos.set(sp.x, sp.y + 0.02, sp.z);
  player.vel.set(0, 0, 0);
  player.yaw = sp.yaw || 0; player.pitch = 0; player.roll = 0;
  player.camOffset.set(0, 0, 0);
  player.onGround = false;
}

// ---------------------------------------------------------------- poziomy ----
let doneSet = new Set();
try { doneSet = new Set(JSON.parse(localStorage.getItem('maceaek.done') || '[]')); } catch { /* brak storage */ }

function saveDone() {
  try { localStorage.setItem('maceaek.done', JSON.stringify([...doneSet])); } catch { /* ignoruj */ }
}

function loadLevel(i) {
  levelIndex = ((i % LEVELS.length) + LEVELS.length) % LEVELS.length;
  levelDef = LEVELS[levelIndex];
  clearLevel();
  portals.forEach(p => p.clear(true));
  levelDef.build(LevelAPI);
  fixSigns();
  gfx.bake(bakeContext());
  fx.makePad(levelDef.exit);
  levelDone = false;
  game.exitHit = false;
  levelTimer = 0;
  gameAudio.levelStart();
  levelTime = 0;
  mech.deaths = 0;
  mech.cubeResets = 0;
  respawn();
  updateCrosshair();
  emit('levelstart', { index: levelIndex, name: levelDef.name, hint: levelDef.hint });
}

// kontekst wypalania światła i siatki świata (gfx.bake)
function bakeContext() {
  return {
    boxes, meshes: worldMeshes, exit: levelDef.exit, render: !game.noRender,
    add: addObject,
    remove(o) { scene.remove(o); const i = levelObjects.indexOf(o); if (i >= 0) levelObjects.splice(i, 1); },
  };
}

// tablice są jednostronne: jeśli któraś patrzy w głąb bryły (zła strona), obróć ją o 180° – autor poziomu nie musi pilnować kierunku
function fixSigns() {
  const inside = (x, y, z) => boxes.some(b => x > b.min.x && x < b.max.x && y > b.min.y && y < b.max.y && z > b.min.z && z < b.max.z);
  for (const m of levelObjects) {
    if (!m.userData.sign) continue;
    const a = m.rotation.y, nx = Math.sin(a), nz = Math.cos(a), p = m.position;
    if (inside(p.x + nx * 0.2, p.y, p.z + nz * 0.2) && !inside(p.x - nx * 0.2, p.y, p.z - nz * 0.2)) m.rotation.y = a + Math.PI;
  }
}

function exitReached() {
  const ex = levelDef.exit;
  return player.onGround && Math.hypot(player.pos.x - ex.x, player.pos.z - ex.z) < 1.8 && Math.abs(player.pos.y - ex.y) < 0.3;
}

function restartLevel() {
  gameAudio.levelStart(portals);
  portals.forEach(p => p.clear());
  restartMechanics();
  respawn();
  updateCrosshair();
  levelDone = false;
  game.exitHit = false;
  levelTimer = 0;
  levelTime = 0;
  mech.deaths = 0;
  mech.cubeResets = 0;
  emit('levelstart', { index: levelIndex, name: levelDef.name, hint: levelDef.hint, restart: true });
}

// ---------------------------------------------------------- strzelanie ----
const ray = new THREE.Raycaster();
const _ctr = new THREE.Vector2(0, 0);
const AXES = ['x', 'y', 'z'];

// powierzchnie, które zatrzymują strzał (bez otwartych drzwi i kratek)
function shotMeshes() {
  return worldMeshes.filter(m => { const b = m.userData.box; return !b.disabled && !b.shootThrough; });
}
// powierzchnie litej kolizji (do trzymania kostki): kratki też blokują
function solidMeshes() {
  return worldMeshes.filter(m => !m.userData.box.disabled);
}

// czy punkt trafienia leży w otworze aktywnego portalu (strzał wtedy przelatuje na drugą stronę)
function portalAtHit(h) {
  const box = h.object.userData.box;
  for (const P of portals) {
    if (!P.linked || P.host !== box || !h.face || h.face.normal.dot(P.normal) < 0.99) continue;
    _c.copy(h.point).sub(P.pos);
    const r = _c.dot(P.right) / PORTAL_HW, u = _c.dot(P.up) / PORTAL_HH;
    if (r * r + u * u < 1.0) return P;
  }
  return null;
}

// promień strzału: przechodzi przez portale (do 4 razy)
function traceShot(origin, dir) {
  const segs = [];
  const o = origin.clone(), d = dir.clone();
  const targets = shotMeshes();
  for (let hop = 0; hop < 5; hop++) {
    ray.set(o, d);
    ray.far = 160;
    const h = ray.intersectObjects(targets, false)[0];
    if (!h) { segs.push([o.clone(), o.clone().addScaledVector(d, 60)]); return { hit: null, segs, dir: d }; }
    segs.push([o.clone(), h.point.clone()]);
    const P = portalAtHit(h);
    if (!P) return { hit: h, segs, dir: d };
    const M = transforms[P.index];
    o.copy(h.point).applyMatrix4(M);
    d.transformDirection(M);
    o.addScaledVector(d, 0.02);
  }
  return { hit: null, segs, dir: d };
}

function fire(index) {
  gunRig.fire(COLORS[index]);
  updateCamera();
  const dir0 = camera.getWorldDirection(new THREE.Vector3());
  const tr = traceShot(camera.position, dir0);

  const muzzle = new THREE.Vector3(0.13, -0.12, -0.55).applyMatrix4(camera.matrixWorld);
  tr.segs[0][0] = muzzle;
  fx.shot(tr.segs, COLORS[index], tr.hit);
  if (!tr.hit) return false;
  const hit = tr.hit;
  const box = hit.object.userData.box;
  const normal = hit.face.normal.clone();

  if (!box.portalable) {
    spawnRing(hit.point, normal, 0x9aa4ae);
    toast('Ta powierzchnia nie przyjmuje portali');
    return false;
  }

  // układ współrzędnych portalu
  const up = new THREE.Vector3();
  if (Math.abs(normal.y) > 0.5) {
    _fwd.copy(tr.dir);
    if (Math.abs(_fwd.x) > Math.abs(_fwd.z)) up.set(Math.sign(_fwd.x), 0, 0);
    else up.set(0, 0, Math.sign(_fwd.z) || -1);
    if (normal.y < 0) up.negate();
  } else up.set(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, normal);

  const nAxis = AXES.find(a => Math.abs(normal[a]) > 0.5);
  const ext = {};
  for (const a of AXES) ext[a] = Math.abs(right[a]) * PORTAL_HW + Math.abs(up[a]) * PORTAL_HH;

  const pos = hit.point.clone();
  pos[nAxis] = normal[nAxis] > 0 ? box.max[nAxis] : box.min[nAxis];
  for (const a of AXES) {
    if (a === nAxis) continue;
    const lo = box.min[a] + ext[a], hi = box.max[a] - ext[a];
    if (lo > hi + 1e-6) {
      spawnRing(hit.point, normal, 0x9aa4ae);
      toast('Za mało miejsca na portal');
      return false;
    }
    pos[a] = THREE.MathUtils.clamp(pos[a], lo, hi);
  }

  // portal na ścianie blisko podłogi – przyklej go do podłogi, żeby dało się do niego wejść
  if (nAxis !== 'y') {
    const origin = new THREE.Vector3(pos.x, pos.y - PORTAL_HH + 0.05, pos.z).addScaledVector(normal, 0.35);
    const down = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 1.3);
    const g = down.intersectObjects(solidMeshes(), false)[0];
    if (g) {
      const lo = box.min.y + ext.y;
      pos.y = Math.max(lo, pos.y - (g.distance - 0.05));
    }
  }

  // czy tuż przed portalem jest wolne miejsce (np. półka albo schody przy samej ścianie)
  for (const b of boxes) {
    if (b === box || b.disabled) continue;
    let hitAll = true;
    for (const a of AXES) {
      let lo, hi;
      if (a === nAxis) {
        if (normal[a] > 0) { lo = pos[a] + 0.02; hi = pos[a] + 0.4; } else { lo = pos[a] - 0.4; hi = pos[a] - 0.02; }
      } else { lo = pos[a] - ext[a] + 0.03; hi = pos[a] + ext[a] - 0.03; }
      if (b.max[a] <= lo || b.min[a] >= hi) { hitAll = false; break; }
    }
    if (hitAll) {
      spawnRing(hit.point, normal, 0x9aa4ae);
      toast('Za mało miejsca na portal');
      return false;
    }
  }

  // nie nakładaj na drugi portal
  const O = portals[1 - index];
  if (O.active && O.normal.dot(normal) > 0.99 && Math.abs(O.pos[nAxis] - pos[nAxis]) < 0.1) {
    let overlap = true;
    for (const a of AXES) {
      if (a === nAxis) continue;
      const oext = Math.abs(O.right[a]) * PORTAL_HW + Math.abs(O.up[a]) * PORTAL_HH;
      if (Math.abs(O.pos[a] - pos[a]) >= ext[a] + oext) overlap = false;
    }
    if (overlap) {
      spawnRing(hit.point, normal, 0x9aa4ae);
      toast('Portale nie mogą się nakładać');
      return false;
    }
  }

  portals[index].place(pos, normal, up, box);
  refreshTransforms();
  spawnRing(pos, normal, COLORS[index]);
  updateCrosshair();
  return true;
}

function resetPortals() {
  portals.forEach(p => p.clear());
  updateCrosshair();
}

// ------------------------------------------------------------------- HUD ----
const blobBlue = document.getElementById('blobBlue');
const blobOrange = document.getElementById('blobOrange');

function updateCrosshair() {
  blobBlue.classList.toggle('on', portals[0].active);
  blobOrange.classList.toggle('on', portals[1].active);
}
// komunikat dla gracza – wyświetla go ui.js; kind (opcjonalnie): 'info' | 'warn' | 'success'
function toast(msg, ms = 1800, kind) {
  emit('toast', { msg, ms, kind });
}

function setActive(v) {
  if (v === active) return;
  audio.play(v ? 'resume' : 'pause');
  active = v;
  if (!v) for (const k in keys) keys[k] = false;
  emit(v ? 'resume' : 'pause');
}

// ----------------------------------------------------------------- input ----
function requestLock() {
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  } catch { /* ignoruj */ }
}
// pierwszy gest użytkownika odblokowuje dźwięk (audio.init jest bezpieczne przy wielokrotnym wywołaniu)
document.addEventListener('pointerdown', () => audio.init());
document.addEventListener('pointerlockchange', () => { audio.init(); setActive(document.pointerLockElement === canvas); });
document.addEventListener('pointerlockerror', () => emit('lockerror'));

document.addEventListener('mousemove', (e) => {
  if (!active) return;
  if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
  const s = game.settings.sensitivity;
  player.yaw -= e.movementX * s;
  player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * s * (game.settings.invertY ? -1 : 1), -1.5533, 1.5533);
});

document.addEventListener('mousedown', (e) => {
  if (!active) return;
  if (e.button === 0) gameAudio.shoot(0, portals, fire);
  else if (e.button === 2) gameAudio.shoot(1, portals, fire);
  e.preventDefault();
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.code === 'KeyR' && !e.repeat && (active || game.forceActive)) {
    restartLevel();
    toast('Poziom zaczęty od nowa');
  }
  if (e.code === 'KeyE' && !e.repeat && (active || game.forceActive)) {
    if (mech.held) { const hc = mech.held; if (dropCube(false)) gameAudio.cubeDrop(hc); else toast('Nie możesz upuścić kostki w powietrzu', 900); }
    else if (!pickCube()) toast('Nie ma czego podnieść', 900);
    else audio.play('cube-pick');
  }
  if ((e.code === 'KeyQ' || e.code === 'KeyF') && !e.repeat && (active || game.forceActive)) {
    if (dropCube(true)) audio.play('cube-throw');
  }
  // klawisz M (wyciszenie) obsługuje ui.js razem z ustawieniami
  if ((e.code === 'KeyN' || e.code === 'KeyP') && !e.repeat && (active || game.forceActive)) {
    loadLevel(levelIndex + (e.code === 'KeyN' ? 1 : -1));
  }
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ---------------------------------------------------------------- resize ----
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  const pr = renderer.getPixelRatio();
  viewW = Math.floor(w * pr); viewH = Math.floor(h * pr);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  gunCam.aspect = w / h;
  gunCam.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- jakość ----
// preset: pixelRatio, głębokość portali, rozmiary i MSAA render targetów, gęstość wypalania (gfx.QUALITY)
let qualityName = 'high';
function setQuality(name, save = true) {
  if (!gfx.QUALITY[name]) return false;
  const q = gfx.applyQuality(name);
  qualityName = name;
  MAX_DEPTH = q.maxDepth;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
  for (const rt of rtCache.values()) rt.dispose();
  rtCache.clear();
  resize();
  gfx.rebake();
  if (save) writeQuality(name);
  return true;
}

// ------------------------------------------------------------ pętla gry ----
let lastT = performance.now();
let time = 0;

function updateCamera(dt = 0) {
  player.roll *= Math.exp(-7 * dt);
  if (Math.abs(player.roll) < 1e-3) player.roll = 0;
  player.camOffset.multiplyScalar(Math.exp(-8 * dt));
  if (player.camOffset.lengthSq() < 1e-6) player.camOffset.set(0, 0, 0);
  camera.position.set(player.pos.x, player.pos.y + EYE_H, player.pos.z).add(player.camOffset);
  camera.rotation.set(player.pitch, player.yaw, player.roll, 'YXZ');
  fx.cameraFx(camera, dt);
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
}

function updateGun(dt) {
  gunRig.update(dt);
}

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  time += dt;

  if (!game.manual) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let i = 0; i < steps; i++) physicsStep(dt / steps);
  }

  // pole „wyjście”
  if (levelDone) {
    levelTimer += dt;
    if (levelTimer > 2.6 && !game.manual && game.autoNext) loadLevel(levelIndex + 1);
  } else {
    if (exitReached()) {
      levelDone = true;
      levelTimer = 0;
      fx.levelComplete(levelDef.exit);
      doneSet.add(levelIndex);
      saveDone();
      audio.play('level-complete');
      emit('levelcomplete', { index: levelIndex, time: levelTime, deaths: mech.deaths, cubeResets: mech.cubeResets });
    }
  }

  for (const P of portals) {
    P.uniforms.uTime.value = time;
    if (P.active && P.open < 1) {
      P.open = Math.min(1, P.open + dt * 3.2);
      P.updateScale();
    }
  }
  fx.update(dt);
  mechanicsVisuals(dt);
  gfx.updateDynamics(cubes, dt);
  updateCamera(dt);
  updateGun(dt);
  gameAudio.frame(dt, camera, player, portals);

  refreshTransforms();
  if (game.noRender) return;
  renderView(camera, 0, null);

  // pistolet na wierzchu
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(gunScene, gunCam);
  renderer.autoClear = true;
}

// interfejs do debugowania / testów
const game = {
  THREE, player, portals, camera, renderer, scene, boxes,
  fire, resetPortals, respawn, setActive, keys, loadLevel, restartLevel, LEVELS,
  get levelDone() { return levelDone; },
  levelIndex: () => levelIndex,
  exitReached,
  exitHit: false,    // zatrzask: gracz choć raz stanął na wyjściu (testy; czyszczony przy loadLevel/restartLevel)
  cubes, buttons, doors, fizzlers, mech,
  pickCube, dropCube, lookTarget,
  events, doneSet, requestLock,
  isActive: () => active || game.forceActive,
  get levelTime() { return levelTime; },
  settings: { sensitivity: 0.0022, invertY: false },  // ustawiane przez ui.js (rad na piksel myszy)
  baseFov: 75,       // podstawowe pole widzenia (ustawia ui.js)
  autoNext: true,    // false = po ukończeniu poziomu nie ładuj następnego sam (ekran ukończenia w ui.js)
  forceActive: false,
  manual: false,     // true = fizyka tylko przez game.step(dt) (testy)
  noRender: false,   // true = bez rysowania (szybkie testy)
  step: physicsStep,
  rtCache, vcams, transforms,
  gfx,
  setQuality,
  getQuality: () => qualityName,
};
window.game = game;
fx.bind({ player, portals, mech, cubes, buttons, doors, fizzlers, game });

async function boot() {
  // ?lvmod=/levels/lv11.js – wczytaj tylko jeden poziom z podanego modułu (do testów)
  const lvmod = params.get('lvmod');
  if (lvmod) {
    const m = await import(lvmod);
    LEVELS.length = 0;
    LEVELS.push(m.default);
  }
  // ?test=1 – tryb testowy: ręczna fizyka, bez rysowania (chyba że ?render=1), zestaw T
  if (params.get('test')) {
    game.manual = true;
    game.noRender = !params.get('render');
    game.forceActive = true;
    setActive(true);
    const kit = await import('./testkit.js');
    window.T = kit.install(game);
  }
  updateCrosshair();
  setQuality(readQuality(), false);
  loadLevel(Number(params.get('level') || 1) - 1);
  frame();
  window.gameReady = true;
}
boot();
