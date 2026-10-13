// Die Zone (Sturm): wartet, schrumpft in Phasen, außerhalb gibt es Schaden.

import * as THREE from '../vendor/three.module.js';
import { hurt } from './actors.js';

export const PHASES = [
  { wait: 75, shrink: 45, r: 115, dmg: 1 },
  { wait: 45, shrink: 40, r: 70, dmg: 2 },
  { wait: 40, shrink: 30, r: 40, dmg: 4 },
  { wait: 30, shrink: 25, r: 20, dmg: 6 },
  { wait: 25, shrink: 20, r: 8, dmg: 8 },
  { wait: 15, shrink: 20, r: 0, dmg: 10 },
];

const VS = `
varying vec3 vW; varying vec2 vUv;
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FS = `
uniform float uTime; varying vec3 vW; varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 p = vec2(vUv.x * 160.0, vW.y * 0.06);
  float a = n(p + vec2(uTime * 0.6, -uTime * 0.25)) * 0.6 + n(p * 2.3 - vec2(uTime * 0.9, uTime * 0.4)) * 0.4;
  float band = smoothstep(0.35, 0.85, a);
  vec3 col = mix(vec3(0.36, 0.12, 0.62), vec3(0.75, 0.45, 1.0), band);
  float alpha = 0.42 + band * 0.25;
  float d = distance(cameraPosition.xz, vW.xz);
  alpha *= mix(1.0, 0.45, smoothstep(40.0, 230.0, d));        // weit weg blasser
  alpha *= 1.0 - smoothstep(55.0, 110.0, vW.y);                 // nach oben ausblenden
  gl_FragColor = vec4(col, alpha);
}`;

export class Zone {
  constructor(G) {
    this.G = G;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, uniforms: { uTime: { value: 0 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 128, 1, true).translate(0, 0.5, 0), this.mat);
    this.mesh.renderOrder = 20;
    this.mesh.frustumCulled = false;
    G.scene.add(this.mesh);
    this.reset();
  }

  reset() {
    this.phase = 0;
    this.mode = 'wait';      // wait | shrink | done
    this.t = PHASES[0].wait;
    this.cx = 0; this.cz = 0; this.r = 250;
    this.fromX = 0; this.fromZ = 0; this.fromR = 250;
    this.tx = 0; this.tz = 0; this.tr = 250;
    this.tick = 1;
    this.active = false;
    this.mesh.visible = false;
  }

  start(rng) {
    this.reset();
    this.rng = rng;
    this.active = true;
    this.mesh.visible = true;
    this._pickNext();
  }

  _pickNext() {
    const P = PHASES[this.phase];
    const room = Math.max(0, Math.min(this.r, 150) - P.r);
    const a = this.rng() * Math.PI * 2, d = this.rng() * room * (this.phase === 0 ? 0.35 : 0.8);
    this.tx = this.cx + Math.cos(a) * d;
    this.tz = this.cz + Math.sin(a) * d;
    this.tr = P.r;
  }

  dmg() { return PHASES[Math.min(this.phase, PHASES.length - 1)].dmg; }

  inside(x, z, margin = 0) { return Math.hypot(x - this.cx, z - this.cz) < this.r - margin; }
  insideNext(x, z, margin = 0) { return Math.hypot(x - this.tx, z - this.tz) < this.tr - margin; }

  info() {
    if (!this.active) return null;
    if (this.mode === 'wait') return { label: 'Zone schrumpft in', t: this.t, phase: this.phase + 1, shrinking: false };
    if (this.mode === 'shrink') return { label: 'Zone schrumpft', t: this.t, phase: this.phase + 1, shrinking: true };
    return { label: 'Letzte Zone', t: 0, phase: PHASES.length, shrinking: false };
  }

  update(dt) {
    this.mat.uniforms.uTime.value += dt;
    if (!this.active) return;
    const G = this.G;
    if (this.mode === 'wait') {
      this.t -= dt;
      if (this.t <= 0) {
        this.mode = 'shrink';
        this.t = PHASES[this.phase].shrink;
        this.fromX = this.cx; this.fromZ = this.cz; this.fromR = this.r;
        G.hud.notice('Die Zone schrumpft!', 'storm');
        G.sfx.play('zone');
      }
    } else if (this.mode === 'shrink') {
      this.t -= dt;
      const P = PHASES[this.phase];
      const k = 1 - Math.max(0, this.t) / P.shrink;
      this.cx = this.fromX + (this.tx - this.fromX) * k;
      this.cz = this.fromZ + (this.tz - this.fromZ) * k;
      this.r = this.fromR + (this.tr - this.fromR) * k;
      if (this.t <= 0) {
        this.phase++;
        if (this.phase >= PHASES.length) { this.mode = 'done'; this.phase = PHASES.length - 1; }
        else {
          this.mode = 'wait';
          this.t = PHASES[this.phase].wait;
          this._pickNext();
          G.hud.notice('Neue Zone auf der Karte markiert', 'info');
        }
      }
    }
    this.mesh.position.set(this.cx, -2, this.cz);
    this.mesh.scale.set(Math.max(0.01, this.r), 115, Math.max(0.01, this.r));
    // Schaden außerhalb, einmal pro Sekunde
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 1;
      for (const a of G.actors) {
        if (!a.alive || a.state === 'bus') continue;
        if (!this.inside(a.pos.x, a.pos.z)) hurt(G, a, this.dmg(), null, { storm: true, weapon: 'Sturm' });
      }
    }
  }
}
