// Grasbüschel rund um die Kamera: feste Weltpositionen in einem mitwandernden Fenster,
// passen sich der Geländehöhe an und wiegen sich im Wind (Vertex-Shader).

import * as THREE from '../vendor/three.module.js';
import { terrainH } from './terrain.js';

export class Grass {
  constructor(G, count, half) {
    this.G = G;
    this.N = count;
    this.half = half;
    this.size = half * 2;
    // ein Büschel aus fünf Halmen
    const pos = [], col = [], nor = [];
    const base = new THREE.Color(0x467f2c), tip = new THREE.Color(0x9ccc58);
    for (let b = 0; b < 5; b++) {
      const a = b * 1.37, r = 0.06 + (b % 2) * 0.07;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      const h = 0.24 + (b % 3) * 0.09, w = 0.04;
      const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
      pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + Math.cos(a) * 0.12, h, cz + Math.sin(a) * 0.12);
      for (const c of [base, base, tip]) col.push(c.r, c.g, c.b);
      for (let k = 0; k < 3; k++) nor.push(0, 1, 0);
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.off = new Float32Array(count * 4);
    this.attr = new THREE.InstancedBufferAttribute(this.off, 4);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aOff', this.attr);
    geo.instanceCount = count;
    // feste Zufallsmuster im Fenster
    this.bx = new Float32Array(count); this.bz = new Float32Array(count); this.sc = new Float32Array(count);
    let seed = 12345;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < count; i++) { this.bx[i] = rnd() * this.size; this.bz[i] = rnd() * this.size; this.sc[i] = 0.65 + rnd() * 0.5; }
    this.time = { value: 0 };
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = this.time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aOff;\nuniform float uTime;')
        .replace('#include <begin_vertex>', `
          vec3 transformed = position * aOff.w;
          float gd = distance(aOff.xz, cameraPosition.xz);
          transformed *= 1.0 - smoothstep(${(half * 0.72).toFixed(1)}, ${(half * 0.97).toFixed(1)}, gd);
          float sw = sin(uTime * 1.9 + aOff.x * 0.37 + aOff.z * 0.29) * 0.16 + sin(uTime * 3.7 + aOff.z * 0.8) * 0.05;
          transformed.x += sw * position.y; transformed.z += sw * 0.5 * position.y;
          transformed += aOff.xyz;`);
    };
    mat.customProgramCacheKey = () => 'grass';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    G.scene.add(this.mesh);
    this.reset();
  }

  // neue Karte: alles neu einsortieren
  reset() { this.off.fill(NaN); }

  set visible(v) { this.mesh.visible = v; }

  update(cam, dt) {
    this.time.value += dt;
    if (!this.mesh.visible) return;
    const ok = this.G.grassOK, S = this.size, off = this.off;
    let changed = false;
    for (let i = 0; i < this.N; i++) {
      const x = this.bx[i] + S * Math.round((cam.x - this.bx[i]) / S);
      const z = this.bz[i] + S * Math.round((cam.z - this.bz[i]) / S);
      const j = i * 4;
      if (off[j] === x && off[j + 2] === z) continue;
      const show = !ok || ok(x, z);
      off[j] = x; off[j + 1] = show ? terrainH(x, z) - 0.03 : 0; off[j + 2] = z; off[j + 3] = show ? this.sc[i] : 0;
      changed = true;
    }
    if (changed) this.attr.needsUpdate = true;
  }
}
