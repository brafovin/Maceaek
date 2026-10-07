import * as THREE from './vendor/three.module.js';
import { S, rr, clamp01, rgb, burst, glow, ring, glowTexture } from './fxcore.js';

/* ==========================================================================
   fxworld.js – wizualia świata: kwas, pole wyjścia, kostki, przyciski, drzwi, fizzlery
   Obiekty z game.js dostają pole `fx` (stan animacji); wszystko co tu powstaje jest
   zwalniane w clearWorld() (wołane z fx.clearLevel przy zmianie poziomu).
   ========================================================================== */

const acids = [];      // {x0,x1,z0,z1,area,mat,mistT,bubbleT}
const pads = [];       // {group, discMat, colMat, x,y,z, boost, partT}
const spare = [];      // rzeczy do zwolnienia przy zmianie poziomu (geometrie, materiały)
const _c = [0, 0, 0];

function track(o) { spare.push(o); return o; }

export function clearWorld() {
  for (const o of spare) o.dispose();
  spare.length = 0;
  acids.length = 0;
  for (const p of pads) S.scene.remove(p.group);
  pads.length = 0;
}

const camDist2 = (x, y, z) => {
  const c = S.camera.position;
  return (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y) + (c.z - z) * (c.z - z);
};

// ======================================================================= KWAS ====
const acidVert = /* glsl */`
  uniform float uTime;
  varying vec3 vW;
  void main() {
    vec3 p = position;
    p.y += sin(p.x * 1.3 + uTime * 1.4) * 0.035 + sin(p.z * 1.7 - uTime * 1.1) * 0.03 + sin((p.x + p.z) * 2.3 + uTime * 2.1) * 0.02;
    vW = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;
const acidFrag = /* glsl */`
  uniform float uTime;
  uniform vec4 uRect;       // x0, z0, x1, z1
  varying vec3 vW;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    float t = uTime;
    vec2 p = vW.xz;
    // normalna fali (pochodne analityczne) – do połysków
    float dx = 0.035 * 1.3 * cos(p.x * 1.3 + t * 1.4) + 0.02 * 2.3 * cos((p.x + p.y) * 2.3 + t * 2.1);
    float dz = -0.03 * 1.7 * cos(p.y * 1.7 - t * 1.1) + 0.02 * 2.3 * cos((p.x + p.y) * 2.3 + t * 2.1);
    vec3 n = normalize(vec3(-dx * 3.0, 1.0, -dz * 3.0));
    vec3 V = normalize(cameraPosition - vW);
    // kaustyki: trzy warstwy przesuniętych grzbietów
    vec2 q = p * 0.5;
    float c = 0.0;
    for (int i = 0; i < 3; i++) {
      q += vec2(sin(q.y * 1.4 + t * 0.55 + float(i) * 2.0), cos(q.x * 1.2 - t * 0.5 + float(i))) * 0.6;
      c += 1.0 - abs(sin(q.x * 2.3 + q.y * 1.9));
    }
    c = pow(c * 0.3333, 6.0);
    // pasma światła i pulsowanie
    float bands = 0.5 + 0.5 * sin(p.x * 0.8 + p.y * 0.45 + t * 0.7 + vnoise(p * 0.25) * 5.0);
    float pulse = 0.9 + 0.1 * sin(t * 2.0 + vnoise(p * 0.2) * 6.0);
    // pianka przy brzegu
    float e = min(min(vW.x - uRect.x, uRect.z - vW.x), min(vW.z - uRect.y, uRect.w - vW.z));
    float fn = vnoise(p * 2.2 + t * 0.4);
    float foam = smoothstep(0.9, 0.05, e + fn * 0.55 - 0.2) * (0.55 + 0.45 * sin(e * 11.0 - t * 2.4 + fn * 5.0));
    foam = clamp(foam, 0.0, 1.0);
    vec3 deep = vec3(0.02, 0.2, 0.012), mid = vec3(0.1, 0.55, 0.03), hi = vec3(0.5, 1.0, 0.1);
    vec3 col = mix(deep, mid, vnoise(p * 0.45 + t * 0.12) * 0.7 + bands * 0.3);
    col += hi * (c * 0.5 + bands * bands * 0.08);
    float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
    col = mix(col, hi * 0.9, fres * 0.45);
    vec3 L = normalize(vec3(0.4, 1.0, 0.3));
    float spec = pow(max(dot(reflect(-L, n), V), 0.0), 60.0);
    col += vec3(0.8, 1.0, 0.55) * spec * 0.8;
    col = mix(col, vec3(0.62, 0.95, 0.4), foam * 0.75);
    col *= pulse;
    gl_FragColor = vec4(col, 0.94);
    #include <colorspace_fragment>
  }
`;

export function makeAcid(x0, x1, z0, z1) {
  const w = x1 - x0, d = z1 - z0;
  const geo = new THREE.PlaneGeometry(w, d, Math.max(1, Math.min(48, Math.ceil(w / 0.7))), Math.max(1, Math.min(48, Math.ceil(d / 0.7))));
  geo.rotateX(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, S.ACID_Y, (z0 + z1) / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uRect: { value: new THREE.Vector4(x0, z0, x1, z1) } },
    vertexShader: acidVert, fragmentShader: acidFrag, transparent: true,
  });
  track(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  acids.push({ x0, x1, z0, z1, area: w * d, mat, mistT: 0, bubbleT: 0 });
  return mesh;
}

// rozbryzg kwasu: moc 0..1 (zależna od prędkości wpadnięcia)
export function acidSplash(x, z, power) {
  const y = S.ACID_Y;
  ring(x, y + 0.03, z, 0, 1, 0, 0x9cff3a, 0, 1.2 + power * 1.6, 0.8);
  ring(x, y + 0.03, z, 0, 1, 0, 0x4dff7a, 2, 2.2 + power * 2.4, 1.1);
  glow(S.add, x, y + 0.5, z, 0x9cff3a, 1.0 + power * 0.6, 0.3, 0.5, 0.1);
  rgb(0x9cff3a, _c);
  const n = 28 + Math.floor(power * 36);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, h = rr(0.6, 3.2) * (0.6 + power * 0.6);
    const w = Math.random() * 0.5;
    S.add.emit(x, y + 0.05, z, Math.cos(a) * h, rr(3, 9) * (0.55 + power * 0.7), Math.sin(a) * h,
      _c[0] + (1 - _c[0]) * w, _c[1] + (1 - _c[1]) * w, _c[2] + (1 - _c[2]) * w, 1, rr(0.06, 0.15), 0.02, rr(0.7, 1.4), 16, 0.3);
  }
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * 6.283, h = rr(0.3, 1.6);
    S.soft.emit(x, y + 0.1, z, Math.cos(a) * h, rr(0.8, 2.2), Math.sin(a) * h, 0.55, 0.95, 0.35, 0.55, rr(0.3, 0.5), rr(0.9, 1.5), rr(0.7, 1.2), 0, 1.5);
  }
}

function updateAcids(dt) {
  for (const a of acids) {
    a.mat.uniforms.uTime.value = S.time;
    const cx = (a.x0 + a.x1) / 2, cz = (a.z0 + a.z1) / 2;
    const reach = Math.max(a.x1 - a.x0, a.z1 - a.z0) / 2 + 40;
    if (camDist2(cx, S.ACID_Y, cz) > reach * reach) continue;
    // bąble – świecące zarodniki unoszące się z powierzchni
    a.bubbleT += dt * Math.min(16, 2 + a.area * 0.05);
    while (a.bubbleT >= 1) {
      a.bubbleT -= 1;
      const x = rr(a.x0, a.x1), z = rr(a.z0, a.z1), s = rr(0.04, 0.11);
      S.add.emit(x, S.ACID_Y + 0.02, z, rr(-0.1, 0.1), rr(0.25, 0.8), rr(-0.1, 0.1), 0.35, 1.0, 0.15, 0.9, s, s * 0.4, rr(1.0, 2.2), 0, 0.2);
    }
    // opary – delikatna zielona mgiełka tuż nad powierzchnią
    a.mistT += dt * Math.min(5, 1 + a.area * 0.012);
    while (a.mistT >= 1) {
      a.mistT -= 1;
      const x = rr(a.x0, a.x1), z = rr(a.z0, a.z1);
      S.soft.emit(x, S.ACID_Y + 0.15, z, rr(-0.15, 0.15), rr(0.2, 0.45), rr(-0.15, 0.15), 0.25, 0.8, 0.12, 0.085, rr(0.9, 1.4), rr(2.2, 3.2), rr(3.0, 4.6), 0, 0.1);
    }
  }
}

// ===================================================================== WYJŚCIE ====
const padDiscVert = /* glsl */`
  varying vec2 vP;
  void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const padDiscFrag = /* glsl */`
  uniform float uTime;
  uniform float uBoost;
  varying vec2 vP;
  void main() {
    float t = uTime;
    float r = length(vP);
    float a = atan(vP.y, vP.x);
    float body = 1.0 - smoothstep(1.78, 1.86, r);
    vec3 base = mix(vec3(0.02, 0.28, 0.1), vec3(0.08, 0.7, 0.28), 0.5 + 0.5 * sin(t * 2.0 - r * 3.0));
    float core = exp(-r * r * 0.7);
    float outer = exp(-pow((r - 2.08) / 0.07, 2.0));
    float dash1 = smoothstep(0.1, 0.5, sin(a * 8.0 + t * 1.8));
    float ring1 = exp(-pow((r - 1.45) / 0.05, 2.0)) * (0.35 + 0.65 * dash1);
    float dash2 = smoothstep(0.0, 0.6, sin(a * 5.0 - t * 1.4));
    float ring2 = exp(-pow((r - 0.9) / 0.045, 2.0)) * (0.3 + 0.7 * dash2);
    float wr = fract(t * 0.45) * 2.0;
    float wave = exp(-pow((r - wr) / 0.08, 2.0)) * (1.0 - wr * 0.5);
    float glowA = outer * 1.2 + ring1 * 0.9 + ring2 * 0.8 + wave * 0.8 + core * 0.55;
    float boost = 1.0 + uBoost * 1.6;
    vec3 col = base * body + vec3(0.45, 1.0, 0.6) * glowA * boost + vec3(0.8, 1.0, 0.9) * core * uBoost;
    float alpha = clamp(body * 0.88 + glowA, 0.0, 1.0) * (1.0 - smoothstep(2.25, 2.45, r));
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;
const padColVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const padColFrag = /* glsl */`
  uniform float uTime;
  uniform float uBoost;
  varying vec2 vUv;
  void main() {
    float h = vUv.y;
    float fall = pow(1.0 - h, 1.7);
    float streak = 0.55 + 0.45 * sin(vUv.x * 62.8 + sin(vUv.x * 18.0 + uTime) * 2.0 + uTime * 1.3 - h * 7.0);
    float rise = 0.7 + 0.3 * sin(h * 14.0 - uTime * 3.0);
    float a = fall * streak * rise * (0.15 + uBoost * 0.5);
    gl_FragColor = vec4(vec3(0.3, 1.0, 0.55) * a, 1.0);
    #include <colorspace_fragment>
  }
`;

export function makePad(ex) {
  const group = new THREE.Group();
  group.position.set(ex.x, ex.y, ex.z);
  const discMat = track(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBoost: { value: 0 } },
    vertexShader: padDiscVert, fragmentShader: padDiscFrag, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  const discGeo = track(new THREE.CircleGeometry(2.45, 64));
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.015;
  disc.renderOrder = 5;
  const colMat = track(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBoost: { value: 0 } },
    vertexShader: padColVert, fragmentShader: padColFrag, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const colGeo = track(new THREE.CylinderGeometry(1.7, 1.78, 9, 40, 1, true));
  const col = new THREE.Mesh(colGeo, colMat);
  col.position.y = 4.5;
  col.renderOrder = 6;
  group.add(disc, col);
  S.scene.add(group);
  pads.push({ group, discMat, colMat, x: ex.x, y: ex.y, z: ex.z, boost: 0, partT: 0 });
}

function updatePads(dt) {
  for (const p of pads) {
    p.boost = Math.max(0, p.boost - dt * 0.7);
    p.discMat.uniforms.uTime.value = p.colMat.uniforms.uTime.value = S.time;
    p.discMat.uniforms.uBoost.value = p.colMat.uniforms.uBoost.value = p.boost;
    if (camDist2(p.x, p.y, p.z) > 70 * 70) continue;
    p.partT += dt * (14 + p.boost * 40);
    while (p.partT >= 1) {
      p.partT -= 1;
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 1.6;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, s = rr(0.035, 0.085);
      const w = Math.random() * 0.5;
      S.add.emit(x, p.y + 0.05, z, -Math.sin(a) * 0.35, rr(0.9, 2.4), Math.cos(a) * 0.35, 0.3 + w * 0.6, 1.0, 0.5 + w * 0.5, 0.9, s, s * 0.3, rr(1.5, 2.6), 0, 0.1);
    }
  }
}

// ukończenie poziomu: konfetti, iskry, fala uderzeniowa
export function padVictory(ex) {
  for (const p of pads) p.boost = 1;
  ring(ex.x, ex.y, ex.z, 0, 1, 0, 0x7dffa8, 2, 9, 1.4);
  ring(ex.x, ex.y, ex.z, 0, 1, 0, 0xffffff, 0, 3.6, 0.7);
  glow(S.add, ex.x, ex.y + 1.2, ex.z, 0x8dffb0, 3.4, 0.5, 0.5, 0.4);
  const palette = [0xff5d73, 0xffd23f, 0x3bceac, 0x4ea8ff, 0xc77dff, 0xff9f1c, 0xffffff];
  for (let i = 0; i < 110; i++) {
    rgb(palette[(Math.random() * palette.length) | 0], _c);
    const a = Math.random() * 6.283, h = rr(1.0, 5.5);
    const s = rr(0.05, 0.1);
    S.soft.emit(ex.x + Math.cos(a) * 0.8, ex.y + 0.3, ex.z + Math.sin(a) * 0.8, Math.cos(a) * h, rr(5, 11), Math.sin(a) * h,
      _c[0], _c[1], _c[2], 1, s, s * 0.8, rr(1.8, 3.0), 8.5, 0.7);
  }
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * 6.283, h = rr(0.5, 4.5);
    const w = Math.random() * 0.6;
    S.add.emit(ex.x, ex.y + 0.2, ex.z, Math.cos(a) * h, rr(4, 12), Math.sin(a) * h, 0.4 + w * 0.6, 1, 0.55 + w * 0.45, 1, rr(0.05, 0.12), 0.01, rr(0.8, 1.6), 9, 0.5);
  }
}

// ======================================================================= KOSTKI ====
let cubeEmissive = null;
function cubeEmissiveMap() {
  if (cubeEmissive) return cubeEmissive;
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#ff7ab8';
  g.beginPath(); g.arc(s / 2, s / 2, 46, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#000';
  g.beginPath(); g.arc(s / 2, s / 2, 30, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff7ab8';
  g.beginPath(); g.arc(s / 2, s / 2, 14, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#7a3a5a'; g.lineWidth = 3; g.strokeRect(14, 14, s - 28, s - 28);
  cubeEmissive = new THREE.CanvasTexture(c);
  cubeEmissive.colorSpace = THREE.SRGBColorSpace;
  return cubeEmissive;
}

// materiał kostki: świecący środek (emissiveMap z rysunku pierścieni)
export function cubeMaterial(mat) {
  mat.emissiveMap = cubeEmissiveMap();
  mat.emissive = new THREE.Color(0xffffff);
  mat.emissiveIntensity = 0.6;
  return mat;
}

export function cubeBuilt(c, index) {
  const mat = track(c.mesh.material.clone());
  c.mesh.material = mat;
  const sm = track(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff7ab8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  const sprite = new THREE.Sprite(sm);
  sprite.scale.setScalar(2.3);
  sprite.visible = false;
  c.mesh.add(sprite);
  c.fx = { mat, sm, sprite, k: 0, flash: 0, rx: 0, ry: 0, rz: 0, ph: index * 1.7, lx: c.pos.x, ly: c.pos.y, lz: c.pos.z };
}

function updateCubes(dt) {
  const P = S.player, t = S.time;
  const kk = Math.min(1, dt * 9);
  for (const c of S.cubes) {
    const f = c.fx;
    if (!f) continue;
    f.k += ((c.held ? 1 : 0) - f.k) * Math.min(1, dt * 8);
    f.flash = Math.max(0, f.flash - dt * 3);
    c.mesh.position.copy(c.pos);
    // trzymana kostka lekko się obraca i przechyla; po upuszczeniu wraca do osi
    let ty = 0, tx = 0, tz = 0;
    if (c.held) {
      ty = P.yaw + Math.sin(t * 1.3 + f.ph) * 0.14;
      tx = -0.12 + Math.sin(t * 1.7 + f.ph) * 0.06;
      tz = Math.sin(t * 1.15 + f.ph * 2) * 0.07;
    }
    const dy = Math.atan2(Math.sin(ty - f.ry), Math.cos(ty - f.ry));
    f.ry += dy * (c.held ? kk : Math.min(1, dt * 16));
    f.rx += (tx - f.rx) * kk;
    f.rz += (tz - f.rz) * kk;
    c.mesh.rotation.set(f.rx, f.ry, f.rz, 'YXZ');
    f.mat.emissiveIntensity = 0.55 + 0.12 * Math.sin(t * 2.3 + f.ph) + 0.8 * f.k + f.flash * 1.2;
    const so = f.k * (0.5 + 0.1 * Math.sin(t * 6 + f.ph)) + f.flash * 0.7;
    f.sm.opacity = clamp01(so);
    f.sprite.visible = so > 0.01;
    f.lx = c.pos.x; f.ly = c.pos.y; f.lz = c.pos.z;
  }
}

// kostka przeszła przez portal (c.pos jest już po stronie wyjścia)
export function cubeTeleport(c) {
  const f = c.fx;
  if (f) {
    glow(S.add, f.lx, f.ly, f.lz, 0xff7ab8, 1.3, 0.3, 0.9, 0.5);
    burst(S.add, f.lx, f.ly, f.lz, 0, 1, 0, 0xff7ab8, 10, 1.5, 4, 1.4, 0.05, 0.5, 5);
    f.flash = 1;
  }
  glow(S.add, c.pos.x, c.pos.y, c.pos.z, 0xffc2e0, 1.5, 0.35, 0.9, 0.5);
  burst(S.add, c.pos.x, c.pos.y, c.pos.z, 0, 1, 0, 0xff7ab8, 12, 1.5, 4.5, 1.4, 0.05, 0.55, 5);
}

// kostka wróciła na miejsce startu (kwas albo fizzler); c.pos jest już na starcie
export function cubeReset(c) {
  const f = c.fx;
  const x = f ? f.lx : c.pos.x, y = f ? f.ly : c.pos.y, z = f ? f.lz : c.pos.z;
  if (y < S.ACID_Y + 1.0) acidSplash(x, z, 0.45);
  else {
    // rozpad kostki: iskry w kolorze fizzlera i różowe odłamki
    glow(S.add, x, y, z, 0xbfe4ff, 1.8, 0.4, 0.9, 0.6);
    burst(S.add, x, y, z, 0, 1, 0, 0x8fd0ff, 26, 1.5, 6.5, 1.8, 0.05, 0.9, 7);
    burst(S.add, x, y, z, 0, 1, 0, 0xff7ab8, 14, 1.0, 4, 1.8, 0.07, 0.9, 7);
  }
  // pojawienie się na starcie
  glow(S.add, c.pos.x, c.pos.y, c.pos.z, 0xffc2e0, 1.4, 0.45, 0.8, 0.5);
  ring(c.pos.x, c.pos.y - 0.38, c.pos.z, 0, 1, 0, 0xff7ab8, 0, 0.9, 0.6);
  if (f) f.flash = 1;
}

// ===================================================================== PRZYCISKI ====
const spotVert = /* glsl */`
  varying vec2 vP;
  void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const spotFrag = /* glsl */`
  uniform float uTime;
  uniform float uK;
  uniform float uR;
  varying vec2 vP;
  void main() {
    float r = length(vP) / uR;          // 1 = krawędź płytki
    vec3 red = vec3(1.0, 0.16, 0.12), green = vec3(0.15, 1.0, 0.42);
    vec3 col = mix(red, green, uK);
    float pulse = 0.8 + 0.2 * sin(uTime * 3.0 - r * 4.0);
    float spot = exp(-pow(max(r - 1.0, 0.0), 2.0) * 1.8) * smoothstep(0.0, 0.95, r) * (0.28 + uK * 0.35);
    float rim = exp(-pow((r - 1.23) / 0.045, 2.0)) * (0.5 + uK * 0.7);
    float a = (spot + rim) * pulse * (1.0 - smoothstep(2.2, 2.6, r));
    gl_FragColor = vec4(col * a, 1.0);
    #include <colorspace_fragment>
  }
`;
const coneVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const coneFrag = /* glsl */`
  uniform float uTime;
  uniform float uK;
  varying vec2 vUv;
  void main() {
    float h = vUv.y;
    vec3 red = vec3(1.0, 0.16, 0.12), green = vec3(0.15, 1.0, 0.42);
    vec3 col = mix(red, green, uK);
    float streak = 0.6 + 0.4 * sin(vUv.x * 50.0 + uTime * 1.6 - h * 8.0);
    float a = pow(1.0 - h, 1.8) * (0.1 + 0.2 * uK) * streak;
    gl_FragColor = vec4(col * a, 1.0);
    #include <colorspace_fragment>
  }
`;

export function buttonBuilt(b, group) {
  const r = b.r;
  const spotMat = track(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uR: { value: r } },
    vertexShader: spotVert, fragmentShader: spotFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  const spot = new THREE.Mesh(track(new THREE.CircleGeometry(r * 2.7, 48)), spotMat);
  spot.rotation.x = -Math.PI / 2;
  spot.position.y = 0.012;
  spot.renderOrder = 5;
  const coneMat = track(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uK: { value: 0 } },
    vertexShader: coneVert, fragmentShader: coneFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const cone = new THREE.Mesh(track(new THREE.CylinderGeometry(r * 0.45, r * 0.92, 2.8, 28, 1, true)), coneMat);
  cone.position.y = 1.45;
  cone.renderOrder = 6;
  group.add(spot, cone);
  b.fx = { spotMat, coneMat, k: 0, flash: 0, red: new THREE.Color(0xe5484d), green: new THREE.Color(0x37d67a) };
}

function updateButtons(dt) {
  const t = S.time;
  for (const b of S.buttons) {
    const f = b.fx;
    if (!f) continue;
    f.k += ((b.pressed ? 1 : 0) - f.k) * Math.min(1, dt * 10);
    f.flash = Math.max(0, f.flash - dt * 3);
    b.plate.position.y = 0.035 - 0.03 * f.k;
    b.plateMat.color.copy(f.red).lerp(f.green, f.k).multiplyScalar(1 + 0.14 * Math.sin(t * 3.2) * (1 - f.k) + f.flash * 0.6);
    f.spotMat.uniforms.uTime.value = f.coneMat.uniforms.uTime.value = t;
    f.spotMat.uniforms.uK.value = f.coneMat.uniforms.uK.value = f.k;
  }
}

// ======================================================================== DRZWI ====
const doorFaceVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const doorFaceFrag = /* glsl */`
  uniform float uTime;
  uniform float uOpen;
  uniform float uFlash;
  uniform vec2 uSize;
  uniform float uBarY;
  uniform float uBarW;
  varying vec2 vUv;
  float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
  void main() {
    vec2 m = (vUv - 0.5) * uSize;
    float e = min(uSize.x * 0.5 - abs(m.x), uSize.y * 0.5 - abs(m.y));
    float band = smoothstep(0.0, 0.02, e) * (1.0 - smoothstep(0.06, 0.1, e));
    float halo = exp(-e * 8.0) * 0.3;
    float flow = 0.5 + 0.5 * sin((m.x + m.y) * 5.0 - uTime * 4.5);
    float dash = mix(0.4 + 0.6 * flow, 1.0, uOpen) * (0.85 + 0.15 * sin(uTime * 3.0) * (1.0 - uOpen));
    vec3 col = mix(vec3(1.0, 0.2, 0.09), vec3(0.14, 1.0, 0.42), uOpen);
    float d = sdBox(m - vec2(0.0, uBarY - uSize.y * 0.5), vec2(uBarW * 0.5, 0.05));
    float bar = (1.0 - smoothstep(0.0, 0.012, d)) + exp(-max(d, 0.0) * 16.0) * 0.4;
    float k = (band + halo) * dash + bar * mix(1.0, 0.55, uOpen);
    k += uFlash * band * 1.6;
    gl_FragColor = vec4(col * k + vec3(uFlash * band * 0.5), 1.0);
    #include <colorspace_fragment>
  }
`;

export function doorBuilt(d) {
  const b = d.box;
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
  const thinX = sx < sz;
  const w = thinX ? sz : sx;
  const mats = [];
  const geo = track(new THREE.PlaneGeometry(w, sy));
  const group = new THREE.Group();
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, cy = (b.min.y + b.max.y) / 2;
  for (const side of [-1, 1]) {
    const mat = track(new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uOpen: { value: 0 }, uFlash: { value: 0 },
        uSize: { value: new THREE.Vector2(w, sy) }, uBarY: { value: Math.min(1.9, sy * 0.5) }, uBarW: { value: Math.min(1.6, w * 0.45) },
      },
      vertexShader: doorFaceVert, fragmentShader: doorFaceFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 7;
    if (thinX) {
      m.position.set(side > 0 ? b.max.x + 0.015 : b.min.x - 0.015, cy, cz);
      m.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      m.position.set(cx, cy, side > 0 ? b.max.z + 0.015 : b.min.z - 0.015);
      m.rotation.y = side > 0 ? 0 : Math.PI;
    }
    group.add(m);
    mats.push(mat);
  }
  S.scene.add(group);
  track({ dispose() { S.scene.remove(group); } });
  d.fx = { mats, open: 0, flash: 0, thinX, w, cx, cz, sparkT: 0 };
}

function updateDoors(dt) {
  const t = S.time;
  for (const d of S.doors) {
    const f = d.fx;
    if (!f) continue;
    const target = d.box.disabled ? 1 : 0;
    const moving = Math.abs(d.open - target) > 0.03;
    f.open += (target - f.open) * Math.min(1, dt * 7);
    f.flash = Math.max(0, f.flash - dt * 2.6);
    for (const m of f.mats) {
      m.uniforms.uTime.value = t;
      m.uniforms.uOpen.value = f.open;
      m.uniforms.uFlash.value = f.flash;
    }
    // iskry z dolnej krawędzi drzwi w czasie ruchu
    if (moving && camDist2(f.cx, d.box.min.y, f.cz) < 60 * 60) {
      f.sparkT += dt * 40;
      const y = d.box.min.y + d.open * (d.height + 0.05);
      while (f.sparkT >= 1) {
        f.sparkT -= 1;
        const u = rr(-0.5, 0.5) * f.w;
        const x = f.thinX ? f.cx : f.cx + u, z = f.thinX ? f.cz + u : f.cz;
        const open = target > 0.5;
        S.add.emit(x, y, z, rr(-0.6, 0.6), open ? rr(-0.5, 1.2) : rr(0.5, 2.5), rr(-0.6, 0.6),
          open ? 0.3 : 1.0, open ? 1.0 : 0.5, open ? 0.5 : 0.15, 1, rr(0.025, 0.05), 0.005, rr(0.3, 0.6), 6, 0.5);
      }
    }
  }
}

// ===================================================================== FIZZLERY ====
const fizzVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const fizzFrag = /* glsl */`
  uniform float uTime;
  uniform vec2 uSize;
  uniform float uHit;
  uniform float uHitX;
  varying vec2 vUv;
  float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
  void main() {
    vec2 m = vUv * uSize;
    float colI = floor(m.x * 2.2);
    float cr = h1(colI + 3.0);
    float fx = abs(fract(m.x * 2.2) - 0.5) * 2.0;
    float colMask = 1.0 - smoothstep(0.5, 1.0, fx);
    float y = m.y * 0.7 - uTime * (0.6 + cr * 1.5) - cr * 10.0;
    float bands = pow(0.5 + 0.5 * sin(y * 2.6 + sin(m.x * 3.0 + uTime * 2.0) * 1.3), 3.0);
    float a = 0.13 + 0.42 * bands * colMask * (0.45 + 0.55 * cr);
    a += 0.07 * (0.5 + 0.5 * sin(m.y * 5.0 - uTime * 3.0 + m.x * 1.2));
    float e = min(min(m.y, uSize.y - m.y), min(m.x, uSize.x - m.x));
    float rim = exp(-e * e / 0.003) * (0.75 + 0.25 * sin(uTime * 15.0 + m.x * 5.0));
    float dx = (vUv.x - uHitX) * uSize.x;
    float hit = uHit * (exp(-dx * dx * 0.5) * 0.9 + exp(-pow(abs(dx) - (1.0 - uHit) * 6.0, 2.0) * 3.0) * 0.6);
    a += rim * 0.9 + hit;
    vec3 c = mix(vec3(0.12, 0.45, 1.0), vec3(0.75, 0.95, 1.0), clamp(bands * colMask * 0.8 + rim + hit, 0.0, 1.0));
    gl_FragColor = vec4(c, clamp(a, 0.0, 0.9));
    #include <colorspace_fragment>
  }
`;

export function fizzlerMaterial(w, h) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uSize: { value: new THREE.Vector2(w, h) }, uHit: { value: 0 }, uHitX: { value: 0.5 } },
    vertexShader: fizzVert, fragmentShader: fizzFrag,
  });
}

export function fizzlerBuilt(f, w, h, alongX) {
  f.fx = { w, h, alongX, hit: 0, sparkT: 0, cx: f.mesh.position.x, cy: f.mesh.position.y, cz: f.mesh.position.z };
}

function updateFizzlers(dt) {
  for (const f of S.fizzlers) {
    const q = f.fx;
    if (!q) continue;
    q.hit = Math.max(0, q.hit - dt * 2.2);
    f.mat.uniforms.uTime.value = S.time;
    f.mat.uniforms.uHit.value = q.hit;
    if (camDist2(q.cx, q.cy, q.cz) > (q.w * 0.5 + 40) * (q.w * 0.5 + 40)) continue;
    // iskry na krawędziach (góra, dół) i na końcach
    q.sparkT += dt * Math.min(14, 3 + q.w * 0.5);
    while (q.sparkT >= 1) {
      q.sparkT -= 1;
      const u = rr(-0.5, 0.5) * q.w;
      const top = Math.random() < 0.5;
      const y = q.cy + (top ? 0.5 : -0.5) * q.h;
      const x = q.alongX ? q.cx + u : q.cx, z = q.alongX ? q.cz : q.cz + u;
      S.add.emit(x, y, z, rr(-0.4, 0.4), top ? rr(-1.2, -0.2) : rr(0.3, 1.4), rr(-0.4, 0.4), 0.3, 0.65, 1.0, 1, rr(0.03, 0.06), 0.005, rr(0.4, 0.9), 0, 0.8);
    }
  }
}

// dotknięcie fizzlera przez gracza / kostkę: błysk i iskry w punkcie dotyku
export function fizzlerHit(f, x, y, z) {
  const q = f.fx;
  if (!q) return;
  q.hit = 1;
  const u = q.alongX ? (x - (q.cx - q.w / 2)) / q.w : (z - (q.cz - q.w / 2)) / q.w;
  f.mat.uniforms.uHitX.value = clamp01(u);
  const nx = q.alongX ? 0 : 1, nz = q.alongX ? 1 : 0;
  const px = q.alongX ? x : q.cx, pz = q.alongX ? q.cz : z;
  burst(S.add, px, y, pz, nx, 0, nz, 0x9fd8ff, 16, 1.5, 6, 1.4, 0.045, 0.7, 5, 0.6);
  burst(S.add, px, y, pz, -nx, 0, -nz, 0x9fd8ff, 16, 1.5, 6, 1.4, 0.045, 0.7, 5, 0.6);
  glow(S.add, px, y, pz, 0xbfe4ff, 1.6, 0.3, 0.8, 0.6);
}

// ============================================================= PETLA / ZDARZENIA ====
export function updateWorld(dt) {
  updateAcids(dt);
  updatePads(dt);
  updateCubes(dt);
  updateButtons(dt);
  updateDoors(dt);
  updateFizzlers(dt);
}

const _hp = [0, 0, 0];
export function mechEvent(type, obj) {
  if (type === 'button-on' || type === 'button-off') {
    const on = type === 'button-on';
    const col = on ? 0x37ff8a : 0xff4a3a;
    ring(obj.x, obj.y, obj.z, 0, 1, 0, col, on ? 2 : 0, obj.r * (on ? 3.2 : 2.0), on ? 0.7 : 0.45);
    burst(S.add, obj.x, obj.y + 0.06, obj.z, 0, 1, 0, col, on ? 22 : 8, 1.5, on ? 5 : 2.5, 1.6, 0.05, 0.7, 5);
    if (obj.fx) obj.fx.flash = on ? 1 : 0.4;
  } else if (type === 'door-open' || type === 'door-close') {
    if (obj.fx) obj.fx.flash = 1;
  } else if (type === 'fizzle') {
    // pozycja: obiekt (gracz albo kostka) najbliżej fizzlera
    const f = obj;
    const q = f.fx;
    const cx = q ? q.cx : (f.min.x + f.max.x) / 2, cy = q ? q.cy : (f.min.y + f.max.y) / 2, cz = q ? q.cz : (f.min.z + f.max.z) / 2;
    const P = S.player.pos;
    _hp[0] = P.x; _hp[1] = P.y + 1.0; _hp[2] = P.z;
    let bd = Math.hypot(_hp[0] - cx, _hp[2] - cz) + (P.y + 1 < f.min.y || P.y > f.max.y ? 99 : 0);
    for (const c of S.cubes) {
      const cf = c.fx;
      const d = cf ? Math.hypot(cf.lx - cx, cf.lz - cz) : 1e9;
      if (d < bd) { bd = d; _hp[0] = cf.lx; _hp[1] = cf.ly; _hp[2] = cf.lz; }
    }
    fizzlerHit(f, _hp[0], _hp[1], _hp[2]);
  }
}
