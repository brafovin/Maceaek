// Spielfiguren (Spieler und Bots): Modell, Animation, Bewegung, Kampf und Heilen.

import * as THREE from '../vendor/three.module.js';
import { moveChar } from './physics.js';
import { skinParts } from './skins.js';
import { WEAPONS, HEALS, RARITY, weaponGeo, pickaxeGeo, healGeo, itemMaterial } from './items.js';
import { newInventory, current } from './inventory.js';
import { forward, lerp } from './util.js';
import { WATER, SWIM_Y } from './terrain.js';

export const SLIDE_T = 0.95;      // Dauer einer Rutschpartie (s)

// Figur aus Skin-Teilen: Rumpf, Kopf, Arme mit Ellbogen, Beine mit Knien. Ein eigenes Material je Figur
// (für das rote Aufblitzen bei Treffern), Farben stecken in den Vertex-Farben.
const G_GLIDER = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1.6, 0, 0.5, 0, 0.35, -0.9, 0, 0.1, 0.5, 0, 0.1, 0.5, 0, 0.35, -0.9, 1.6, 0, 0.5], 3));
  g.computeVertexNormals();
  return g;
})();
const HIP_Y = 0.93, HIP_X = 0.095, SHO_Y = 1.45, SHO_X = 0.235, KNEE = 0.43, ELBOW = 0.29;

export function makeModel(skin) {
  const P = skinParts(skin);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const body = new THREE.Group();
  root.add(body);
  const mk = (geo, parent, m = mat) => {
    const me = new THREE.Mesh(geo, m);
    me.castShadow = true;
    parent.add(me);
    return me;
  };
  const grp = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  mk(P.torso, body);
  const head = grp(body, 0, 1.58, 0);
  mk(P.head, head);
  const limb = (x, y, a, b, joint) => {
    const g = grp(body, x, y, 0);
    mk(a, g);
    const j = grp(g, 0, -joint, 0);
    mk(b, j);
    return [g, j];
  };
  const [legL, kneeL] = limb(-HIP_X, HIP_Y, P.thigh, P.shin, KNEE);
  const [legR, kneeR] = limb(HIP_X, HIP_Y, P.thigh, P.shin, KNEE);
  const [armL, elbowL] = limb(-SHO_X, SHO_Y, P.upper, P.fore, ELBOW);
  const [armR, elbowR] = limb(SHO_X, SHO_Y, P.upper, P.fore, ELBOW);
  // Zielachse in Schulterhöhe: Waffe kippt mit dem Blick, die Hände greifen per IK nach
  const aim = grp(body, 0, SHO_Y, 0);
  const holder = grp(aim, 0.12, -0.1, -0.2);
  const weapon = new THREE.Mesh(weaponGeo('pistole', 0), itemMaterial());
  weapon.scale.setScalar(1.15);
  weapon.castShadow = true;
  holder.add(weapon);
  const pick = new THREE.Mesh(pickaxeGeo(), itemMaterial());
  pick.position.set(0, -0.3, -0.36);
  pick.rotation.x = -Math.PI / 2;
  pick.castShadow = true;
  elbowR.add(pick);
  const glider = grp(root, 0, 2.55, 0);
  const gm = new THREE.Mesh(G_GLIDER, new THREE.MeshStandardMaterial({ color: skin.packCol || skin.topCol, side: THREE.DoubleSide, roughness: 0.6 }));
  gm.castShadow = true;
  glider.add(gm);
  glider.visible = false;
  return { root, body, legL, legR, kneeL, kneeR, armL, armR, elbowL, elbowR, head, aim, holder, weapon, pick, glider, mats: { body: mat } };
}

// Zwei-Gelenk-IK: Arm (Schulter) und Ellbogen so drehen, dass die Hand bei (tx, ty, tz) relativ zur Schulter liegt
const L1 = ELBOW, L2 = 0.3;
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
function reach(arm, elbow, tx, ty, tz) {
  const d = Math.min(L1 + L2 - 0.004, Math.max(0.14, Math.hypot(tx, ty, tz)));
  const e = Math.PI - Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
  elbow.rotation.set(e, 0, 0);
  _v1.set(0, -(L1 + L2 * Math.cos(e)), -L2 * Math.sin(e)).normalize();
  _v2.set(tx, ty, tz).normalize();
  arm.quaternion.setFromUnitVectors(_v1, _v2);
}
// Hand an einen Punkt im Körper-System legen (z. B. Lenkrad des Busfahrers)
export function reachHand(m, side, x, y, z) {
  reach(side < 0 ? m.armL : m.armR, side < 0 ? m.elbowL : m.elbowR, x - side * SHO_X, y - SHO_Y, z);
}
// Punkt (x, y, z) im Zielachsen-System → Hand-Ziel relativ zur Schulter (side −1 links, +1 rechts)
const _h = new THREE.Vector3();
function handTo(m, side, x, y, z) {
  _h.set(x, y, z).applyEuler(m.aim.rotation).add(m.aim.position);
  const arm = side < 0 ? m.armL : m.armR, el = side < 0 ? m.elbowL : m.elbowR;
  reach(arm, el, _h.x - side * SHO_X, _h.y - SHO_Y, _h.z);
}
// Griffpunkte je Waffe (im Zielachsen-System): Halterung, rechte Hand, linke Hand
const HOLD = {
  pistole: { p: [0.07, -0.08, -0.46], r: [0.07, -0.14, -0.43], l: [0.05, -0.16, -0.42] },
  mp: { p: [0.11, -0.1, -0.26], r: [0.11, -0.22, -0.33], l: [0.1, -0.2, -0.47] },
  sturmgewehr: { p: [0.12, -0.1, -0.2], r: [0.12, -0.24, -0.31], l: [0.1, -0.13, -0.5] },
  schrotflinte: { p: [0.12, -0.1, -0.24], r: [0.12, -0.18, -0.24], l: [0.1, -0.15, -0.6] },
  scharfschuetze: { p: [0.12, -0.12, -0.26], r: [0.12, -0.24, -0.2], l: [0.1, -0.13, -0.56] },
  raketenwerfer: { p: [0.2, 0.1, -0.12], r: [0.2, 0.0, -0.08], l: [0.2, 0.0, -0.42] },
};

const _f = new THREE.Vector3(), _m = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0), _RIGHT = new THREE.Vector3(1, 0, 0);

export class Actor {
  constructor(G, { name, isPlayer = false, skin }) {
    this.G = G;
    this.name = name;
    this.isPlayer = isPlayer;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.r = 0.42; this.h = 1.8;
    this.onGround = false;
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.shield = 0;
    this.alive = true; this.kills = 0;
    this.inv = newInventory();
    this.state = 'bus';
    this.fireCd = 0; this.reloadT = 0; this.reloadItem = null;
    this.useT = 0; this.useItem = null;
    this.swingT = 0; this.swingCd = 0;
    this.bloom = 0; this.shotT = 0; this.flash = 0;
    this.lastHit = -99; this.lastAttacker = null;
    this.walk = 0; this.deadT = 0;
    this.held = null;
    this.crouch = false; this.slideT = 0; this.slideDir = new THREE.Vector3();
    this.swimming = false; this.wading = false; this.stepT = 0;
    this.seat = -1; this.lastShot = -99; this.landT = 0;
    this.skin = skin;
    this.model = makeModel(skin);
    this.model.root.visible = false;
    G.scene.add(this.model.root);
  }

  get low() { return this.crouch || this.slideT > 0; }

  eye(out) { return out.set(this.pos.x, this.pos.y + (this.low ? 1.05 : 1.55), this.pos.z); }

  dispose() { this.G.scene.remove(this.model.root); this.model.mats.body.dispose(); }
}

// ---------- Inventar-Aktionen ----------

export function select(G, a, idx) {
  if (idx === a.inv.sel) return;
  a.inv.sel = idx;
  a.reloadT = 0; a.reloadItem = null;
  a.useT = 0; a.useItem = null;
  a.fireCd = Math.max(a.fireCd, 0.22);
  if (a.isPlayer) G.sfx.play('equip');
}

export function startReload(G, a) {
  const it = current(a.inv);
  if (!it || it.k !== 'w' || a.reloadT > 0) return false;
  const W = WEAPONS[it.id];
  if (it.mag >= W.mag || a.inv.ammo[W.ammo] <= 0) return false;
  a.reloadT = W.reload * (1 - 0.04 * it.r);
  a.reloadDur = a.reloadT;
  a.reloadItem = it;
  G.sfx.at('reload', a.pos, a.isPlayer ? 1 : 0.5);
  return true;
}

export function startUse(G, a) {
  const it = current(a.inv);
  if (!it || it.k !== 'h' || a.useT > 0) return false;
  const H = HEALS[it.id];
  if (H.hp && a.hp >= H.maxHp) { if (a.isPlayer) G.hud.notice(H.maxHp < 100 ? `${H.name} heilt nur bis ${H.maxHp} Leben` : 'Leben ist schon voll'); return false; }
  if (H.shield && a.shield >= H.maxShield) { if (a.isPlayer) G.hud.notice(H.maxShield < 100 ? `${H.name} lädt nur bis ${H.maxShield} Schild` : 'Schild ist schon voll'); return false; }
  a.useT = a.useDur = H.time;
  a.useItem = it;
  if (a.isPlayer) G.sfx.play('use');
  return true;
}

export function updateTimers(G, a, dt) {
  a.fireCd = Math.max(0, a.fireCd - dt);
  a.swingCd = Math.max(0, a.swingCd - dt);
  a.swingT = Math.max(0, a.swingT - dt);
  a.shotT = Math.max(0, a.shotT - dt);
  a.bloom = Math.max(0, a.bloom - dt * 0.09);
  const cur = current(a.inv);
  if (a.reloadT > 0) {
    if (cur !== a.reloadItem) { a.reloadT = 0; a.reloadItem = null; }
    else {
      a.reloadT -= dt;
      if (a.reloadT <= 0) {
        const W = WEAPONS[cur.id];
        const take = Math.min(W.mag - cur.mag, a.inv.ammo[W.ammo]);
        cur.mag += take;
        a.inv.ammo[W.ammo] -= take;
        a.reloadT = 0; a.reloadItem = null;
      }
    }
  }
  if (a.useT > 0) {
    if (cur !== a.useItem) { a.useT = 0; a.useItem = null; }
    else {
      a.useT -= dt;
      if (a.useT <= 0) {
        const H = HEALS[cur.id];
        if (H.hp) a.hp = Math.min(H.maxHp, Math.max(a.hp, a.hp + H.hp));
        if (H.shield) a.shield = Math.min(H.maxShield, Math.max(a.shield, a.shield + H.shield));
        cur.n--;
        if (cur.n <= 0) a.inv.slots[a.inv.slots.indexOf(cur)] = null;
        a.useT = 0; a.useItem = null;
        G.sfx.at('healed', a.pos, a.isPlayer ? 1 : 0.4);
        G.fx.sparkle(_e.set(a.pos.x, a.pos.y + 1, a.pos.z), H.shield ? 0x5fb8ff : 0x7dff8a, 18, 1);
      }
    }
  }
  if (a.flash > 0) {
    a.flash -= dt;
    const on = a.flash > 0;
    for (const k in a.model.mats) a.model.mats[k].emissive.setHex(on ? 0x661010 : 0x000000);
  }
}

// ---------- Schießen ----------

export function muzzle(a, out) {
  forward(a.yaw, a.pitch, _f);
  const rx = Math.cos(a.yaw), rz = -Math.sin(a.yaw);
  return out.set(a.pos.x + rx * 0.14 + _f.x * 0.8, a.pos.y + (a.low ? 0.9 : 1.32) + _f.y * 0.8, a.pos.z + rz * 0.14 + _f.z * 0.8);
}

function spreadDir(d, s, out) {
  if (s <= 0) return out.copy(d);
  _a.crossVectors(d, Math.abs(d.y) < 0.99 ? _UP : _RIGHT).normalize();
  _b.crossVectors(d, _a);
  const r = s * Math.sqrt(Math.random()), t = Math.random() * Math.PI * 2;
  return out.copy(d).addScaledVector(_a, Math.cos(t) * r).addScaledVector(_b, Math.sin(t) * r).normalize();
}

// Strahl gegen Figuren: Kopf (Kugel) und Körper (Box)
export function rayActors(G, o, d, maxT, skip) {
  let best = maxT, ba = null, head = false;
  for (const t of G.actors) {
    if (!t.alive || t === skip || t.state === 'bus') continue;
    const cx = t.pos.x - o.x, cz = t.pos.z - o.z, cy = t.pos.y + 1 - o.y;
    const along = cx * d.x + cy * d.y + cz * d.z;
    if (along < -1 || along > best + 1) continue;
    const px = cx - d.x * along, py = cy - d.y * along, pz = cz - d.z * along;
    if (px * px + py * py + pz * pz > 2.2 * 2.2) continue;
    // Kopf
    const low = t.low && !t.swimming, seated = t.state === 'car';
    const hx = t.pos.x - o.x, hy = t.pos.y + (seated ? 1.15 : low ? 1.22 : 1.72) - o.y, hz = t.pos.z - o.z;
    const b = hx * d.x + hy * d.y + hz * d.z;
    const c = hx * hx + hy * hy + hz * hz - 0.25 * 0.25;
    const disc = b * b - c;
    if (disc >= 0) {
      const th = b - Math.sqrt(disc);
      if (th > 0 && th < best) { best = th; ba = t; head = true; }
    }
    // Körper
    const tb = rayBox(o, d, t.pos.x - 0.33, t.pos.y + (t.swimming ? 1.0 : seated ? 0.35 : 0), t.pos.z - 0.33, t.pos.x + 0.33, t.pos.y + (seated ? 0.95 : low ? 1.05 : 1.52), t.pos.z + 0.33);
    if (tb > 0 && tb < best) { best = tb; ba = t; head = false; }
  }
  return ba ? { a: ba, t: best, head } : null;
}

function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let t0 = 0, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    const oc = i === 0 ? o.x : i === 1 ? o.y : o.z, dc = i === 0 ? d.x : i === 1 ? d.y : d.z;
    const lo = i === 0 ? x0 : i === 1 ? y0 : z0, hi = i === 0 ? x1 : i === 1 ? y1 : z1;
    if (Math.abs(dc) < 1e-9) { if (oc < lo || oc > hi) return -1; continue; }
    let a = (lo - oc) / dc, b = (hi - oc) / dc;
    if (a > b) { const q = a; a = b; b = q; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }
  return t0;
}

function falloff(W, t) {
  const [f0, f1, fm] = W.falloff;
  return t <= f0 ? 1 : t >= f1 ? fm : 1 + (fm - 1) * (t - f0) / (f1 - f0);
}

// Hauptaktion (linke Maustaste): schießen, hacken oder heilen. o = Schussursprung, d = Richtung (normiert)
export function attack(G, a, o, d, aiming = false) {
  const inv = a.inv, it = current(inv);
  if (a.swimming) return false;
  if (it === 'pickaxe') return swing(G, a, o, d);
  if (!it) return false;
  if (it.k === 'h') { startUse(G, a); return false; }
  if (a.useT > 0) { a.useT = 0; a.useItem = null; }
  const W = WEAPONS[it.id];
  if (a.fireCd > 0 || a.reloadT > 0) return false;
  if (it.mag <= 0) {
    if (!startReload(G, a)) { if (a.isPlayer) G.sfx.play('empty'); a.fireCd = 0.3; }
    return false;
  }
  it.mag--;
  a.fireCd = 1 / W.rate;
  a.lastShot = G.time;
  const mul = RARITY[it.r].mul;
  const moving = Math.hypot(a.vel.x, a.vel.z) > 1.2;
  let spread = (aiming ? W.aimSpread : W.spread) + a.bloom + (moving ? 0.01 : 0) + (a.onGround ? 0 : 0.025);
  if (a.crouch && a.slideT <= 0) spread *= 0.6;
  a.bloom = Math.min(0.045, a.bloom + (W.auto ? 0.0035 : 0.007));
  a.shotT = 0.1;
  muzzle(a, _m);
  G.sfx.shot(W.sound, a.pos, a.isPlayer);
  G.fx.flash(_m);
  if (W.rocket) {
    spreadDir(d, spread, _d);
    G.fx.rocket(a, _m, _d, W.dmg * mul, W.splash, W.struct);
  } else {
    const hits = new Map();
    const pellets = W.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      spreadDir(d, spread, _d);
      const wh = G.world.raycast(o.x, o.y, o.z, _d.x, _d.y, _d.z, W.range);
      const wt = wh ? wh.t : W.range;
      const wc = wh ? wh.c : null;
      const wn = wh ? [wh.nx, wh.ny, wh.nz] : null;
      const ah = rayActors(G, o, _d, wt, a);
      if (ah) {
        const dmg = W.dmg * mul * falloff(W, ah.t) * (ah.head ? W.head : 1);
        const h = hits.get(ah.a) || { dmg: 0, head: false };
        h.dmg += dmg; h.head = h.head || ah.head;
        hits.set(ah.a, h);
        _e.copy(o).addScaledVector(_d, ah.t);
        G.fx.impact(_e, null, ah.head ? 0xffe066 : 0xffffff);
      } else if (wc) {
        _e.copy(o).addScaledVector(_d, wt);
        const pc = wc.owner;
        if (pc && pc.parts) G.pieces.damage(pc, W.struct * mul, a);
        G.fx.impact(_e, wn, wc.water ? 'water' : pc && pc.debris ? pc.debris : 0x8a8a80);
      } else _e.copy(o).addScaledVector(_d, W.range);
      G.fx.tracer(_m, _e, pellets > 1);
    }
    for (const [t, h] of hits) hurt(G, t, h.dmg, a, { head: h.head, weapon: W.name });
  }
  if (it.mag <= 0 && inv.ammo[W.ammo] > 0) startReload(G, a);
  return true;
}

function swing(G, a, o, d) {
  if (a.swingCd > 0) return false;
  a.swingCd = 0.6;
  a.swingT = 0.35;
  G.sfx.at('swing', a.pos, a.isPlayer ? 1 : 0.4);
  const reach = 3.3;
  const wh = G.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, reach, null, false);
  const wt = wh ? wh.t : reach;
  const wc = wh ? wh.c : null;
  const ah = rayActors(G, o, d, wt, a);
  if (ah) {
    hurt(G, ah.a, 20, a, { weapon: 'Spitzhacke' });
    _e.copy(o).addScaledVector(d, ah.t);
    G.fx.impact(_e, null, 0xffffff);
    return true;
  }
  if (wc) {
    _e.copy(o).addScaledVector(d, wt);
    const pc = wc.owner;
    if (pc && pc.parts) {
      if (pc.yieldMat && pc.yieldHit) {
        let n = pc.yieldHit + (pc.hp <= 50 ? pc.bonus : 0);
        n = Math.min(n, 999 - a.inv.mats[pc.yieldMat]);
        if (n > 0) {
          a.inv.mats[pc.yieldMat] += n;
          if (a.isPlayer) G.hud.matGain(pc.yieldMat, n);
        }
      }
      G.sfx.at('pick-' + pc.sound, _e, a.isPlayer ? 1 : 0.5);
      G.pieces.damage(pc, 50, a);
      G.fx.impact(_e, [wh.nx, wh.ny, wh.nz], pc.debris);
    } else {
      G.sfx.at('pick-stein', _e, a.isPlayer ? 0.7 : 0.3);
      G.fx.impact(_e, null, 0xaaaaaa);
    }
  }
  return true;
}

// Explosion (Rakete): Schaden an Figuren und Bauteilen
export function explode(G, pos, src, dmg, radius, struct) {
  G.fx.explosion(pos, radius);
  G.sfx.at('explosion', pos);
  for (const t of G.actors) {
    if (!t.alive || t.state === 'bus') continue;
    _e.set(t.pos.x, t.pos.y + 1, t.pos.z);
    const dd = _e.distanceTo(pos);
    if (dd < radius) hurt(G, t, dmg * (1 - (dd / radius) * 0.7), src, { weapon: 'Raketenwerfer' });
  }
  for (const pc of G.pieces.near(pos, radius)) {
    const dd = pc.center.distanceTo(pos);
    G.pieces.damage(pc, struct * Math.max(0.3, 1 - dd / (radius + 2) * 0.6), src);
  }
}

// ---------- Schaden und Ausscheiden ----------

export function hurt(G, t, amount, src, o = {}) {
  if (!t.alive || amount <= 0 || G.state === 'end') return;
  amount = Math.max(1, Math.round(amount));
  let sh = 0;
  if (!o.storm && !o.fall) { sh = Math.min(t.shield, amount); t.shield -= sh; }
  const hp = amount - sh;
  t.hp -= hp;
  t.flash = 0.12;
  t.lastHit = G.time;
  if (src && src !== t) t.lastAttacker = src;
  if (src && src === G.player && t !== G.player) {
    G.stats.dmg += amount;
    G.hud.damageNumber(t, amount, o.head, sh > 0 && hp === 0);
    G.hud.hitmarker(t.hp <= 0, o.head);
    G.sfx.play(o.head ? 'headshot' : 'hit');
  }
  if (t === G.player) G.hud.hurt(src && src !== t ? src.pos : null, !!o.storm);
  if (t.brain) t.brain.onHurt(src);
  if (t.hp <= 0) { t.hp = 0; kill(G, t, src, o); }
}

export function kill(G, t, src, o = {}) {
  if (t.vehicle) { t.vehicle.driver = null; t.vehicle = null; t.state = 'ground'; }
  t.alive = false;
  t.deadT = 0;
  t.vel.set(0, 0, 0);
  t.useT = 0; t.reloadT = 0;
  const items = [];
  for (const s of t.inv.slots) if (s) items.push(s);
  for (const k in t.inv.ammo) if (t.inv.ammo[k] > 0) items.push({ k: 'a', id: k, n: t.inv.ammo[k] });
  for (const k in t.inv.mats) if (t.inv.mats[k] > 0) items.push({ k: 'm', id: k, n: t.inv.mats[k] });
  G.loot.scatter(items, t.pos.x, t.pos.y, t.pos.z);
  t.inv = newInventory();
  G.fx.sparkle(_e.set(t.pos.x, t.pos.y + 1, t.pos.z), 0x7fd3ff, 45, 2);
  G.sfx.at('elim', t.pos);
  if (src && src !== t) src.kills++;
  G.onElimination(t, src, o);
}

// ---------- Bewegung ----------

function approach(v, tx, tz, acc) {
  const dx = tx - v.x, dz = tz - v.z, l = Math.hypot(dx, dz);
  if (l <= acc) { v.x = tx; v.z = tz; }
  else { v.x += (dx / l) * acc; v.z += (dz / l) * acc; }
}

// Fallschaden: ab ca. 4 m Fallhöhe (ein Stockwerk), ab ca. 20 m tödlich
export const FALL_SAFE = 13.5;
function fallDamage(G, a, v) {
  const dmg = Math.round((v - FALL_SAFE) * 5.4);
  if (dmg <= 0) return;
  G.sfx.at('fallhurt', a.pos, a.isPlayer ? 1 : 0.6);
  G.fx.debris(_e.set(a.pos.x, a.pos.y + 0.1, a.pos.z), 0x8a7a5a, 8);
  if (a.isPlayer) { G.hud.notice(`Fallschaden −${dmg}`, 'warn', 1.6); G.shake = Math.min(1, dmg / 40); }
  hurt(G, a, dmg, null, { fall: true, weapon: 'Sturz' });
}

// Ducken umschalten; beim Sprinten wird daraus eine Rutschpartie
export function crouchToggle(G, a, sprinting) {
  if (a.state !== 'ground' || a.swimming || !a.alive) return;
  const hs = Math.hypot(a.vel.x, a.vel.z);
  if (!a.crouch && sprinting && a.onGround && hs > 6) {
    a.slideT = SLIDE_T;
    a.slideDir.set(a.vel.x / hs, 0, a.vel.z / hs);
    a.crouch = true;
    G.sfx.at('slide', a.pos, a.isPlayer ? 1 : 0.5);
    return;
  }
  a.crouch = !a.crouch;
  if (!a.crouch) a.slideT = 0;
}

// ins Wasser gefallen/geglitten?
function hitWater(G, a) {
  const W = G.world;
  if (!W.terrain || a.pos.y > SWIM_Y + 0.05 || W.terrain(a.pos.x, a.pos.z) >= SWIM_Y) return false;
  a.state = 'ground';
  a.pos.y = SWIM_Y;
  a.vel.y = 0;
  a.swimming = true;
  splash(G, a);
  return true;
}

function splash(G, a) {
  _e.set(a.pos.x, WATER + 0.2, a.pos.z);
  G.fx.splash(_e);
  G.sfx.at('splash', _e, a.isPlayer ? 1 : 0.6);
}

// wx/wz: gewünschte Geschwindigkeit (m/s)
export function stepActor(G, a, wx, wz, jump, dt) {
  const W = G.world;
  if (!a.alive) return;
  if (a.state === 'bus') { G.seatPos(a, a.pos); a.vel.set(0, 0, 0); return; }
  if (a.state === 'car') { a.vel.set(0, 0, 0); return; }
  if (a.state === 'fall') {
    approach(a.vel, wx, wz, 22 * dt);
    const term = a.dive ? -44 : -26;
    moveChar(W, a, dt);
    if (a.vel.y < term) a.vel.y = lerp(a.vel.y, term, Math.min(1, dt * 4));
    if (hitWater(G, a)) return;
    const g = W.groundAt(a.pos.x, a.pos.z, 0.3, a.pos.y + 0.05, a.pos.y + 0.6);
    if (a.pos.y - Math.max(g, WATER) < 40 || a.deploy) { a.state = 'glide'; a.deploy = false; G.sfx.at('glider', a.pos, a.isPlayer ? 1 : 0.3); }
    if (a.onGround) a.state = 'ground';
    return;
  }
  if (a.state === 'glide') {
    approach(a.vel, wx, wz, 9 * dt);
    a.vel.y = lerp(a.vel.y, -6.5, Math.min(1, dt * 3));
    moveChar(W, a, dt, 0);
    if (hitWater(G, a)) return;
    if (a.onGround) { a.state = 'ground'; a.vel.y = 0; G.sfx.at('land', a.pos, a.isPlayer ? 1 : 0.3); }
    return;
  }
  // Ducken: niedrigere Figur (Aufstehen nur mit Platz über dem Kopf)
  const wantH = a.low ? 1.25 : 1.8;
  if (a.h !== wantH) {
    if (wantH > a.h && !W.free(a.pos.x, a.pos.y, a.pos.z, a.r * 0.9, 1.8)) a.crouch = true;
    else a.h = wantH;
  }
  if (a.slideT > 0) {
    a.slideT -= dt;
    const k = Math.max(0, a.slideT / SLIDE_T);
    const sp = 3.2 + 8.3 * k;
    wx = a.slideDir.x * sp; wz = a.slideDir.z * sp;
    if (a.blocked) a.slideT = 0;
  }
  if (a.swimming) {
    const l = Math.hypot(wx, wz);
    if (l > 3.6) { wx *= 3.6 / l; wz *= 3.6 / l; }
    jump = false;
  } else if (a.wading) { wx *= 0.72; wz *= 0.72; }
  approach(a.vel, wx, wz, (a.onGround || a.swimming ? (a.slideT > 0 ? 30 : 70) : 14) * dt);
  if (jump && a.onGround) {
    a.vel.y = 8.2; a.onGround = false;
    a.crouch = false; a.slideT = 0;
    if (a.isPlayer) G.sfx.play('jump');
  }
  moveChar(W, a, dt);
  // Wasser: schwimmen im Tiefen, waten im Flachen
  const wasSwim = a.swimming;
  a.swimming = false; a.wading = false;
  if (W.terrain && a.pos.y < WATER + 0.05) {
    const th = W.terrain(a.pos.x, a.pos.z);
    if (th < SWIM_Y && a.pos.y <= SWIM_Y + 0.02) {
      a.swimming = true;
      if (a.pos.y < SWIM_Y) { a.pos.y = SWIM_Y; if (a.vel.y < 0) a.vel.y = 0; }
      a.onGround = false;
      a.landSpeed = 0;
      a.crouch = false; a.slideT = 0;
      if (!wasSwim && a.vel.y < -4) splash(G, a);
    } else if (th < WATER) a.wading = a.pos.y < WATER - 0.2;
  }
  if (a.landSpeed > 11) a.landT = Math.min(0.35, (a.landSpeed - 8) * 0.03);   // in die Knie gehen
  if (a.landSpeed > FALL_SAFE) fallDamage(G, a, a.landSpeed);
  else if (a.landSpeed > 9 && a.isPlayer) G.sfx.play('land');
  // Schritte (geduckt lautlos)
  const hs = Math.hypot(a.vel.x, a.vel.z);
  if ((a.onGround || a.swimming) && hs > 1.2 && a.slideT <= 0) {
    a.stepT -= dt * hs / (a.swimming ? 1.6 : 2.3);
    if (a.stepT <= 0) {
      a.stepT = 1;
      if (!a.crouch) G.sfx.step(a, hs);
    }
  }
}

// ---------- Animation ----------

export function animate(G, a, dt) {
  const m = a.model;
  m.root.position.copy(a.pos);
  m.root.rotation.y = a.state === 'bus' ? G.bus.yaw : a.state === 'car' && a.vehicle ? a.vehicle.yaw : a.yaw;
  if (!a.alive) {
    a.deadT += dt;
    m.root.rotation.x = Math.min(1.45, a.deadT * 4);
    m.kneeL.rotation.x = m.kneeR.rotation.x = -0.4;
    if (a.deadT > 1.2) m.root.position.y -= (a.deadT - 1.2) * 0.8;
    m.root.visible = a.deadT < 2.2;
    m.root.scale.setScalar(1);
    return;
  }
  m.root.visible = !(a.isPlayer && G.hidePlayer);
  m.root.rotation.x = 0;
  m.root.scale.setScalar(a.state === 'bus' ? 0.86 : a.state === 'car' ? 0.9 : 1);
  m.glider.visible = a.state === 'glide';
  const it = current(a.inv);
  // gehaltener Gegenstand
  const heldKey = it === 'pickaxe' ? 'pick' : it ? (it.k + it.id + (it.r ?? '')) : 'none';
  if (heldKey !== a.held) {
    a.held = heldKey;
    if (it && it !== 'pickaxe') m.weapon.geometry = it.k === 'w' ? weaponGeo(it.id, it.r) : healGeo(it.id);
  }
  m.pick.visible = it === 'pickaxe';
  m.holder.visible = !!it && it !== 'pickaxe';
  m.aim.rotation.set(0, 0, 0);
  m.head.rotation.set(0, 0, 0);
  const hs = Math.hypot(a.vel.x, a.vel.z);
  const k = 1 - Math.exp(-dt * 14);
  const bodyTo = (y, rx) => { m.body.position.y += (y - m.body.position.y) * k; m.body.rotation.x += (rx - m.body.rotation.x) * k; };
  // Beine: Oberschenkel (positiv = nach vorn) und Knie (negativ = beugen)
  const legs = (tl, kl, tr, kr, sl = 0, sr = 0) => {
    m.legL.rotation.set(tl, 0, sl); m.kneeL.rotation.x = kl;
    m.legR.rotation.set(tr, 0, sr); m.kneeR.rotation.x = kr;
  };
  // Arme: Schulter (Euler) und Ellbogen (positiv = beugen)
  const arms = (xl, zl, el, xr, zr, er) => {
    m.armL.rotation.set(xl, 0, zl); m.elbowL.rotation.x = el;
    m.armR.rotation.set(xr, 0, zr); m.elbowR.rotation.x = er;
  };
  const noItem = () => { m.holder.visible = false; m.pick.visible = false; };
  if (a.state === 'car') {
    // am Steuer: Hände am Lenkrad
    m.body.position.y = -0.44; m.body.rotation.x = 0.08;
    legs(1.4, -1.25, 1.4, -1.35, 0.08, -0.08);
    const st = a.vehicle ? a.vehicle.steer * 0.35 : 0;
    arms(1.05 + st, 0.18, 0.55, 1.05 - st, -0.18, 0.55);
    noItem();
    return;
  }
  if (a.state === 'bus') {
    // sitzen, Hände auf den Oberschenkeln
    m.body.position.y = -0.44; m.body.rotation.x = 0.05;
    legs(1.45, -1.45, 1.45, -1.45, 0.06, -0.06);
    arms(0.35, 0.1, 0.9, 0.35, -0.1, 0.9);
    m.head.rotation.x = a.pitch * 0.3;
    noItem();
    return;
  }
  if (a.state === 'fall') {
    // Fallschirmspringer-Haltung: Bauch nach unten, Arme und Beine gespreizt
    bodyTo(0, -1.25);
    const fl = Math.sin(G.time * 9) * 0.06;
    arms(0.4, 1.25 + fl, 1.2, 0.4, -1.25 - fl, 1.2);
    legs(-0.15, -0.9, -0.15, -0.9, 0.3, -0.3);
    m.head.rotation.x = 0.9;
    noItem();
    return;
  }
  if (a.state === 'glide') {
    bodyTo(0, 0);
    arms(Math.PI - 0.2, -0.25, 0.25, Math.PI - 0.2, 0.25, 0.25);
    legs(0.3, -0.35, -0.05, -0.15);
    noItem();
    return;
  }
  if (a.swimming) {
    // Kraulen an der Wasseroberfläche
    m.root.position.y = WATER - 0.55;
    bodyTo(0.05, -1.3);
    const t = G.time * 5;
    arms(Math.PI + Math.sin(t) * 1.4, 0.1, 0.25 + Math.max(0, Math.cos(t)) * 0.6, Math.PI - Math.sin(t) * 1.4, -0.1, 0.25 + Math.max(0, -Math.cos(t)) * 0.6);
    legs(Math.sin(t * 2) * 0.3, -0.25, -Math.sin(t * 2) * 0.3, -0.25);
    m.head.rotation.x = 0.9;
    noItem();
    return;
  }
  a.walk += hs * dt * (a.crouch ? 2.6 : 1.9);
  const amp = Math.min(1, hs / (a.crouch ? 2.5 : 5));
  const sw = Math.sin(a.walk) * amp * 0.7;
  // Knie beugt sich, während das Bein nach vorn schwingt
  const kn = ph => -(0.08 + Math.max(0, Math.cos(ph)) * amp * (hs > 7 ? 1.5 : 1.05));
  if (a.slideT > 0) {
    // Rutschen: zurückgelehnt, ein Bein gestreckt, eins angewinkelt
    bodyTo(-0.5, 0.5);
    legs(0.95, -0.2, 0.55, -1.25, 0.1, -0.12);
  } else if (a.landT > 0) {
    // harte Landung: kurz in die Knie
    a.landT -= dt;
    bodyTo(-0.32, -0.25);
    legs(1.0, -1.7, 0.85, -1.5);
  } else if (a.crouch) {
    bodyTo(-0.3, -0.18);
    legs(0.95 + sw * 0.4, -1.6 + Math.max(0, sw) * 0.4, 0.95 - sw * 0.4, -1.6 + Math.max(0, -sw) * 0.4);
  } else {
    bodyTo(0, hs > 7 ? -0.14 : -0.02);
    if (a.onGround) legs(sw, kn(a.walk), -sw, kn(a.walk + Math.PI));
    else legs(0.75, -1.1, -0.15, -0.35);
  }
  m.head.rotation.x = a.pitch * 0.5;
  if (it && it !== 'pickaxe' && it.k === 'w') {
    // Waffe im Anschlag: Zielachse folgt dem Blick, Hände per IK an Griff und Handschutz
    const H = HOLD[it.id] || HOLD.sturmgewehr;
    const kick = a.shotT * 1.2, back = a.shotT * 0.5;
    m.aim.rotation.x = a.pitch + kick;
    m.head.rotation.x = a.pitch * 0.25;
    m.holder.position.set(H.p[0], H.p[1], H.p[2] + back);
    m.holder.rotation.set(0, 0, 0);
    handTo(m, 1, H.r[0], H.r[1], H.r[2] + back);
    if (a.reloadT > 0) {
      // nachladen: Waffe gekippt, linke Hand am Magazin
      m.holder.rotation.x = -0.45;
      handTo(m, -1, H.p[0] - 0.02, H.p[1] - 0.2, H.p[2] - 0.05 + Math.sin(G.time * 10) * 0.04);
    } else handTo(m, -1, H.l[0], H.l[1], H.l[2] + back);
  } else if (it === 'pickaxe') {
    m.armL.rotation.set(-sw * 0.8, 0, 0.08); m.elbowL.rotation.x = 0.25 + Math.max(0, -sw) * 0.4;
    if (a.swingT > 0) {
      const s = 1 - a.swingT / 0.35;
      const ang = s < 0.35 ? lerp(0.7, 2.6, s / 0.35) : lerp(2.6, 0.2, (s - 0.35) / 0.65);
      m.armR.rotation.set(ang + a.pitch * 0.6, 0, -0.1);
      m.elbowR.rotation.x = s < 0.35 ? 0.9 : 0.2;
    } else { m.armR.rotation.set(0.35 + sw * 0.25, 0, -0.08); m.elbowR.rotation.x = 0.45; }
  } else if (it) {
    // Heilung vor der Brust, beide Hände dran
    const bob = a.useT > 0 ? Math.sin(G.time * 12) * 0.04 : 0;
    m.holder.rotation.set(0, 0, 0);
    m.holder.position.set(0.04, -0.27 + bob, -0.36);
    handTo(m, 1, 0.13, -0.29 + bob, -0.34);
    handTo(m, -1, -0.05, -0.29 - bob, -0.34);
  } else {
    arms(-sw, 0.08, 0.2 + Math.max(0, -sw) * 0.5, sw, -0.08, 0.2 + Math.max(0, sw) * 0.5);
  }
}
