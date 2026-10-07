import * as THREE from './vendor/three.module.js';
import * as self from './fx.js';
import { S, rr, clamp01, smooth, rgb, burst, glow, ring, initCore, updateCore, clearCore } from './fxcore.js';
import { updateWorld, clearWorld, mechEvent as worldMechEvent, acidSplash, padVictory } from './fxworld.js';

export { makeAcid, acidSplash, makePad, cubeMaterial, cubeBuilt, cubeTeleport, cubeReset, buttonBuilt, doorBuilt, fizzlerMaterial, fizzlerBuilt } from './fxworld.js';
export { createGun } from './fxmodels.js';

/* ==========================================================================
   fx.js – efekty wizualne: portale (shader, halo, iskry, zamykanie), strzał (pocisk, błysk,
   rozbryzg, nieudany strzał), efekty ekranowe, wykrywanie zdarzeń (lądowanie, kwas).
   Moduły: fxcore.js (cząstki, decale), fxworld.js (kwas, wyjście, mechaniki), fxmodels.js (pistolet).
   Zasada: żadnych alokacji na klatkę; wszystko w stałych pulach. Dokumentacja: docs/fx.md
   ========================================================================== */

// punkty zaczepienia dla innych modułów (np. dźwięku): ustaw funkcję, a fx ją wywoła
export const hooks = {
  shotFail: null,   // (kind) – nieudany strzał trafił w cel: 1 = brak miejsca, 2 = powierzchnia nie przyjmuje portali
  impact: null,     // () – pocisk dotarł do celu i postawił portal
};

const FAIL_COLOR = 0x9aa4ae;     // kolor, którym game.js zgłasza nieudany strzał (spawnRing)
const BOLT_SPEED = 230;          // m/s
const _c = [0, 0, 0];

// =============================================================== PORTALE ====
export const portalVert = /* glsl */`
  varying vec2 vP;
  varying vec4 vClip;
  void main() {
    vP = position.xy;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vClip = projectionMatrix * mv;
    gl_Position = vClip;
  }
`;

// Wir: świecący pierścień, falujące smugi energii, refrakcja przy brzegu widoku, rozbłysk otwarcia.
// Zasady przez-portalowego renderowania (tMap / uUseTex / vClip) bez zmian.
export const portalFrag = /* glsl */`
  uniform sampler2D tMap;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uUseTex;
  uniform float uOpen;
  uniform float uFade;
  varying vec2 vP;
  varying vec4 vClip;
  void main() {
    float t = uTime;
    float r = length(vP) / 0.88;                    // 1.0 = brzeg owalu
    float a = atan(vP.y, vP.x);
    float birth = 1.0 - uOpen;
    float wob = sin(a * 5.0 - t * 5.0) * sin(a * 3.0 + t * 3.0);

    // widok na drugą stronę, lekko zniekształcony przy brzegu
    vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
    float edgeK = smoothstep(0.45, 1.0, r);
    vec2 warp = vec2(sin(a * 4.0 + t * 3.0 + r * 9.0), cos(a * 3.0 - t * 2.6 + r * 8.0)) * edgeK * edgeK * 0.016;
    vec3 view = texture2D(tMap, suv + warp).rgb;

    // wir energii (widoczny, gdy nie ma widoku, i jako smugi na brzegu widoku)
    float sp = a + r * 3.4 - t * 1.7;
    float sw = 0.5 + 0.5 * sin(sp * 3.0 + sin(r * 7.0 - t * 2.2) * 1.5);
    sw *= 0.55 + 0.45 * sin(a * 5.0 - t * 2.3 + r * 5.0);
    vec3 swirl = uColor * (0.12 + 0.75 * sw) * (0.35 + 0.95 * r) + vec3(0.04) * sw;
    vec3 inner = mix(swirl, view, uUseTex);
    inner += uColor * (sw * 0.4 + edgeK * 0.18) * edgeK * uUseTex;

    // pierścień: biały rdzeń + kolorowa poświata
    float d = abs(r - (0.93 + 0.012 * wob));
    float core = exp(-pow(d / 0.03, 2.0));
    float halo = exp(-pow(d / 0.11, 2.0));
    float pulse = 0.8 + 0.2 * sin(t * 3.0 + a * 2.0);
    vec3 ringCol = uColor * (halo * (1.3 + 0.8 * (0.5 + 0.5 * wob)) * pulse + core * 1.2) + vec3(core * (0.55 + 0.25 * wob));

    // rozbłysk i fala przy otwarciu
    float flashK = birth * birth;
    float wave = exp(-pow((r - uOpen * 1.25) / 0.14, 2.0)) * birth;
    ringCol += (uColor * 0.8 + vec3(0.6)) * wave * 1.5;
    inner += vec3(1.0) * flashK * 0.9 * (1.0 - smoothstep(0.0, 1.1, r));
    ringCol *= 1.0 + flashK * 1.6;

    float inside = 1.0 - smoothstep(0.86, 0.95, r);
    float ga = clamp(max(ringCol.r, max(ringCol.g, ringCol.b)), 0.0, 1.0);
    vec3 outerCol = ringCol / max(ga, 0.001);
    vec3 col = mix(outerCol, inner + ringCol, inside);
    float alpha = max(inside, ga) * (1.0 - smoothstep(1.06, 1.136, r)) * uFade;
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

const haloVert = /* glsl */`
  varying vec2 vP;
  void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const haloFrag = /* glsl */`
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpen;
  uniform vec2 uHalf;
  varying vec2 vP;
  void main() {
    vec2 q = vP / uHalf;
    float r = length(q);
    float a = atan(q.y, q.x);
    float fall = smoothstep(1.6, 1.02, r);
    float pulse = 0.82 + 0.18 * sin(uTime * 2.4 + a * 2.0 + sin(a * 3.0 - uTime));
    float band = exp(-pow((r - 1.08) / 0.09, 2.0)) * 0.8;
    float cover = smoothstep(0.84, 1.0, r);
    vec3 c = uColor * (fall * fall * 0.7 + band) * pulse * cover * uOpen;
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

export function portalUniforms(color, tex) {
  return {
    tMap: { value: tex },
    uColor: { value: new THREE.Color(color) },
    uTime: { value: 0 },
    uUseTex: { value: 0 },
    uOpen: { value: 0 },
    uFade: { value: 1 },
  };
}

// miękka poświata na ścianie wokół portalu (addytywny quad w grupie portalu)
export function makeHalo(portal) { return haloMesh(portal.uniforms.uColor, portal.uniforms.uTime, portal.uniforms.uOpen); }

function haloMesh(uColor, uTime, uOpen) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor, uTime, uOpen, uHalf: { value: new THREE.Vector2(S.PORTAL_HW, S.PORTAL_HH) } },
    vertexShader: haloVert, fragmentShader: haloFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry((S.PORTAL_HW + 0.7) * 2, (S.PORTAL_HH + 0.7) * 2), mat);
  m.position.z = -0.0015;
  m.frustumCulled = false;
  m.renderOrder = 4;
  return m;
}

// ---- „duchy”: animacja zamykania portalu na starej pozycji ----
const GHOSTS = 4;
const ghosts = [];
let ghostGeo = null;

function initGhosts() {
  ghostGeo = new THREE.CircleGeometry(1, 48);
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;
  for (let i = 0; i < GHOSTS; i++) {
    const uniforms = portalUniforms(0xffffff, blank);
    uniforms.uOpen.value = 1;
    const mat = new THREE.ShaderMaterial({
      uniforms, vertexShader: portalVert, fragmentShader: portalFrag, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    const disc = new THREE.Mesh(ghostGeo, mat);
    disc.frustumCulled = false;
    const haloOpen = { value: 0 };
    group.add(disc, haloMesh(uniforms.uColor, uniforms.uTime, haloOpen));
    group.visible = false;
    S.scene.add(group);
    ghosts.push({ group, disc, uniforms, haloOpen, t: 0, life: 0.4, on: false, fizzle: false, s0x: 1, s0y: 1, px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 1, ux: 0, uy: 1, uz: 0, rx: 1, ry: 0, rz: 0, ci: 0 });
  }
}

// portal zniknął (przestawiony / usunięty): krótka animacja na starym miejscu
let ghostNext = 0;
export function portalGone(P) {
  if (!ghosts.length) return;
  const g = ghosts[ghostNext];
  ghostNext = (ghostNext + 1) % GHOSTS;
  g.on = true; g.t = 0; g.life = 0.42; g.fizzle = false;
  g.group.visible = true;
  g.group.matrix.copy(P.group.matrix);
  g.group.matrixWorldNeedsUpdate = true;
  g.uniforms.uColor.value.copy(P.uniforms.uColor.value);
  g.uniforms.uTime.value = P.uniforms.uTime.value;
  g.uniforms.uFade.value = 1;
  g.ci = P.index;
  g.px = P.pos.x; g.py = P.pos.y; g.pz = P.pos.z;
  g.nx = P.normal.x; g.ny = P.normal.y; g.nz = P.normal.z;
  g.ux = P.up.x; g.uy = P.up.y; g.uz = P.up.z;
  g.rx = P.right.x; g.ry = P.right.y; g.rz = P.right.z;
  const k = Math.max(0.001, P.open);
  g.disc.scale.set(S.PORTAL_HW / 0.88 * k, S.PORTAL_HH / 0.88 * k, 1);
  g.s0x = g.disc.scale.x; g.s0y = g.disc.scale.y;
  emitEdgeSparks(g, 26, 2.2, 6, S.COLORS[P.index], 0.35);
}

// iskry wzdłuż krawędzi owalu portalu (dane z P lub ducha: pos/normal/up/right)
function emitEdgeSparks(P, n, v0, v1, color, white) {
  rgb(color, _c);
  const hw = S.PORTAL_HW, hh = S.PORTAL_HH;
  const px = P.px ?? P.pos.x, py = P.py ?? P.pos.y, pz = P.pz ?? P.pos.z;
  const nx = P.nx ?? P.normal.x, ny = P.ny ?? P.normal.y, nz = P.nz ?? P.normal.z;
  const ux = P.ux ?? P.up.x, uy = P.uy ?? P.up.y, uz = P.uz ?? P.up.z;
  const rx = P.rx ?? P.right.x, ry = P.ry ?? P.right.y, rz = P.rz ?? P.right.z;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.2832, ca = Math.cos(a), sa = Math.sin(a);
    const v = rr(v0, v1) * 0.3, w = Math.random() * white;
    const ox = rx * ca * hw + ux * sa * hh, oy = ry * ca * hw + uy * sa * hh, oz = rz * ca * hw + uz * sa * hh;
    // kierunek na zewnątrz owalu + lekko od ściany
    const dx = rx * ca + ux * sa, dy = ry * ca + uy * sa, dz = rz * ca + uz * sa;
    S.add.emit(px + ox * 0.97 + nx * 0.04, py + oy * 0.97 + ny * 0.04, pz + oz * 0.97 + nz * 0.04,
      dx * v + nx * rr(0.2, 1.2), dy * v + ny * rr(0.2, 1.2) + rr(0.1, 0.8), dz * v + nz * rr(0.2, 1.2),
      _c[0] + (1 - _c[0]) * w, _c[1] + (1 - _c[1]) * w, _c[2] + (1 - _c[2]) * w, 1, rr(0.03, 0.065), 0.006, rr(0.5, 1.0), 2.5, 1.2);
  }
}

function updateGhosts(dt) {
  for (const g of ghosts) {
    if (!g.on) continue;
    g.t += dt;
    const k = g.t / g.life;
    if (k >= 1) { g.on = false; g.group.visible = false; continue; }
    const e = k * k;
    g.disc.scale.set(g.s0x * (1 - e), g.s0y * (1 - e), 1);
    g.disc.rotation.z = k * 2.4;
    g.uniforms.uFade.value = 1 - k * k;
    g.haloOpen.value = (1 - k) * (1 - k);
    g.uniforms.uTime.value += dt;
    if (g.fizzle) emitEdgeSparks(g, 3, 1, 4, 0x9fd8ff, 0.7);
  }
}

// fizzler: portale rozpadają się na iskry (duchy zamykających się portali są najświeższe)
function dissolveGhosts() {
  for (const g of ghosts) {
    if (!g.on || g.t > 0.15 || g.fizzle) continue;
    g.fizzle = true;
    g.life = 0.55;
    emitEdgeSparks(g, 34, 3, 9, 0xbfe4ff, 0.8);
  }
}

// iskry unoszące się wokół krawędzi aktywnych portali
const sparkT = [0, 0];
function updatePortalSparks(dt) {
  for (const P of S.portals) {
    if (!P.active || P.open < 0.98) continue;
    const c = S.camera.position;
    if ((c.x - P.pos.x) ** 2 + (c.y - P.pos.y) ** 2 + (c.z - P.pos.z) ** 2 > 45 * 45) continue;
    sparkT[P.index] += dt * (P.linked ? 15 : 9);
    while (sparkT[P.index] >= 1) { sparkT[P.index] -= 1; emitEdgeSparks(P, 1, 0.8, 2.2, S.COLORS[P.index], 0.5); }
  }
}

// =============================================================== STRZAŁ ====
const boltVert = /* glsl */`
  uniform vec3 uA;
  uniform vec3 uB;
  uniform float uLen;
  uniform float uW;
  varying vec2 vS;
  void main() {
    float u = position.x + 0.5;
    float v = position.y * 2.0;
    vec3 P = mix(uA, uB, u);
    vec3 dir = (uB - uA) / uLen;
    vec3 side = cross(dir, cameraPosition - P);
    float sl = length(side);
    side = sl > 1e-5 ? side / sl : vec3(0.0, 1.0, 0.0);
    P += side * v * uW;
    vS = vec2(u * uLen, v);
    gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
  }
`;
const boltFrag = /* glsl */`
  uniform vec3 uColor;
  uniform float uHead;
  uniform float uTail;
  uniform float uAfter;
  uniform float uW;
  varying vec2 vS;
  void main() {
    float x = vS.y * uW;
    float b = uHead - vS.x;
    float body = b > 0.0 ? exp(-b / uTail * 3.0) : exp(b * 25.0);
    float x2 = x * x;
    float core = exp(-x2 / 0.00003);
    float gl = exp(-x2 / 0.0009);
    float h = exp(-b * b / 0.02) * exp(-x2 / 0.0007);
    float line = uAfter * exp(-x2 / 0.00004) * step(-0.05, b);
    vec3 c = uColor * (gl * body * 1.1 + h * 1.3 + line) + vec3(core * body * 0.9 + h * 0.9 + line * 0.5);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

const BOLTS = 12;
const bolts = [];
let boltNext = 0;

function initBolts() {
  const geo = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < BOLTS; i++) {
    const uniforms = {
      uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() }, uLen: { value: 1 }, uW: { value: 0.1 },
      uColor: { value: new THREE.Color() }, uHead: { value: 0 }, uTail: { value: 4 }, uAfter: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms, vertexShader: boltVert, fragmentShader: boltFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = 18;
    S.scene.add(mesh);
    bolts.push({ mesh, uniforms, on: false, t: 0, delay: 0, len: 1, ax: 0, ay: 0, az: 0, dx: 0, dy: 0, dz: 0, lastS: 0, cr: 1, cg: 1, cb: 1, end: 1 });
  }
}

let shotLag = 0;          // czas lotu ostatniego pocisku – o tyle opóźniamy rozbryzg
let shotSurface = false;  // czy ostatni strzał trafił w powierzchnię, która nie przyjmuje portali

// segs: lista [od, do] (kolejne odcinki toru, także przez portale); hit: trafienie raycastu lub null
export function shot(segs, color, hit) {
  let delay = 0;
  for (let i = 0; i < segs.length; i++) {
    const a = segs[i][0], b = segs[i][1];
    const len = a.distanceTo(b);
    if (len < 0.01) continue;
    const bo = bolts[boltNext];
    boltNext = (boltNext + 1) % BOLTS;
    bo.on = true; bo.t = 0; bo.delay = delay; bo.len = len; bo.lastS = 0;
    bo.ax = a.x; bo.ay = a.y; bo.az = a.z;
    bo.dx = (b.x - a.x) / len; bo.dy = (b.y - a.y) / len; bo.dz = (b.z - a.z) / len;
    const u = bo.uniforms;
    u.uA.value.copy(a); u.uB.value.copy(b); u.uLen.value = len;
    u.uColor.value.set(color);
    rgb(color, _c);
    bo.cr = _c[0] + 0.5; bo.cg = _c[1] + 0.5; bo.cb = _c[2] + 0.5;
    u.uHead.value = -1; u.uAfter.value = 0;
    bo.mesh.visible = true;
    // do końca odcinka głowa musi dotrzeć + ogon wygasić
    bo.end = len + 6;
    delay += len / BOLT_SPEED;
  }
  shotLag = delay;
  shotSurface = !!(hit && hit.object.userData.box && !hit.object.userData.box.portalable);
  // błysk lufy w świecie: iskry lecące do przodu
  const a = segs[0][0];
  const d = segs[0][1];
  _dir.subVectors(d, a).normalize();
  burst(S.add, a.x, a.y, a.z, _dir.x, _dir.y, _dir.z, color, 5, 1.5, 5, 0.5, 0.025, 0.25, 0, 0.6);
}
const _dir = new THREE.Vector3();

function updateBolts(dt) {
  for (const b of bolts) {
    if (!b.on) continue;
    b.t += dt;
    const ts = b.t - b.delay;
    const u = b.uniforms;
    if (ts < 0) { u.uHead.value = -1; continue; }
    const head = ts * BOLT_SPEED;
    u.uHead.value = head;
    u.uAfter.value = Math.max(0, 1 - ts / 0.3) * 0.7;
    // głowa pocisku jako miękka cząstka (okrągła z każdego kąta)
    if (head < b.len + 0.5) {
      const h = Math.min(head, b.len);
      for (let s = b.lastS; s <= h; s += 0.45) {
        S.add.emit(b.ax + b.dx * s, b.ay + b.dy * s, b.az + b.dz * s, 0, 0, 0, b.cr, b.cg, b.cb, 0.9, 0.11, 0.02, 0.08);
        b.lastS = s + 0.45;
      }
    }
    if (ts > b.end / BOLT_SPEED + 0.05 && ts > 0.3) { b.on = false; b.mesh.visible = false; }
  }
}

// ---- rozbryzg w miejscu trafienia (wołane z game.js jako spawnRing) ----
const PEND = 8;
const pend = [];
for (let i = 0; i < PEND; i++) pend.push({ on: false, t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, color: 0, kind: 0 });
let pendNext = 0;

export function impact(point, normal, color) {
  const p = pend[pendNext];
  pendNext = (pendNext + 1) % PEND;
  p.on = true; p.t = -shotLag;
  p.x = point.x; p.y = point.y; p.z = point.z;
  p.nx = normal.x; p.ny = normal.y; p.nz = normal.z;
  p.color = color;
  p.kind = color === FAIL_COLOR ? (shotSurface ? 2 : 1) : 0;
}

function fireImpact(p) {
  const { x, y, z, nx, ny, nz } = p;
  if (p.kind === 0) {
    if (hooks.impact) hooks.impact();
    ring(x, y, z, nx, ny, nz, p.color, 0, 0.95, 0.5);
    glow(S.add, x + nx * 0.35, y + ny * 0.35, z + nz * 0.35, p.color, 0.7, 0.22, 0.9, 0.5);
    burst(S.add, x + nx * 0.03, y + ny * 0.03, z + nz * 0.03, nx, ny, nz, p.color, 22, 2, 7.5, 1.3, 0.05, 0.75, 7);
    burst(S.add, x, y, z, nx, ny, nz, p.color, 6, 0.3, 1.2, 1.5, 0.09, 1.4, -0.4, 0.2);
  } else if (p.kind === 2) {
    if (hooks.shotFail) hooks.shotFail(2);
    // powierzchnia, która nie przyjmuje portali: szare iskry, krzyżyk i kłąb dymu
    ring(x, y, z, nx, ny, nz, 0xaab4be, 1, 0.6, 0.6);
    burst(S.add, x + nx * 0.03, y + ny * 0.03, z + nz * 0.03, nx, ny, nz, 0xc9d2dc, 14, 1.5, 6, 1.4, 0.035, 0.6, 9, 0.5);
    for (let i = 0; i < 3; i++) S.soft.emit(x + nx * 0.1, y + ny * 0.1, z + nz * 0.1, nx * 0.5 + rr(-0.3, 0.3), ny * 0.5 + rr(0.1, 0.5), nz * 0.5 + rr(-0.3, 0.3), 0.6, 0.62, 0.65, 0.4, 0.07, 0.3, 0.7, 0, 1.5);
  } else {
    // za mało miejsca / nakładanie: czerwone iskry
    if (hooks.shotFail) hooks.shotFail(1);
    ring(x, y, z, nx, ny, nz, 0xff4a38, 1, 0.65, 0.65);
    glow(S.add, x + nx * 0.3, y + ny * 0.3, z + nz * 0.3, 0xff4a38, 0.6, 0.2, 0.7, 0.3);
    burst(S.add, x + nx * 0.03, y + ny * 0.03, z + nz * 0.03, nx, ny, nz, 0xff6a3d, 14, 1.5, 5.5, 1.4, 0.035, 0.6, 9, 0.2);
  }
}

function updateImpacts(dt) {
  shotLag = 0;
  for (const p of pend) {
    if (!p.on) continue;
    p.t += dt;
    if (p.t >= 0) { p.on = false; fireImpact(p); }
  }
}

// ======================================================= EFEKTY EKRANOWE ====
const scr = { vig: null, flash: null, speed: null, sctx: null, speedOn: false };
const lines = [];
let flashA = 0, flashColor = '', flashDecay = 3;
let kick = 0, punch = 0, startFov = 75, curFov = 75;
let shake = 0, dip = 0, dipV = 0;
let prevGround = true, prevVy = 0, lastDeaths = 0, lastPX = 0, lastPZ = 0;
const LINES = 44;

function initScreen() {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden';
  scr.vig = document.createElement('div');
  scr.vig.style.cssText = 'position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 52%,rgba(0,0,0,.5) 100%);opacity:.8';
  scr.flash = document.createElement('div');
  scr.flash.style.cssText = 'position:absolute;inset:0;opacity:0';
  scr.speed = document.createElement('canvas');
  scr.speed.width = 320; scr.speed.height = 180;
  scr.speed.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none';
  scr.sctx = scr.speed.getContext('2d');
  wrap.append(scr.vig, scr.speed, scr.flash);
  S.renderer.domElement.insertAdjacentElement('afterend', wrap);
  for (let i = 0; i < LINES; i++) lines.push({ a: Math.random() * 6.2832, r: Math.random(), len: rr(0.12, 0.3), sp: rr(0.8, 1.6), w: rr(0.5, 1.6) });
}

// błysk ekranu w kolorze (0xRRGGBB), siła 0..1
export function flash(color, amount, decay = 3.2) {
  const h = color.toString(16).padStart(6, '0');
  if (amount >= flashA) { flashColor = '#' + h; scr.flash.style.background = flashColor; }
  flashA = Math.max(flashA, amount);
  flashDecay = decay;
}

function updateScreen(dt) {
  if (flashA > 0.002) {
    flashA *= Math.exp(-flashDecay * dt);
    scr.flash.style.opacity = flashA.toFixed(3);
  } else if (flashA > 0) { flashA = 0; scr.flash.style.opacity = '0'; }
  const P = S.player;
  const speed = Math.hypot(P.vel.x, P.vel.y, P.vel.z);
  const si = smooth(15, 40, speed);
  scr.vig.style.opacity = (0.75 + si * 0.25).toFixed(2);
  if (si > 0.03) {
    if (!scr.speedOn) { scr.speedOn = true; scr.speed.style.display = 'block'; }
    const g = scr.sctx, W = 320, H = 180;
    g.clearRect(0, 0, W, H);
    const maxR = Math.hypot(W, H) * 0.5;
    for (let i = 0; i < LINES; i++) {
      const l = lines[i];
      l.r += dt * l.sp * (0.8 + si * 2.2);
      if (l.r > 1) { l.r -= 1; l.a = Math.random() * 6.2832; }
      const r0 = (0.42 + l.r * 0.58) * maxR, r1 = r0 + l.len * maxR * (0.4 + si);
      const ca = Math.cos(l.a), sa = Math.sin(l.a);
      g.strokeStyle = `rgba(255,255,255,${(0.5 * si * Math.sin(l.r * 3.1416)).toFixed(3)})`;
      g.lineWidth = l.w;
      g.beginPath();
      g.moveTo(W / 2 + ca * r0, H / 2 + sa * r0);
      g.lineTo(W / 2 + ca * r1, H / 2 + sa * r1);
      g.stroke();
    }
  } else if (scr.speedOn) { scr.speedOn = false; scr.speed.style.display = 'none'; }
  kick += (Math.min(9, Math.max(0, speed - 9) * 0.3) - kick) * Math.min(1, dt * 4);
  punch *= Math.exp(-dt * 7);
}

// wołane z updateCamera(dt>0) po ustawieniu pozycji/obrotu kamery, przed updateMatrixWorld
export function cameraFx(camera, dt) {
  if (!(dt > 0)) return;
  const t = S.time;
  shake *= Math.exp(-dt * 5.5);
  dipV += (-dip * 180 - dipV * 14) * dt;
  dip += dipV * dt;
  if (shake > 0.0004) {
    camera.rotation.x += shake * 0.05 * Math.sin(t * 61);
    camera.rotation.z += shake * 0.045 * Math.sin(t * 53 + 1.3);
    camera.position.y += shake * 0.02 * Math.sin(t * 47 + 0.6);
  }
  camera.position.y += dip;
  const base = S.game && S.game.baseFov > 0 ? S.game.baseFov : startFov;
  const target = base + kick + punch;
  if (Math.abs(target - curFov) > 0.005 || Math.abs(camera.fov - target) > 0.005) {
    curFov = target;
    camera.fov = target;
    camera.updateProjectionMatrix();
  }
}

// gracz przeszedł przez portal P (wołane na początku teleport(P))
export function teleported(P) {
  flash(S.COLORS[P.other.index], 0.3, 4.5);
  punch = 5;
}

export function levelComplete(exit) {
  padVictory(exit);
  flash(0xbfffd8, 0.32, 2.6);
}

// ============================================================ PĘTLA / ZDARZENIA ====
export function mechEvent(type, obj) {
  worldMechEvent(type, obj);
  if (type === 'fizzle') dissolveGhosts();
}

function detectEvents(dt) {
  const P = S.player;
  // lądowanie: dotknięcie ziemi po locie
  const g = P.onGround;
  if (g && !prevGround) {
    const v = -prevVy;
    if (v > 7) {
      S.landImpact = v;
      const n = Math.min(26, Math.floor((v - 5) * 1.1));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.2832, s = rr(1.0, 2.6) * (0.6 + v / 40);
        S.soft.emit(P.pos.x + Math.cos(a) * 0.3, P.pos.y + 0.08, P.pos.z + Math.sin(a) * 0.3, Math.cos(a) * s, rr(0.2, 0.7), Math.sin(a) * s,
          0.72, 0.74, 0.78, 0.3, 0.1, rr(0.4, 0.75), rr(0.45, 0.8), -0.3, 2.2);
      }
      if (v > 12) shake = Math.min(1, 0.25 + (v - 12) / 30) * 1.2;
      dipV -= Math.min(v, 40) * 0.045;
    }
  }
  if (!g) prevVy = P.vel.y;
  prevGround = g;
  // śmierć w kwasie (mech.deaths rośnie, gracz wraca na start)
  if (S.mech.deaths !== lastDeaths) {
    lastDeaths = S.mech.deaths;
    acidSplash(lastPX, lastPZ, clamp01(-prevVy / 30 + 0.2));
    flash(0x7dff3a, 0.55, 2.4);
    shake = 0.8;
  }
  lastPX = P.pos.x; lastPZ = P.pos.z;
}

export function update(dt) {
  S.time += dt;
  detectEvents(dt);
  updateImpacts(dt);
  updateBolts(dt);
  updatePortalSparks(dt);
  updateGhosts(dt);
  updateScreen(dt);
  updateWorld(dt);
  updateCore(dt);
}

// poziom się zmienia: zwolnij wszystko, co zależy od poziomu
export function clearLevel() {
  clearCore();
  clearWorld();
  for (const p of pend) p.on = false;
  for (const b of bolts) { b.on = false; b.mesh.visible = false; }
  for (const g of ghosts) { g.on = false; g.group.visible = false; }
}

// ctx: scene, camera, renderer, COLORS, PORTAL_HW, PORTAL_HH, EYE_H, ACID_Y (wołane przed utworzeniem portali)
export function init(ctx) {
  Object.assign(S, ctx);
  startFov = curFov = ctx.camera.fov;
  initCore(ctx.scene);
  initBolts();
  initGhosts();
  initScreen();
}

// ctx: player, portals, mech, cubes, buttons, doors, fizzlers, game (wołane po utworzeniu tych struktur)
export function bind(ctx) {
  Object.assign(S, ctx);
  lastDeaths = S.mech.deaths;
  ctx.game.fx = self;
}
