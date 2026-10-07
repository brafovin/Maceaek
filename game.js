import * as THREE from './vendor/three.module.js';

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
const MAX_DEPTH = 2;         // ile poziomów „portal w portalu” jest renderowane
const NEAR = 0.03;
const SPAWN = new THREE.Vector3(0, 0.02, 18);
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

// oświetlenie sceny
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

const texWhite = makeCanvasTexture(256, (g, s) => {
  g.fillStyle = '#e6eaee'; g.fillRect(0, 0, s, s);
  speckle(g, s, 500, 0.05);
  g.strokeStyle = '#aab3bc'; g.lineWidth = 5; g.strokeRect(2.5, 2.5, s - 5, s - 5);
  g.strokeStyle = '#f7f9fb'; g.lineWidth = 2; g.strokeRect(7, 7, s - 14, s - 14);
  g.fillStyle = '#c3cad1';
  for (const [x, y] of [[16, 16], [s - 16, 16], [16, s - 16], [s - 16, s - 16]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
});
const texFloor = makeCanvasTexture(256, (g, s) => {
  g.fillStyle = '#c9ced4'; g.fillRect(0, 0, s, s);
  speckle(g, s, 900, 0.07);
  g.strokeStyle = '#8f98a2'; g.lineWidth = 5; g.strokeRect(2.5, 2.5, s - 5, s - 5);
  g.strokeStyle = '#dde1e6'; g.lineWidth = 2; g.strokeRect(7, 7, s - 14, s - 14);
});
const texDark = makeCanvasTexture(256, (g, s) => {
  g.fillStyle = '#272b30'; g.fillRect(0, 0, s, s);
  speckle(g, s, 700, 0.06);
  g.strokeStyle = '#14171a'; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s - 6);
  g.strokeStyle = '#3a4047'; g.lineWidth = 2; g.strokeRect(9, 9, s - 18, s - 18);
  g.strokeStyle = '#3a4047'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(24, s - 24); g.lineTo(s - 24, 24); g.moveTo(24, 24); g.lineTo(s - 24, s - 24); g.stroke();
});

const MATS = {
  white: { mat: new THREE.MeshLambertMaterial({ map: texWhite }), portalable: true, tile: 2 },
  floor: { mat: new THREE.MeshLambertMaterial({ map: texFloor }), portalable: true, tile: 2 },
  dark:  { mat: new THREE.MeshLambertMaterial({ map: texDark }),  portalable: false, tile: 2 },
};

// ----------------------------------------------------------------- świat ----
const world = new THREE.Group();
scene.add(world);
const boxes = [];        // kolizje AABB
const worldMeshes = [];  // do raycastu

function addBox(x0, y0, z0, x1, y1, z1, kind = 'white') {
  const m = MATS[kind];
  const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  // UV we współrzędnych świata, żeby sąsiednie ściany miały spójną siatkę
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    let u, v;
    if (ax > 0.5) { u = p.getZ(i); v = p.getY(i); }
    else if (ay > 0.5) { u = p.getX(i); v = p.getZ(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u / m.tile, v / m.tile);
  }
  const mesh = new THREE.Mesh(geo, m.mat);
  const box = {
    min: new THREE.Vector3(x0, y0, z0),
    max: new THREE.Vector3(x1, y1, z1),
    portalable: m.portalable,
  };
  mesh.userData.box = box;
  world.add(mesh);
  worldMeshes.push(mesh);
  boxes.push(box);
  return box;
}

function buildLevel() {
  // podłoga z dołem (kwas) pośrodku
  addBox(-26, -8, -26, -6, 0, 26, 'floor');
  addBox(6, -8, -26, 26, 0, 26, 'floor');
  addBox(-6, -8, -6, 6, 0, 26, 'floor');
  addBox(-6, -8, -26, 6, 0, -16, 'floor');
  addBox(-6, -8, -16, 6, -6, -6, 'dark');          // dno dołu

  // ściany i sufit
  addBox(-26, 0, -26, 26, 14, -24, 'white');       // północ
  addBox(-26, 0, 24, 26, 14, 26, 'white');         // południe
  addBox(-26, 0, -24, -24, 14, 24, 'white');       // zachód
  addBox(24, 0, -24, 26, 14, 24, 'dark');          // wschód (nie przyjmuje portali)
  addBox(-26, 14, -26, 26, 16, 26, 'floor');       // sufit

  // schody po zachodniej stronie i podest
  for (let i = 1; i <= 12; i++) addBox(-24, 0, 4, -18, 0.5 * i, 4 + 1.5 * (13 - i), 'white');
  addBox(-24, 0, -8, -14, 6, 4, 'white');

  // platforma docelowa (tylko przez portale)
  addBox(14, 0, -24, 24, 5, -14, 'white');

  // filary, ściany
  addBox(-2, 0, 8, 2, 3, 12, 'white');
  addBox(8, 0, 10, 12, 5, 14, 'white');
  addBox(-12, 0, -14, -10, 8, -4, 'dark');         // ciemna ściana – bez portali
  addBox(12, 0, 0, 14, 8, 10, 'white');

  // kwas w dole
  const acid = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 10),
    new THREE.MeshBasicMaterial({ color: 0x78e03a, transparent: true, opacity: 0.92 })
  );
  acid.rotation.x = -Math.PI / 2;
  acid.position.set(0, ACID_Y, -11);
  scene.add(acid);
  levelAnim.acid = acid;

  // panele świetlne w suficie
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const x of [-16, 0, 16]) for (const z of [-16, 0, 16]) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), lightMat);
    l.rotation.x = Math.PI / 2;
    l.position.set(x, 13.98, z);
    scene.add(l);
  }

  // pad „wyjście” na platformie docelowej
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(1.8, 40),
    new THREE.MeshBasicMaterial({ color: 0x4ade80 })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(19, 5.015, -19);
  scene.add(pad);
  levelAnim.pad = pad;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.0, 2.25, 48),
    new THREE.MeshBasicMaterial({ color: 0xbbf7d0 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(19, 5.02, -19);
  scene.add(ring);

  // tablice na ścianie
  function sign(text, sub, w, h, x, y, z, ry = 0) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = Math.round(1024 * h / w);
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(20,24,30,.92)'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(14, 14, c.width - 28, c.height - 28);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${Math.round(c.height * 0.3)}px system-ui, sans-serif`;
    g.fillText(text, c.width / 2, c.height * 0.42);
    g.font = `400 ${Math.round(c.height * 0.14)}px system-ui, sans-serif`;
    g.fillStyle = '#9fb3c8';
    g.fillText(sub, c.width / 2, c.height * 0.76);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
  }
  sign('KOMORA TESTOWA 01', 'Dotrzyj do zielonego pola na wysokiej platformie', 12, 3, 0, 9, -23.97);
  sign('BRAK PORTALI', 'ta powierzchnia nie przyjmuje portali', 5, 1.4, 25.0 - 1.02, 7, 0, -Math.PI / 2);
}
const levelAnim = {};
buildLevel();

// ---------------------------------------------------------------- portale ----
const DUMMY_TEX = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
DUMMY_TEX.needsUpdate = true;

const portalVert = /* glsl */`
  varying vec2 vP;
  varying vec4 vClip;
  void main() {
    vP = position.xy;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vClip = projectionMatrix * mv;
    gl_Position = vClip;
  }
`;
const portalFrag = /* glsl */`
  uniform sampler2D tMap;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uUseTex;
  varying vec2 vP;
  varying vec4 vClip;
  void main() {
    float r = length(vP);
    vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
    vec3 view = texture2D(tMap, suv).rgb;
    vec3 inner = mix(uColor * 0.22, view, uUseTex);
    float a = atan(vP.y, vP.x);
    float wob = 0.5 + 0.5 * sin(a * 5.0 - uTime * 5.0) * sin(a * 3.0 + uTime * 3.0);
    vec3 glow = uColor * (1.1 + 0.9 * wob) + vec3(0.12);
    float ring = smoothstep(0.72, 0.84, r);
    vec3 col = mix(inner, glow, ring);
    float alpha = 1.0 - smoothstep(0.90, 1.0, r);
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

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

    this.uniforms = {
      tMap: { value: DUMMY_TEX },
      uColor: { value: new THREE.Color(COLORS[index]) },
      uTime: { value: 0 },
      uUseTex: { value: 0 },
    };
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
    this.group.add(this.disc);
    this.group.visible = false;
    scene.add(this.group);
  }

  place(pos, normal, up, host) {
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
  }

  clear() {
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
  const k = depth === 0 ? 1 : 0.5;
  const w = Math.max(2, Math.floor(viewW * k)), h = Math.max(2, Math.floor(viewH * k));
  if (!rt) {
    rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, samples: depth === 0 ? 4 : 0 });
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
gunScene.add(new THREE.AmbientLight(0xffffff, 1.6));
const gunSun = new THREE.DirectionalLight(0xffffff, 2.0);
gunSun.position.set(0.4, 0.8, 0.6);
gunScene.add(gunSun);

const gun = new THREE.Group();
gun.scale.setScalar(0.65);
const gunBase = new THREE.Vector3(0.16, -0.15, -0.42);
gunScene.add(gun);
const gunWhite = new THREE.MeshLambertMaterial({ color: 0xe9edf1 });
const gunGrey = new THREE.MeshLambertMaterial({ color: 0x4b525a });
const gunGlowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
{
  const rear = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.26, 24), gunWhite);
  rear.rotation.x = Math.PI / 2;
  rear.position.set(0, 0, 0.09);
  gun.add(rear);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.046, 0.3, 24), gunWhite);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, -0.19);
  gun.add(barrel);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.035, 24), gunGrey);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0, -0.03);
  gun.add(collar);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.22), gunGrey);
  spine.position.set(0, 0.062, 0.02);
  gun.add(spine);
  for (let i = 0; i < 3; i++) {
    const a = i * (Math.PI * 2 / 3) + Math.PI / 2;
    const prong = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.16), gunGrey);
    prong.position.set(Math.cos(a) * 0.05, Math.sin(a) * 0.05, -0.34);
    prong.rotation.z = a - Math.PI / 2;
    gun.add(prong);
  }
  const tip = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.007, 10, 28), gunGlowMat);
  tip.position.set(0, 0, -0.35);
  gun.add(tip);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), gunGlowMat);
  core.position.set(0, 0, -0.335);
  gun.add(core);
}
let gunKick = 0;
const gunColor = new THREE.Color(0xdfe7ee);
const gunTarget = new THREE.Color(0xdfe7ee);

// -------------------------------------------------------------- efekty ----
const effects = [];

function spawnRing(point, normal, color) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.28, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false })
  );
  m.position.copy(point).addScaledVector(normal, 0.02);
  m.lookAt(_p.copy(point).add(normal));
  scene.add(m);
  effects.push({ mesh: m, t: 0, life: 0.45, kind: 'ring' });
}

const _up = new THREE.Vector3(0, 1, 0);
function spawnBeam(from, to, color) {
  const len = from.distanceTo(to);
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, len, 6, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_up, _p.subVectors(to, from).normalize());
  scene.add(m);
  effects.push({ mesh: m, t: 0, life: 0.18, kind: 'beam' });
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.t += dt;
    const k = e.t / e.life;
    if (k >= 1) {
      scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
      effects.splice(i, 1);
      continue;
    }
    e.mesh.material.opacity = (1 - k) * (e.kind === 'beam' ? 0.9 : 1);
    if (e.kind === 'ring') e.mesh.scale.setScalar(1 + k * 1.6);
  }
}

// ------------------------------------------------------------------ gracz ----
const player = {
  pos: SPAWN.clone(),
  vel: new THREE.Vector3(),
  onGround: false,
  yaw: 0,
  pitch: 0,
  roll: 0,
  camOffset: new THREE.Vector3(), // wygładza „przeskok” kamery po teleportacji
};

const keys = Object.create(null);
let active = false;       // kursor zablokowany = gra aktywna
let won = false;

function overlaps(box, x, y, z) {
  return x - PLAYER_R < box.max.x && x + PLAYER_R > box.min.x &&
         y < box.max.y && y + PLAYER_H > box.min.y &&
         z - PLAYER_R < box.max.z && z + PLAYER_R > box.min.z;
}

// czy ciało gracza mieści się w otworze portalu P (rzut na płaszczyznę portalu)
const _c = new THREE.Vector3();
function bodyInHole(P, x, y, z) {
  const hx = PLAYER_R * 0.75, hy0 = 0.2, hy1 = 1.6;
  for (let i = 0; i < 8; i++) {
    _c.set(x + (i & 1 ? hx : -hx), y + (i & 2 ? hy1 : hy0), z + (i & 4 ? hx : -hx)).sub(P.pos);
    const r = _c.dot(P.right) / PORTAL_HW, u = _c.dot(P.up) / PORTAL_HH;
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
    if (bodyInHole(P, x, y, z)) {
      if (Math.abs(P.normal.y) > 0.5) inFloorHole = true;
      return true;
    }
  }
  return false;
}
let inFloorHole = false;

function collect(x, y, z, out) {
  out.length = 0;
  for (const b of boxes) if (overlaps(b, x, y, z) && !boxIgnored(b, x, y, z)) out.push(b);
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
  if (player.onGround) {
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
    }
  } else if (wishLen > 0) {
    accelerate(_wish, speed, 2.5, dt);
  }

  player.vel.y = Math.max(player.vel.y - GRAVITY * dt, -55);

  _eyePrev.copy(player.pos); _eyePrev.y += EYE_H;
  const wasGround = player.onGround;
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

  // kwas
  if (player.pos.y < ACID_Y - 0.4) {
    respawn();
    toast('Kwas! Zaczynasz od nowa');
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
      const r = _hitP.dot(P.right) / PORTAL_HW, u = _hitP.dot(P.up) / PORTAL_HH;
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

  // kamera (oczy) – ciągłość obrazu
  const eye = _eye.copy(player.pos); eye.y += EYE_H;
  eye.applyMatrix4(M);
  const camWorld = eye.clone();
  // prędkość
  const speed = player.vel.length();
  player.vel.transformDirection(M).multiplyScalar(speed);
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

  // gdzie stają stopy: przy wylocie z podłogi/sufitu ciało stoi/wisi przy portalu,
  // przy wylocie ze ściany oczy zachowują ciągłość
  let feetY = eye.y - EYE_H;
  if (O.normal.y > 0.5) feetY = O.pos.y + 0.002;
  else if (O.normal.y < -0.5) feetY = O.pos.y - PLAYER_H - 0.002;
  player.pos.set(eye.x, feetY, eye.z);
  // wypchnij ze ścian, które nie są otworem portalu
  for (let i = 0; i < 4; i++) {
    if (!collect(player.pos.x, player.pos.y, player.pos.z, _hit).length) break;
    let top = -Infinity;
    for (const b of _hit) top = Math.max(top, b.max.y);
    player.pos.y = top + EPS;
  }
  player.onGround = false;
  player.camOffset.copy(camWorld).sub(_c.set(player.pos.x, player.pos.y + EYE_H, player.pos.z));
  _eyePrev.set(player.pos.x, player.pos.y + EYE_H, player.pos.z);
}

function respawn() {
  player.pos.copy(SPAWN);
  player.vel.set(0, 0, 0);
  player.yaw = 0; player.pitch = 0; player.roll = 0;
  player.camOffset.set(0, 0, 0);
  player.onGround = false;
}

// ---------------------------------------------------------- strzelanie ----
const ray = new THREE.Raycaster();
const _ctr = new THREE.Vector2(0, 0);
const AXES = ['x', 'y', 'z'];

function fire(index) {
  gunKick = 1;
  gunTarget.set(COLORS[index]);
  updateCamera();
  ray.setFromCamera(_ctr, camera);
  ray.far = 120;
  const hits = ray.intersectObjects(worldMeshes, false);

  const muzzle = new THREE.Vector3(0.13, -0.12, -0.55).applyMatrix4(camera.matrixWorld);
  if (!hits.length) {
    spawnBeam(muzzle, ray.ray.at(60, new THREE.Vector3()), COLORS[index]);
    return false;
  }
  const hit = hits[0];
  const box = hit.object.userData.box;
  const normal = hit.face.normal.clone();
  spawnBeam(muzzle, hit.point, COLORS[index]);

  if (!box.portalable) {
    spawnRing(hit.point, normal, 0x9aa4ae);
    toast('Ta powierzchnia nie przyjmuje portali');
    return false;
  }

  // układ współrzędnych portalu
  const up = new THREE.Vector3();
  if (Math.abs(normal.y) > 0.5) {
    camera.getWorldDirection(_fwd);
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
    const g = down.intersectObjects(worldMeshes, false)[0];
    if (g) {
      const lo = box.min.y + ext.y;
      pos.y = Math.max(lo, pos.y - (g.distance - 0.05));
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
const crosshair = document.getElementById('crosshair');
const blobBlue = document.getElementById('blobBlue');
const blobOrange = document.getElementById('blobOrange');
const hint = document.getElementById('hint');
const overlay = document.getElementById('overlay');
const toastEl = document.getElementById('toast');
let toastTimer = 0;

function updateCrosshair() {
  blobBlue.classList.toggle('on', portals[0].active);
  blobOrange.classList.toggle('on', portals[1].active);
}
function toast(msg, ms = 1800) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

function setActive(v) {
  active = v;
  overlay.classList.toggle('hidden', v);
  crosshair.style.display = v ? 'block' : 'none';
  hint.style.display = v ? 'block' : 'none';
  if (!v) for (const k in keys) keys[k] = false;
}

// ----------------------------------------------------------------- input ----
overlay.addEventListener('click', () => {
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  } catch { /* ignoruj */ }
});
document.addEventListener('pointerlockchange', () => setActive(document.pointerLockElement === canvas));
document.addEventListener('pointerlockerror', () => {
  const err = document.getElementById('err');
  err.style.display = 'block';
  err.textContent = 'Nie udało się przechwycić kursora – spróbuj kliknąć jeszcze raz.';
});

document.addEventListener('mousemove', (e) => {
  if (!active) return;
  if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
  const s = 0.0022;
  player.yaw -= e.movementX * s;
  player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * s, -1.5533, 1.5533);
});

document.addEventListener('mousedown', (e) => {
  if (!active) return;
  if (e.button === 0) fire(0);
  else if (e.button === 2) fire(1);
  e.preventDefault();
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.code === 'KeyR' && !e.repeat && (active || game.forceActive)) {
    resetPortals();
    if (e.shiftKey || player.pos.y < -1) respawn();
    toast('Portale usunięte');
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

// ------------------------------------------------------------ pętla gry ----
let lastT = performance.now();
let time = 0;
let bob = 0;

function updateCamera(dt = 0) {
  player.roll *= Math.exp(-7 * dt);
  if (Math.abs(player.roll) < 1e-3) player.roll = 0;
  player.camOffset.multiplyScalar(Math.exp(-8 * dt));
  if (player.camOffset.lengthSq() < 1e-6) player.camOffset.set(0, 0, 0);
  camera.position.set(player.pos.x, player.pos.y + EYE_H, player.pos.z).add(player.camOffset);
  camera.rotation.set(player.pitch, player.yaw, player.roll, 'YXZ');
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
}

function updateGun(dt) {
  gunKick = Math.max(0, gunKick - dt * 6);
  const sp = Math.hypot(player.vel.x, player.vel.z);
  bob += dt * (3 + sp * 1.3) * (player.onGround ? 1 : 0.2);
  const amp = player.onGround ? Math.min(sp / WALK, 1.6) : 0.2;
  gun.position.set(
    gunBase.x + Math.sin(bob) * 0.006 * amp,
    gunBase.y + Math.abs(Math.cos(bob)) * 0.008 * amp - Math.min(Math.max(player.vel.y, -8), 8) * 0.0012,
    gunBase.z + gunKick * 0.07
  );
  gun.rotation.set(gunKick * 0.12, 0, 0);
  gunColor.lerp(gunTarget, Math.min(1, dt * 10));
  gunGlowMat.color.copy(gunColor).multiplyScalar(1.0);
}

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  time += dt;

  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  for (let i = 0; i < steps; i++) physicsStep(dt / steps);

  // pad wyjściowy
  if (!won && player.onGround && Math.hypot(player.pos.x - 19, player.pos.z + 19) < 1.8 && Math.abs(player.pos.y - 5) < 0.2) {
    won = true;
    toast('Komora ukończona! Gratulacje 🎉', 5000);
  }
  if (levelAnim.pad) levelAnim.pad.material.color.setHSL(0.38, 0.7, 0.5 + 0.1 * Math.sin(time * 3));
  if (levelAnim.acid) levelAnim.acid.material.color.setHSL(0.25 + 0.02 * Math.sin(time * 2), 0.75, 0.5 + 0.05 * Math.sin(time * 3.3));

  for (const P of portals) {
    P.uniforms.uTime.value = time;
    if (P.active && P.open < 1) {
      P.open = Math.min(1, P.open + dt * 4.5);
      P.updateScale();
    }
  }
  updateEffects(dt);
  updateCamera(dt);
  updateGun(dt);

  refreshTransforms();
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
  fire, resetPortals, respawn, setActive, keys,
  forceActive: false,
  step: physicsStep,
  rtCache, vcams, transforms,
};
window.game = game;

updateCrosshair();
respawn();
frame();
