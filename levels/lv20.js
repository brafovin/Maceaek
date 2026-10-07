import { DARK_ALL } from './util.js';

// Labirynt luster – ciemny labirynt kanałów z kwasem. Niemal wszystko jest ciemne i nie przyjmuje portali;
// tylko małe białe łatki (2 × 2,6 m) są portalowalne. Trzy „skoki” przez kanały:
//   I   S  -> L2 (róg: łatka-peryskop widzi za zakręt),
//   II  L2 -> L3 (jak wyżej, z innej strony),
//   III L3 -> L4 (łańcuch: peryskop -> kolejny peryskop -> cel).
// Plan: siatka 0,5 m; wszystko, co nie jest „wolne”, jest pełną ciemną bryłą (generowaną z siatki).

const H = 6, G = 0.5;
const X0 = -14, X1 = 34, Z0 = -53, Z1 = 15;

// F = podłoga (chodzi się), C = kanał z kwasem
const FREE = [
  // strefa startowa S (pętla korytarzy wokół bloku)
  ['F', -6, 6, -1, 2],       // balkon nad halą I
  ['F', -6, 6, 10, 13],
  ['F', -6, -3, 2, 10],
  ['F', 3, 6, 2, 10],
  ['F', -1.5, 1.5, 5, 10],   // wnęka
  ['F', 6, 14, 6, 9],        // boczny korytarz (ślepy zaułek)
  ['C', -6, 6, -10, -1],     // hala I
  ['C', 6, 14, -7.5, -4.5],  // korytarz 2
  // L2 (hala + ślepy tunel z łatką lądowania)
  ['F', 14, 26, -12, 0],
  ['F', 26, 32, -7.5, -4.5],
  ['C', 14, 26, -21, -12],   // hala II
  ['C', 6, 14, -19.5, -16.5],// korytarz 3
  // L3
  ['F', -6, 6, -21, -12],
  ['F', -12, -6, -19.5, -16.5],
  ['C', -6, 6, -30, -21],    // hala III
  ['C', 6, 14, -29.5, -26.5],// korytarz 4
  ['C', 14, 30, -32, -23],   // hala IV
  ['C', 15.5, 18.5, -41, -32],// korytarz 5
  // L4
  ['F', 10, 26, -51, -41],
];
// słupy (wycinają wolną przestrzeń)
const PILLARS = [
  [17, 21, -9, -7.5], [17, 21, -3.5, -2],              // L2
  [-3, -1, -15.5, -13.5],                              // L3
  [11, 14, -47, -44], [20, 23, -47, -44],              // L4
];
// łatki: f = kierunek normalnej (strona wolnej przestrzeni), p = współrzędna płaszczyzny ściany, c = środek wzdłuż ściany
const PATCHES = {
  aS1:   { f: '+x', p: -6, c: 0.5 },
  aS2:   { f: '+x', p: 3, c: 4 },
  dS2:   { f: '-x', p: 14, c: 7.5 },
  dS1:   { f: '+z', p: 5, c: 0 },
  B1:    { f: '+x', p: -6, c: -6, canal: true },
  B1b:   { f: '+x', p: -6, c: -2, canal: true },
  f2:    { f: '-x', p: 32, c: -6 },
  aL2a:  { f: '-z', p: -9, c: 19 },
  aL2b:  { f: '-z', p: 0, c: 23 },
  B2:    { f: '-x', p: 26, c: -18, canal: true },
  B2b:   { f: '-x', p: 26, c: -14, canal: true },
  f3:    { f: '+x', p: -12, c: -18 },
  aL3:   { f: '-z', p: -12, c: 3.5 },
  B3:    { f: '+x', p: -6, c: -28, canal: true },
  fMid:  { f: '-x', p: 30, c: -28, canal: true },
  p2:    { f: '-z', p: -23, c: 17, canal: true },
  fEnd:  { f: '+z', p: -51, c: 17 },
};
// kratki-barierki przy halach: nie da się wyskoczyć w przestrzeń nad kanałem (strzał i wzrok przechodzą)
const FENCE_H = 1.55; // wyższa niż skok (1,47 m), ale niższa niż oczy (1,62 m)
const FENCES = [
  [-5.5, 6, -1.3, -1], [14, 26, -12.3, -12], [-6, 6, -21.3, -21],   // krawędzie hal I, II, III
];
export const design = { FREE, PILLARS, PATCHES, FENCES, H, G, X0, X1, Z0, Z1 };
const PY = 1.3; // wysokość celowania w łatkę
const pt = (k) => { const q = PATCHES[k]; return q.f[1] === 'x' ? [q.p, PY, q.c] : [q.c, PY, q.p]; };

function patchRect(q) {
  const t = 0.5, w = 1;
  switch (q.f) {
    case '+x': return [q.p - t, q.p, q.c - w, q.c + w, 'x'];
    case '-x': return [q.p, q.p + t, q.c - w, q.c + w, 'x'];
    case '+z': return [q.c - w, q.c + w, q.p - t, q.p, 'z'];
    default:   return [q.c - w, q.c + w, q.p, q.p + t, 'z'];
  }
}

export default {
  design, // dane planu (do analizy; silnik ich nie używa)
  name: 'Labirynt luster',
  hint: 'Najważniejszych łatek nie widać zza rogu. Zerknij tam oczami portalu – a potem sprawdź, czy celownik też tamtędy sięgnie.',
  spawn: { x: 4.5, y: 0, z: 11.5, yaw: Math.PI / 2 },
  exit: { x: 17, y: 0, z: -44.5 },
  build(L) {
    L.room(X0, X1, Z0, Z1, H, DARK_ALL);
    const nx = (X1 - X0) / G, nz = (Z1 - Z0) / G;
    const st = new Uint8Array(nx * nz); // 0 lita, 1 wolna, 2 łatka
    const ix = (x) => Math.round((x - X0) / G), iz = (z) => Math.round((z - Z0) / G);
    const fill = (x0, x1, z0, z1, v, need) => {
      for (let j = iz(z0); j < iz(z1); j++) for (let i = ix(x0); i < ix(x1); i++) {
        if (need !== undefined && st[j * nx + i] !== need) throw new Error(`lv20: komórka (${X0 + i * G}, ${Z0 + j * G}) zajęta`);
        st[j * nx + i] = v;
      }
    };
    for (const [, x0, x1, z0, z1] of FREE) fill(x0, x1, z0, z1, 1);
    for (const [x0, x1, z0, z1] of PILLARS) fill(x0, x1, z0, z1, 0);
    for (const k of Object.keys(PATCHES)) { const r = patchRect(PATCHES[k]); fill(r[0], r[1], r[2], r[3], 2, 0); }

    // pełna ciemna masa: scalanie komórek w prostokąty
    const used = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (st[j * nx + i] !== 0 || used[j * nx + i]) continue;
      let w = 1;
      while (i + w < nx && st[j * nx + i + w] === 0 && !used[j * nx + i + w]) w++;
      let h = 1;
      outer: while (j + h < nz) {
        for (let k = 0; k < w; k++) if (st[(j + h) * nx + i + k] !== 0 || used[(j + h) * nx + i + k]) break outer;
        h++;
      }
      for (let b = 0; b < h; b++) for (let a = 0; a < w; a++) used[(j + b) * nx + i + a] = 1;
      L.box(X0 + i * G, -8, Z0 + j * G, X0 + (i + w) * G, H, Z0 + (j + h) * G, 'dark');
    }

    // podłogi i kanały
    for (const [k, x0, x1, z0, z1] of FREE) {
      if (k === 'F') L.floor(x0, x1, z0, z1, 'dark'); else L.pit(x0, x1, z0, z1);
    }

    // „śluza” przy starcie: każda droga ze spawnu na balkon przechodzi przez fizzler, więc powrót po śmierci czyści portale
    L.fizzler(2, 0, 10, 2.1, 4, 13);     // zachód: korytarz południowy
    L.fizzler(3, 0, 9.6, 6, 4, 9.7);     // północ: kolumna wschodnia

    for (const [x0, x1, z0, z1] of FENCES) L.box(x0, 0, z0, x1, FENCE_H, z1, 'grate');

    // łatki: biała płyta 0..2,6 m + ciemne wypełnienie nad (i pod, gdy łatka wisi nad kanałem)
    for (const k of Object.keys(PATCHES)) {
      const q = PATCHES[k], [x0, x1, z0, z1] = patchRect(q);
      L.box(x0, 0, z0, x1, 2.6, z1, 'white');
      L.box(x0, 2.6, z0, x1, H, z1, 'dark');
      if (q.canal) L.box(x0, -8, z0, x1, 0, z1, 'dark');
    }

    // tablice
    L.sign('LABIRYNT LUSTER', 'Wyjście: daleko na północy', 2.9, 0.9, -5.97, 3.4, 11.5, Math.PI / 2);
    L.sign('ŚLUZA', 'Przejście przez śluzę usuwa portale', 3.2, 0.9, 3.8, 2.9, 12.97, Math.PI);
    L.sign('I', null, 1.4, 0.9, -5.97, 4.1, 0.5, Math.PI / 2);
    L.sign('II', null, 1.6, 0.9, 31.97, 4.1, -6, -Math.PI / 2);
    L.sign('III', null, 1.8, 0.9, -11.97, 4.1, -18, Math.PI / 2);
    L.sign('IV', null, 1.6, 0.9, 17, 4.1, -50.97, 0);
  },
  solve(T) {
    const pl = T.game.player;
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const frame = (i) => { const P = T.portal(i); return { pos: P.pos, n: P.normal, up: P.up, right: cross(P.up, P.normal) }; };
    // punkt q (po stronie portalu B) widziany przez portal A: gdzie trzeba wycelować, żeby strzał wyleciał z B w kierunku q
    const virt = (a, b, q) => {
      const d = sub(q, b.pos);
      const r = dot(d, b.right), u = dot(d, b.up), n = dot(d, b.n);
      return [0, 1, 2].map(k => a.pos[k] - r * a.right[k] + u * a.up[k] - n * a.n[k]);
    };
    // gdzie stanąć (dystans `dist` przed portalem A), żeby linia do V przechodziła przez środek otworu A
    const standFor = (a, V, dist) => {
      const d = sub(a.pos, V), k = dist / dot(d, a.n);
      return [a.pos[0] + d[0] * k, a.pos[2] + d[2] * k];
    };
    const near = (i, k, tol = 1.4) => {
      const P = T.portal(i).pos, q = pt(k);
      T.assert(T.portal(i).active && Math.hypot(P[0] - q[0], P[2] - q[2]) < tol, `portal ${i} nie jest na łatce ${k}: ${JSON.stringify(P)}`);
    };
    // przestaw portal 1 (pomarańczowy) „oczami” portalu 0: stoję przed niebieskim i celuję w łatkę k widzianą przez niego
    const through = (k, dist = 3) => {
      const A = frame(0), B = frame(1), V = virt(A, B, pt(k));
      const s = standFor(A, V, dist);
      T.creep(s[0], s[1]);
      T.wait(0.15);
      T.shoot(1, V[0], V[1], V[2]);
      near(1, k);
    };
    const enter = () => { T.assert(T.walkThrough(0), 'nie wszedłem w niebieski portal'); T.wait(0.6); };

    // ---- skok I: z pętli startowej na platformę L2 ----
    T.walkTo(-4.5, 11.5); T.walkTo(-4.5, 0.5); T.walkTo(0, 0.5);
    T.shoot(0, ...pt('aS1')); near(0, 'aS1');
    T.shoot(1, ...pt('B1')); near(1, 'B1');
    through('f2');
    enter();
    T.assert(Math.abs(pl.pos.x - 31.5) < 1.2 && Math.abs(pl.pos.z + 6) < 2, 'nie wylądowałem w L2: ' + JSON.stringify(T.st()));

    // ---- skok II: z L2 na L3 ----
    T.walkTo(24, -6); T.walkTo(22, -10.5);
    T.shoot(0, ...pt('aL2b')); near(0, 'aL2b');
    T.shoot(1, ...pt('B2')); near(1, 'B2');
    through('f3');
    enter();
    T.assert(Math.abs(pl.pos.x + 11.5) < 1.2 && Math.abs(pl.pos.z + 18) < 2, 'nie wylądowałem w L3: ' + JSON.stringify(T.st()));

    // ---- skok III: z L3 do L4 (łańcuch trzech strzałów) ----
    T.walkTo(0, -18); T.walkTo(2, -20);
    T.shoot(0, ...pt('aL3')); near(0, 'aL3');
    T.shoot(1, ...pt('B3')); near(1, 'B3');
    through('fMid');
    through('p2');
    through('fEnd');
    enter();
    T.assert(Math.abs(pl.pos.x - 17) < 1.5 && pl.pos.z < -49, 'nie wylądowałem w L4: ' + JSON.stringify(T.st()));
    T.walkTo(17, -44.5);
  },
};
