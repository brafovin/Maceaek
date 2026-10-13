// Gegner-KI: abspringen, Truhen plündern, kämpfen, bauen, heilen und vor dem Sturm fliehen.

import * as THREE from '../vendor/three.module.js';
import { attack, select, startReload, startUse, stepActor } from './actors.js';
import { current, give, weaponScore, hasAmmoFor } from './inventory.js';
import { WEAPONS, HEALS } from './items.js';
import { wrapAngle, forward, HALF } from './util.js';
import { MAT_ORDER } from './pieces.js';

export const BOT_NAMES = ['Lukas', 'Mia', 'Finn', 'Emma', 'Leon', 'Hannah', 'Paul', 'Lea', 'Jonas', 'Sophie', 'Ben', 'Marie',
  'Elias', 'Lina', 'Noah', 'Clara', 'Felix', 'Ida', 'Anton', 'Greta', 'Max', 'Frieda', 'Theo', 'Mila', 'Karl', 'Nele', 'Oskar', 'Lotta', 'Emil', 'Romy'];

export const DIFF = {
  leicht: { err: 0.1, react: 1.0, turn: 4, build: 0.15, view: 50 },
  normal: { err: 0.062, react: 0.7, turn: 6.5, build: 0.3, view: 65 },
  schwer: { err: 0.034, react: 0.4, turn: 9.5, build: 0.5, view: 85 },
};

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3();

export class Brain {
  constructor(G, a, diff) {
    this.G = G; this.a = a; this.d = DIFF[diff] || DIFF.normal;
    a.brain = this;
    this.think = Math.random() * 0.3;
    this.mode = 'loot';
    this.goal = null;
    this.enemy = null; this.seenAt = -99; this.firstSeen = -99;
    this.lastSeen = new THREE.Vector3();
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = 0;
    this.burst = 0; this.pause = 0;
    this.stuckT = 0; this.lastPos = new THREE.Vector3(); this.checkT = 1;
    this.avoidT = 0; this.avoidDir = 0;
    this.digT = 0; this.jumpCd = 1;
    this.buildCd = 2; this.wantBuild = false;
    this.err = new THREE.Vector3(); this.errT = 0;
    this.wanderT = 0;
    this.jumpAt = 0; this.land = new THREE.Vector3();
  }

  // Landepunkt und Absprungzeit wählen
  planDrop(bus, rng) {
    const G = this.G;
    const chests = G.loot.chests;
    if (chests.length && rng() < 0.55) {
      const c = rng.pick(chests);
      this.land.set(c.pos.x + rng.range(-4, 4), 0, c.pos.z + rng.range(-4, 4));
    } else this.land.set(rng.range(-140, 140), 0, rng.range(-140, 140));
    const rel = _t.copy(this.land).sub(bus.start).setY(0);
    const along = rel.dot(bus.dir);
    this.jumpAt = Math.min(bus.dur - 1, Math.max(1.5, along / bus.speed - 2 - rng() * 3));
  }

  onHurt(src) {
    if (!src || src === this.a || !src.alive) return;
    if (!this.enemy || this.enemy === src || Math.random() < 0.6) {
      if (this.enemy !== src) this.firstSeen = this.G.time - this.d.react * 0.4;
      this.enemy = src;
      this.seenAt = this.G.time;
      this.lastSeen.copy(src.pos);
    }
    this.wantBuild = true;
  }

  update(dt) {
    const a = this.a, G = this.G;
    if (!a.alive) return;
    if (a.state === 'bus') { if (G.bus.t >= this.jumpAt) G.eject(a); return; }
    if (a.state === 'fall' || a.state === 'glide') {
      const dx = this.land.x - a.pos.x, dz = this.land.z - a.pos.z, d = Math.hypot(dx, dz);
      const sp = a.state === 'fall' ? 16 : 13;
      if (d > 1) a.yaw = Math.atan2(-dx, -dz);
      a.dive = a.state === 'fall' && d < 40;
      stepActor(G, a, d > 2 ? dx / d * sp : 0, d > 2 ? dz / d * sp : 0, false, dt);
      return;
    }
    this.think -= dt;
    if (this.think <= 0) { this.think = 0.16 + Math.random() * 0.1; this.decide(); }
    this.act(dt);
  }

  // ---------- Wahrnehmung ----------

  canSee(t) {
    const a = this.a, G = this.G;
    a.eye(_o);
    _t.set(t.pos.x, t.pos.y + 1.2, t.pos.z);
    _d.subVectors(_t, _o);
    const dist = _d.length();
    _d.divideScalar(dist);
    const h = G.world.raycast(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, dist, null, true);
    return !h || h.t > dist - 0.4;
  }

  findEnemy() {
    const a = this.a, G = this.G;
    const cur = current(a.inv);
    const view = this.d.view * (cur && cur.id === 'scharfschuetze' ? 1.6 : 1);
    const cand = [];
    for (const t of G.actors) {
      if (t === a || !t.alive || t.state === 'bus' || t.state === 'fall') continue;
      const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z, dy = t.pos.y - a.pos.y;
      const d = Math.hypot(dx, dz, dy);
      if (d > view) continue;
      if (d > 22) {
        const ang = Math.abs(wrapAngle(Math.atan2(-dx, -dz) - a.yaw));
        if (ang > 1.9) continue;
      }
      cand.push([d, t]);
    }
    cand.sort((x, y) => x[0] - y[0]);
    // aktuellen Gegner bevorzugen, wenn sichtbar
    if (this.enemy && this.enemy.alive) {
      const e = cand.find(c => c[1] === this.enemy);
      if (e && this.canSee(this.enemy)) return this.enemy;
    }
    for (let i = 0; i < Math.min(3, cand.length); i++) if (this.canSee(cand[i][1])) return cand[i][1];
    return null;
  }

  wantsItem(it) {
    const inv = this.a.inv;
    if (it.k === 'a') return inv.ammo[it.id] < 300;
    if (it.k === 'm') return inv.mats[it.id] < 400;
    const empty = inv.slots.includes(null);
    if (it.k === 'h') return empty || inv.slots.some(s => s && s.k === 'h' && s.id === it.id && s.n < HEALS[it.id].stack);
    if (it.k === 'w') {
      if (inv.slots.some(s => s && s.k === 'w' && s.id === it.id && s.r >= it.r)) return false;
      if (empty) return true;
      return weaponScore(it) > this.worstWeapon()[1] + 0.3;
    }
    return false;
  }

  worstWeapon() {
    let wi = -1, ws = Infinity;
    this.a.inv.slots.forEach((s, i) => {
      const sc = s ? (s.k === 'w' ? weaponScore(s) : 1.5) : -1;
      if (sc < ws) { ws = sc; wi = i; }
    });
    return [wi, ws];
  }

  findLoot() {
    const a = this.a, G = this.G;
    let best = null, bs = Infinity;
    for (const c of G.loot.chests) {
      if (c.opened || Math.abs(c.pos.y - a.pos.y) > 1.5) continue;
      const d = Math.hypot(c.pos.x - a.pos.x, c.pos.z - a.pos.z);
      if (d < 60 && d < bs) { bs = d; best = { chest: c, pos: c.pos }; }
    }
    for (const p of G.loot.pickups) {
      if (Math.abs(p.pos.y - a.pos.y) > 1.5) continue;
      const d = Math.hypot(p.pos.x - a.pos.x, p.pos.z - a.pos.z) + (p.item.k === 'w' ? -6 : 4);
      if (d < 40 && d < bs && this.wantsItem(p.item)) { bs = d; best = { pickup: p, pos: p.pos }; }
    }
    return best;
  }

  // ---------- Entscheidungen ----------

  decide() {
    const a = this.a, G = this.G, inv = a.inv, Z = G.zone;
    const enemy = this.findEnemy();
    if (enemy) {
      if (this.enemy !== enemy || G.time - this.seenAt > 3) this.firstSeen = G.time;
      this.enemy = enemy;
      this.seenAt = G.time;
      this.lastSeen.copy(enemy.pos);
    } else if (this.enemy && (!this.enemy.alive || G.time - this.seenAt > 6)) this.enemy = null;
    const hasGun = inv.slots.some(s => hasAmmoFor(inv, s));
    const outside = Z.active && !Z.inside(a.pos.x, a.pos.z, 3);
    const nextOut = Z.active && Z.mode !== 'done' && !Z.insideNext(a.pos.x, a.pos.z, 5) && (Z.mode === 'shrink' || Z.t < 30);
    const hasHeal = inv.slots.some(s => s && s.k === 'h' && this.healUseful(s));
    const ed = this.enemy ? this.enemy.pos.distanceTo(a.pos) : Infinity;
    let mode;
    if (this.enemy && (hasGun || ed < 7) && (G.time - this.seenAt < 2.5)) mode = 'fight';
    else if (outside && a.hp > 25) mode = 'zone';
    else if (hasHeal && (a.hp < 70 || a.shield < 50) && G.time - a.lastHit > 2.5) mode = 'heal';
    else if (outside || nextOut) mode = 'zone';
    else {
      const l = this.findLoot();
      if (l) { mode = 'loot'; this.goal = l; }
      else mode = 'wander';
    }
    if (mode !== 'heal' && a.useT > 0 && mode === 'fight') { a.useT = 0; a.useItem = null; }
    this.mode = mode;
    if (mode === 'fight') this.pickWeapon(ed);
    else if (mode !== 'heal' && this.digT <= 0) {
      // beste Waffe bereit halten, nachladen wenn Ruhe
      this.pickWeapon(25);
      const cur = current(inv);
      if (cur && cur.k === 'w' && cur.mag < WEAPONS[cur.id].mag) startReload(G, a);
    }
    if (mode === 'zone' || mode === 'wander') {
      this.wanderT -= 0.2;
      if (!this.goal || !this.goal.wander || this.wanderT <= 0 || this.goal.pos.distanceTo(a.pos) < 4) {
        const ang = Math.random() * Math.PI * 2;
        const r = Z.active ? Math.max(0, Z.tr * 0.6) * Math.sqrt(Math.random()) : 30;
        const cx = Z.active ? Z.tx : a.pos.x, cz = Z.active ? Z.tz : a.pos.z;
        const x = Math.max(-HALF + 8, Math.min(HALF - 8, cx + Math.cos(ang) * r));
        const z = Math.max(-HALF + 8, Math.min(HALF - 8, cz + Math.sin(ang) * r));
        this.goal = { wander: true, pos: new THREE.Vector3(x, 0, z) };
        this.wanderT = 12 + Math.random() * 10;
      }
    }
  }

  healUseful(s) {
    const H = HEALS[s.id], a = this.a;
    return (H.hp && a.hp < H.maxHp) || (H.shield && a.shield < H.maxShield);
  }

  pickWeapon(dist) {
    const a = this.a, inv = a.inv;
    let best = -1, bs = -1;
    inv.slots.forEach((s, i) => {
      if (!s || s.k !== 'w' || !hasAmmoFor(inv, s)) return;
      let sc = weaponScore(s);
      const id = s.id;
      if (id === 'schrotflinte') sc += dist < 10 ? 3 : dist < 18 ? 0.5 : -2;
      if (id === 'mp') sc += dist < 22 ? 1.5 : -0.5;
      if (id === 'sturmgewehr') sc += dist > 8 ? 1.5 : 0;
      if (id === 'scharfschuetze') sc += dist > 45 ? 3 : dist < 15 ? -3 : -0.5;
      if (id === 'raketenwerfer') sc += dist > 12 && dist < 60 ? 2 : -3;
      if (s.mag <= 0) sc -= 1;
      if (sc > bs) { bs = sc; best = i; }
    });
    if (best >= 0 && inv.sel !== best + 1) select(this.G, a, best + 1);
    if (best < 0 && inv.sel !== 0) select(this.G, a, 0);
  }

  // ---------- Ausführen ----------

  act(dt) {
    const a = this.a, G = this.G;
    this.buildCd -= dt;
    this.jumpCd -= dt;
    this.digT -= dt;
    // festgefahren?
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 1.2;
      const moved = this.lastPos.distanceTo(a.pos);
      this.stuckT = this.wantsMove && moved < 0.6 ? this.stuckT + 1 : 0;
      this.lastPos.copy(a.pos);
    }
    this.wantsMove = false;
    let wx = 0, wz = 0, jump = false;
    if (this.digT > 0 && this.dig(dt)) { stepActor(G, a, 0, 0, false, dt); return; }

    if (this.mode === 'fight' && this.enemy) [wx, wz, jump] = this.fight(dt);
    else if (this.mode === 'heal') {
      const it = current(a.inv);
      if (!it || it.k !== 'h' || !this.healUseful(it)) {
        const i = a.inv.slots.findIndex(s => s && s.k === 'h' && this.healUseful(s));
        if (i >= 0) select(G, a, i + 1); else this.mode = 'wander';
      } else if (a.useT <= 0) startUse(G, a);
    } else if (this.goal) {
      const g = this.goal;
      if (g.chest && g.chest.opened) this.goal = null;
      else if (g.pickup && !G.loot.pickups.includes(g.pickup)) this.goal = null;
      else {
        const d = Math.hypot(g.pos.x - a.pos.x, g.pos.z - a.pos.z);
        if (d < 1.7 && (g.chest || g.pickup)) {
          if (g.chest) G.loot.openChest(g.chest, a);
          else this.take(g.pickup);
          this.goal = null;
          this.think = Math.min(this.think, 0.3);
        } else {
          const sp = this.mode === 'zone' ? 7.4 : 6;
          [wx, wz, jump] = this.steer(g.pos.x, g.pos.z, sp, dt);
        }
      }
    }
    // im Vorbeigehen Munition/Material aufsammeln
    for (const p of G.loot.pickups) {
      if ((p.item.k === 'a' || p.item.k === 'm') && p.settled && Math.abs(p.pos.x - a.pos.x) < 1.4 && Math.abs(p.pos.z - a.pos.z) < 1.4 && Math.abs(p.pos.y - a.pos.y) < 1.2) { this.take(p); break; }
    }
    stepActor(G, a, wx, wz, jump, dt);
  }

  take(p) {
    const G = this.G, inv = this.a.inv;
    const it = p.item;
    if (it.k === 'w' && !inv.slots.includes(null)) {
      const [wi, ws] = this.worstWeapon();
      if (wi < 0 || weaponScore(it) <= ws + 0.3) return;
      const old = inv.slots[wi];
      inv.slots[wi] = null;
      if (this.a.inv.sel === wi + 1) select(G, this.a, 0);
      G.loot.spawn(old, this.a.pos.x, this.a.pos.y + 0.6, this.a.pos.z, 0, 2, 0);
    }
    const r = give(inv, it);
    if (r === 'taken') G.loot.remove(p);
  }

  // zum Ziel laufen, Hindernissen ausweichen, notfalls durchhacken
  steer(tx, tz, speed, dt) {
    const a = this.a, G = this.G;
    const dx = tx - a.pos.x, dz = tz - a.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.6) return [0, 0, false];
    this.wantsMove = true;
    let yaw = Math.atan2(-dx, -dz);
    if (this.avoidT > 0) { this.avoidT -= dt; yaw += this.avoidDir; }
    const probe = (y, h) => {
      const fx = -Math.sin(y), fz = -Math.cos(y);
      return G.world.raycast(a.pos.x, a.pos.y + h, a.pos.z, fx, 0, fz, 1.7, null, false);
    };
    let jump = false;
    const knee = probe(yaw, 0.45), head = probe(yaw, 1.5);
    if (knee && !head) jump = a.onGround && this.jumpCd <= 0;
    else if (head) {
      let found = false;
      for (const off of [0.7, -0.7, 1.4, -1.4, 2.2, -2.2]) {
        const o = this.avoidDir > 0 ? off : -off;
        if (!probe(yaw + o, 1.5) && !probe(yaw + o, 0.45)) { this.avoidDir = o; this.avoidT = 0.7; yaw += o; found = true; break; }
      }
      if (!found || this.stuckT >= 2) this.startDig(head.c);
    }
    if (this.stuckT >= 3) { this.startDig(head ? head.c : knee ? knee.c : null); jump = a.onGround; }
    if (jump) this.jumpCd = 0.8;
    a.yaw = turn(a.yaw, yaw, 8 * dt);
    a.pitch *= 0.9;
    return [-Math.sin(yaw) * speed, -Math.cos(yaw) * speed, jump];
  }

  startDig(c) {
    if (!c || !c.owner || !c.owner.parts) return;
    this.digTarget = c.owner;
    this.digT = 3;
    this.stuckT = 0;
  }

  dig() {
    const a = this.a, G = this.G, pc = this.digTarget;
    if (!pc || pc.dead) { this.digT = 0; return false; }
    if (a.inv.sel !== 0) select(G, a, 0);
    const dx = pc.center.x - a.pos.x, dz = pc.center.z - a.pos.z;
    a.yaw = Math.atan2(-dx, -dz);
    const dy = Math.min(pc.center.y, a.pos.y + 2.5) - (a.pos.y + 1.55);
    a.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    a.eye(_o);
    forward(a.yaw, a.pitch, _d);
    attack(G, a, _o, _d);
    return true;
  }

  fight(dt) {
    const a = this.a, G = this.G, e = this.enemy, inv = a.inv;
    const visible = G.time - this.seenAt < 0.35;
    const tp = visible ? e.pos : this.lastSeen;
    const dx = tp.x - a.pos.x, dz = tp.z - a.pos.z, dy = tp.y - a.pos.y;
    const dist = Math.hypot(dx, dz);
    const cur = current(inv);
    const W = cur && cur.k === 'w' ? WEAPONS[cur.id] : null;
    const pref = W ? W.pref : 1.4;
    // zielen (mit Fehler, der sich langsam ändert)
    this.errT -= dt;
    if (this.errT <= 0) {
      this.errT = 0.3 + Math.random() * 0.3;
      const ev = Math.hypot(e.vel.x, e.vel.z);
      const m = this.d.err * (1 + ev * 0.08 + (e.state !== 'ground' ? 0.5 : 0)) * Math.max(4, dist);
      this.err.set((Math.random() - 0.5) * 2 * m, (Math.random() - 0.5) * 1.6 * m, (Math.random() - 0.5) * 2 * m);
    }
    a.eye(_o);
    const headshot = Math.random() < 0.2 ? 0.45 : 0;
    _t.set(tp.x + this.err.x, tp.y + 1.2 + headshot + this.err.y, tp.z + this.err.z);
    _d.subVectors(_t, _o);
    const wantYaw = Math.atan2(-_d.x, -_d.z);
    const wantPitch = Math.atan2(_d.y, Math.hypot(_d.x, _d.z));
    a.yaw = turn(a.yaw, wantYaw, this.d.turn * dt);
    a.pitch += Math.max(-this.d.turn * dt, Math.min(this.d.turn * dt, wantPitch - a.pitch));
    // schießen
    const aligned = Math.abs(wrapAngle(wantYaw - a.yaw)) < 0.12 && Math.abs(wantPitch - a.pitch) < 0.15;
    if (visible && aligned && G.time - this.firstSeen > this.d.react) {
      if (this.pause > 0) this.pause -= dt;
      else {
        forward(a.yaw, a.pitch, _d);
        if (cur === 'pickaxe') { if (dist < 2.6) attack(G, a, _o, _d); }
        else if (cur && cur.k === 'w') {
          if (W.rocket && dist < 7) { /* nicht zu nah */ }
          else if (attack(G, a, _o, _d, dist > 20)) {
            if (W.auto) { this.burst += 1; if (this.burst > 6 + Math.random() * 8) { this.burst = 0; this.pause = 0.25 + Math.random() * 0.4; } }
            else this.pause = Math.random() * 0.25;
          }
        }
      }
    }
    // bauen, wenn beschossen
    if (this.wantBuild && this.buildCd <= 0 && a.onGround) {
      this.wantBuild = false;
      this.buildCd = 2.5 + Math.random() * 3;
      if (Math.random() < this.d.build) {
        const mat = MAT_ORDER.find(m => a.inv.mats[m] >= 10);
        if (mat) {
          const yawTo = Math.atan2(-dx, -dz);
          const t = G.pieces.target(a, 'wall', yawTo, 0);
          if (G.pieces.build(a, t, mat) && Math.random() < 0.5) {
            const m2 = MAT_ORDER.find(m => a.inv.mats[m] >= 10);
            if (m2) G.pieces.build(a, G.pieces.target(a, 'ramp', yawTo, 0), m2);
          }
        }
      }
    }
    // bewegen: Abstand halten, seitlich ausweichen
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 0.5 + Math.random() * 1.1; }
    const n = dist > 0.1 ? 1 / dist : 0;
    let fx = 0, fz = 0;
    if (!visible) { fx = dx * n; fz = dz * n; }
    else if (dist > pref + 6) { fx = dx * n; fz = dz * n; }
    else if (dist < pref - 3) { fx = -dx * n; fz = -dz * n; }
    const sx = -dz * n * this.strafe, sz = dx * n * this.strafe;
    let vx = fx * 6 + sx * 4.2, vz = fz * 6 + sz * 4.2;
    if (Math.abs(dy) > 3 && dist < 6) { vx = fx * 4; vz = fz * 4; }
    let jump = false;
    // Hindernis in Laufrichtung?
    const vl = Math.hypot(vx, vz);
    if (vl > 0.1) {
      this.wantsMove = true;
      const h = G.world.raycast(a.pos.x, a.pos.y + 0.45, a.pos.z, vx / vl, 0, vz / vl, 1.4, null, false);
      if (h) { this.strafe = -this.strafe; vx = fx * 6; vz = fz * 6; jump = a.onGround && this.jumpCd <= 0; }
    }
    if (a.onGround && this.jumpCd <= 0 && Math.random() < dt * 0.6) jump = true;
    if (jump) this.jumpCd = 1.2;
    if (!visible && this.stuckT >= 2) {
      const hc = G.world.raycast(a.pos.x, a.pos.y + 1.2, a.pos.z, fx, 0, fz, 2, null, false);
      if (hc) this.startDig(hc.c);
    }
    return [vx, vz, jump];
  }
}

function turn(cur, want, max) {
  const d = wrapAngle(want - cur);
  return cur + Math.max(-max, Math.min(max, d));
}
