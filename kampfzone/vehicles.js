// Fahrbare Fahrzeuge: Autos und Traktor. Einsteigen mit E, fahren mit WASD, Leertaste = Handbremse.
// Einfache Fahrphysik: Gas/Bremse, geschwindigkeitsabhängige Lenkung, Räder folgen Gelände und Rampen,
// Sprünge, Zusammenstöße (Schaden an Fahrzeug und Fahrer) und Überfahren von Figuren.

import * as THREE from '../vendor/three.module.js';
import { mat4 } from './geo.js';
import { hurt } from './actors.js';
import { wrapAngle } from './util.js';
import { WATER } from './terrain.js';

export const TYPES = {
  auto:    { name: 'Auto', maxF: 27, maxR: 8, acc: 11, brake: 24, turn: 1.75, hl: 2.1, hw: 0.93, wz: 1.35, wx: 0.86, low: 0.95, top: 1.55, seat: [-0.42, 0.12, 0.25] },
  traktor: { name: 'Traktor', maxF: 12, maxR: 5, acc: 6, brake: 16, turn: 1.5, hl: 1.7, hw: 0.95, wz: 1.2, wx: 0.85, low: 1.4, top: 2.6, seat: [0, 0.95, 0.75] },
};

const _v = new THREE.Vector3();

export class Vehicles {
  constructor(G) {
    this.G = G;
    this.list = [];
  }

  reset() { this.list = []; }

  // ein vorhandenes Teil (Auto/Traktor) fahrbar machen
  register(pc, type, x, z, yaw) {
    const v = {
      pc, type, T: TYPES[type], pos: new THREE.Vector3(x, 0, z), yaw, speed: 0, vy: 0, pitch: 0, roll: 0,
      driver: null, air: false, steer: 0, crashT: 0, sink: 0, dead: false,
    };
    v.pos.y = this.groundY(v);
    const prev = pc.onDestroy;
    pc.onDestroy = p => { if (prev) prev(p); this.wreck(v); };
    this.list.push(v);
    this.place(v);
    return v;
  }

  // Bodenhöhe unter den vier Rädern → [Mitte, vorne, hinten, links, rechts]
  wheels(v, y = v.pos.y) {
    const W = this.G.world, T = v.T;
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw), rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw);
    const skip = c => c.owner === v.pc;
    const h = (a, b) => {
      const x = v.pos.x + fx * a + rx * b, z = v.pos.z + fz * a + rz * b;
      return groundSkip(W, x, z, y + 0.75, y + 1.1, skip);
    };
    const fl = h(T.wz, -T.wx), fr = h(T.wz, T.wx), bl = h(-T.wz, -T.wx), br = h(-T.wz, T.wx);
    const f = Math.max(fl, fr), b = Math.max(bl, br), l = Math.max(fl, bl), r = Math.max(fr, br);
    return [(f + b) / 2, f, b, l, r];
  }

  groundY(v) { return this.wheels(v, v.pos.y + 50)[0]; }

  // Modell, Kollision und Mittelpunkt an die aktuelle Lage anpassen
  place(v) {
    const p = v.pc.parts[0];
    mat4(v.pos.x, v.pos.y + 0.02, v.pos.z, v.yaw, 1, 1, 1, v.pitch, v.roll, p.m);
    p.pool.setMatrix(p.idx, p.m);
    v.pc.center.set(v.pos.x, v.pos.y + 0.8, v.pos.z);
    const W = this.G.world, T = v.T;
    for (const c of v.pc.colliders) W.remove(c);
    v.pc.colliders.length = 0;
    // drei Segmente entlang der Fahrzeuglänge, jeweils als achsenparallele Box
    const s = Math.abs(Math.sin(v.yaw)), c = Math.abs(Math.cos(v.yaw));
    const seg = T.hl / 3;
    const ex = c * T.hw + s * seg, ez = s * T.hw + c * seg;
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
    for (const k of [-1, 0, 1]) {
      const x = v.pos.x + fx * k * seg * 2, z = v.pos.z + fz * k * seg * 2;
      const top = !v.driver && k === 0 ? T.top : T.low;
      v.pc.colliders.push(W.box(x - ex, v.pos.y, z - ez, x + ex, v.pos.y + top, z + ez, v.pc));
    }
  }

  nearest(pos, maxD = 3.4) {
    let best = null, bd = maxD;
    for (const v of this.list) {
      if (v.dead || v.driver || v.sink > 0) continue;
      const d = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z);
      if (d < bd && Math.abs(v.pos.y - pos.y) < 2.5) { bd = d; best = v; }
    }
    return best;
  }

  enter(a, v) {
    if (v.driver || v.dead) return;
    v.driver = a;
    a.vehicle = v;
    a.state = 'car';
    a.vel.set(0, 0, 0);
    a.crouch = false; a.slideT = 0; a.useT = 0; a.reloadT = 0;
    this.seat(v, a.pos);
    this.place(v);
    this.G.sfx.at('door', v.pos);
  }

  exit(a) {
    const v = a.vehicle;
    if (!v) return;
    v.driver = null;
    a.vehicle = null;
    a.state = 'ground';
    const W = this.G.world;
    const rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw);
    // links aussteigen, sonst rechts, sonst aufs Dach
    let placed = false;
    for (const side of [-1, 1]) {
      const x = v.pos.x + rx * side * (v.T.hw + 0.9), z = v.pos.z + rz * side * (v.T.hw + 0.9);
      const y = W.groundAt(x, z, 0.4, v.pos.y + 1, v.pos.y + 1.2);
      if (W.free(x, y, z, 0.42, 1.8)) { a.pos.set(x, y, z); placed = true; break; }
    }
    if (!placed) a.pos.set(v.pos.x, v.pos.y + v.T.top + 0.05, v.pos.z);
    a.vel.set(-Math.sin(v.yaw) * v.speed * 0.5, 2, -Math.cos(v.yaw) * v.speed * 0.5);
    a.onGround = false;
    a.yaw = v.yaw;
    this.place(v);
    this.G.sfx.at('door', v.pos);
  }

  // Sitzplatz des Fahrers (Fußpunkt der Figur)
  seat(v, out) {
    const [sx, sy, sz] = v.T.seat;
    const rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw), fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
    return out.set(v.pos.x + rx * sx - fx * sz, v.pos.y + sy, v.pos.z + rz * sx - fz * sz);
  }

  // Fahrzeug zerstört: Fahrer fliegt raus
  wreck(v) {
    v.dead = true;
    const a = v.driver;
    if (a) {
      this.exit(a);
      hurt(this.G, a, 30, null, { weapon: 'Explosion' });
    }
    _v.set(v.pos.x, v.pos.y + 1, v.pos.z);
    this.G.fx.explosion(_v, 4);
    this.G.sfx.at('explosion', _v);
    this.list.splice(this.list.indexOf(v), 1);
  }

  // input: { throttle: -1..1, steer: -1..1 (links +), brake: bool }
  update(dt, input) {
    const G = this.G;
    for (const v of this.list) {
      if (v.dead) continue;
      const moving = v.driver || Math.abs(v.speed) > 0.05 || v.air || v.sink > 0;
      if (!moving) continue;
      this.drive(v, dt, v.driver && v.driver === G.player ? input : null);
    }
  }

  drive(v, dt, inp) {
    const G = this.G, W = G.world, T = v.T;
    v.crashT = Math.max(0, v.crashT - dt);
    // im tiefen Wasser säuft der Motor ab
    const th = W.terrain ? W.terrain(v.pos.x, v.pos.z) : 0;
    if (th < WATER - 0.9 && v.pos.y < WATER - 0.3) {
      v.sink += dt;
      v.speed *= Math.max(0, 1 - dt * 2);
      if (v.driver) { G.hud.notice('Das Auto ist abgesoffen!', 'warn', 2); this.exit(v.driver); }
      inp = null;
    }
    const thr = inp ? inp.throttle : 0;
    if (!v.air) {
      if (thr > 0) v.speed += (v.speed < -0.5 ? T.brake : T.acc) * thr * dt;
      else if (thr < 0) v.speed += (v.speed > 0.5 ? -T.brake : -T.acc * 0.7) * -thr * dt;
      else v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 3 * dt);
      if (inp && inp.brake) v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 14 * dt);
      v.speed = Math.max(-T.maxR, Math.min(T.maxF, v.speed));
      const st = inp ? inp.steer : 0;
      v.steer += (st - v.steer) * Math.min(1, dt * 8);
      const k = Math.max(-1, Math.min(1, v.speed / 6)) * (1 - Math.min(0.45, Math.abs(v.speed) / 60));
      v.yaw = wrapAngle(v.yaw + v.steer * T.turn * k * dt * (inp && inp.brake ? 1.4 : 1));
    }
    // waagerecht bewegen, Hindernisse prüfen
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
    const ox = v.pos.x, oz = v.pos.z;
    v.pos.x += fx * v.speed * dt;
    v.pos.z += fz * v.speed * dt;
    const hit = this.collide(v);
    if (hit) {
      const impact = Math.abs(v.speed);
      if (impact > 7 && v.crashT <= 0) {
        v.crashT = 0.5;
        G.sfx.at('crash', v.pos, Math.min(1.5, impact / 15));
        G.fx.debris(v.pc.center, v.pc.debris, 10);
        G.pieces.damage(v.pc, impact * impact * 0.35, v.driver);
        if (hit.owner && hit.owner.parts && hit.owner !== v.pc) G.pieces.damage(hit.owner, impact * 12, v.driver);
        if (v.driver && impact > 16) hurt(G, v.driver, (impact - 16) * 2.5, null, { weapon: 'Unfall' });
      }
      v.speed *= -0.25;
      if (this.collide(v)) { v.pos.x = ox; v.pos.z = oz; }
    }
    // senkrecht: Räder folgen dem Boden, sonst Flug
    const [gy, f, b, l, r] = this.wheels(v);
    if (v.air) {
      v.vy -= 24 * dt;
      v.pos.y += v.vy * dt;
      if (v.pos.y <= gy) {
        const impact = -v.vy;
        v.pos.y = gy; v.vy = 0; v.air = false;
        if (impact > 11) {
          G.sfx.at('crash', v.pos, Math.min(1.5, impact / 18));
          G.pieces.damage(v.pc, (impact - 11) * 18, v.driver);
          if (v.driver) hurt(G, v.driver, (impact - 11) * 3, null, { fall: true, weapon: 'Sturz' });
        } else if (impact > 4) G.sfx.at('land', v.pos, 0.8);
      }
    } else {
      const prev = v.pos.y;
      if (gy < prev - 0.6) { v.air = true; v.vy = Math.min(v.vy, 0); }
      else {
        v.vy = Math.max(-20, Math.min(20, (gy - prev) / Math.max(dt, 1e-3)));
        v.pos.y = gy;
      }
    }
    if (!v.air) {
      v.pitch += (Math.atan2(f - b, T.wz * 2) - v.pitch) * Math.min(1, dt * 10);
      v.roll += (Math.atan2(r - l, T.wx * 2) - v.roll) * Math.min(1, dt * 10);
    } else v.pitch += (-0.1 - v.pitch) * dt;
    // Figuren überfahren
    if (Math.abs(v.speed) > 5) {
      const rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw);
      for (const a of G.actors) {
        if (!a.alive || a === v.driver || a.state !== 'ground' || G.time - (a.runOver || -9) < 0.8) continue;
        const dx = a.pos.x - v.pos.x, dz = a.pos.z - v.pos.z;
        const al = dx * fx + dz * fz, sd = dx * rx + dz * rz;
        if (Math.abs(al) < T.hl + 0.35 && Math.abs(sd) < T.hw + 0.4 && Math.abs(a.pos.y - v.pos.y) < 1.6) {
          a.runOver = G.time;
          hurt(G, a, Math.min(120, Math.abs(v.speed) * 4.2), v.driver, { weapon: T.name });
          a.vel.set(fx * v.speed * 0.7 + Math.sign(sd || 1) * rx * 3, 5, fz * v.speed * 0.7 + Math.sign(sd || 1) * rz * 3);
          a.onGround = false;
          G.sfx.at('crash', a.pos, 0.6);
        }
      }
    }
    this.place(v);
    if (v.driver) { this.seat(v, v.driver.pos); v.driver.yaw = v.driver.isPlayer ? v.driver.yaw : v.yaw; }
  }

  // Kreise vorne/Mitte/hinten gegen Boxen; schiebt das Fahrzeug heraus, liefert den Treffer
  collide(v) {
    const W = this.G.world, T = v.T;
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
    const rad = T.hw + 0.05;
    let hit = null;
    for (const k of [-1, 0, 1]) {
      const cx = v.pos.x + fx * k * (T.hl - rad), cz = v.pos.z + fz * k * (T.hl - rad);
      for (const c of W.query(cx - rad, cz - rad, cx + rad, cz + rad)) {
        if (c.t !== 0 || c.owner === v.pc) continue;
        if (c.maxy <= v.pos.y + 0.7 || c.miny >= v.pos.y + T.low + 0.4) continue;
        const px = Math.max(c.minx, Math.min(cx, c.maxx)), pz = Math.max(c.minz, Math.min(cz, c.maxz));
        let dx = cx - px, dz = cz - pz;
        const d = Math.hypot(dx, dz);
        if (d >= rad) continue;
        if (d < 1e-4) { dx = -fx; dz = -fz; } else { dx /= d; dz /= d; }
        const push = rad - d + 0.01;
        v.pos.x += dx * push; v.pos.z += dz * push;
        hit = c;
      }
    }
    return hit;
  }
}

// Bodenhöhe ohne die eigenen Kollisionsboxen des Fahrzeugs
function groundSkip(W, x, z, maxBox, maxSlope, skip) {
  let g = W.terrain ? W.terrain(x, z) : 0;
  for (const c of W.query(x - 0.3, z - 0.3, x + 0.3, z + 0.3)) {
    if (skip(c)) continue;
    if (c.t === 0) {
      if (c.maxy <= maxBox && c.maxy > g && x + 0.3 > c.minx && x - 0.3 < c.maxx && z + 0.3 > c.minz && z - 0.3 < c.maxz) g = c.maxy;
    } else if (x >= c.minx && x <= c.maxx && z >= c.minz && z <= c.maxz) {
      const s = W.slopeH(c, x, z);
      if (s <= maxSlope && s > g) g = s;
    }
  }
  return g;
}
