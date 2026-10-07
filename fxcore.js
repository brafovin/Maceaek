import * as THREE from './vendor/three.module.js';

/* ==========================================================================
   fxcore.js – wspólny stan efektów i pula cząstek (instancjonowane quady)
   Cząstki rysują się w scenie głównej, więc widać je także przez portale.
   Żadnych alokacji na klatkę: wszystko w tablicach typowanych o stałym rozmiarze.
   ========================================================================== */

// współdzielony stan modułów fx (wypełniany w fx.init / fx.bind)
export const S = {
  scene: null, camera: null, renderer: null,
  COLORS: [0x2d9bff, 0xff8a1f],
  PORTAL_HW: 0.65, PORTAL_HH: 1.15, EYE_H: 1.62, ACID_Y: -5,
  time: 0,
  // wiązane później (bind)
  player: null, portals: null, mech: null, cubes: null, buttons: null, doors: null, fizzlers: null, game: null,
  // pule cząstek: addPool – świecące (addytywne), softPool – zwykłe (kurz, mgła, konfetti)
  add: null, soft: null,
  // stan wspólny dla wielu modułów
  landImpact: 0,     // prędkość uderzenia przy ostatnim lądowaniu (m/s); pistolet zeruje po odczycie
};

export const rr = (a, b) => a + Math.random() * (b - a);
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// kolor 0xRRGGBB -> składowe liniowe (zgodne z THREE.Color i ColorManagement)
const _col = new THREE.Color();
export function rgb(hex, out) {
  _col.set(hex);
  out[0] = _col.r; out[1] = _col.g; out[2] = _col.b;
  return out;
}

// ------------------------------------------------------------------ cząstki ----
const poolVert = /* glsl */`
  attribute vec3 iPos;
  attribute vec4 iCol;
  attribute float iSize;
  varying vec4 vCol;
  varying vec2 vUv;
  void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 p = iPos + (right * position.x + up * position.y) * iSize;
    vUv = position.xy;
    vCol = iCol;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;
const poolFrag = /* glsl */`
  varying vec4 vCol;
  varying vec2 vUv;
  void main() {
    float d = dot(vUv, vUv);
    if (d >= 1.0) discard;
    #ifdef ADD
      float a = exp(-d * 4.2) * (1.0 - d * d);
      gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.0);
    #else
      float a = (1.0 - d) * (1.0 - d);
      gl_FragColor = vec4(vCol.rgb, a * vCol.a);
    #endif
    #include <colorspace_fragment>
  }
`;

let baseQuad = null;
function quadGeometry() {
  if (baseQuad) return baseQuad;
  baseQuad = new THREE.BufferGeometry();
  baseQuad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  baseQuad.setIndex([0, 1, 2, 0, 2, 3]);
  return baseQuad;
}

export class ParticlePool {
  constructor(scene, cap, additive) {
    this.cap = cap;
    this.n = 0;
    this.px = new Float32Array(cap); this.py = new Float32Array(cap); this.pz = new Float32Array(cap);
    this.vx = new Float32Array(cap); this.vy = new Float32Array(cap); this.vz = new Float32Array(cap);
    this.age = new Float32Array(cap); this.life = new Float32Array(cap);
    this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap);
    this.grav = new Float32Array(cap); this.drag = new Float32Array(cap);
    this.cr = new Float32Array(cap); this.cg = new Float32Array(cap); this.cb = new Float32Array(cap); this.ca = new Float32Array(cap);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    for (const a of [this.aPos, this.aCol, this.aSize]) a.setUsage(THREE.DynamicDrawUsage);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quadGeometry().index;
    g.setAttribute('position', quadGeometry().getAttribute('position'));
    g.setAttribute('iPos', this.aPos);
    g.setAttribute('iCol', this.aCol);
    g.setAttribute('iSize', this.aSize);
    g.instanceCount = 0;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      vertexShader: poolVert,
      fragmentShader: poolFrag,
      defines: additive ? { ADD: 1 } : {},
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = additive ? 20 : 19;
    scene.add(this.mesh);
  }

  // pozycja, prędkość, kolor (r,g,b liniowo), alfa, rozmiar początkowy/końcowy (promień, m), życie (s), grawitacja, opór
  emit(x, y, z, vx, vy, vz, r, g, b, a, s0, s1, life, grav = 0, drag = 0) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.cr[i] = r; this.cg[i] = g; this.cb[i] = b; this.ca[i] = a;
    this.s0[i] = s0; this.s1[i] = s1;
    this.age[i] = 0; this.life[i] = life;
    this.grav[i] = grav; this.drag[i] = drag;
  }

  update(dt) {
    const n0 = this.n;
    if (n0 === 0) { this.mesh.visible = false; return; }
    const ap = this.aPos.array, ac = this.aCol.array, as = this.aSize.array;
    for (let i = n0 - 1; i >= 0; i--) {
      const age = this.age[i] + dt;
      if (age >= this.life[i]) {
        // usuń: podstaw ostatnią (już przetworzoną) cząstkę
        const l = --this.n;
        if (i !== l) this.copy(l, i);
        continue;
      }
      this.age[i] = age;
      const dk = this.drag[i] > 0 ? Math.exp(-this.drag[i] * dt) : 1;
      this.vx[i] *= dk; this.vy[i] = this.vy[i] * dk - this.grav[i] * dt; this.vz[i] *= dk;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
    }
    // zapis atrybutów po kompaktowaniu
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const k = this.age[i] / this.life[i];
      const fade = k < 0.12 ? k / 0.12 : (1 - k) / 0.88;   // szybkie wejście, łagodne wygaszanie
      ap[i * 3] = this.px[i]; ap[i * 3 + 1] = this.py[i]; ap[i * 3 + 2] = this.pz[i];
      ac[i * 4] = this.cr[i]; ac[i * 4 + 1] = this.cg[i]; ac[i * 4 + 2] = this.cb[i]; ac[i * 4 + 3] = this.ca[i] * fade;
      as[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
    }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    for (const a of [this.aPos, this.aCol, this.aSize]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }

  copy(from, to) {
    this.px[to] = this.px[from]; this.py[to] = this.py[from]; this.pz[to] = this.pz[from];
    this.vx[to] = this.vx[from]; this.vy[to] = this.vy[from]; this.vz[to] = this.vz[from];
    this.age[to] = this.age[from]; this.life[to] = this.life[from];
    this.s0[to] = this.s0[from]; this.s1[to] = this.s1[from];
    this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from];
    this.cr[to] = this.cr[from]; this.cg[to] = this.cg[from]; this.cb[to] = this.cb[from]; this.ca[to] = this.ca[from];
  }

  clear() { this.n = 0; this.geo.instanceCount = 0; this.mesh.visible = false; }
}

// ------------------------------------------------------- pomocnicze emitery ----
const _c = [0, 0, 0];

// iskry w stożku wokół normalnej: n sztuk, prędkość [v0,v1], rozrzut (0 = wzdłuż normalnej, 1 = półkula)
export function burst(pool, px, py, pz, nx, ny, nz, color, n, v0, v1, spread, size, life, grav, white = 0.35) {
  rgb(color, _c);
  // dowolna oś prostopadła do normalnej
  let ax = 0, ay = 1, az = 0;
  if (Math.abs(ny) > 0.9) { ax = 1; ay = 0; }
  let tx = ay * nz - az * ny, ty = az * nx - ax * nz, tz = ax * ny - ay * nx;
  const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
  const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.2832, s = Math.sqrt(Math.random()) * spread;
    const ca = Math.cos(a) * s, sa = Math.sin(a) * s;
    let dx = nx + tx * ca + bx * sa, dy = ny + ty * ca + by * sa, dz = nz + tz * ca + bz * sa;
    const dl = Math.hypot(dx, dy, dz) || 1;
    const v = rr(v0, v1) / dl;
    const w = Math.random() * white;
    pool.emit(px, py, pz, dx * v, dy * v, dz * v,
      _c[0] + (1 - _c[0]) * w, _c[1] + (1 - _c[1]) * w, _c[2] + (1 - _c[2]) * w, 1,
      size * rr(0.7, 1.2), 0.004, life * rr(0.6, 1.1), grav, 0.6);
  }
}

// miękki błysk (jedna duża cząstka)
export function glow(pool, x, y, z, color, size, life, alpha = 1, white = 0.3) {
  rgb(color, _c);
  pool.emit(x, y, z, 0, 0, 0,
    _c[0] + (1 - _c[0]) * white, _c[1] + (1 - _c[1]) * white, _c[2] + (1 - _c[2]) * white, alpha,
    size, size * 0.2, life);
}


// ----------------------------------------------------------- tekstura poświaty ----
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

// ------------------------------------------------------------ znaki na powierzchni ----
// Płaskie „decale” przyklejone do ścian: pierścień trafienia (0), krzyżyk nieudanego strzału (1), fala uderzeniowa (2).
const decalVert = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 2.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const decalFrag = /* glsl */`
  uniform vec3 uColor;
  uniform float uP;
  uniform float uKind;
  varying vec2 vUv;
  void main() {
    float r = length(vUv);
    float p = uP;
    float e = 1.0 - (1.0 - p) * (1.0 - p);
    float a = 0.0;
    if (uKind < 0.5) {
      float rad = mix(0.22, 0.92, e);
      float w = mix(0.16, 0.05, p);
      a = exp(-pow((r - rad) / w, 2.0)) * (1.0 - p) + exp(-r * r * 7.0) * (1.0 - p) * (1.0 - p) * 1.4;
    } else if (uKind < 1.5) {
      vec2 q = abs(vUv);
      float d = abs(q.x - q.y) * 0.7071;
      float cross = exp(-pow(d / 0.07, 2.0)) * (1.0 - smoothstep(0.42, 0.55, max(q.x, q.y)));
      float rim = exp(-pow((r - mix(0.5, 0.78, e)) / 0.07, 2.0)) * 0.7;
      a = (cross + rim) * (1.0 - p) * (1.0 - p);
    } else {
      float rad = mix(0.1, 0.95, e);
      a = (exp(-pow((r - rad) / 0.09, 2.0)) + 0.25 * exp(-pow((r - rad * 0.8) / 0.2, 2.0))) * (1.0 - p);
    }
    float edge = 1.0 - smoothstep(0.85, 1.0, r);
    a *= edge;
    gl_FragColor = vec4(uColor * a * 1.5 + vec3(a * a * 0.5), 1.0);
    #include <colorspace_fragment>
  }
`;

const DECALS = 14;
const decals = [];
let decalNext = 0;
const _dz = new THREE.Vector3(0, 0, 1);
const _dn = new THREE.Vector3();

function initDecals(scene) {
  const geo = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < DECALS; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uP: { value: 0 }, uKind: { value: 0 } },
      vertexShader: decalVert, fragmentShader: decalFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    scene.add(mesh);
    decals.push({ mesh, mat, t: 0, life: 1, on: false });
  }
}

export function ring(x, y, z, nx, ny, nz, color, kind, size, life) {
  const d = decals[decalNext];
  decalNext = (decalNext + 1) % DECALS;
  d.on = true; d.t = 0; d.life = life;
  d.mat.uniforms.uColor.value.set(color);
  d.mat.uniforms.uKind.value = kind;
  d.mat.uniforms.uP.value = 0;
  d.mesh.visible = true;
  d.mesh.position.set(x + nx * 0.02, y + ny * 0.02, z + nz * 0.02);
  d.mesh.quaternion.setFromUnitVectors(_dz, _dn.set(nx, ny, nz));
  d.mesh.scale.setScalar(size * 2);
}

// ------------------------------------------------------------------ cykl życia ----
export function initCore(scene) {
  S.scene = scene;
  S.add = new ParticlePool(scene, 1800, true);
  S.soft = new ParticlePool(scene, 800, false);
  initDecals(scene);
}

export function updateCore(dt) {
  S.add.update(dt);
  S.soft.update(dt);
  for (const d of decals) {
    if (!d.on) continue;
    d.t += dt;
    if (d.t >= d.life) { d.on = false; d.mesh.visible = false; continue; }
    d.mat.uniforms.uP.value = d.t / d.life;
  }
}

export function clearCore() {
  S.add.clear();
  S.soft.clear();
  for (const d of decals) { d.on = false; d.mesh.visible = false; }
}

