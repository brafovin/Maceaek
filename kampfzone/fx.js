// Effekte: Partikel, Leuchtspuren, Mündungsfeuer, Explosionen und Raketen.

import * as THREE from '../vendor/three.module.js';
import { explode, rayActors } from './actors.js';

const VS = `
attribute float size; attribute float alpha; attribute vec3 pcolor;
varying vec3 vC; varying float vA;
uniform float uScale;
void main() {
  vC = pcolor; vA = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FS_SOFT = `
uniform sampler2D map; varying vec3 vC; varying float vA;
void main() { float a = texture2D(map, gl_PointCoord).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * a, a); }`;
const FS_HARD = `
varying vec3 vC; varying float vA;
void main() { if (vA < 0.02) discard; gl_FragColor = vec4(vC, 1.0); }`;

class Particles {
  constructor(scene, n, { soft, map }) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.s0 = new Float32Array(n);
    this.s1 = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: soft ? FS_SOFT : FS_HARD,
      uniforms: { map: { value: map }, uScale: { value: 400 } },
      transparent: soft, depthWrite: !soft,
      blending: soft ? THREE.CustomBlending : THREE.NormalBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = soft ? 10 : 0;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, color, life, s0, s1 = s0, grav = 0, drag = 0) {
    const i = this.next; this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.life[i] = this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; } continue; }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.max[i]);
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 2] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.grav[i] > 0 && this.pos[i * 3 + 1] < 0.05) { this.pos[i * 3 + 1] = 0.05; this.vel[i * 3 + 1] *= -0.3; this.vel[i * 3] *= 0.6; this.vel[i * 3 + 2] *= 0.6; }
      this.alpha[i] = Math.min(1, t * 2.5);
      this.size[i] = this.s1[i] + (this.s0[i] - this.s1[i]) * t;
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = a.pcolor.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = true;
  }
  clear() { this.life.fill(0); }
}

const _c = new THREE.Color(), _c2 = new THREE.Color(), _v = new THREE.Vector3(), _p = new THREE.Vector3();

export class Fx {
  constructor(G) {
    this.G = G;
    const scene = G.scene;
    this.soft = new Particles(scene, 2400, { soft: true, map: G.tex.glow });
    this.hard = new Particles(scene, 1600, { soft: false });
    // Leuchtspuren
    this.trN = 160;
    this.trPos = new Float32Array(this.trN * 6);
    this.trCol = new Float32Array(this.trN * 6);
    this.trLife = new Float32Array(this.trN);
    this.trBase = new Float32Array(this.trN * 3);
    this.trNext = 0;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.trCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracers.frustumCulled = false;
    scene.add(this.tracers);
    // Mündungsfeuer
    this.flashes = [];
    const fm = new THREE.SpriteMaterial({ map: G.tex.glow, color: 0xffc46b, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(fm);
      s.visible = false;
      scene.add(s);
      this.flashes.push({ s, t: 0 });
    }
    this.flashI = 0;
    this.light = new THREE.PointLight(0xffa040, 0, 30, 1.6);
    scene.add(this.light);
    this.lightT = 0;
    this.rockets = [];
    this.rocketGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.6, 8).rotateX(Math.PI / 2);
    this.rocketMat = new THREE.MeshStandardMaterial({ color: 0x5c6b3c, emissive: 0x331100 });
  }

  clear() {
    this.soft.clear(); this.hard.clear();
    this.trLife.fill(0);
    for (const r of this.rockets) this.G.scene.remove(r.mesh);
    this.rockets.length = 0;
  }

  tracer(from, to, thin = false) {
    const i = this.trNext; this.trNext = (this.trNext + 1) % this.trN;
    // Leuchtspur startet etwas vor der Mündung und ist kurz
    _v.subVectors(to, from);
    const len = _v.length();
    const seg = Math.min(len, thin ? 2.5 : 6);
    _v.normalize();
    _p.copy(to).addScaledVector(_v, -seg);
    this.trPos.set([_p.x, _p.y, _p.z, to.x, to.y, to.z], i * 6);
    const b = thin ? 0.6 : 1;
    this.trBase.set([1.0 * b, 0.85 * b, 0.45 * b], i * 3);
    this.trLife[i] = 0.07;
    // zweiter, blasser Teil direkt an der Mündung
    const j = this.trNext; this.trNext = (this.trNext + 1) % this.trN;
    _p.copy(from).addScaledVector(_v, Math.min(len, 4));
    this.trPos.set([from.x, from.y, from.z, _p.x, _p.y, _p.z], j * 6);
    this.trBase.set([0.7 * b, 0.55 * b, 0.25 * b], j * 3);
    this.trLife[j] = 0.04;
  }

  flash(p) {
    const f = this.flashes[this.flashI]; this.flashI = (this.flashI + 1) % this.flashes.length;
    f.s.position.copy(p);
    f.s.scale.setScalar(0.5 + Math.random() * 0.3);
    f.s.visible = true;
    f.t = 0.05;
  }

  impact(p, n, color) {
    _c.set(color);
    for (let i = 0; i < 5; i++) {
      const nx = n ? n[0] : 0, ny = n ? n[1] : 0.5, nz = n ? n[2] : 0;
      this.hard.emit(p.x, p.y, p.z, (nx + Math.random() - 0.5) * 3, (ny + Math.random()) * 2.5, (nz + Math.random() - 0.5) * 3, _c, 0.5 + Math.random() * 0.3, 0.07, 0.04, 14, 0.5);
    }
    _c2.setRGB(1, 0.85, 0.5);
    this.soft.emit(p.x, p.y, p.z, 0, 0, 0, _c2, 0.08, 0.5, 0.2);
  }

  debris(p, color, n = 20) {
    _c.set(color);
    for (let i = 0; i < n; i++) {
      _c2.copy(_c).multiplyScalar(0.7 + Math.random() * 0.5);
      this.hard.emit(p.x + (Math.random() - 0.5) * 3, p.y + (Math.random() - 0.5) * 2.5, p.z + (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6, _c2, 1 + Math.random() * 0.8, 0.22, 0.12, 16, 0.3);
    }
    _c2.setRGB(0.6, 0.58, 0.55);
    for (let i = 0; i < 8; i++) this.soft.emit(p.x + (Math.random() - 0.5) * 2, p.y, p.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2, _c2, 1.2, 1.2, 3.5, 0, 1);
  }

  sparkle(p, color, n = 10, spread = 1) {
    _c.set(color);
    for (let i = 0; i < n; i++) {
      this.soft.emit(p.x + (Math.random() - 0.5) * spread, p.y + (Math.random() - 0.5) * spread, p.z + (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * 1.5, 0.8 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5, _c, 0.6 + Math.random() * 0.6, 0.35, 0.05, 0, 1);
    }
  }

  explosion(p, r) {
    _c.setRGB(1, 0.6, 0.2);
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2, s = 4 + Math.random() * r * 2;
      this.soft.emit(p.x, p.y, p.z, Math.cos(a) * Math.cos(e) * s, Math.abs(Math.sin(e)) * s, Math.sin(a) * Math.cos(e) * s, _c, 0.4 + Math.random() * 0.4, 2.2, 0.4, 0, 3);
    }
    _c.setRGB(0.25, 0.24, 0.22);
    for (let i = 0; i < 30; i++) this.soft.emit(p.x + (Math.random() - 0.5) * r, p.y + Math.random() * 2, p.z + (Math.random() - 0.5) * r, (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3, _c, 2 + Math.random(), 2, 6, 0, 1);
    this.light.position.copy(p);
    this.light.intensity = 400;
    this.lightT = 0.25;
  }

  rocket(src, from, dir, dmg, radius, struct) {
    const mesh = new THREE.Mesh(this.rocketGeo, this.rocketMat);
    mesh.position.copy(from);
    mesh.lookAt(_v.copy(from).add(dir));
    this.G.scene.add(mesh);
    this.rockets.push({ src, pos: from.clone(), dir: dir.clone(), dmg, radius, struct, mesh, t: 0 });
  }

  update(dt) {
    const G = this.G;
    this.soft.update(dt);
    this.hard.update(dt);
    // Leuchtspuren ausblenden
    for (let i = 0; i < this.trN; i++) {
      const l = this.trLife[i];
      if (l <= 0) { if (this.trCol[i * 6] !== 0) this.trCol.fill(0, i * 6, i * 6 + 6); continue; }
      this.trLife[i] -= dt;
      const k = Math.max(0, this.trLife[i] / 0.07);
      for (let v = 0; v < 2; v++) for (let c = 0; c < 3; c++) this.trCol[i * 6 + v * 3 + c] = this.trBase[i * 3 + c] * k * (v === 0 ? 0.35 : 1);
    }
    this.tracers.geometry.attributes.position.needsUpdate = true;
    this.tracers.geometry.attributes.color.needsUpdate = true;
    for (const f of this.flashes) if (f.t > 0) { f.t -= dt; if (f.t <= 0) f.s.visible = false; }
    if (this.lightT > 0) { this.lightT -= dt; this.light.intensity = Math.max(0, this.lightT / 0.25) * 400; }
    // Raketen
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.t += dt;
      const step = 48 * dt;
      const wh = G.world.raycast(r.pos.x, r.pos.y, r.pos.z, r.dir.x, r.dir.y, r.dir.z, step);
      const wt = wh ? wh.t : step;
      const ah = rayActors(G, r.pos, r.dir, wt, r.src);
      if (wh || ah || r.t > 6) {
        const t = ah ? ah.t : wt;
        _p.copy(r.pos).addScaledVector(r.dir, Math.max(0, t - 0.2));
        G.scene.remove(r.mesh);
        this.rockets.splice(i, 1);
        explode(G, _p.clone(), r.src, r.dmg, r.radius, r.struct);
        continue;
      }
      r.pos.addScaledVector(r.dir, step);
      r.mesh.position.copy(r.pos);
      _c.setRGB(0.55, 0.55, 0.55);
      this.soft.emit(r.pos.x, r.pos.y, r.pos.z, (Math.random() - 0.5) * 0.5, 0.4, (Math.random() - 0.5) * 0.5, _c, 0.9, 0.6, 1.8, 0, 1);
      _c.setRGB(1, 0.6, 0.2);
      this.soft.emit(r.pos.x, r.pos.y, r.pos.z, 0, 0, 0, _c, 0.1, 0.8, 0.3);
    }
  }
}
