// Wypalanie światła i budowa siatki świata.
//
// Świat to prostopadłościany osiowe, więc:
//  * każdą ścianę dzielimy na komórki (siatka świata + współrzędne wszystkich brył → brak szczelin T),
//  * komórki zasłonięte przez inne bryły wyrzucamy,
//  * dla wierzchołków liczymy kolor: ambient × AO (promienie półsferyczne vs AABB) + światła punktowe
//    (lampy sufitowe, kwas, pole wyjścia, drzwi) z cieniami (promień vs AABB).
// Wynik to geometria z kolorami wierzchołków; materiały to MeshBasicMaterial (zero świateł w shaderze).

const SOLID = new Set(['white', 'floor', 'dark']);       // bryły litę: zasłaniają światło i inne ściany
const SHRINK = 0.002;                                     // okluzory lekko zmniejszone (brak samozasłaniania)
const NROT = 8;                                           // ile obróconych zestawów promieni AO
const GOLDEN = 2.39996323;

// normalne: nid = oś * 2 + (znak > 0)   →  -x, +x, -y, +y, -z, +z
const NX = [-1, 1, 0, 0, 0, 0], NY = [0, 0, -1, 1, 0, 0], NZ = [0, 0, 0, 0, -1, 1];

// ambient (kolor × jasność) dla poszczególnych normalnych: ściany, sufit (odbicie), podłoga
const AMB = [
  [0.82, 0.88, 0.98, 0.30], [0.82, 0.88, 0.98, 0.30],
  [0.84, 0.90, 1.00, 0.36], [0.86, 0.91, 1.00, 0.30],
  [0.82, 0.88, 0.98, 0.30], [0.82, 0.88, 0.98, 0.30],
];

// układ UV: oś „w prawo” (znak) i „w górę” (znak) tekstury dla ściany o osi a i znaku s
function faceUV(a, s) {
  if (a === 0) return [2, -s, 1, 1];
  if (a === 2) return [0, s, 1, 1];
  return [0, 1, 2, -s];
}

const L_STRIDE = 14;
// światło: x,y,z, r,g,b, I, 1/R0², odcięcie², fx,fy,fz (kierunek emisji), flagi (1 = cienie, 2 = dookólne)
export function packLights(list) {
  const out = new Float64Array(list.length * L_STRIDE);
  list.forEach((l, i) => {
    const o = i * L_STRIDE;
    out.set([l.x, l.y, l.z, l.r, l.g, l.b, l.I, 1 / (l.R0 * l.R0), (l.R0 * l.cut) ** 2,
      l.fx ?? 0, l.fy ?? 0, l.fz ?? 0, (l.shadow === false ? 0 : 1) | (l.omni ? 2 : 0), 0], o);
  });
  return out;
}

// miękkie ścięcie jasności (okolice lamp nie przepalają się na biało, gradient zostaje)
function shoulder(x) { return x < 0.75 ? x : 0.75 + 0.3 * (1 - Math.exp((0.75 - x) / 0.3)); }

export class LightField {
  constructor(boxes, lights, q) {
    const occ = [];
    for (const b of boxes) {
      if (!SOLID.has(b.kind)) continue;
      occ.push(b.min.x + SHRINK, b.min.y + SHRINK, b.min.z + SHRINK, b.max.x - SHRINK, b.max.y - SHRINK, b.max.z - SHRINK);
    }
    this.occ = Float64Array.from(occ);
    this.lights = lights;
    this.nLights = lights.length / L_STRIDE;
    this.rays = q.rays;
    this.shadows = q.shadows;
    this.aoDist = q.aoDist;
    this.dirs = [];
    const K = q.rays;
    for (let nid = 0; nid < 6; nid++) {
      const a = nid >> 1, s = (nid & 1) ? 1 : -1, t1 = (a + 1) % 3, t2 = (a + 2) % 3;
      const arr = new Float64Array(NROT * K * 6);
      const d = [0, 0, 0];
      for (let r = 0; r < NROT; r++) for (let i = 0; i < K; i++) {
        const u = (i + 0.5) / K, rad = Math.sqrt(u), ph = i * GOLDEN + r * 0.83;
        d[a] = s * Math.sqrt(1 - u); d[t1] = rad * Math.cos(ph); d[t2] = rad * Math.sin(ph);
        const o = (r * K + i) * 6;
        for (let c = 0; c < 3; c++) { arr[o + c] = d[c]; arr[o + 3 + c] = 1 / (Math.abs(d[c]) < 1e-9 ? 1e-9 : d[c]); }
      }
      this.dirs.push(arr);
    }
    // 5 promieni do wykrywania „zewnętrznej” strony ścian (normalna + cztery ukośne)
    this.extDirs = [];
    for (let nid = 0; nid < 6; nid++) {
      const a = nid >> 1, s = (nid & 1) ? 1 : -1, t1 = (a + 1) % 3, t2 = (a + 2) % 3;
      const arr = new Float64Array(5 * 6), d = [0, 0, 0];
      [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([u, v], k) => {
        const tilt = (u || v) ? 0.866 : 0;
        d[a] = s * (tilt ? 0.5 : 1); d[t1] = u * tilt; d[t2] = v * tilt;
        for (let c = 0; c < 3; c++) { arr[k * 6 + c] = d[c]; arr[k * 6 + 3 + c] = 1 / (Math.abs(d[c]) < 1e-9 ? 1e-9 : d[c]); }
      });
      this.extDirs.push(arr);
    }
  }

  // czy komórka patrzy w pustkę (żaden z promieni nie trafia w bryłę) – zewnętrzna strona ścian pokoju
  exterior(px, py, pz, nid) {
    const e = this.extDirs[nid];
    for (let k = 0; k < 30; k += 6) if (this.nearest(px, py, pz, e[k + 3], e[k + 4], e[k + 5], 1e4) < 1e4) return false;
    return true;
  }

  // odległość do najbliższego okluzora wzdłuż promienia (idx = 1/kierunek); maxT jeśli brak
  nearest(ox, oy, oz, idx, idy, idz, maxT) {
    const o = this.occ;
    let best = maxT;
    for (let k = 0, n = o.length; k < n; k += 6) {
      let t0 = (o[k] - ox) * idx, t1 = (o[k + 3] - ox) * idx;
      let tn = t0 < t1 ? t0 : t1, tf = t0 < t1 ? t1 : t0;
      t0 = (o[k + 1] - oy) * idy; t1 = (o[k + 4] - oy) * idy;
      let lo = t0 < t1 ? t0 : t1, hi = t0 < t1 ? t1 : t0;
      if (lo > tn) tn = lo; if (hi < tf) tf = hi;
      t0 = (o[k + 2] - oz) * idz; t1 = (o[k + 5] - oz) * idz;
      lo = t0 < t1 ? t0 : t1; hi = t0 < t1 ? t1 : t0;
      if (lo > tn) tn = lo; if (hi < tf) tf = hi;
      if (tn <= tf && tf > 0 && tn < best) best = tn > 0 ? tn : 0;
    }
    return best;
  }

  // czy odcinek (o → o + d·1) przecina jakąkolwiek bryłę
  blocked(ox, oy, oz, dx, dy, dz) {
    const idx = 1 / (Math.abs(dx) < 1e-12 ? 1e-12 : dx), idy = 1 / (Math.abs(dy) < 1e-12 ? 1e-12 : dy), idz = 1 / (Math.abs(dz) < 1e-12 ? 1e-12 : dz);
    return this.nearest(ox, oy, oz, idx, idy, idz, 0.999) < 0.999;
  }

  // widoczność nieba (1 = otwarta przestrzeń, 0 = zamknięte) w punkcie p dla normalnej nid
  visibility(px, py, pz, nid, seed) {
    const K = this.rays, arr = this.dirs[nid], D = this.aoDist;
    const base = (seed % NROT) * K * 6;
    const ox = px + NX[nid] * 0.02, oy = py + NY[nid] * 0.02, oz = pz + NZ[nid] * 0.02;
    let sum = 0;
    for (let i = 0; i < K; i++) {
      const o = base + i * 6;
      const t = this.nearest(ox, oy, oz, arr[o + 3], arr[o + 4], arr[o + 5], D);
      if (t < D) sum += 1 - t / D;
    }
    return 1 - sum / K;
  }

  // kolor (liniowy) w punkcie p dla normalnej nid → out[0..2]
  shade(px, py, pz, nid, out) {
    const nx = NX[nid], ny = NY[nid], nz = NZ[nid];
    const seed = (Math.imul(Math.round(px * 64), 73856093) ^ Math.imul(Math.round(py * 64), 19349663) ^ Math.imul(Math.round(pz * 64), 83492791)) >>> 0;
    const vis = this.visibility(px, py, pz, nid, (seed >>> 7) % NROT);
    const am = AMB[nid], ao = 0.06 + 0.94 * vis * vis * Math.sqrt(vis), k = am[3] * ao;
    let r = am[0] * k, g = am[1] * k, b = am[2] * k;
    const lamp = 0.45 + 0.55 * ao;      // AO przyciemnia też światło bezpośrednie (naroża)
    const L = this.lights, oox = px + nx * 0.03, ooy = py + ny * 0.03, ooz = pz + nz * 0.03;
    for (let li = 0, n = this.nLights; li < n; li++) {
      const o = li * L_STRIDE;
      const dx = L[o] - px, dy = L[o + 1] - py, dz = L[o + 2] - pz;
      const r2 = dx * dx + dy * dy + dz * dz + 0.6;
      if (r2 > L[o + 8]) continue;
      const inv = 1 / Math.sqrt(r2);
      const cosR = (nx * dx + ny * dy + nz * dz) * inv;
      if (cosR <= 0.02) continue;
      let we = 1;
      if (!(L[o + 12] & 2)) {
        const cosE = -(L[o + 9] * dx + L[o + 10] * dy + L[o + 11] * dz) * inv;
        we = cosE > 0 ? 0.3 + 0.7 * cosE : 0.3;
      }
      const E = L[o + 6] * cosR * we / (1 + r2 * L[o + 7]);
      if (E < 0.004) continue;
      if ((L[o + 12] & 1) && this.shadows && this.blocked(oox, ooy, ooz, L[o] - oox, L[o + 1] - ooy, L[o + 2] - ooz)) continue;
      r += L[o + 3] * E * lamp; g += L[o + 4] * E * lamp; b += L[o + 5] * E * lamp;
    }
    out[0] = shoulder(r); out[1] = shoulder(g); out[2] = shoulder(b);
  }
}

function hash3(a, b, c, d) {
  let h = Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791) ^ Math.imul(d, 2654435761);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return (h ^ (h >>> 16)) >>> 0;
}

// punkty podziału przedziału [lo, hi]: siatka `base` + współrzędne wszystkich brył
function splits(lo, hi, base, coords) {
  const eps = 1e-3, tmp = [];
  for (let v = (Math.floor(lo / base + 1e-9) + 1) * base; v < hi - eps; v += base) tmp.push(v);
  for (const c of coords) if (c > lo + eps && c < hi - eps) tmp.push(c);
  tmp.sort((x, y) => x - y);
  const out = [lo];
  let last = lo;
  for (const v of tmp) if (v - last > eps) { out.push(v); last = v; }
  out.push(hi);
  return out;
}

const _c = [0, 0, 0], _col = [0, 0, 0];

// Buduje siatki świata. boxes: [{min,max,kind}], info: {rodzaj: {tile, mode, atlas:[cols,rows]}},
// zwraca Map: klucz (rodzaj albo bryła drzwi) → {pos, col, uv, idx} + statystyki
export function bakeWorld(boxes, field, info, q) {
  const n = boxes.length;
  const bmin = new Float64Array(n * 3), bmax = new Float64Array(n * 3);
  const coords = [[], [], []];
  boxes.forEach((b, i) => {
    for (let a = 0; a < 3; a++) {
      const lo = [b.min.x, b.min.y, b.min.z][a], hi = [b.max.x, b.max.y, b.max.z][a];
      bmin[i * 3 + a] = lo; bmax[i * 3 + a] = hi;
      coords[a].push(lo, hi);
    }
  });
  for (let a = 0; a < 3; a++) coords[a] = [...new Set(coords[a].map(v => Math.round(v * 1000) / 1000))].sort((x, y) => x - y);
  const solid = [];
  boxes.forEach((b, i) => { if (SOLID.has(b.kind)) solid.push(i); });

  const groups = new Map();
  let cells = 0;

  for (let i = 0; i < n; i++) {
    const box = boxes[i], inf = info[box.kind];
    const key = box.kind === 'door' ? box : box.kind;
    let grp = groups.get(key);
    if (!grp) { grp = { pos: [], col: [], uv: [], idx: [] }; groups.set(key, grp); }
    const tile = inf.tile, base = Math.min(q.base, tile);
    const [cols, rows] = inf.atlas;
    const nVar = cols * rows;

    for (let a = 0; a < 3; a++) for (let sg = 0; sg < 2; sg++) {
      const s = sg ? 1 : -1, nid = a * 2 + sg;
      const t1 = (a + 1) % 3, t2 = (a + 2) % 3;
      const plane = s > 0 ? bmax[i * 3 + a] : bmin[i * 3 + a];
      const S1 = splits(bmin[i * 3 + t1], bmax[i * 3 + t1], base, coords[t1]);
      const S2 = splits(bmin[i * 3 + t2], bmax[i * 3 + t2], base, coords[t2]);
      const n1 = S1.length - 1, n2 = S2.length - 1;
      const [rAx, rs, uAx, us] = faceUV(a, s);
      const vcache = new Float32Array((n1 + 1) * (n2 + 1) * 3), vdone = new Uint8Array((n1 + 1) * (n2 + 1));

      const pos = [0, 0, 0];
      const vertex = (p, qd) => {
        const id = qd * (n1 + 1) + p;
        if (!vdone[id]) {
          pos[a] = plane; pos[t1] = S1[p]; pos[t2] = S2[qd];
          field.shade(pos[0], pos[1], pos[2], nid, _col);
          vcache[id * 3] = _col[0]; vcache[id * 3 + 1] = _col[1]; vcache[id * 3 + 2] = _col[2];
          vdone[id] = 1;
        }
        return id * 3;
      };

      for (let p = 0; p < n1; p++) for (let qd = 0; qd < n2; qd++) {
        // środek komórki lekko przed ścianą: zasłonięty przez inną bryłę? zdublowany z wcześniejszą?
        _c[a] = plane + s * 0.01; _c[t1] = (S1[p] + S1[p + 1]) / 2; _c[t2] = (S2[qd] + S2[qd + 1]) / 2;
        let hidden = false;
        for (let k = 0; k < solid.length && !hidden; k++) {
          const j = solid[k];
          if (j === i) continue;
          if (_c[0] > bmin[j * 3] + 1e-4 && _c[0] < bmax[j * 3] - 1e-4 && _c[1] > bmin[j * 3 + 1] + 1e-4 && _c[1] < bmax[j * 3 + 1] - 1e-4 &&
              _c[2] > bmin[j * 3 + 2] + 1e-4 && _c[2] < bmax[j * 3 + 2] - 1e-4) hidden = true;
          else if (j < i && SOLID.has(box.kind) &&
              Math.abs((s > 0 ? bmax[j * 3 + a] : bmin[j * 3 + a]) - plane) < 1e-4 &&
              _c[t1] > bmin[j * 3 + t1] && _c[t1] < bmax[j * 3 + t1] && _c[t2] > bmin[j * 3 + t2] && _c[t2] < bmax[j * 3 + t2]) hidden = true; // współpłaszczyznowe nakładanie
        }
        if (hidden || field.exterior(_c[0], _c[1], _c[2], nid)) continue;
        cells++;

        // UV: kafel 2 m (z wariantem z atlasu) albo cała ściana (drzwi)
        const cr = (rAx === a ? plane : rAx === t1 ? (S1[p] + S1[p + 1]) / 2 : (S2[qd] + S2[qd + 1]) / 2);
        const cu = (uAx === a ? plane : uAx === t1 ? (S1[p] + S1[p + 1]) / 2 : (S2[qd] + S2[qd + 1]) / 2);
        let iu = 0, iv = 0, ox = 0, oy = 0;
        if (inf.mode === 'tile') {
          iu = Math.floor(rs * cr / tile); iv = Math.floor(us * cu / tile);
          const k = nVar > 1 ? hash3(iu, iv, nid + 1, Math.round(plane * 8)) % nVar : 0;
          ox = k % cols; oy = (k / cols) | 0;
        }
        const v0 = grp.pos.length / 3;
        const corners = [[p, qd], [p + 1, qd], [p + 1, qd + 1], [p, qd + 1]];
        for (const [cp, cq] of corners) {
          pos[a] = plane; pos[t1] = S1[cp]; pos[t2] = S2[cq];
          grp.pos.push(pos[0], pos[1], pos[2]);
          const vi = vertex(cp, cq);
          grp.col.push(vcache[vi], vcache[vi + 1], vcache[vi + 2]);
          let fu, fv;
          if (inf.mode === 'tile') {
            fu = rs * pos[rAx] / tile - iu; fv = us * pos[uAx] / tile - iv;
          } else {
            const r0 = bmin[i * 3 + rAx], r1 = bmax[i * 3 + rAx], u0 = bmin[i * 3 + uAx], u1 = bmax[i * 3 + uAx];
            fu = rs > 0 ? (pos[rAx] - r0) / (r1 - r0) : (r1 - pos[rAx]) / (r1 - r0);
            fv = us > 0 ? (pos[uAx] - u0) / (u1 - u0) : (u1 - pos[uAx]) / (u1 - u0);
          }
          fu = Math.min(1, Math.max(0, fu)); fv = Math.min(1, Math.max(0, fv));
          const inset = 0.5 / 512;
          grp.uv.push((ox + inset + fu * (1 - 2 * inset)) / cols, 1 - (oy + 1) / rows + (inset + fv * (1 - 2 * inset)) / rows);
        }
        if (s > 0) grp.idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
        else grp.idx.push(v0, v0 + 2, v0 + 1, v0, v0 + 3, v0 + 2);
      }
    }
  }
  return { groups, cells };
}
