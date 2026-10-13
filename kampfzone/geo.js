// Geometrie-Helfer: Teile zusammenführen (mit Vertex-Farben und Materialgruppen)
// und Instanz-Pools für viele gleiche, zerstörbare Objekte (wenige Draw-Calls).

import * as THREE from '../vendor/three.module.js';

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color();

// Matrix aus Position, Drehung (YXZ) und Skalierung
export function mat4(x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0, out = new THREE.Matrix4()) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return out.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// Teile: { geo, m?: Matrix4, color?: hex|Color, mat?: Materialindex }
// planar: Kantenlänge für planare UVs (z. B. 4 für Wände) – sonst bleiben die UVs der Geometrie.
export function merge(parts, { planar = 0, half = 0 } = {}) {
  const buckets = new Map();
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    if (p.m) g.applyMatrix4(p.m);
    const pos = g.attributes.position.array, nor = g.attributes.normal.array;
    const uv = g.attributes.uv ? g.attributes.uv.array : null;
    _c.set(p.color ?? 0xffffff);
    const groups = g.groups.length ? g.groups : [{ start: 0, count: pos.length / 3, materialIndex: 0 }];
    for (const gr of groups) {
      const mi = p.mat ?? gr.materialIndex ?? 0;
      let b = buckets.get(mi);
      if (!b) buckets.set(mi, b = { pos: [], nor: [], uv: [], col: [] });
      for (let v = gr.start; v < gr.start + gr.count; v++) {
        const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        const nx = nor[v * 3], ny = nor[v * 3 + 1], nz = nor[v * 3 + 2];
        b.pos.push(x, y, z); b.nor.push(nx, ny, nz);
        if (planar) {
          const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
          let u, w;
          if (ay >= ax && ay >= az) { u = x + half; w = z + half; }
          else if (az >= ax) { u = (nz > 0 ? x : -x) + half; w = y; }
          else { u = (nx > 0 ? -z : z) + half; w = y; }
          b.uv.push(u / planar, w / planar);
        } else b.uv.push(uv ? uv[v * 2] : 0, uv ? uv[v * 2 + 1] : 0);
        b.col.push(_c.r, _c.g, _c.b);
      }
    }
    g.dispose();
  }
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  let P = [], N = [], U = [], C = [];
  const out = new THREE.BufferGeometry();
  for (const k of keys) {
    const b = buckets.get(k);
    out.addGroup(P.length / 3, b.pos.length / 3, k);
    P = P.concat(b.pos); N = N.concat(b.nor); U = U.concat(b.uv); C = C.concat(b.col);
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  if (keys.length === 1) out.clearGroups();
  out.computeBoundingSphere();
  return out;
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// Viele Instanzen derselben Geometrie; Indizes werden nach dem Entfernen wiederverwendet.
export class InstPool {
  constructor(parent, geo, mat, cap, { shadow = true, receive = true } = {}) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadow;
    this.mesh.receiveShadow = receive;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.cap = cap;
    this.free = [];
    this.n = 0;
    parent.add(this.mesh);
  }
  add(m, color) {
    let i;
    if (this.free.length) i = this.free.pop();
    else {
      if (this.n >= this.cap) { console.warn("InstPool voll", this.mesh.name); return -1; }
      i = this.n++;
      this.mesh.count = this.n;
    }
    this.mesh.setMatrixAt(i, m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.setColor(i, color ?? 0xffffff);
    return i;
  }
  setMatrix(i, m) {
    this.mesh.setMatrixAt(i, m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  // Farbe als Hex-Zahl, THREE.Color oder [r,g,b] (linear, darf > 1 sein)
  setColor(i, c) {
    const a = this.mesh.instanceColor.array;
    if (typeof c === 'number') { _c.setHex(c); a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
    else if (Array.isArray(c)) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
    else { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    this.mesh.instanceColor.needsUpdate = true;
  }
  remove(i) {
    if (i < 0) return;
    this.mesh.setMatrixAt(i, ZERO);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.free.push(i);
  }
  reset() {
    this.n = 0;
    this.free.length = 0;
    this.mesh.count = 0;
  }
}

// Box-Geometrie mit Mittelpunkt (cx,cy,cz) – häufig gebraucht
export function boxAt(w, h, d, cx = 0, cy = 0, cz = 0) {
  return new THREE.BoxGeometry(w, h, d).translate(cx, cy, cz);
}
