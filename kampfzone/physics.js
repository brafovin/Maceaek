// Kollisionswelt: achsenparallele Boxen und Schrägen (Rampen, Dächer) in einem 2D-Raster.
// Dazu: Bewegung von Figuren (Stufen, Rampen, Decken) und Strahltests für Schüsse.

import { GRAV } from './util.js';

const CS = 8;                 // Rastergröße (m)
const N = 72;                 // Zellen pro Achse
const OFF = (N * CS) / 2;     // Raster deckt -288..288 ab
const SLAB = 0.3;             // Dicke einer Schräge
export const STEP = 0.8;      // maximale Stufenhöhe
const SNAP = 0.55;            // „am Boden kleben“ beim Hinabgehen

export const GROUND = { ground: true };

export class World {
  constructor() {
    this.cells = Array.from({ length: N * N }, () => []);
    this.stamp = 1;
    this.tmp = [];
    this.tmp2 = [];
    this.hit = { t: 0, c: null, nx: 0, ny: 0, nz: 0, x: 0, y: 0, z: 0 };
  }

  clear() { for (const c of this.cells) c.length = 0; }

  _range(minx, minz, maxx, maxz) {
    const i0 = Math.max(0, Math.floor((minx + OFF) / CS)), i1 = Math.min(N - 1, Math.floor((maxx + OFF) / CS));
    const k0 = Math.max(0, Math.floor((minz + OFF) / CS)), k1 = Math.min(N - 1, Math.floor((maxz + OFF) / CS));
    return [i0, i1, k0, k1];
  }

  _add(c) {
    const [i0, i1, k0, k1] = this._range(c.minx, c.minz, c.maxx, c.maxz);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) this.cells[i * N + k].push(c);
    c.stamp = 0;
    return c;
  }

  remove(c) {
    if (c.dead) return;
    c.dead = true;
    const [i0, i1, k0, k1] = this._range(c.minx, c.minz, c.maxx, c.maxz);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
      const arr = this.cells[i * N + k], j = arr.indexOf(c);
      if (j >= 0) arr.splice(j, 1);
    }
  }

  box(minx, miny, minz, maxx, maxy, maxz, owner = null) {
    return this._add({ t: 0, minx, miny, minz, maxx, maxy, maxz, owner });
  }

  // Schräge über dem Rechteck; steigt entlang axis (0 = x, 2 = z) in Richtung dir (+1/-1) von y0 um rise
  slope(minx, minz, maxx, maxz, y0, rise, axis, dir, owner = null) {
    const c = { t: 1, minx, minz, maxx, maxz, miny: y0 - SLAB, maxy: y0 + rise, y0, rise, axis, dir, owner };
    const L = axis === 0 ? maxx - minx : maxz - minz;
    c.k = (rise / L) * dir;
    c.base = dir > 0 ? (axis === 0 ? minx : minz) : (axis === 0 ? maxx : maxz);
    return this._add(c);
  }

  slopeH(c, x, z) { return c.y0 + c.k * ((c.axis === 0 ? x : z) - c.base); }

  query(minx, minz, maxx, maxz, out = this.tmp) {
    out.length = 0;
    const st = ++this.stamp;
    const [i0, i1, k0, k1] = this._range(minx, minz, maxx, maxz);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
      for (const c of this.cells[i * N + k]) {
        if (c.stamp === st) continue;
        c.stamp = st;
        if (c.maxx < minx || c.minx > maxx || c.maxz < minz || c.minz > maxz) continue;
        out.push(c);
      }
    }
    return out;
  }

  // höchste tragende Fläche unter dem Fuß (Boxen bis maxBox, Schrägen bis maxSlope)
  groundAt(x, z, r, maxBox, maxSlope) {
    let g = 0;
    for (const c of this.query(x - r, z - r, x + r, z + r)) {
      if (c.t === 0) {
        if (c.maxy <= maxBox && c.maxy > g && x + r > c.minx && x - r < c.maxx && z + r > c.minz && z - r < c.maxz) g = c.maxy;
      } else if (x >= c.minx && x <= c.maxx && z >= c.minz && z <= c.maxz) {
        const s = this.slopeH(c, x, z);
        if (s <= maxSlope && s > g) g = s;
      }
    }
    return g;
  }

  ceilAt(x, z, r, minY) {
    let m = Infinity;
    for (const c of this.query(x - r, z - r, x + r, z + r)) {
      if (c.t === 0) {
        if (c.miny >= minY && c.miny < m && x + r > c.minx && x - r < c.maxx && z + r > c.minz && z - r < c.maxz) m = c.miny;
      } else if (x >= c.minx && x <= c.maxx && z >= c.minz && z <= c.maxz) {
        const s = this.slopeH(c, x, z) - SLAB;
        if (s >= minY && s < m) m = s;
      }
    }
    return m;
  }

  // ist der Zylinderraum frei? (nur Boxen)
  free(x, y, z, r, h) {
    for (const c of this.query(x - r, z - r, x + r, z + r, this.tmp2)) {
      if (c.t !== 0) continue;
      if (x + r > c.minx && x - r < c.maxx && z + r > c.minz && z - r < c.maxz && c.maxy > y + 0.02 && c.miny < y + h) return false;
    }
    return true;
  }

  // Strahl (Richtung normiert). skip: Funktion(collider) → true = ignorieren. Liefert this.hit oder null.
  raycast(ox, oy, oz, dx, dy, dz, maxT, skip = null, withGround = true) {
    const st = ++this.stamp;
    let best = maxT, bc = null, bnx = 0, bny = 0, bnz = 0;
    if (withGround && dy < -1e-9) {
      const t = -oy / dy;
      if (t >= 0 && t < best) { best = t; bc = GROUND; bnx = 0; bny = 1; bnz = 0; }
    }
    let gx = Math.floor((ox + OFF) / CS), gz = Math.floor((oz + OFF) / CS);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const adx = Math.abs(dx), adz = Math.abs(dz);
    const ddx = adx > 1e-9 ? CS / adx : Infinity, ddz = adz > 1e-9 ? CS / adz : Infinity;
    let tx = adx > 1e-9 ? (((gx + (dx > 0 ? 1 : 0)) * CS - OFF) - ox) / dx : Infinity;
    let tz = adz > 1e-9 ? (((gz + (dz > 0 ? 1 : 0)) * CS - OFF) - oz) / dz : Infinity;
    for (let it = 0; it < 400; it++) {
      if (gx >= 0 && gx < N && gz >= 0 && gz < N) {
        for (const c of this.cells[gx * N + gz]) {
          if (c.stamp === st) continue;
          c.stamp = st;
          if (skip && skip(c)) continue;
          if (c.t === 0) {
            // Slab-Methode
            let t0 = 0, t1 = best, ax = -1, sgn = 0;
            if (adx < 1e-12) { if (ox < c.minx || ox > c.maxx) continue; }
            else {
              let a = (c.minx - ox) / dx, b = (c.maxx - ox) / dx, s = -1;
              if (a > b) { const q = a; a = b; b = q; s = 1; }
              if (a > t0) { t0 = a; ax = 0; sgn = s; }
              if (b < t1) t1 = b;
              if (t0 > t1) continue;
            }
            if (Math.abs(dy) < 1e-12) { if (oy < c.miny || oy > c.maxy) continue; }
            else {
              let a = (c.miny - oy) / dy, b = (c.maxy - oy) / dy, s = -1;
              if (a > b) { const q = a; a = b; b = q; s = 1; }
              if (a > t0) { t0 = a; ax = 1; sgn = s; }
              if (b < t1) t1 = b;
              if (t0 > t1) continue;
            }
            if (adz < 1e-12) { if (oz < c.minz || oz > c.maxz) continue; }
            else {
              let a = (c.minz - oz) / dz, b = (c.maxz - oz) / dz, s = -1;
              if (a > b) { const q = a; a = b; b = q; s = 1; }
              if (a > t0) { t0 = a; ax = 2; sgn = s; }
              if (b < t1) t1 = b;
              if (t0 > t1) continue;
            }
            if (ax < 0) continue;              // Startpunkt in der Box → ignorieren
            if (t0 < best) {
              best = t0; bc = c;
              bnx = ax === 0 ? sgn : 0; bny = ax === 1 ? sgn : 0; bnz = ax === 2 ? sgn : 0;
            }
          } else {
            // Schräge als Ebene y = y0 + k·(c − base)
            const oc = c.axis === 0 ? ox : oz, dc = c.axis === 0 ? dx : dz;
            const den = dy - c.k * dc;
            if (Math.abs(den) < 1e-9) continue;
            const t = (c.y0 + c.k * (oc - c.base) - oy) / den;
            if (t < 0 || t >= best) continue;
            const hx = ox + dx * t, hz = oz + dz * t;
            if (hx < c.minx || hx > c.maxx || hz < c.minz || hz > c.maxz) continue;
            best = t; bc = c;
            const l = Math.hypot(c.k, 1);
            let nx = c.axis === 0 ? -c.k / l : 0, ny = 1 / l, nz = c.axis === 2 ? -c.k / l : 0;
            if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
            bnx = nx; bny = ny; bnz = nz;
          }
        }
      } else if ((gx < 0 && sx < 0) || (gx >= N && sx > 0) || (gz < 0 && sz < 0) || (gz >= N && sz > 0)) break;
      const tn = Math.min(tx, tz);
      if (tn > best) break;
      if (tx < tz) { gx += sx; tx += ddx; } else { gz += sz; tz += ddz; }
    }
    if (!bc) return null;
    const h = this.hit;
    h.t = best; h.c = bc; h.nx = bnx; h.ny = bny; h.nz = bnz;
    h.x = ox + dx * best; h.y = oy + dy * best; h.z = oz + dz * best;
    return h;
  }
}

// ---------- Bewegung einer Figur ----------
// ch: { pos, vel, r, h, onGround }  (pos = Fußpunkt)

function moveAxis(W, ch, axis, d) {
  if (!d) return;
  const p = ch.pos, r = ch.r, h = ch.h;
  if (axis === 0) p.x += d; else p.z += d;
  const list = W.query(p.x - r, p.z - r, p.x + r, p.z + r);
  for (let n = 0; n < list.length; n++) {
    const c = list[n];
    if (c.t === 0) {
      if (p.x + r <= c.minx || p.x - r >= c.maxx || p.z + r <= c.minz || p.z - r >= c.maxz) continue;
      if (c.maxy <= p.y + 0.02 || c.miny >= p.y + h) continue;
      const rise = c.maxy - p.y;
      if ((rise <= STEP && (ch.onGround || ch.vel.y <= 1)) && W.free(p.x, c.maxy, p.z, r * 0.9, h)) {
        p.y = c.maxy;   // Stufe hoch
        continue;
      }
      if (axis === 0) p.x = d > 0 ? c.minx - r - 1e-3 : c.maxx + r + 1e-3;
      else p.z = d > 0 ? c.minz - r - 1e-3 : c.maxz + r + 1e-3;
      ch.blocked = c;
    } else {
      if (p.x < c.minx || p.x > c.maxx || p.z < c.minz || p.z > c.maxz) continue;
      const s = W.slopeH(c, p.x, p.z);
      if (s > p.y + STEP && s - SLAB < p.y + h) {
        if (axis === 0) p.x -= d; else p.z -= d;
        ch.blocked = c;
      }
    }
  }
}

export function moveChar(W, ch, dt, gravScale = 1) {
  const p = ch.pos, v = ch.vel;
  const wasGround = ch.onGround;
  ch.blocked = null;
  const sub = Math.max(1, Math.ceil(Math.max(Math.abs(v.x), Math.abs(v.z)) * dt / 0.2));
  const sdt = dt / sub;
  for (let s = 0; s < sub; s++) {
    moveAxis(W, ch, 0, v.x * sdt);
    moveAxis(W, ch, 2, v.z * sdt);
  }
  v.y -= GRAV * gravScale * dt;
  const ny = p.y + v.y * dt;
  ch.landSpeed = 0;
  if (v.y <= 0) {
    const g = W.groundAt(p.x, p.z, ch.r * 0.8, p.y + 0.05, p.y + STEP);
    if (ny <= g) { ch.landSpeed = -v.y; p.y = g; v.y = 0; ch.onGround = true; }
    else if (wasGround && ny - g < SNAP) { p.y = g; v.y = 0; ch.onGround = true; }
    else { p.y = ny; ch.onGround = false; }
  } else {
    const c = W.ceilAt(p.x, p.z, ch.r * 0.8, p.y + ch.h - 0.15);
    if (ny + ch.h > c) { p.y = Math.max(p.y, c - ch.h - 0.01); v.y = 0; }
    else p.y = ny;
    ch.onGround = false;
  }
}
