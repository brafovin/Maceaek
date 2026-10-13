// Zerstörbare Teile: Bauteile der Spieler, Hauswände, Bäume, Steine, Mülltonnen, Ampeln …
// Alles wird über Instanz-Pools gezeichnet; jedes Teil hat Lebenspunkte und Kollisionsboxen.

import * as THREE from '../vendor/three.module.js';
import { InstPool, merge, mat4, boxAt } from './geo.js';
import { GRID, HALF } from './util.js';

export const BUILD_MATS = {
  holz:   { name: 'Holz',   hp: 200, tex: 'buildWood',  debris: 0xb07a45 },
  stein:  { name: 'Stein',  hp: 320, tex: 'buildStone', debris: 0x9a958c },
  metall: { name: 'Metall', hp: 480, tex: 'buildMetal', debris: 0xaab6bd },
};
export const MAT_ORDER = ['holz', 'stein', 'metall'];
export const KIND_LABEL = { wall: 'Wand', floor: 'Boden', ramp: 'Rampe' };
export const BUILD_COST = 10;

// Richtungen: 0 = +x, 1 = −x, 2 = +z, 3 = −z
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const DIR_YAW = [Math.PI / 2, -Math.PI / 2, 0, Math.PI];

// Hausstile (Fassade außen, Tapete innen)
export const STYLES = {
  brick:   { ext: 'brick',   win: 'brickWin',   int: 'wallpaper', edge: 0xb39a80, mat: 'stein',  hp: 300, name: 'Ziegelwand',  floorTex: 'woodFloor' },
  plaster: { ext: 'plaster', win: 'plasterWin', int: 'wallpaper', edge: 0xe4ddd0, mat: 'stein',  hp: 250, name: 'Hauswand',    floorTex: 'woodFloor' },
  wood:    { ext: 'wood',    win: 'woodWin',    int: 'woodFloor', edge: 0x6d4a2c, mat: 'holz',   hp: 220, name: 'Holzwand',    floorTex: 'woodFloor' },
  office:  { ext: 'office',  win: 'officeWin',  int: 'wallpaper', edge: 0x8f989f, mat: 'metall', hp: 350, name: 'Bürowand',    floorTex: 'tiles' },
  church:  { ext: 'church',  win: 'churchWinHigh', low: 'churchWinLow', int: 'church', edge: 0xcfc3a5, mat: 'stein', hp: 420, name: 'Kirchenmauer', floorTex: 'tiles' },
};

const T = 0.25; // Wanddicke

function doorParts(hw, hh) {
  return [
    [-2, 0, -T / 2, -hw, 4, T / 2],
    [hw, 0, -T / 2, 2, 4, T / 2],
    [-hw, hh, -T / 2, hw, 4, T / 2],
  ];
}
const WALL_BOXES = {
  solid: [[-2, 0, -T / 2, 2, 4, T / 2]],
  door: doorParts(0.8, 2.6),
  bigdoor: doorParts(1.2, 3.2),
};

function wallGeo(variant) {
  if (variant === 'door' || variant === 'bigdoor') {
    return merge(WALL_BOXES[variant].map(b => ({
      geo: boxAt(b[3] - b[0], b[4] - b[1], b[5] - b[2], (b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2),
    })), { planar: 4, half: 2 });
  }
  return boxAt(4, 4, T, 0, 2, 0);
}

// lokale Box bei Drehung um Vielfache von 90° in Weltkoordinaten
export function rotBox(b, yaw, ox, oy, oz) {
  const q = Math.round(yaw / (Math.PI / 2)) & 3;
  const [x0, y0, z0, x1, y1, z1] = b;
  if (q === 0) return [ox + x0, oy + y0, oz + z0, ox + x1, oy + y1, oz + z1];
  if (q === 1) return [ox + z0, oy + y0, oz - x1, ox + z1, oy + y1, oz - x0];
  if (q === 2) return [ox - x1, oy + y0, oz - z1, ox - x0, oy + y1, oz - z0];
  return [ox - z1, oy + y0, oz + x0, ox - z0, oy + y1, oz + x1];
}

const _m = new THREE.Matrix4(), _r = new THREE.Matrix4();
let nextId = 1;

export class Pieces {
  constructor(G) {
    this.G = G;
    this.group = new THREE.Group();
    G.scene.add(this.group);
    this.pools = new Map();
    this.byKey = new Map();
    this.all = new Set();
    this.anim = new Set();
    this.mats = {};
    this._makeGhosts();
  }

  // ---------- Pools ----------

  pool(name, make) {
    let p = this.pools.get(name);
    if (!p) {
      const { geo, mat, cap = 400, shadow = true, receive = true } = make();
      p = new InstPool(this.group, geo, mat, cap, { shadow, receive });
      this.pools.set(name, p);
    }
    return p;
  }

  _std(key, opts) {
    if (!this.mats[key]) this.mats[key] = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...opts });
    return this.mats[key];
  }

  buildPool(kind, mat) {
    const tex = this.G.tex[BUILD_MATS[mat].tex];
    return this.pool(`b-${kind}-${mat}`, () => {
      const m = this._std('b-' + mat, { map: tex, metalness: mat === 'metall' ? 0.35 : 0, roughness: mat === 'metall' ? 0.55 : 0.85 });
      let geo;
      if (kind === 'wall') geo = boxAt(4, 4, T, 0, 2, 0);
      else if (kind === 'floor') geo = boxAt(4, 0.2, 4, 0, 0.1, 0);
      else geo = rampGeo();
      return { geo, mat: m, cap: 600 };
    });
  }

  cityWallPool(style, variant) {
    const S = STYLES[style], tx = this.G.tex;
    return this.pool(`c-wall-${style}-${variant}`, () => {
      const edge = this._std('edge-' + style, { color: S.edge });
      const extTex = variant === 'window' ? tx[S.win] : variant === 'winlow' ? tx[S.low] : tx[S.ext];
      const ext = this._std(`ext-${style}-${variant}`, { map: extTex });
      const int = this._std(`int-${style}`, { map: tx[S.int] });
      const geoV = variant === 'door' || variant === 'bigdoor' ? variant : 'solid';
      return { geo: wallGeo(geoV), mat: [edge, edge, edge, edge, ext, int], cap: 360 };
    });
  }

  cityFloorPool(style, roof) {
    const S = STYLES[style], tx = this.G.tex;
    return this.pool(`c-floor-${style}-${roof ? 'r' : 'f'}`, () => {
      const edge = this._std('edge-' + style, { color: S.edge });
      const top = roof ? this._std('roof-gravel', { map: tx.roofGravel }) : this._std('floor-' + S.floorTex, { map: tx[S.floorTex] });
      const bottom = this._std('ceiling', { map: tx.ceiling });
      return { geo: boxAt(4, 0.2, 4, 0, 0.1, 0), mat: [edge, edge, top, bottom, edge, edge], cap: 400 };
    });
  }

  stairPool() {
    return this.pool('c-ramp', () => ({ geo: rampGeo(), mat: this._std('stairs', { map: this.G.tex.stairs }), cap: 80 }));
  }

  reset() {
    for (const p of this.pools.values()) p.reset();
    this.byKey.clear();
    this.all.clear();
    this.anim.clear();
    this.hideGhost();
  }

  // ---------- Teile anlegen ----------
  // spec: { key, kind, name, hp, yieldMat, yieldHit, parts:[{pool, m, color}], boxes:[[...]], slopes:[[...]], center, built, owner, nature }
  create(spec) {
    const W = this.G.world;
    const pc = {
      id: nextId++, key: spec.key || null, kind: spec.kind, name: spec.name, hp: spec.hp, maxHp: spec.hp,
      yieldMat: spec.yieldMat || null, yieldHit: spec.yieldHit || 0, bonus: spec.bonus || 0,
      parts: [], colliders: [], center: spec.center, built: !!spec.built, owner: spec.owner || null,
      nature: !!spec.nature, dead: false, flash: 0, wobble: 0, grow: spec.grow ? 0 : 1, debris: spec.debris ?? 0x999999,
      sound: spec.sound || 'stein', onDestroy: spec.onDestroy || null,
    };
    for (const p of spec.parts) {
      const color = Array.isArray(p.color) ? new THREE.Color().setRGB(p.color[0], p.color[1], p.color[2]) : new THREE.Color(p.color ?? 0xffffff);
      const m = p.m.clone();
      const idx = p.pool.add(pc.grow < 1 ? growMatrix(m, 0.05) : m, color);
      pc.parts.push({ pool: p.pool, idx, m, color });
    }
    for (const b of spec.boxes || []) pc.colliders.push(W.box(b[0], b[1], b[2], b[3], b[4], b[5], pc));
    for (const s of spec.slopes || []) pc.colliders.push(W.slope(s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], pc));
    if (pc.key) this.byKey.set(pc.key, pc);
    this.all.add(pc);
    if (pc.grow < 1) this.anim.add(pc);
    return pc;
  }

  // ---------- Gitter-Bauteile ----------

  static wallKey(axis, i, j, k) { return `w${axis}${i},${j},${k}`; }
  static floorKey(i, j, k) { return `f${i},${j},${k}`; }
  static rampKey(i, j, k) { return `r${i},${j},${k}`; }

  // Wand entlang x (axis 'x', bei z = 4k) oder entlang z (axis 'z', bei x = 4i)
  addWall(o) {
    const { axis, i, j, k } = o;
    const ox = axis === 'x' ? i * GRID + 2 : i * GRID, oz = axis === 'x' ? k * GRID : k * GRID + 2, oy = j * GRID;
    const yaw = o.yaw ?? (axis === 'x' ? 0 : Math.PI / 2);
    const variant = o.variant || 'solid';
    const boxes = (WALL_BOXES[variant] || WALL_BOXES.solid).map(b => rotBox(b, yaw, ox, oy, oz));
    return this.create({
      key: Pieces.wallKey(axis, i, j, k), kind: 'wall', name: o.name, hp: o.hp, yieldMat: o.yieldMat, yieldHit: o.yieldHit,
      parts: [{ pool: o.pool, m: mat4(ox, oy, oz, yaw), color: o.color }], boxes,
      center: new THREE.Vector3(ox, oy + 2, oz), built: o.built, owner: o.owner, grow: o.built, debris: o.debris, sound: o.sound,
    });
  }

  addFloor(o) {
    const { i, j, k } = o;
    const ox = i * GRID + 2, oy = j * GRID, oz = k * GRID + 2;
    return this.create({
      key: Pieces.floorKey(i, j, k), kind: 'floor', name: o.name, hp: o.hp, yieldMat: o.yieldMat, yieldHit: o.yieldHit,
      parts: [{ pool: o.pool, m: mat4(ox, oy, oz), color: o.color }],
      boxes: [[ox - 2, oy, oz - 2, ox + 2, oy + 0.2, oz + 2]],
      center: new THREE.Vector3(ox, oy + 0.1, oz), built: o.built, owner: o.owner, grow: o.built, debris: o.debris, sound: o.sound,
    });
  }

  addRamp(o) {
    const { i, j, k, dir } = o;
    const ox = i * GRID + 2, oy = j * GRID + 2, oz = k * GRID + 2;
    const axis = dir < 2 ? 0 : 2, sgn = dir % 2 === 0 ? 1 : -1;
    return this.create({
      key: Pieces.rampKey(i, j, k), kind: 'ramp', name: o.name, hp: o.hp, yieldMat: o.yieldMat, yieldHit: o.yieldHit,
      parts: [{ pool: o.pool, m: mat4(ox, oy, oz, DIR_YAW[dir]), color: o.color }],
      slopes: [[i * GRID, k * GRID, i * GRID + GRID, k * GRID + GRID, j * GRID, GRID, axis, sgn]],
      center: new THREE.Vector3(ox, oy, oz), built: o.built, owner: o.owner, grow: o.built, debris: o.debris, sound: o.sound,
    });
  }

  // ---------- Schaden ----------

  damage(pc, amount, src) {
    if (pc.dead || amount <= 0) return;
    pc.hp -= amount;
    pc.flash = 0.09;
    if (pc.nature) pc.wobble = 0.35;
    this.anim.add(pc);
    this._tint(pc, 1.7);
    if (src && src === this.G.player) this.G.hud.pieceHp(pc);
    if (pc.hp <= 0) this.destroy(pc, src);
  }

  _tint(pc, f) {
    const k = pc.built || pc.nature ? 1 : 0.55 + 0.45 * Math.max(0, pc.hp / pc.maxHp);
    for (const p of pc.parts) p.pool.setColor(p.idx, [p.color.r * f * k, p.color.g * f * k, p.color.b * f * k]);
  }

  destroy(pc, src) {
    if (pc.dead) return;
    pc.dead = true;
    for (const p of pc.parts) p.pool.remove(p.idx);
    for (const c of pc.colliders) this.G.world.remove(c);
    if (pc.key && this.byKey.get(pc.key) === pc) this.byKey.delete(pc.key);
    this.all.delete(pc);
    this.anim.delete(pc);
    this.G.fx.debris(pc.center, pc.debris, pc.kind === 'wall' || pc.kind === 'floor' || pc.kind === 'ramp' ? 26 : 18);
    this.G.sfx.at('break-' + pc.sound, pc.center);
    if (pc.onDestroy) pc.onDestroy(pc);
  }

  update(dt) {
    for (const pc of this.anim) {
      let busy = false;
      if (pc.grow < 1) {
        pc.grow = Math.min(1, pc.grow + dt / 0.2);
        for (const p of pc.parts) p.pool.setMatrix(p.idx, growMatrix(p.m, pc.grow));
        busy = pc.grow < 1;
      }
      if (pc.flash > 0) {
        pc.flash -= dt;
        if (pc.flash <= 0) this._tint(pc, 1); else busy = true;
      }
      if (pc.wobble > 0) {
        pc.wobble = Math.max(0, pc.wobble - dt);
        const a = Math.sin(pc.wobble * 45) * pc.wobble * 0.12;
        _r.makeRotationZ(a);
        for (const p of pc.parts) p.pool.setMatrix(p.idx, _m.copy(p.m).multiply(_r));
        busy = busy || pc.wobble > 0;
      }
      if (!busy) this.anim.delete(pc);
    }
  }

  // Teile in der Nähe eines Punktes (für Explosionen)
  near(pos, r) {
    const out = [];
    const seen = new Set();
    for (const c of this.G.world.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r, [])) {
      const pc = c.owner;
      if (!pc || !pc.parts || seen.has(pc)) continue;
      seen.add(pc);
      if (pc.center.distanceTo(pos) < r + 2) out.push(pc);
    }
    return out;
  }

  // ---------- Bauen ----------

  // Zielzelle für ein Bauteil vor der Figur
  target(a, kind, yaw, pitch) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const dir = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 0 : 1) : (fz > 0 ? 2 : 3);
    const [dx, dz] = DIRS[dir];
    const p = a.pos;
    const ci = Math.floor(p.x / GRID), ck = Math.floor(p.z / GRID);
    const jf = Math.max(0, Math.floor((p.y + 0.3) / GRID));
    const t = { kind, dir, i: ci, j: jf, k: ck, axis: null, key: '' };
    if (kind === 'wall') {
      t.j = jf + (pitch > 0.6 ? 1 : 0);
      if (dir === 0) { t.axis = 'z'; t.i = ci + 1; }
      else if (dir === 1) { t.axis = 'z'; t.i = ci; }
      else if (dir === 2) { t.axis = 'x'; t.k = ck + 1; }
      else { t.axis = 'x'; t.k = ck; }
      t.key = Pieces.wallKey(t.axis, t.i, t.j, t.k);
    } else if (kind === 'floor') {
      if (pitch < -0.55) { /* unter den Füßen */ }
      else if (pitch > 0.75) t.j = jf + 1;
      else { t.i = ci + dx; t.k = ck + dz; }
      t.key = Pieces.floorKey(t.i, t.j, t.k);
    } else {
      const lx = p.x + dx * 2, lz = p.z + dz * 2;
      t.i = Math.floor(lx / GRID); t.k = Math.floor(lz / GRID);
      t.j = Math.max(0, Math.floor((p.y + 2) / GRID));
      t.key = Pieces.rampKey(t.i, t.j, t.k);
    }
    const cx = t.i * GRID + 2, cz = t.k * GRID + 2;
    t.inside = Math.abs(cx) < HALF - 4 && Math.abs(cz) < HALF - 4 && t.j <= 14;
    t.free = !this.byKey.has(t.key);
    return t;
  }

  canBuild(a, t, mat) {
    return t.inside && t.free && a.inv.mats[mat] >= BUILD_COST;
  }

  // baut am Ziel (Material wird abgezogen); liefert das Teil oder null
  build(a, t, mat) {
    if (!this.canBuild(a, t, mat)) return null;
    a.inv.mats[mat] -= BUILD_COST;
    const M = BUILD_MATS[mat];
    const o = {
      i: t.i, j: t.j, k: t.k, axis: t.axis, dir: t.dir, hp: M.hp, name: M.name + KIND_LABEL[t.kind].toLowerCase(),
      pool: this.buildPool(t.kind, mat), built: true, owner: a, debris: M.debris, sound: mat,
    };
    const pc = t.kind === 'wall' ? this.addWall(o) : t.kind === 'floor' ? this.addFloor(o) : this.addRamp(o);
    this.G.sfx.at('build', pc.center);
    return pc;
  }

  // ---------- Vorschau (Geist) ----------

  _makeGhosts() {
    const mk = geo => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0.32, depthWrite: false }));
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.9 }));
      m.add(e);
      m.visible = false;
      m.renderOrder = 5;
      this.G.scene.add(m);
      return m;
    };
    this.ghosts = { wall: mk(boxAt(4, 4, T, 0, 2, 0)), floor: mk(boxAt(4, 0.2, 4, 0, 0.1, 0)), ramp: mk(rampGeo()) };
  }

  showGhost(t, ok) {
    for (const k in this.ghosts) this.ghosts[k].visible = k === t.kind;
    const g = this.ghosts[t.kind];
    if (t.kind === 'wall') {
      if (t.axis === 'x') { g.position.set(t.i * GRID + 2, t.j * GRID, t.k * GRID); g.rotation.set(0, 0, 0); }
      else { g.position.set(t.i * GRID, t.j * GRID, t.k * GRID + 2); g.rotation.set(0, Math.PI / 2, 0); }
    } else if (t.kind === 'floor') { g.position.set(t.i * GRID + 2, t.j * GRID, t.k * GRID + 2); g.rotation.set(0, 0, 0); }
    else { g.position.set(t.i * GRID + 2, t.j * GRID + 2, t.k * GRID + 2); g.rotation.set(0, DIR_YAW[t.dir], 0); }
    const col = ok ? 0x4fc3ff : 0xff4a4a;
    g.material.color.setHex(col);
    g.children[0].material.color.setHex(ok ? 0xbfe9ff : 0xffb0b0);
  }

  hideGhost() { if (this.ghosts) for (const k in this.ghosts) this.ghosts[k].visible = false; }
}

// Rampe: Platte, die in lokaler +z-Richtung von y = −2 auf +2 steigt (Ursprung in der Zellmitte)
export function rampGeo() {
  return new THREE.BoxGeometry(4, 0.25, 4 * Math.SQRT2).translate(0, -0.125, 0).rotateX(-Math.PI / 4);
}

const _gm = new THREE.Matrix4(), _gs = new THREE.Matrix4();
function growMatrix(m, s) {
  const e = 0.3 + 0.7 * s * s * (3 - 2 * s);
  return _gm.copy(m).multiply(_gs.makeScale(1, e, 1));
}
