// Truhen und Gegenstände am Boden (aufheben mit E, Munition/Material automatisch).

import * as THREE from '../vendor/three.module.js';
import { merge, boxAt } from './geo.js';
import { RARITY, itemGeo, itemMaterial, itemRarity, chestLoot } from './items.js';
import { WATER } from './terrain.js';

const _v = new THREE.Vector3();

export class Loot {
  constructor(G) {
    this.G = G;
    this.group = new THREE.Group();
    G.scene.add(this.group);
    this.pickups = [];
    this.chests = [];
    this.beamGeo = new THREE.CylinderGeometry(0.06, 0.16, 7, 8, 1, true).translate(0, 3.5, 0);
    this.beamMats = RARITY.map(r => new THREE.MeshBasicMaterial({ color: r.hex, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.ringGeo = new THREE.RingGeometry(0.3, 0.42, 24).rotateX(-Math.PI / 2);
    this.ringMats = RARITY.map(r => new THREE.MeshBasicMaterial({ color: r.hex, transparent: true, opacity: 0.8, depthWrite: false }));
    const GOLD = 0xe8b423, WOOD = 0x7a4a24, DWOOD = 0x5a3518;
    this.chestBase = merge([
      { geo: boxAt(1.0, 0.5, 0.62, 0, 0.25, 0), color: WOOD },
      { geo: boxAt(1.04, 0.07, 0.66, 0, 0.47, 0), color: GOLD },
      { geo: boxAt(0.08, 0.5, 0.66, -0.36, 0.25, 0), color: GOLD },
      { geo: boxAt(0.08, 0.5, 0.66, 0.36, 0.25, 0), color: GOLD },
      { geo: boxAt(0.98, 0.04, 0.6, 0, 0.5, 0), color: DWOOD },
    ]);
    this.chestLid = merge([
      { geo: boxAt(1.0, 0.24, 0.62, 0, 0.12, -0.31), color: WOOD },
      { geo: boxAt(0.08, 0.26, 0.66, -0.36, 0.12, -0.31), color: GOLD },
      { geo: boxAt(0.08, 0.26, 0.66, 0.36, 0.12, -0.31), color: GOLD },
      { geo: boxAt(0.16, 0.16, 0.05, 0, 0.0, -0.64), color: GOLD },
    ]);
    this.chestMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.3, emissive: 0x6a4a00, emissiveIntensity: 0.35 });
    this.chestMatOpen = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
  }

  reset() {
    for (const p of this.pickups) this._dispose(p);
    for (const c of this.chests) this.group.remove(c.root);
    this.pickups.length = 0;
    this.chests.length = 0;
  }

  // ---------- Truhen ----------

  addChest(x, y, z, yaw) {
    const root = new THREE.Group();
    root.position.set(x, y, z);
    root.rotation.y = yaw;
    const base = new THREE.Mesh(this.chestBase, this.chestMat);
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.5, 0.31);
    const lid = new THREE.Mesh(this.chestLid, this.chestMat);
    lidPivot.add(lid);
    root.add(base, lidPivot);
    base.castShadow = lid.castShadow = true;
    this.group.add(root);
    const s = Math.abs(Math.sin(yaw)) > 0.5;
    const hx = s ? 0.31 : 0.5, hz = s ? 0.5 : 0.31;
    const ch = { pos: new THREE.Vector3(x, y, z), yaw, opened: false, root, base, lid, lidPivot, open: 0, spark: Math.random() };
    ch.collider = this.G.world.box(x - hx, y, z - hz, x + hx, y + 0.62, z + hz, { chest: ch });
    this.chests.push(ch);
    return ch;
  }

  openChest(ch, actor) {
    if (ch.opened) return;
    ch.opened = true;
    ch.base.material = ch.lid.material = this.chestMatOpen;
    this.G.sfx.at('chest', ch.pos);
    this.G.fx.sparkle(_v.copy(ch.pos).setY(ch.pos.y + 0.7), 0xffd36b, 30);
    const fx = -Math.sin(ch.yaw), fz = -Math.cos(ch.yaw);
    const items = chestLoot(this.G.rng);
    items.forEach((it, i) => {
      const a = (i - (items.length - 1) / 2) * 0.55;
      const dx = fx * Math.cos(a) - fz * Math.sin(a), dz = fz * Math.cos(a) + fx * Math.sin(a);
      this.spawn(it, ch.pos.x + fx * 0.6, ch.pos.y + 0.8, ch.pos.z + fz * 0.6, dx * 2.2, 3.5, dz * 2.2);
    });
  }

  // ---------- Gegenstände ----------

  spawn(item, x, y, z, vx = 0, vy = 0, vz = 0) {
    const mesh = new THREE.Mesh(itemGeo(item), itemMaterial());
    const big = item.k === 'w' ? 1.5 : 1.25;
    mesh.scale.setScalar(big);
    mesh.castShadow = true;
    this.group.add(mesh);
    const r = itemRarity(item);
    let beam = null, ring = null;
    if (item.k === 'w' || item.k === 'h') {
      beam = new THREE.Mesh(this.beamGeo, this.beamMats[r]);
      ring = new THREE.Mesh(this.ringGeo, this.ringMats[r]);
      this.group.add(beam, ring);
    }
    const p = { item, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(vx, vy, vz), mesh, beam, ring, t: Math.random() * 6, settled: false, check: 0, born: this.G.time };
    this.pickups.push(p);
    return p;
  }

  remove(p) {
    const i = this.pickups.indexOf(p);
    if (i >= 0) this.pickups.splice(i, 1);
    this._dispose(p);
  }

  _dispose(p) {
    this.group.remove(p.mesh);
    if (p.beam) this.group.remove(p.beam, p.ring);
  }

  // Gegenstände rund um einen Punkt verstreuen (Truhen, Ausscheiden)
  scatter(items, x, y, z) {
    items.forEach((it, i) => {
      const a = (i / Math.max(1, items.length)) * Math.PI * 2 + Math.random() * 0.4;
      const s = 1.6 + Math.random() * 1.2;
      this.spawn(it, x, y + 0.9, z, Math.cos(a) * s, 3 + Math.random(), Math.sin(a) * s);
    });
  }

  update(dt, cam) {
    const W = this.G.world;
    for (const p of this.pickups) {
      p.t += dt;
      p.check -= dt;
      if (!p.settled || p.check <= 0) {
        if (p.settled) { p.check = 0.5; p.settled = false; }
        p.vel.y -= 20 * dt;
        const nx = p.pos.x + p.vel.x * dt, nz = p.pos.z + p.vel.z * dt;
        // nicht durch Wände fliegen
        const hv = Math.hypot(p.vel.x, p.vel.z);
        if (hv > 0.01) {
          const h = W.raycast(p.pos.x, p.pos.y + 0.2, p.pos.z, p.vel.x / hv, 0, p.vel.z / hv, hv * dt + 0.3, null, false);
          if (h) { p.vel.x *= -0.3; p.vel.z *= -0.3; }
          else { p.pos.x = nx; p.pos.z = nz; }
        }
        const g = Math.max(W.groundAt(p.pos.x, p.pos.z, 0.15, p.pos.y + 0.05, p.pos.y + 0.6), WATER - 0.25);   // schwimmt auf Wasser
        p.pos.y += p.vel.y * dt;
        if (p.pos.y <= g) {
          p.pos.y = g;
          p.vel.set(0, 0, 0);
          p.settled = true;
          p.check = 0.5;
        }
      }
      const far = p.pos.distanceToSquared(cam) > 110 * 110;
      p.mesh.visible = !far;
      const bob = 0.35 + Math.sin(p.t * 2.2) * 0.08;
      p.mesh.position.set(p.pos.x, p.pos.y + bob, p.pos.z);
      p.mesh.rotation.set(p.item.k === 'w' ? 0.25 : 0, p.t * 1.4, 0);
      if (p.beam) {
        p.beam.visible = p.ring.visible = !far;
        p.beam.position.copy(p.pos);
        p.ring.position.set(p.pos.x, p.pos.y + 0.03, p.pos.z);
      }
    }
    for (const c of this.chests) {
      if (c.opened && c.open < 1) {
        c.open = Math.min(1, c.open + dt * 3.5);
        c.lidPivot.rotation.x = 1.9 * (1 - (1 - c.open) ** 3);
      }
      if (!c.opened) {
        c.spark -= dt;
        if (c.spark <= 0) {
          c.spark = 0.35 + Math.random() * 0.4;
          if (c.pos.distanceToSquared(cam) < 40 * 40) this.G.fx.sparkle(_v.set(c.pos.x, c.pos.y + 0.7, c.pos.z), 0xffd36b, 2, 0.6);
        }
      }
    }
  }

  // nächstes interaktives Objekt (Truhe oder Gegenstand) für eine Figur
  nearest(pos, dirX, dirZ, maxD = 2.6, kinds = null) {
    let best = null, bs = Infinity;
    for (const c of this.chests) {
      if (c.opened) continue;
      const s = score(pos, c.pos, dirX, dirZ, maxD);
      if (s < bs) { bs = s; best = { chest: c }; }
    }
    for (const p of this.pickups) {
      if (!p.settled && this.G.time - p.born < 0.4) continue;
      if (kinds && !kinds.includes(p.item.k)) continue;
      const s = score(pos, p.pos, dirX, dirZ, maxD) - 0.2;
      if (s < bs) { bs = s; best = { pickup: p }; }
    }
    return best;
  }
}

function score(pos, q, dx, dz, maxD) {
  const x = q.x - pos.x, z = q.z - pos.z, y = q.y - pos.y;
  if (y < -1.2 || y > 1.6) return Infinity;
  const d = Math.hypot(x, z);
  if (d > maxD) return Infinity;
  const facing = d > 0.01 ? (x * dx + z * dz) / d : 1;
  return d - facing * 0.8;
}
