// Wypalanie światła i budowa siatki świata.
//
// Świat to prostopadłościany osiowe, więc:
//  * każdą ścianę dzielimy na komórki (siatka świata + współrzędne wszystkich brył → brak szczelin T),
//  * komórki zasłonięte przez inne bryły wyrzucamy,
//  * dla wierzchołków liczymy kolor: ambient × AO (promienie półsferyczne vs AABB) + światła punktowe
//    (lampy sufitowe, kwas, pole wyjścia, drzwi) z cieniami (promień vs AABB).
// Wynik to geometria z kolorami wierzchołków; materiały to MeshBasicMaterial (zero świateł w shaderze).

// Wydajność (poziomy po ~150 tys. trójkątów wypalają się w ułamku sekundy):
//  * BoxGrid – jednorodna siatka okluzorów; promienie AO, cieni i „zewnętrzności” idą DDA po komórkach (wyniki identyczne
//    jak przy przeglądzie wszystkich brył), cień sprawdza najpierw bryłę, która ostatnio zasłoniła dane światło;
//  * podpowiedzi (q.hint, w metrach): wierzchołki pośrednie ściany (nieparzyste/niższego poziomu indeksy) nie liczą AO
//    i prób cienia, gdy ich najbliżsi „grubsi” sąsiedzi (policzeni wcześniej, w promieniu q.hint) mają zgodną widoczność
//    światła/AO – dziedziczą ją; wyjątek: wierzchołki leżące na krawędzi pobliskiej bryły. Wynik deterministyczny.
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


// Jednorodna siatka przyspieszająca dla prostopadłościanów (arr: min x,y,z, max x,y,z na bryłę).
// Zapytania: promień → najbliższe trafienie (DDA po komórkach, te same wyniki co pełny przegląd) oraz
// lista brył w komórce punktu. Bryły są wpisywane z niewielkim zapasem, więc trafienia w granicach komórek nie giną.
class BoxGrid {
  constructor(arr, cell) {
    const n = arr.length / 6;
    this.arr = arr; this.n = n;
    this.stamp = 0;
    this.hit = -1;                  // ostatnia bryła trafiona w trybie any
    this.R = new Float64Array(8);
    this.mark = new Int32Array(n);
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < arr.length; k += 6) {
      if (arr[k] < x0) x0 = arr[k]; if (arr[k + 1] < y0) y0 = arr[k + 1]; if (arr[k + 2] < z0) z0 = arr[k + 2];
      if (arr[k + 3] > x1) x1 = arr[k + 3]; if (arr[k + 4] > y1) y1 = arr[k + 4]; if (arr[k + 5] > z1) z1 = arr[k + 5];
    }
    if (!n) { x0 = y0 = z0 = 0; x1 = y1 = z1 = 1; }
    const pad = 0.01;
    x0 -= pad; y0 -= pad; z0 -= pad; x1 += pad; y1 += pad; z1 += pad;
    let cs = cell, nx, ny, nz;
    for (;;) {
      nx = Math.max(1, Math.ceil((x1 - x0) / cs)); ny = Math.max(1, Math.ceil((y1 - y0) / cs)); nz = Math.max(1, Math.ceil((z1 - z0) / cs));
      if (nx * ny * nz <= 60000) break;
      cs *= 1.25;
    }
    this.cs = cs; this.inv = 1 / cs; this.nx = nx; this.ny = ny; this.nz = nz;
    this.x0 = x0; this.y0 = y0; this.z0 = z0;
    this.x1 = x0 + nx * cs; this.y1 = y0 + ny * cs; this.z1 = z0 + nz * cs;
    // CSR: start[c]..start[c+1] → indeksy brył w komórce c
    const cnt = new Int32Array(nx * ny * nz + 1), eps = 1e-3, inv = this.inv;
    const range = (k) => [
      Math.max(0, Math.floor((arr[k] - eps - x0) * inv)), Math.min(nx - 1, Math.floor((arr[k + 3] + eps - x0) * inv)),
      Math.max(0, Math.floor((arr[k + 1] - eps - y0) * inv)), Math.min(ny - 1, Math.floor((arr[k + 4] + eps - y0) * inv)),
      Math.max(0, Math.floor((arr[k + 2] - eps - z0) * inv)), Math.min(nz - 1, Math.floor((arr[k + 5] + eps - z0) * inv)),
    ];
    for (let pass = 0; pass < 2; pass++) {
      if (pass) { for (let c = 0; c < cnt.length - 1; c++) cnt[c + 1] += cnt[c]; this.start = cnt.slice(); this.list = new Int32Array(cnt[cnt.length - 1]); }
      const fill = pass ? this.start.slice() : null;
      for (let j = 0; j < n; j++) {
        const [a0, a1, b0, b1, c0, c1] = range(j * 6);
        for (let cz = c0; cz <= c1; cz++) for (let cy = b0; cy <= b1; cy++) for (let cx = a0; cx <= a1; cx++) {
          const c = (cz * ny + cy) * nx + cx;
          if (pass) this.list[fill[c]++] = j; else cnt[c + 1]++;
        }
      }
    }
  }

  // indeks komórki zawierającej punkt (bryły: this.list[this.start[c] .. this.start[c + 1]]); -1 poza siatką
  cellOf(px, py, pz) {
    const ix = Math.floor((px - this.x0) * this.inv), iy = Math.floor((py - this.y0) * this.inv), iz = Math.floor((pz - this.z0) * this.inv);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= this.nx || iy >= this.ny || iz >= this.nz) return -1;
    return (iz * this.ny + iy) * this.nx + ix;
  }

  // Promień: wejście w this.R = [ox, oy, oz, 1/dx, 1/dy, 1/dz, maxT] (parametry w tablicy, nie w argumentach: unikamy
  // alokowania liczb zmiennoprzecinkowych przy każdym wywołaniu), wynik: this.R[7] = odległość (w jednostkach długości
  // kierunku) do najbliższej bryły, maxT jeśli brak; zwraca true, jeśli coś trafiono.
  // any = true: kończy na pierwszym trafieniu (wystarczy wiedzieć, czy cokolwiek jest na trasie)
  trace(any) {
    const R = this.R;
    const ox = R[0], oy = R[1], oz = R[2], idx = R[3], idy = R[4], idz = R[5], maxT = R[6];
    R[7] = maxT;
    if (!this.n) return false;
    // wejście w siatkę
    let tA = 0, tB = maxT;
    let a = (this.x0 - ox) * idx, b = (this.x1 - ox) * idx;
    let lo = a < b ? a : b, hi = a < b ? b : a;
    if (lo > tA) tA = lo; if (hi < tB) tB = hi;
    a = (this.y0 - oy) * idy; b = (this.y1 - oy) * idy;
    lo = a < b ? a : b; hi = a < b ? b : a;
    if (lo > tA) tA = lo; if (hi < tB) tB = hi;
    a = (this.z0 - oz) * idz; b = (this.z1 - oz) * idz;
    lo = a < b ? a : b; hi = a < b ? b : a;
    if (lo > tA) tA = lo; if (hi < tB) tB = hi;
    if (tA > tB) return false;
    const { nx, ny, nz, inv, cs } = this;
    let ix = Math.floor((ox + tA / idx - this.x0) * inv), iy = Math.floor((oy + tA / idy - this.y0) * inv), iz = Math.floor((oz + tA / idz - this.z0) * inv);
    if (ix < 0) ix = 0; else if (ix >= nx) ix = nx - 1;
    if (iy < 0) iy = 0; else if (iy >= ny) iy = ny - 1;
    if (iz < 0) iz = 0; else if (iz >= nz) iz = nz - 1;
    const sx = idx > 0 ? 1 : -1, sy = idy > 0 ? 1 : -1, sz = idz > 0 ? 1 : -1;
    let tmx = ((this.x0 + (sx > 0 ? ix + 1 : ix) * cs) - ox) * idx;
    let tmy = ((this.y0 + (sy > 0 ? iy + 1 : iy) * cs) - oy) * idy;
    let tmz = ((this.z0 + (sz > 0 ? iz + 1 : iz) * cs) - oz) * idz;
    const tdx = cs * Math.abs(idx), tdy = cs * Math.abs(idy), tdz = cs * Math.abs(idz);
    const o = this.arr, start = this.start, list = this.list, mark = this.mark, stamp = ++this.stamp;
    let best = maxT;
    for (;;) {
      const c = (iz * ny + iy) * nx + ix;
      for (let q = start[c], e = start[c + 1]; q < e; q++) {
        const j = list[q];
        if (mark[j] === stamp) continue;
        mark[j] = stamp;
        const k = j * 6;
        let t0 = (o[k] - ox) * idx, t1 = (o[k + 3] - ox) * idx;
        let tn = t0 < t1 ? t0 : t1, tf = t0 < t1 ? t1 : t0;
        t0 = (o[k + 1] - oy) * idy; t1 = (o[k + 4] - oy) * idy;
        lo = t0 < t1 ? t0 : t1; hi = t0 < t1 ? t1 : t0;
        if (lo > tn) tn = lo; if (hi < tf) tf = hi;
        t0 = (o[k + 2] - oz) * idz; t1 = (o[k + 5] - oz) * idz;
        lo = t0 < t1 ? t0 : t1; hi = t0 < t1 ? t1 : t0;
        if (lo > tn) tn = lo; if (hi < tf) tf = hi;
        if (tn <= tf && tf > 0 && tn < best) { best = tn > 0 ? tn : 0; if (any) { this.hit = j; R[7] = best; return true; } }
      }
      // następna komórka
      let tn;
      if (tmx <= tmy && tmx <= tmz) { tn = tmx; ix += sx; tmx += tdx; if (ix < 0 || ix >= nx) break; }
      else if (tmy <= tmz) { tn = tmy; iy += sy; tmy += tdy; if (iy < 0 || iy >= ny) break; }
      else { tn = tmz; iz += sz; tmz += tdz; if (iz < 0 || iz >= nz) break; }
      if (best <= tn || tn > tB) break;
    }
    R[7] = best;
    return best < maxT;
  }
}

export class LightField {
  constructor(boxes, lights, q) {
    const occ = [];
    for (const b of boxes) {
      if (!SOLID.has(b.kind)) continue;
      occ.push(b.min.x + SHRINK, b.min.y + SHRINK, b.min.z + SHRINK, b.max.x - SHRINK, b.max.y - SHRINK, b.max.z - SHRINK);
    }
    this.occ = Float64Array.from(occ);
    this.grid = new BoxGrid(this.occ, q.gridCell || 4.5);
    this.lights = lights;
    this.nLights = lights.length / L_STRIDE;
    this.B = new Float64Array(6);
    this.lastBlock = new Int32Array(this.nLights).fill(-1);   // dla każdego światła: bryła, która ostatnio rzuciła cień
    this.rays = q.rays;
    this.shadows = q.shadows;
    this.aoDist = q.aoDist;
    this.aoTol = q.aoTol ?? 0.04;
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
    const R = this.grid.R;
    R[0] = px; R[1] = py; R[2] = pz; R[6] = 1e4;
    for (let k = 0; k < 30; k += 6) {
      R[3] = e[k + 3]; R[4] = e[k + 4]; R[5] = e[k + 5];
      if (this.grid.trace(true)) return false;
    }
    return true;
  }

  // odległość do najbliższego okluzora wzdłuż promienia (idx = 1/kierunek); maxT jeśli brak
  nearest(ox, oy, oz, idx, idy, idz, maxT) {
    const R = this.grid.R;
    R[0] = ox; R[1] = oy; R[2] = oz; R[3] = idx; R[4] = idy; R[5] = idz; R[6] = maxT;
    this.grid.trace(false);
    return R[7];
  }

  // czy odcinek (o → o + d·1) przecina jakąkolwiek bryłę
  blocked(ox, oy, oz, dx, dy, dz) {
    const idx = 1 / (Math.abs(dx) < 1e-12 ? 1e-12 : dx), idy = 1 / (Math.abs(dy) < 1e-12 ? 1e-12 : dy), idz = 1 / (Math.abs(dz) < 1e-12 ? 1e-12 : dz);
    const R = this.grid.R;
    R[0] = ox; R[1] = oy; R[2] = oz; R[3] = idx; R[4] = idy; R[5] = idz; R[6] = 0.999;
    return this.grid.trace(true);
  }

  // jak blocked, ale najpierw sprawdza bryłę, która ostatnio zasłoniła światło li (sąsiednie wierzchołki zwykle mają ten sam cień);
  // odcinek (początek, wektor do światła) w this.B = [ox, oy, oz, dx, dy, dz]
  blockedL(li) {
    const B = this.B, ox = B[0], oy = B[1], oz = B[2], dx = B[3], dy = B[4], dz = B[5];
    const idx = 1 / (Math.abs(dx) < 1e-12 ? 1e-12 : dx), idy = 1 / (Math.abs(dy) < 1e-12 ? 1e-12 : dy), idz = 1 / (Math.abs(dz) < 1e-12 ? 1e-12 : dz);
    const lb = this.lastBlock[li];
    if (lb >= 0) {
      const o = this.occ, k = lb * 6;
      let t0 = (o[k] - ox) * idx, t1 = (o[k + 3] - ox) * idx;
      let tn = t0 < t1 ? t0 : t1, tf = t0 < t1 ? t1 : t0;
      t0 = (o[k + 1] - oy) * idy; t1 = (o[k + 4] - oy) * idy;
      let lo = t0 < t1 ? t0 : t1, hi = t0 < t1 ? t1 : t0;
      if (lo > tn) tn = lo; if (hi < tf) tf = hi;
      t0 = (o[k + 2] - oz) * idz; t1 = (o[k + 5] - oz) * idz;
      lo = t0 < t1 ? t0 : t1; hi = t0 < t1 ? t1 : t0;
      if (lo > tn) tn = lo; if (hi < tf) tf = hi;
      if (tn <= tf && tf > 0 && tn < 0.999) return true;
    }
    const R = this.grid.R;
    R[0] = ox; R[1] = oy; R[2] = oz; R[3] = idx; R[4] = idy; R[5] = idz; R[6] = 0.999;
    if (this.grid.trace(true)) { this.lastBlock[li] = this.grid.hit; return true; }
    return false;
  }

  // widoczność nieba (1 = otwarta przestrzeń, 0 = zamknięte) w punkcie p dla normalnej nid
  visibility(px, py, pz, nid, seed) {
    const K = this.rays, arr = this.dirs[nid], D = this.aoDist;
    const base = (seed % NROT) * K * 6;
    const ox = px + NX[nid] * 0.02, oy = py + NY[nid] * 0.02, oz = pz + NZ[nid] * 0.02;
    let sum = 0;
    const grid = this.grid, R = grid.R;
    R[0] = ox; R[1] = oy; R[2] = oz; R[6] = D;
    for (let i = 0; i < K; i++) {
      const o = base + i * 6;
      R[3] = arr[o + 3]; R[4] = arr[o + 4]; R[5] = arr[o + 5];
      if (grid.trace(false)) sum += 1 - R[7] / D;
    }
    return 1 - sum / K;
  }

  // kolor (liniowy) w punkcie p dla normalnej nid → out[0..2]
  // hint: opcjonalne podpowiedzi od sąsiednich, już policzonych wierzchołków (zob. HintBuf i bakeWorld):
  //   hint.own >= 0 – zapisz widoczność świateł i AO tego wierzchołka; hint.nh > 0 – użyj sąsiadów hint.ids/hint.w
  shade(px, py, pz, nid, out, hint) {
    const nx = NX[nid], ny = NY[nid], nz = NZ[nid];
    const seed = (Math.imul(Math.round(px * 64), 73856093) ^ Math.imul(Math.round(py * 64), 19349663) ^ Math.imul(Math.round(pz * 64), 83492791)) >>> 0;
    const nL = this.nLights;
    let vis = -1;
    const nh = hint ? hint.nh : 0;
    if (nh > 0) {                                 // AO: interpolacja z sąsiadów, jeśli są zgodni
      const ao = hint.ao, ids = hint.ids, w = hint.w, tol = this.aoTol;
      let lo = 2, hi = -1, acc = 0;
      for (let h = 0; h < nh; h++) { const v = ao[ids[h]]; if (v < lo) lo = v; if (v > hi) hi = v; acc += v * w[h]; }
      if (hi - lo <= tol) vis = acc;
    }
    if (vis < 0) vis = this.visibility(px, py, pz, nid, (seed >>> 7) % NROT);
    if (hint && hint.own >= 0) hint.ao[hint.own] = vis;
    const am = AMB[nid], ao = 0.06 + 0.94 * vis * vis * Math.sqrt(vis), k = am[3] * ao;
    let r = am[0] * k, g = am[1] * k, b = am[2] * k;
    const lamp = 0.45 + 0.55 * ao;      // AO przyciemnia też światło bezpośrednie (naroża)
    const L = this.lights, oox = px + nx * 0.03, ooy = py + ny * 0.03, ooz = pz + nz * 0.03;
    const B = this.B;
    const list = hint && hint.nl >= 0 ? hint.list : null, nlist = list ? hint.nl : this.nLights;
    for (let ll = 0; ll < nlist; ll++) {
      const li = list ? list[ll] : ll, o = li * L_STRIDE;
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
      if ((L[o + 12] & 1) && this.shadows) {
        let v = 0;
        if (nh > 0) { const rec = hint.rec, ids = hint.ids; v = rec[ids[0] * nL + li]; for (let h = 1; h < nh && v; h++) if (rec[ids[h] * nL + li] !== v) v = 0; }
        if (!v) { B[0] = oox; B[1] = ooy; B[2] = ooz; B[3] = L[o] - oox; B[4] = L[o + 1] - ooy; B[5] = L[o + 2] - ooz; v = this.blockedL(li) ? 2 : 1; }
        if (hint && hint.own >= 0) hint.rec[hint.own * nL + li] = v;
        if (v === 2) continue;
      }
      r += L[o + 3] * E * lamp; g += L[o + 4] * E * lamp; b += L[o + 5] * E * lamp;
    }
    out[0] = shoulder(r); out[1] = shoulder(g); out[2] = shoulder(b);
  }
}

const CORNER_P = [0, 1, 1, 0], CORNER_Q = [0, 0, 1, 1];

// zapewnia miejsce na nv wierzchołków i ni indeksów więcej w grupie geometrii
function grow(g, nv, ni) {
  const needV = g.nv + nv, needI = g.ni + ni;
  if (g.pos.length < needV * 3) {
    const cap = Math.max(needV, g.nv * 2, 64);
    for (const [k, n, T] of [['pos', 3, Float32Array], ['col', 3, Float32Array], ['uv', 2, Float32Array]]) { const a = new T(cap * n); a.set(g[k].subarray(0, g.nv * n)); g[k] = a; }
  }
  if (g.idx.length < needI) { const a = new Uint32Array(Math.max(needI, g.ni * 2, 96)); a.set(g.idx.subarray(0, g.ni)); g.idx = a; }
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

const _c = [0, 0, 0], _p = [0, 0, 0], _col = [0, 0, 0];
let _fb = new Int32Array(1024);

// bufory robocze używane przez kolejne ściany (bez alokacji na każdą ścianę); scratchU zeruje żądany prefiks
let _sf = new Float32Array(1 << 14);
const _su = [new Uint8Array(1 << 12), new Uint8Array(1 << 12), new Uint8Array(1 << 12)];
function scratchF(n) { if (_sf.length < n) _sf = new Float32Array(n * 2); return _sf; }
function scratchU(k, n) { if (_su[k].length < n) _su[k] = new Uint8Array(n * 2); else _su[k].fill(0, 0, n); return _su[k]; }

// bufory podpowiedzi „grubych” wierzchołków (parzyste indeksy siatki ściany): które światła je widzą (0 = nie testowano,
// 1 = widoczne, 2 = zasłonięte) i ich widoczność nieba (AO). Używane przez wierzchołki pośrednie.
const hintBuf = { rec: new Uint8Array(1 << 16), ao: new Float32Array(1 << 12), ids: new Int32Array(4), w: new Float64Array(4), own: -1, nh: 0, list: new Int32Array(256), nl: -1 };
function hintReset(nCoarse, nL) {
  if (hintBuf.ao.length < nCoarse) hintBuf.ao = new Float32Array(nCoarse * 2);
  if (hintBuf.rec.length < nCoarse * nL) hintBuf.rec = new Uint8Array(nCoarse * nL * 2);
  else hintBuf.rec.fill(0, 0, nCoarse * nL);
  return hintBuf;
}

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

  const sarr = new Float64Array(solid.length * 6);
  solid.forEach((j, k) => { for (let c = 0; c < 3; c++) { sarr[k * 6 + c] = bmin[j * 3 + c]; sarr[k * 6 + 3 + c] = bmax[j * 3 + c]; } });
  const sgrid = new BoxGrid(sarr, 3);

  const groups = new Map();
  let cells = 0;

  for (let i = 0; i < n; i++) {
    const box = boxes[i], inf = info[box.kind];
    const key = box.kind === 'door' ? box : box.kind;
    let grp = groups.get(key);
    if (!grp) { grp = { pos: new Float32Array(0), col: new Float32Array(0), uv: new Float32Array(0), idx: new Uint32Array(0), nv: 0, ni: 0 }; groups.set(key, grp); }
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
      const W = n1 + 1, H = n2 + 1;
      const vcache = scratchF(W * H * 3), vdone = scratchU(0, W * H);
      const vis = scratchU(1, n1 * n2);                                           // komórki widoczne

      // „grube” wierzchołki (parzyste indeksy) zapisują widoczność świateł i AO; wierzchołki pośrednie, których
      // najbliżsi „grubi” sąsiedzi (w promieniu q.hint) się zgadzają, pomijają próby cienia i AO (cień/AO są spójne w obrębie ~1 m)
      const nL = field.nLights, CW = (W + 1) >> 1, CH = (H + 1) >> 1;
      const hb = hintReset(CW * CH, nL);
      // światła, które mogą oświetlić tę ścianę (przód płaszczyzny, w zasięgu odcięcia od prostokąta ściany); reszta i tak
      // odpadałaby w shade na tych samych warunkach
      if (hb.list.length < nL) hb.list = new Int32Array(nL);
      hb.nl = 0;
      {
        const Lq = field.lights, lo = [0, 0, 0], hi = [0, 0, 0];
        lo[a] = hi[a] = plane; lo[t1] = S1[0]; hi[t1] = S1[n1]; lo[t2] = S2[0]; hi[t2] = S2[n2];
        for (let li = 0; li < nL; li++) {
          const o = li * L_STRIDE;
          if (s * (Lq[o + a] - plane) <= 0) continue;
          let d2 = 0;
          for (let c = 0; c < 3; c++) { const v = Lq[o + c], d = v < lo[c] ? lo[c] - v : v > hi[c] ? v - hi[c] : 0; d2 += d * d; }
          if (d2 + 0.6 > Lq[o + 8] + 1e-6) continue;
          hb.list[hb.nl++] = li;
        }
      }
      const hd2 = (q.hint || 0) * (q.hint || 0);
      const pos = [0, 0, 0];
      const hr = q.hint || 0, HLEV = q.hintLevels ?? 3;
      // wierzchołek leży na linii siatki będącej współrzędną pobliskiej bryły (krawędź otworu, narożnik): tam brak podpowiedzi
      // bryły lite w pobliżu tej ściany (AABB powiększony o hr dotyka jej prostokąta)
      let nf = 0;
      if (hd2 > 0) {
        if (_fb.length < solid.length) _fb = new Int32Array(solid.length);
        for (let k = 0; k < solid.length; k++) {
          const j = solid[k];
          if (bmin[j * 3 + a] - hr > plane || bmax[j * 3 + a] + hr < plane || bmin[j * 3 + t1] - hr > S1[n1] || bmax[j * 3 + t1] + hr < S1[0] ||
              bmin[j * 3 + t2] - hr > S2[n2] || bmax[j * 3 + t2] + hr < S2[0]) continue;
          _fb[nf++] = j;
        }
      }
      const special = (p, qd) => {
        const x = S1[p], y = S2[qd];
        for (let k = 0; k < nf; k++) {
          const j = _fb[k], j3 = j * 3;
          if (bmin[j3 + a] - hr > plane || bmax[j3 + a] + hr < plane || bmin[j3 + t1] - hr > x || bmax[j3 + t1] + hr < x ||
              bmin[j3 + t2] - hr > y || bmax[j3 + t2] + hr < y) continue;
          const in1 = x > bmin[j3 + t1] - 1e-3 && x < bmax[j3 + t1] + 1e-3, in2 = y > bmin[j3 + t2] - 1e-3 && y < bmax[j3 + t2] + 1e-3;
          if ((in2 && (Math.abs(bmin[j3 + t1] - x) < 1e-3 || Math.abs(bmax[j3 + t1] - x) < 1e-3)) ||
              (in1 && (Math.abs(bmin[j3 + t2] - y) < 1e-3 || Math.abs(bmax[j3 + t2] - y) < 1e-3))) return true;
        }
        return false;
      };
      // poziom wierzchołka: liczba zer na końcu indeksów (0 = któryś indeks nieparzysty); wierzchołek poziomu l
      // ma sąsiadów „grubszych” co 2^l indeksów (poziom > l), od których dziedziczy widoczność świateł i AO
      const levelOf = (p, qd) => {
        const m = p | qd;
        return m === 0 ? HLEV : Math.min(HLEV, 31 - Math.clz32(m & -m));
      };
      const color = (p, qd) => {
        const id = qd * W + p;
        if (vdone[id]) return;
        hb.own = -1; hb.nh = 0;
        if (hd2 > 0) {
          if (!((p | qd) & 1)) hb.own = (qd >> 1) * CW + (p >> 1);
          const lv = levelOf(p, qd);
          if (lv < HLEV && !special(p, qd)) {
            const st = 1 << lv, dp = (p >> lv) & 1, dq = (qd >> lv) & 1;
            let nh = 0;
            for (let ip = 0; ip <= dp && nh >= 0; ip++) for (let iq = 0; iq <= dq && nh >= 0; iq++) {
              const pc = p - dp * st + ip * 2 * st * dp, qc = qd - dq * st + iq * 2 * st * dq;
              if (pc > n1 || qc > n2 || !vdone[qc * W + pc]) { nh = -1; break; }
              const dx = S1[pc] - S1[p], dy = S2[qc] - S2[qd];
              if (dx * dx + dy * dy > hd2) { nh = -1; break; }
              const wp = dp ? (ip ? (S1[p] - S1[p - st]) / (S1[p + st] - S1[p - st]) : (S1[p + st] - S1[p]) / (S1[p + st] - S1[p - st])) : 1;
              const wq = dq ? (iq ? (S2[qd] - S2[qd - st]) / (S2[qd + st] - S2[qd - st]) : (S2[qd + st] - S2[qd]) / (S2[qd + st] - S2[qd - st])) : 1;
              hb.ids[nh] = (qc >> 1) * CW + (pc >> 1); hb.w[nh] = wp * wq; nh++;
            }
            hb.nh = nh > 0 ? nh : 0;
          }
        }
        pos[a] = plane; pos[t1] = S1[p]; pos[t2] = S2[qd];
        field.shade(pos[0], pos[1], pos[2], nid, _col, hb);
        vcache[id * 3] = _col[0]; vcache[id * 3 + 1] = _col[1]; vcache[id * 3 + 2] = _col[2];
        vdone[id] = 1;
      };

      // 1) które komórki są widoczne (niezasłonięte, nie „zewnętrzne”)
      for (let p = 0; p < n1; p++) for (let qd = 0; qd < n2; qd++) {
        // środek komórki lekko przed ścianą: zasłonięty przez inną bryłę? zdublowany z wcześniejszą?
        _c[a] = plane + s * 0.01; _c[t1] = (S1[p] + S1[p + 1]) / 2; _c[t2] = (S2[qd] + S2[qd + 1]) / 2;
        let hidden = false;
        // kandydaci: bryły z komórki środka komórki (zawieranie) i z komórki punktu na płaszczyźnie (współpłaszczyznowe)
        const c0 = sgrid.cellOf(_c[0], _c[1], _c[2]);
        _p[a] = plane; _p[t1] = _c[t1]; _p[t2] = _c[t2];
        const c1 = sgrid.cellOf(_p[0], _p[1], _p[2]);
        for (let pass = 0; pass < 2 && !hidden; pass++) {
          const cc = pass ? c1 : c0;
          if (cc < 0 || (pass && cc === c0)) continue;
          for (let q2 = sgrid.start[cc], e2 = sgrid.start[cc + 1]; q2 < e2 && !hidden; q2++) {
            const j = solid[sgrid.list[q2]];
            if (j === i) continue;
            if (_c[0] > bmin[j * 3] + 1e-4 && _c[0] < bmax[j * 3] - 1e-4 && _c[1] > bmin[j * 3 + 1] + 1e-4 && _c[1] < bmax[j * 3 + 1] - 1e-4 &&
                _c[2] > bmin[j * 3 + 2] + 1e-4 && _c[2] < bmax[j * 3 + 2] - 1e-4) hidden = true;
            else if (j < i && SOLID.has(box.kind) &&
                Math.abs((s > 0 ? bmax[j * 3 + a] : bmin[j * 3 + a]) - plane) < 1e-4 &&
                _c[t1] > bmin[j * 3 + t1] && _c[t1] < bmax[j * 3 + t1] && _c[t2] > bmin[j * 3 + t2] && _c[t2] < bmax[j * 3 + t2]) hidden = true; // współpłaszczyznowe nakładanie
          }
        }
        if (hidden || field.exterior(_c[0], _c[1], _c[2], nid)) continue;
        vis[p * n2 + qd] = 1;
        cells++;
      }

      // 2) kolory wierzchołków potrzebnych widocznym komórkom: najpierw „grube” (parzyste indeksy), potem reszta
      const need = scratchU(2, W * H);
      for (let p = 0; p < n1; p++) for (let qd = 0; qd < n2; qd++) if (vis[p * n2 + qd]) {
        need[qd * W + p] = need[qd * W + p + 1] = need[(qd + 1) * W + p] = need[(qd + 1) * W + p + 1] = 1;
      }
      for (let lv = hd2 > 0 ? HLEV : 0; lv >= 0; lv--) for (let qd = 0; qd < H; qd++) for (let p = 0; p < W; p++) {
        if (need[qd * W + p] && (hd2 > 0 ? levelOf(p, qd) === lv : true)) color(p, qd);
      }

      // 3) geometria widocznych komórek
      let nCell = 0;
      for (let k = 0, nk = n1 * n2; k < nk; k++) nCell += vis[k];
      grow(grp, nCell * 4, nCell * 6);
      const gp = grp.pos, gc = grp.col, gu = grp.uv, gi = grp.idx;
      const inset = 0.5 / 512, tiled = inf.mode === 'tile';
      for (let p = 0; p < n1; p++) for (let qd = 0; qd < n2; qd++) {
        if (!vis[p * n2 + qd]) continue;

        // UV: kafel 2 m (z wariantem z atlasu) albo cała ściana (drzwi)
        const m1 = (S1[p] + S1[p + 1]) / 2, m2 = (S2[qd] + S2[qd + 1]) / 2;
        const cr = (rAx === a ? plane : rAx === t1 ? m1 : m2);
        const cu = (uAx === a ? plane : uAx === t1 ? m1 : m2);
        let iu = 0, iv = 0, ox = 0, oy = 0;
        if (tiled) {
          iu = Math.floor(rs * cr / tile); iv = Math.floor(us * cu / tile);
          const k = nVar > 1 ? hash3(iu, iv, nid + 1, Math.round(plane * 8)) % nVar : 0;
          ox = k % cols; oy = (k / cols) | 0;
        }
        const v0 = grp.nv;
        for (let k = 0; k < 4; k++) {
          const cp = p + CORNER_P[k], cq = qd + CORNER_Q[k];
          pos[a] = plane; pos[t1] = S1[cp]; pos[t2] = S2[cq];
          const vo = grp.nv * 3, vi = (cq * W + cp) * 3;
          gp[vo] = pos[0]; gp[vo + 1] = pos[1]; gp[vo + 2] = pos[2];
          gc[vo] = vcache[vi]; gc[vo + 1] = vcache[vi + 1]; gc[vo + 2] = vcache[vi + 2];
          let fu, fv;
          if (tiled) {
            fu = rs * pos[rAx] / tile - iu; fv = us * pos[uAx] / tile - iv;
          } else {
            const r0 = bmin[i * 3 + rAx], r1 = bmax[i * 3 + rAx], u0 = bmin[i * 3 + uAx], u1 = bmax[i * 3 + uAx];
            fu = rs > 0 ? (pos[rAx] - r0) / (r1 - r0) : (r1 - pos[rAx]) / (r1 - r0);
            fv = us > 0 ? (pos[uAx] - u0) / (u1 - u0) : (u1 - pos[uAx]) / (u1 - u0);
          }
          fu = Math.min(1, Math.max(0, fu)); fv = Math.min(1, Math.max(0, fv));
          gu[grp.nv * 2] = (ox + inset + fu * (1 - 2 * inset)) / cols;
          gu[grp.nv * 2 + 1] = 1 - (oy + 1) / rows + (inset + fv * (1 - 2 * inset)) / rows;
          grp.nv++;
        }
        const io = grp.ni;
        if (s > 0) { gi[io] = v0; gi[io + 1] = v0 + 1; gi[io + 2] = v0 + 2; gi[io + 3] = v0; gi[io + 4] = v0 + 2; gi[io + 5] = v0 + 3; }
        else { gi[io] = v0; gi[io + 1] = v0 + 2; gi[io + 2] = v0 + 1; gi[io + 3] = v0; gi[io + 4] = v0 + 3; gi[io + 5] = v0 + 2; }
        grp.ni += 6;
      }
    }
  }
  for (const grp of groups.values()) {
    grp.pos = grp.pos.subarray(0, grp.nv * 3); grp.col = grp.col.subarray(0, grp.nv * 3);
    grp.uv = grp.uv.subarray(0, grp.nv * 2); grp.idx = grp.idx.subarray(0, grp.ni);
  }
  return { groups, cells };
}
